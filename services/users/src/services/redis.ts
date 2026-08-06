import Redis from 'ioredis';

/**
 * Create a lazy Redis client (no connection until the first command). The
 * users service only talks to the broker for best-effort `user.*` event
 * publishing when the Postgres store driver is active; memory mode stays
 * hermetic for dev/CI (M-08).
 */
export function createRedisClient(url: string): Redis {
  return new Redis(url, {
    lazyConnect: true,
    maxRetriesPerRequest: 1,
    enableOfflineQueue: false,
    connectTimeout: 2000,
  });
}
