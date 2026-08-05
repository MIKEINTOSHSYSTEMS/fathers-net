import type Redis from 'ioredis';
import type { IdempotencyStore } from './types';
import { createMemoryIdempotencyStore } from './memory-store';
import { RedisIdempotencyStore } from './redis-store';
import type { StoreDriver } from '../ratelimit';

export type { IdempotencyStore, StoredIdempotencyResult } from './types';

export interface IdempotencyStoreOptions {
  driver: StoreDriver;
  redis?: Redis;
}

export function createIdempotencyStore(options: IdempotencyStoreOptions): IdempotencyStore {
  if (options.driver === 'redis' && options.redis) {
    return new RedisIdempotencyStore(options.redis);
  }
  return createMemoryIdempotencyStore();
}
