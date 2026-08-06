import Redis from 'ioredis';

/**
 * Create a lazy Redis client (no connection until the first command). The
 * auth service only uses Redis when the store driver is `redis`; the in-memory
 * store keeps dev/CI hermetic (M-08).
 */
export function createRedisClient(url: string): Redis {
  return new Redis(url, {
    lazyConnect: true,
    maxRetriesPerRequest: 1,
    enableOfflineQueue: false,
    connectTimeout: 2000,
  });
}
