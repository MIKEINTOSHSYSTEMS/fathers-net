import Redis from 'ioredis';

import { createInMemoryEventBus, createRedisEventBus, streamNameFor } from '../src/bus';
import { createEvent, parseEvent } from '../src/event';

describe('@fathersnet/events in-memory bus (M-08 test-double)', () => {
  it('records published events in order', async () => {
    const bus = createInMemoryEventBus();
    try {
      const e1 = createEvent({
        type: 'user.enrolled',
        producer: 'user-service',
        payload: { user_id: 'u1' },
      });
      const e2 = createEvent({
        type: 'user.consent.changed',
        producer: 'user-service',
        payload: { user_id: 'u1' },
      });
      const id1 = await bus.publish(e1);
      const ids = await bus.publishMany([e2]);
      expect(bus.published).toHaveLength(2);
      expect(bus.published[0].id).toBe(e1.id);
      expect(bus.published[1].id).toBe(e2.id);
      expect(id1).toBe(`mem:${e1.id}`);
      expect(ids[0]).toBe(`mem:${e2.id}`);
    } finally {
      await bus.dispose();
    }
  });

  it('dispose clears the published list', async () => {
    const bus = createInMemoryEventBus();
    await bus.publish(
      createEvent({ type: 'user.enrolled', producer: 'user-service', payload: {} }),
    );
    await bus.dispose();
    expect(bus.published).toHaveLength(0);
  });
});

describe('streamNameFor topic derivation (one stream per event type)', () => {
  it('uses the `events:` prefix by default', () => {
    expect(streamNameFor('user.enrolled')).toBe('events:user.enrolled');
    expect(streamNameFor('whatsapp.message.received')).toBe('events:whatsapp.message.received');
  });

  it('honors a custom prefix', () => {
    expect(streamNameFor('user.enrolled', 'fn')).toBe('fn:user.enrolled');
  });
});

const REDIS_TEST_URL = process.env.REDIS_TEST_URL;
const describeRedis = REDIS_TEST_URL ? describe : describe.skip;

describeRedis('@fathersnet/events redis bus', () => {
  let client: Redis;

  beforeAll(() => {
    client = new Redis(REDIS_TEST_URL as string);
  });

  afterAll(async () => {
    await client.quit();
  });

  afterEach(async () => {
    await client.flushall();
  });

  it('publishes to the per-event stream and round-trips the envelope', async () => {
    const bus = createRedisEventBus({ client });
    const event = createEvent({
      id: '00000000-0000-4000-8000-000000000099',
      type: 'user.enrolled',
      producer: 'user-service',
      payload: { user_id: 'u1', language: 'hi', region: 'UP', cohort: 'test' },
    });
    await bus.publish(event);
    const raw = (await client.xrange('events:user.enrolled', '-', '+')) as unknown as [
      string,
      string[],
    ][];
    expect(raw).toHaveLength(1);
    const fields = raw[0][1];
    const data = fields[fields.indexOf('data') + 1];
    const parsed = parseEvent(data);
    expect(parsed.id).toBe(event.id);
    expect(parsed.type).toBe('user.enrolled');
    expect(parsed.payload).toEqual(event.payload);
    expect(fields[fields.indexOf('type') + 1]).toBe('user.enrolled');
  });

  it('honors a custom stream prefix', async () => {
    const bus = createRedisEventBus({ client, streamPrefix: 'fn' });
    const event = createEvent({
      type: 'user.consent.changed',
      producer: 'user-service',
      payload: { user_id: 'u1' },
    });
    await bus.publish(event);
    const raw = (await client.xrange('fn:user.consent.changed', '-', '+')) as unknown as [
      string,
      string[],
    ][];
    expect(raw).toHaveLength(1);
    expect(await client.xlen('events:user.consent.changed')).toBe(0);
  });
});
