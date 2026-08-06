import type Redis from 'ioredis';
import type { AuthStateStore } from './types';
import { createMemoryAuthStateStore } from './memory-store';
import { RedisAuthStateStore } from './redis-store';

export type AuthStoreDriver = 'memory' | 'redis';

export interface AuthStateStoreOptions {
  driver: AuthStoreDriver;
  redis?: Redis;
  /** Injectable clock (milliseconds) for deterministic tests. */
  nowMs?: () => number;
}

/**
 * Store factory (M-08: provider-agnostic). The Redis adapter is the pilot;
 * the in-memory store is the hermetic test-double used by unit tests, CI
 * without Redis, and local development.
 */
export type { AuthStateStore } from './types';
export type { OtpRecord, AttemptState, RequestCount, RefreshTokenRecord } from './types';

export function createAuthStateStore(options: AuthStateStoreOptions): AuthStateStore {
  if (options.driver === 'redis' && options.redis) {
    return new RedisAuthStateStore(options.redis, options.nowMs);
  }
  return createMemoryAuthStateStore(options.nowMs);
}
