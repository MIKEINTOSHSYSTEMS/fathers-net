import type { ConsumerDedupStore } from './types';

/**
 * In-memory consumer dedup store for unit tests and hermetic CI. Not shared
 * across processes — production uses the Redis store.
 */
export function createMemoryConsumerDedupStore(name = 'default'): ConsumerDedupStore {
  const entries = new Map<string, number>();

  function key(id: string): string {
    return `${name}:${id}`;
  }

  async function claim(id: string, ttlSeconds: number): Promise<boolean> {
    const k = key(id);
    const now = Date.now();
    const expiry = entries.get(k);
    if (expiry !== undefined && expiry > now) {
      return false;
    }
    entries.set(k, now + ttlSeconds * 1000);
    const timer = setTimeout(() => {
      const current = entries.get(k);
      if (current !== undefined && current <= Date.now()) {
        entries.delete(k);
      }
    }, ttlSeconds * 1000);
    timer.unref();
    return true;
  }

  async function isProcessed(id: string): Promise<boolean> {
    const k = key(id);
    const expiry = entries.get(k);
    if (expiry === undefined) {
      return false;
    }
    if (expiry <= Date.now()) {
      entries.delete(k);
      return false;
    }
    return true;
  }

  return {
    claim,
    isProcessed,
    async dispose(): Promise<void> {
      entries.clear();
    },
  };
}
