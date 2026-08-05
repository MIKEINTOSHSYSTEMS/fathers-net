import Redis from 'ioredis';

/**
 * Create a lazy Redis client (no connection until the first command). The
 * gateway never opens the connection at boot: rate limiting and idempotency
 * degrade to in-memory stores when Redis is unavailable, so readiness stays
 * independent of Redis availability (12-factor, decoupled deps).
 */
export function createRedisClient(url: string): Redis {
  return new Redis(url, {
    lazyConnect: true,
    maxRetriesPerRequest: 1,
    enableOfflineQueue: false,
    connectTimeout: 2000,
  });
}
