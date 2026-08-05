import type { IdempotencyStore, StoredIdempotencyResult } from './types';

const PENDING = 'pending';

/**
 * In-memory idempotency store for local development and hermetic CI. Not
 * shared across processes — production/staging use the Redis store.
 */
export function createMemoryIdempotencyStore(): IdempotencyStore {
  const entries = new Map<string, string>();

  async function claim(key: string, ttlSeconds: number): Promise<boolean> {
    if (entries.has(key)) {
      return false;
    }
    entries.set(key, PENDING);
    const timer = setTimeout(() => {
      entries.delete(key);
    }, ttlSeconds * 1000);
    timer.unref();
    return true;
  }

  async function get(key: string): Promise<StoredIdempotencyResult | null> {
    const value = entries.get(key);
    if (!value || value === PENDING) {
      return null;
    }
    return JSON.parse(value) as StoredIdempotencyResult;
  }

  async function save(key: string, result: StoredIdempotencyResult): Promise<void> {
    entries.set(key, JSON.stringify(result));
  }

  async function deleteKey(key: string): Promise<void> {
    entries.delete(key);
  }

  return {
    claim,
    get,
    save,
    delete: deleteKey,
    async dispose(): Promise<void> {
      entries.clear();
    },
  };
}
