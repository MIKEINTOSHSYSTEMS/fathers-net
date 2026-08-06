import { createInMemoryEventBus } from '../src/bus';
import type { DomainEvent } from '../src/event';
import { backoffMs, OutboxRelay, type OutboxReader, type OutboxRow } from '../src/outbox';

function sampleRow(overrides: Partial<OutboxRow> = {}): OutboxRow {
  return {
    id: 'row-1',
    event_id: '00000000-0000-4000-8000-000000000001',
    event_type: 'user.enrolled',
    producer: 'user-service',
    schema_version: 1,
    occurred_at: '2026-08-06T08:00:00.000Z',
    aggregate_type: 'user',
    aggregate_id: 'u1',
    idempotency_key: '00000000-0000-4000-8000-000000000001',
    payload: { user_id: 'u1' },
    status: 'pending',
    attempts: 0,
    available_at: '2026-08-06T08:00:00.000Z',
    created_at: '2026-08-06T08:00:00.000Z',
    published_at: null,
    last_error: null,
    ...overrides,
  };
}

interface FakeReaderState {
  rows: OutboxRow[];
  published: string[];
  failed: { id: string; error: string; nextAttemptAt: Date }[];
  dead: { id: string; error: string }[];
  fetchLimits: number[];
}

function createFakeReader(initial: OutboxRow[]): { reader: OutboxReader } & FakeReaderState {
  const state: FakeReaderState = {
    rows: [...initial],
    published: [],
    failed: [],
    dead: [],
    fetchLimits: [],
  };
  const reader: OutboxReader = {
    async fetchPending(limit) {
      state.fetchLimits.push(limit);
      return state.rows.filter((row) => row.status === 'pending' || row.status === 'failed');
    },
    async markPublished(rowId, publishedAt) {
      state.published.push(rowId);
      const row = state.rows.find((candidate) => candidate.id === rowId);
      if (row) {
        row.status = 'published';
        row.published_at = publishedAt.toISOString();
      }
    },
    async markFailed(rowId, error, nextAttemptAt) {
      state.failed.push({ id: rowId, error, nextAttemptAt });
      const row = state.rows.find((candidate) => candidate.id === rowId);
      if (row) {
        row.status = 'failed';
        row.attempts += 1;
        row.available_at = nextAttemptAt.toISOString();
        row.last_error = error;
      }
    },
    async markDead(rowId, error) {
      state.dead.push({ id: rowId, error });
      const row = state.rows.find((candidate) => candidate.id === rowId);
      if (row) {
        row.status = 'dead';
        row.attempts += 1;
        row.last_error = error;
      }
    },
  };
  return { reader, ...state };
}

