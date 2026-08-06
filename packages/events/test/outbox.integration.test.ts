import { randomUUID } from 'node:crypto';

import Redis from 'ioredis';
import { Client } from 'pg';

import { createRedisEventBus } from '../src/bus';
import { parseEvent, type DomainEvent } from '../src/event';
import { OUTBOX_TABLE_DDL, OutboxRelay, PostgresOutboxReader, type OutboxRow } from '../src/outbox';

const DATABASE_URL = process.env.DATABASE_URL;
const REDIS_TEST_URL = process.env.REDIS_TEST_URL;
const describeIntegration = DATABASE_URL && REDIS_TEST_URL ? describe : describe.skip;

describeIntegration('@fathersnet/events outbox relay (postgres + redis, test-local table)', () => {
  let pgClient: Client;
  let redisClient: Redis;

  beforeAll(async () => {
    pgClient = new Client({ connectionString: DATABASE_URL });
    await pgClient.connect();
    await pgClient.query(OUTBOX_TABLE_DDL);
    redisClient = new Redis(REDIS_TEST_URL as string);
  });

  afterAll(async () => {
    await pgClient.query('DROP TABLE IF EXISTS outbox');
    await pgClient.end();
    await redisClient.quit();
  });

  beforeEach(async () => {
    await pgClient.query('TRUNCATE outbox');
    await redisClient.flushall();
  });

  async function insertRow(eventType: string, payload: Record<string, unknown>): Promise<string> {
    const eventId = randomUUID();
    await pgClient.query(
      `INSERT INTO outbox (event_id, event_type, producer, occurred_at, idempotency_key, payload)
       VALUES ($1, $2, $3, now(), $5, $4)`,
      [eventId, eventType, 'user-service', JSON.stringify(payload), eventId],
    );
    return eventId;
  }

  async function rowStatus(id: string): Promise<string> {
    const result = await pgClient.query<{ status: string }>(
      'SELECT status FROM outbox WHERE event_id = $1',
      [id],
    );
    return result.rows[0].status;
  }

  it('publishes each committed row exactly once and marks it published', async () => {
    const id1 = await insertRow('user.enrolled', { user_id: 'u1' });
    const id2 = await insertRow('user.consent.changed', {
      user_id: 'u1',
      consent_type: 'research',
      state: 'granted',
    });
    const id3 = await insertRow('pregnancy.week.changed', { user_id: 'u1', week: 12 });

    const relay = new OutboxRelay({
      bus: createRedisEventBus({ client: redisClient }),
      reader: new PostgresOutboxReader(pgClient),
    });
    const summary = await relay.runOnce();
    expect(summary).toEqual({ scanned: 3, published: 3, failed: 0, dead: 0 });

    for (const id of [id1, id2, id3]) {
      expect(await rowStatus(id)).toBe('published');
    }
    for (const [stream, id] of [
      ['events:user.enrolled', id1],
      ['events:user.consent.changed', id2],
      ['events:pregnancy.week.changed', id3],
    ] as const) {
      const raw = (await redisClient.xrange(stream, '-', '+')) as unknown as [string, string[]][];
      expect(raw).toHaveLength(1);
      const fields = raw[0][1];
      const parsed = parseEvent(fields[fields.indexOf('data') + 1]);
      expect(parsed.id).toBe(id);
    }
  });

  it('re-running the relay publishes nothing (no duplicates on restart)', async () => {
    await insertRow('user.enrolled', { user_id: 'u1' });
    const relay = new OutboxRelay({
      bus: createRedisEventBus({ client: redisClient }),
      reader: new PostgresOutboxReader(pgClient),
    });
    expect(await relay.runOnce()).toEqual({ scanned: 1, published: 1, failed: 0, dead: 0 });
    expect(await relay.runOnce()).toEqual({ scanned: 0, published: 0, failed: 0, dead: 0 });
    const raw = (await redisClient.xrange('events:user.enrolled', '-', '+')) as unknown as [
      string,
      string[],
    ][];
    expect(raw).toHaveLength(1);
  });

  it('retries a failed publish, then dead-letters after max attempts and fires onDead', async () => {
    const id = await insertRow('user.enrolled', { user_id: 'u1' });
    const onDead = jest.fn();
    const failingBus = {
      async publish<T>(_event: DomainEvent<T>): Promise<string> {
        throw new Error('provider timeout');
      },
      async publishMany(): Promise<string[]> {
        throw new Error('provider timeout');
      },
      async dispose(): Promise<void> {},
    };
    const relay = new OutboxRelay({
      bus: failingBus,
      reader: new PostgresOutboxReader(pgClient),
      maxAttempts: 2,
      retryBaseMs: 0,
      retryMaxMs: 0,
      jitterFactor: 0,
      onDead,
    });

    const first = await relay.runOnce();
    expect(first).toEqual({ scanned: 1, published: 0, failed: 1, dead: 0 });
    expect(await rowStatus(id)).toBe('failed');

    const second = await relay.runOnce();
    expect(second).toEqual({ scanned: 1, published: 0, failed: 0, dead: 1 });
    expect(await rowStatus(id)).toBe('dead');
    expect(onDead).toHaveBeenCalledTimes(1);
    expect(onDead).toHaveBeenCalledWith(
      expect.objectContaining<Partial<OutboxRow>>({ event_id: id }),
      expect.any(Error),
    );
  });

  it('a recovered row is published exactly once after a retry', async () => {
    const id = await insertRow('journal.entry.created', { entry_id: 'e1' });
    let failing = true;
    const innerBus = createRedisEventBus({ client: redisClient });
    const bus = {
      async publish<T>(event: DomainEvent<T>): Promise<string> {
        if (failing) {
          failing = false;
          throw new Error('bus down');
        }
        return innerBus.publish(event);
      },
      publishMany: innerBus.publishMany,
      dispose: innerBus.dispose,
    };
    const relay = new OutboxRelay({
      bus,
      reader: new PostgresOutboxReader(pgClient),
      retryBaseMs: 0,
      retryMaxMs: 0,
      jitterFactor: 0,
    });

    expect(await relay.runOnce()).toEqual({ scanned: 1, published: 0, failed: 1, dead: 0 });
    expect(await relay.runOnce()).toEqual({ scanned: 1, published: 1, failed: 0, dead: 0 });
    expect(await rowStatus(id)).toBe('published');
    const raw = (await redisClient.xrange('events:journal.entry.created', '-', '+')) as unknown as [
      string,
      string[],
    ][];
    expect(raw).toHaveLength(1);
    const fields = raw[0][1];
    expect(parseEvent(fields[fields.indexOf('data') + 1]).id).toBe(id);
  });
});
