import Redis from 'ioredis';
import { createConsumerDedupStore } from '@fathersnet/idempotency';

import { createRedisEventBus } from '../src/bus';
import { createRedisStreamConsumer, type DlqEntry } from '../src/consumer';
import { createEvent } from '../src/event';

const REDIS_TEST_URL = process.env.REDIS_TEST_URL;
const describeRedis = REDIS_TEST_URL ? describe : describe.skip;

describeRedis('@fathersnet/events stream consumer + DLQ', () => {
  let client: Redis;
  const GROUP = 'test-group';
  const CONSUMER = 'test-consumer';

  beforeAll(() => {
    client = new Redis(REDIS_TEST_URL as string);
  });

  afterAll(async () => {
    await client.quit();
  });

  afterEach(async () => {
    await client.flushall();
  });

  it('ensureGroup is idempotent (BUSYGROUP is a no-op)', async () => {
    const consumer = createRedisStreamConsumer({ client });
    await consumer.ensureGroup(GROUP, ['user.enrolled']);
    await expect(consumer.ensureGroup(GROUP, ['user.enrolled'])).resolves.toBeUndefined();
  });

  it('reads published messages and removes them from pending on ack', async () => {
    const consumer = createRedisStreamConsumer({ client });
    const bus = createRedisEventBus({ client });
    await consumer.ensureGroup(GROUP, ['user.enrolled']);
    const event = createEvent({
      type: 'user.enrolled',
      producer: 'user-service',
      payload: { user_id: 'u1' },
    });
    await bus.publish(event);

    const messages = await consumer.read({
      group: GROUP,
      consumer: CONSUMER,
      streams: ['user.enrolled'],
      blockMs: 100,
    });
    expect(messages).toHaveLength(1);
    expect(messages[0].event.id).toBe(event.id);
    expect(messages[0].id).toMatch(/^\d+-\d+$/);

    expect(await consumer.pendingCount('user.enrolled', GROUP)).toBe(1);
    await consumer.ack('user.enrolled', GROUP, messages[0].id);
    expect(await consumer.pendingCount('user.enrolled', GROUP)).toBe(0);

    const again = await consumer.read({
      group: GROUP,
      consumer: CONSUMER,
      streams: ['user.enrolled'],
      blockMs: 100,
    });
    expect(again).toHaveLength(0);
  });

  it('unacked messages stay pending (at-least-once: nothing is lost)', async () => {
    const consumer = createRedisStreamConsumer({ client });
    const bus = createRedisEventBus({ client });
    await consumer.ensureGroup(GROUP, ['user.enrolled']);
    await bus.publish(
      createEvent({ type: 'user.enrolled', producer: 'user-service', payload: { user_id: 'u1' } }),
    );
    await consumer.read({
      group: GROUP,
      consumer: CONSUMER,
      streams: ['user.enrolled'],
      blockMs: 100,
    });
    expect(await consumer.pendingCount('user.enrolled', GROUP)).toBe(1);
    expect(
      await consumer.read({
        group: GROUP,
        consumer: CONSUMER,
        streams: ['user.enrolled'],
        blockMs: 100,
      }),
    ).toHaveLength(0);
  });

  it('moves a failed message to the per-topic DLQ with the full record (12 §16 I-13)', async () => {
    const consumer = createRedisStreamConsumer({ client });
    const bus = createRedisEventBus({ client });
    await consumer.ensureGroup(GROUP, ['user.enrolled']);
    const event = createEvent({
      type: 'user.enrolled',
      producer: 'user-service',
      payload: { user_id: 'u1' },
    });
    await bus.publish(event);
    const messages = await consumer.read({
      group: GROUP,
      consumer: CONSUMER,
      streams: ['user.enrolled'],
      blockMs: 100,
    });
    expect(messages).toHaveLength(1);

    const dlqEntryId = await consumer.moveToDlq({
      stream: 'user.enrolled',
      messageId: messages[0].id,
      reason: 'max attempts exceeded',
      error: 'handler crashed',
    });
    expect(dlqEntryId).toMatch(/^\d+-\d+$/);
    expect(await consumer.dlqLen('user.enrolled')).toBe(1);

    const raw = (await client.xrange('events:user.enrolled.dlq', '-', '+')) as unknown as [
      string,
      string[],
    ][];
    const fields = raw[0][1];
    const data = fields[fields.indexOf('data') + 1];
    const entry = JSON.parse(data) as DlqEntry;
    expect(entry.stream).toBe('events:user.enrolled');
    expect(entry.messageId).toBe(messages[0].id);
    expect(entry.reason).toBe('max attempts exceeded');
    expect(entry.error).toBe('handler crashed');
    expect(Number.isNaN(Date.parse(entry.moved_at))).toBe(false);
  });

  it('consumer dedup by event id yields exactly-once processing on replay (FR-161)', async () => {
    const consumer = createRedisStreamConsumer({ client });
    const bus = createRedisEventBus({ client });
    const dedup = createConsumerDedupStore({
      driver: 'redis',
      redis: client,
      name: 'journal-sink',
    });
    await consumer.ensureGroup(GROUP, ['journal.entry.created']);
    const event = createEvent({
      type: 'journal.entry.created',
      producer: 'journal-service',
      payload: { entry_id: 'e1' },
    });

    let processed = 0;
    const drain = async (): Promise<void> => {
      const messages = await consumer.read({
        group: GROUP,
        consumer: CONSUMER,
        streams: ['journal.entry.created'],
        blockMs: 100,
      });
      for (const message of messages) {
        if (await dedup.claim(message.event.id, 3600)) {
          processed += 1;
        }
        await consumer.ack('journal.entry.created', GROUP, message.id);
      }
    };

    await bus.publish(event);
    await drain();
    expect(processed).toBe(1);

    // At-least-once redelivery of the same event (same event id) is a no-op.
    await bus.publish(event);
    await drain();
    expect(processed).toBe(1);
    expect(await consumer.pendingCount('journal.entry.created', GROUP)).toBe(0);
  });
});
