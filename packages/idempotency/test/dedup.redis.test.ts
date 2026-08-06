import Redis from 'ioredis';

import { createConsumerDedupStore } from '../src';

const REDIS_TEST_URL = process.env.REDIS_TEST_URL;
const describeRedis = REDIS_TEST_URL ? describe : describe.skip;

describeRedis('@fathersnet/idempotency consumer dedup store (redis)', () => {
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

  it('claims a new id once and rejects a duplicate', async () => {
    const store = createConsumerDedupStore({ driver: 'redis', redis: client });
    try {
      await expect(store.claim('event-1', 3600)).resolves.toBe(true);
      await expect(store.claim('event-1', 3600)).resolves.toBe(false);
    } finally {
      await store.dispose();
    }
  });

  it('isProcessed reflects an existing claim', async () => {
    const store = createConsumerDedupStore({ driver: 'redis', redis: client });
    try {
      await expect(store.isProcessed('event-1')).resolves.toBe(false);
      await store.claim('event-1', 3600);
      await expect(store.isProcessed('event-1')).resolves.toBe(true);
    } finally {
      await store.dispose();
    }
  });

  it('releases the claim after the TTL expires', async () => {
    const store = createConsumerDedupStore({ driver: 'redis', redis: client });
    try {
      await store.claim('event-1', 1);
      await expect(store.claim('event-1', 1)).resolves.toBe(false);
      await new Promise((resolve) => setTimeout(resolve, 1100));
      await expect(store.claim('event-1', 1)).resolves.toBe(true);
    } finally {
      await store.dispose();
    }
  });

  it('isolates dedup state per consumer name', async () => {
    const a = createConsumerDedupStore({ driver: 'redis', redis: client, name: 'consumer-a' });
    const b = createConsumerDedupStore({ driver: 'redis', redis: client, name: 'consumer-b' });
    try {
      await expect(a.claim('shared-id', 3600)).resolves.toBe(true);
      await expect(b.claim('shared-id', 3600)).resolves.toBe(true);
    } finally {
      await a.dispose();
      await b.dispose();
    }
  });
});
