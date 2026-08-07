import Redis from 'ioredis';

/**
 * Create a lazy Redis client (no connection until the first command). The
 * scheduler uses Redis for leader election, run-id binding, and the job DLQ.
 * Failures surface immediately so the worker can log and skip instead of
 * queueing silently.
 */
export function createRedisClient(url: string): Redis {
  return new Redis(url, {
    lazyConnect: true,
    maxRetriesPerRequest: 1,
    enableOfflineQueue: false,
    connectTimeout: 2000,
  });
}
