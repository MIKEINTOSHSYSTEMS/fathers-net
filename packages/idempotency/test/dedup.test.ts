import { createConsumerDedupStore } from '../src';

describe('@fathersnet/idempotency consumer dedup store (memory)', () => {
  it('claims a new id once and rejects a duplicate', async () => {
    const store = createConsumerDedupStore({ driver: 'memory' });
    try {
      await expect(store.claim('event-1', 3600)).resolves.toBe(true);
      await expect(store.claim('event-1', 3600)).resolves.toBe(false);
    } finally {
      await store.dispose();
    }
  });

  it('isProcessed reflects an existing claim', async () => {
    const store = createConsumerDedupStore({ driver: 'memory' });
    try {
      await expect(store.isProcessed('event-1')).resolves.toBe(false);
      await store.claim('event-1', 3600);
      await expect(store.isProcessed('event-1')).resolves.toBe(true);
    } finally {
      await store.dispose();
    }
  });

  it('releases the claim after the TTL expires', async () => {
    jest.useFakeTimers();
    const store = createConsumerDedupStore({ driver: 'memory' });
    try {
      await store.claim('event-1', 1);
      await expect(store.claim('event-1', 1)).resolves.toBe(false);
      jest.advanceTimersByTime(1100);
      await expect(store.claim('event-1', 1)).resolves.toBe(true);
    } finally {
      await store.dispose();
      jest.useRealTimers();
    }
  });

  it('isolates dedup state per consumer name', async () => {
    const a = createConsumerDedupStore({ driver: 'memory', name: 'consumer-a' });
    const b = createConsumerDedupStore({ driver: 'memory', name: 'consumer-b' });
    try {
      await expect(a.claim('shared-id', 3600)).resolves.toBe(true);
      await expect(b.claim('shared-id', 3600)).resolves.toBe(true);
    } finally {
      await a.dispose();
      await b.dispose();
    }
  });
});
