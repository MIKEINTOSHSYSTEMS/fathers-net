import type Redis from 'ioredis';
import type { RateLimitStore } from './types';
import { createMemoryTokenBucketStore } from './memory-token-bucket';
import { RedisTokenBucketStore } from './redis-token-bucket';

export { createMemoryTokenBucketStore } from './memory-token-bucket';
export { RedisTokenBucketStore } from './redis-token-bucket';
export type { RateLimitResult, RateLimitStore } from './types';

export type StoreDriver = 'memory' | 'redis';

export interface RateLimitStoreOptions {
  driver: StoreDriver;
  redis?: Redis;
  now?: () => number;
}

export function createRateLimitStore(options: RateLimitStoreOptions): RateLimitStore {
  if (options.driver === 'redis' && options.redis) {
    return new RedisTokenBucketStore(options.redis, options.now);
  }
  return createMemoryTokenBucketStore(options.now);
}
