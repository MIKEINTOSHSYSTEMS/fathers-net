import type Redis from 'ioredis';
import type { RateLimitResult, RateLimitStore } from './types';

const TOKEN_BUCKET_LUA = `
local key = KEYS[1]
local limit = tonumber(ARGV[1])
local refillRate = tonumber(ARGV[2])
local now = tonumber(ARGV[3])
local cost = tonumber(ARGV[4])

local fields = redis.call('HGETALL', key)
local tokens = limit
local last = now
if fields[1] then
  tokens = tonumber(fields[2]) or limit
  last = tonumber(fields[4]) or now
end

local elapsed = now - last
if elapsed > 0 then
  tokens = math.min(limit, tokens + elapsed * refillRate)
end

local allowed = 0
if tokens >= cost then
  tokens = tokens - cost
  allowed = 1
end

local remaining = math.floor(tokens)
local retryAfter = 0
if allowed == 0 then
  retryAfter = math.max(1, math.ceil((cost - tokens) / refillRate))
end
local reset = now + math.ceil((limit - tokens) / refillRate)

redis.call('HMSET', key, 'tokens', tostring(tokens), 'last', tostring(now))
redis.call('PEXPIRE', key, math.max(1000, math.floor(limit / refillRate * 2000)))
return { allowed, remaining, retryAfter, reset }
`;

/**
 * Redis-backed token bucket (FR-169). The whole consume/refill decision runs
 * atomically in Lua so limits hold across all gateway instances. `now` is
 * injected in seconds for deterministic tests.
 */
export class RedisTokenBucketStore implements RateLimitStore {
  private readonly now: () => number;

  constructor(
    private readonly client: Redis,
    now?: () => number,
  ) {
    this.now = now ?? (() => Math.floor(Date.now() / 1000));
  }

  async consume(key: string, limit: number, windowSeconds: number): Promise<RateLimitResult> {
    const result = (await this.client.eval(
      TOKEN_BUCKET_LUA,
      1,
      key,
      limit,
      limit / windowSeconds,
      this.now(),
      1,
    )) as [number, number, number, number];

    return {
      allowed: result[0] === 1,
      limit,
      remaining: result[1],
      retryAfterSeconds: result[2],
      resetAtSeconds: result[3],
    };
  }

  async dispose(): Promise<void> {
    // The shared Redis client is owned by the gateway app, not this store.
  }
}
