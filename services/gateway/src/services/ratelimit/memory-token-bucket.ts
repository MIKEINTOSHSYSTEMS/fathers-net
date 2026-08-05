import type { RateLimitResult, RateLimitStore } from './types';

interface TokenBucket {
  tokens: number;
  lastRefill: number;
}

const STALE_MS = 10 * 60 * 1000;
const MAX_BUCKETS = 10_000;

/**
 * In-memory token bucket store. Used for local development and as the CI
 * default so tests stay hermetic; production/staging use the Redis store so
 * limits hold across gateway instances. The clock is injectable for tests.
 */
export function createMemoryTokenBucketStore(now: () => number = Date.now): RateLimitStore {
  const buckets = new Map<string, TokenBucket>();

  async function consume(
    key: string,
    limit: number,
    windowSeconds: number,
  ): Promise<RateLimitResult> {
    const current = now();
    const refillRate = limit / windowSeconds;
    let bucket = buckets.get(key);
    if (!bucket) {
      bucket = { tokens: limit, lastRefill: current };
      buckets.set(key, bucket);
      if (buckets.size > MAX_BUCKETS) {
        prune(current);
      }
    }

    const elapsed = Math.max(0, (current - bucket.lastRefill) / 1000);
    bucket.tokens = Math.min(limit, bucket.tokens + elapsed * refillRate);
    bucket.lastRefill = current;

    const allowed = bucket.tokens >= 1;
    if (allowed) {
      bucket.tokens -= 1;
    }
    const remaining = Math.floor(bucket.tokens);
    const retryAfterSeconds = allowed
      ? 0
      : Math.max(1, Math.ceil((1 - bucket.tokens) / refillRate));
    const resetAtSeconds =
      Math.ceil(current / 1000) + Math.ceil((limit - bucket.tokens) / refillRate);
    return { allowed, limit, remaining, retryAfterSeconds, resetAtSeconds };
  }

  function prune(current: number): void {
    const cutoff = current - STALE_MS;
    for (const [key, bucket] of buckets) {
      if (bucket.lastRefill < cutoff) {
        buckets.delete(key);
      }
    }
  }

  return {
    consume,
    async dispose(): Promise<void> {
      buckets.clear();
    },
  };
}
