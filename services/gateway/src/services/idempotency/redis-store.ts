import type Redis from 'ioredis';
import type { IdempotencyStore, StoredIdempotencyResult } from './types';

const PENDING = 'pending';

const CLAIM_LUA = `
local exists = redis.call('EXISTS', KEYS[1])
redis.call('SET', KEYS[1], 'pending', 'PX', tonumber(ARGV[1]) * 1000)
if exists == 0 then return 1 else return 0 end
`;

/**
 * Redis-backed idempotency store (FR-161). The claim is atomic so concurrent
 * retries of the same key cannot double-execute. Shared across gateway
 * instances via the platform Redis (06 §2.3).
 */
export class RedisIdempotencyStore implements IdempotencyStore {
  constructor(private readonly client: Redis) {}

  async claim(key: string, ttlSeconds: number): Promise<boolean> {
    const result = await this.client.eval(CLAIM_LUA, 1, key, ttlSeconds);
    return result === 1;
  }

  async get(key: string): Promise<StoredIdempotencyResult | null> {
    const value = await this.client.get(key);
    if (!value || value === PENDING) {
      return null;
    }
    return JSON.parse(value) as StoredIdempotencyResult;
  }

  async save(key: string, result: StoredIdempotencyResult, ttlSeconds: number): Promise<void> {
    await this.client.set(key, JSON.stringify(result), 'PX', ttlSeconds * 1000);
  }

  async delete(key: string): Promise<void> {
    await this.client.del(key);
  }

  async dispose(): Promise<void> {
    // The shared Redis client is owned by the gateway app, not this store.
  }
}