describe('@fathersnet/events outbox relay (unit, in-memory bus)', () => {
  it('publishes each committed row exactly once and marks it published', async () => {
    const rows = [
      sampleRow({ id: 'row-1' }),
      sampleRow({
        id: 'row-2',
        event_id: '00000000-0000-4000-8000-000000000002',
        event_type: 'journal.entry.created',
        producer: 'journal-service',
        payload: { entry_id: 'e1' },
      }),
      sampleRow({
        id: 'row-3',
        event_id: '00000000-0000-4000-8000-000000000003',
        event_type: 'pregnancy.week.changed',
        producer: 'pregnancy-engine',
        payload: { user_id: 'u1', week: 12 },
      }),
    ];
    const state = createFakeReader(rows);
    const bus = createInMemoryEventBus();
    const relay = new OutboxRelay({ bus, reader: state.reader });

    const summary = await relay.runOnce();
    expect(summary).toEqual({ scanned: 3, published: 3, failed: 0, dead: 0 });
    expect(state.published).toEqual(['row-1', 'row-2', 'row-3']);
    expect(bus.published.map((event) => event.id)).toEqual([
      rows[0].event_id,
      rows[1].event_id,
      rows[2].event_id,
    ]);
    expect(bus.published.map((event) => event.type)).toEqual([
      'user.enrolled',
      'journal.entry.created',
      'pregnancy.week.changed',
    ]);
    for (const row of rows) {
      expect(state.rows.find((candidate) => candidate.id === row.id)?.status).toBe('published');
    }
  });

  it('re-running the relay publishes nothing (replay is safe, FR-161)', async () => {
    const state = createFakeReader([sampleRow()]);
    const bus = createInMemoryEventBus();
    const relay = new OutboxRelay({ bus, reader: state.reader });

    await relay.runOnce();
    expect(bus.published).toHaveLength(1);
    const second = await relay.runOnce();
    expect(second).toEqual({ scanned: 0, published: 0, failed: 0, dead: 0 });
    expect(bus.published).toHaveLength(1);
  });

  it('schedules a retry with backoff on transient failure, then succeeds once', async () => {
    const state = createFakeReader([sampleRow()]);
    const innerBus = createInMemoryEventBus();
    let failing = true;
    const bus = {
      published: innerBus.published,
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
      reader: state.reader,
      retryBaseMs: 60_000,
      retryMaxMs: 240_000,
      jitterFactor: 0,
    });

    const first = await relay.runOnce();
    expect(first).toEqual({ scanned: 1, published: 0, failed: 1, dead: 0 });
    expect(state.failed).toHaveLength(1);
    expect(state.failed[0].error).toBe('bus down');
    expect(state.failed[0].nextAttemptAt.getTime()).toBeGreaterThan(Date.now());
    expect(state.rows[0].attempts).toBe(1);
    expect(bus.published).toHaveLength(0);

    const second = await relay.runOnce();
    expect(second).toEqual({ scanned: 1, published: 1, failed: 0, dead: 0 });
    expect(bus.published).toHaveLength(1);
    expect(state.rows[0].status).toBe('published');
  });

  it('dead-letters a row that exhausts max attempts and fires onDead (12 §16 I-13, OR-008)', async () => {
    const state = createFakeReader([sampleRow()]);
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
      reader: state.reader,
      maxAttempts: 2,
      retryBaseMs: 1,
      retryMaxMs: 1,
      jitterFactor: 0,
      onDead,
    });

    await relay.runOnce();
    expect(state.rows[0].status).toBe('failed');
    expect(state.rows[0].attempts).toBe(1);
    expect(onDead).not.toHaveBeenCalled();

    await relay.runOnce();
    expect(state.rows[0].status).toBe('dead');
    expect(state.rows[0].attempts).toBe(2);
    expect(state.rows[0].last_error).toBe('provider timeout');
    expect(state.dead).toEqual([{ id: 'row-1', error: 'provider timeout' }]);
    expect(onDead).toHaveBeenCalledTimes(1);
    expect(onDead).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'row-1' }),
      expect.any(Error),
    );
  });

  it('reconstructs a valid event envelope from the stored row', async () => {
    const state = createFakeReader([sampleRow()]);
    const bus = createInMemoryEventBus();
    const relay = new OutboxRelay({ bus, reader: state.reader });
    await relay.runOnce();
    const event = bus.published[0];
    expect(event.id).toBe(state.rows[0].event_id);
    expect(event.type).toBe('user.enrolled');
    expect(event.idempotency_key).toBe(state.rows[0].idempotency_key);
    expect(event.aggregate).toEqual({ type: 'user', id: 'u1' });
    expect(event.payload).toEqual({ user_id: 'u1' });
  });

  it('respects the configured batch size', async () => {
    const state = createFakeReader([
      sampleRow(),
      sampleRow({ id: 'row-2' }),
      sampleRow({ id: 'row-3' }),
    ]);
    const bus = createInMemoryEventBus();
    const relay = new OutboxRelay({ bus, reader: state.reader, batchSize: 2 });
    await relay.runOnce();
    expect(state.fetchLimits).toEqual([2]);
  });

  it('start/stop runs the relay on an interval and stops cleanly', async () => {
    jest.useFakeTimers();
    const state = createFakeReader([sampleRow()]);
    const bus = createInMemoryEventBus();
    const relay = new OutboxRelay({ bus, reader: state.reader });
    relay.start(1000);
    await Promise.resolve();
    await jest.advanceTimersByTimeAsync(100);
    expect(relay.isRunning).toBe(true);
    expect(bus.published).toHaveLength(1);
    await relay.stop();
    expect(relay.isRunning).toBe(false);
    jest.useRealTimers();
  });
});

describe('backoffMs exponential backoff + jitter', () => {
  it('grows 1 -> 2 -> 4 minutes and caps at the maximum (03 §5.4)', () => {
    expect(backoffMs(1, 60_000, 240_000, 0)).toBe(60_000);
    expect(backoffMs(2, 60_000, 240_000, 0)).toBe(120_000);
    expect(backoffMs(3, 60_000, 240_000, 0)).toBe(240_000);
    expect(backoffMs(10, 60_000, 240_000, 0)).toBe(240_000);
  });

  it('bounds the jitter to ±jitterFactor of the backoff', () => {
    for (let i = 0; i < 100; i += 1) {
      const value = backoffMs(2, 60_000, 240_000, 0.2);
      expect(value).toBeGreaterThanOrEqual(96_000);
      expect(value).toBeLessThanOrEqual(144_000);
    }
  });

  it('never returns a negative delay', () => {
    for (let i = 0; i < 100; i += 1) {
      expect(backoffMs(1, 10, 10, 1)).toBeGreaterThanOrEqual(0);
    }
  });
});
