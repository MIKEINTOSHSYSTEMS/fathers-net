import Redis from 'ioredis';

/**
 * Lazy Redis client shared by the bus, consumers, and the outbox relay
 * (mirrors `services/gateway/src/services/redis.ts`). No connection is opened
 * until the first command; failures surface immediately so the relay can
 * schedule a retry / dead-letter instead of queueing silently.
 */
export function createRedisClient(url: string): Redis {
  return new Redis(url, {
    lazyConnect: true,
    maxRetriesPerRequest: 1,
    enableOfflineQueue: false,
    connectTimeout: 2000,
  });
}
