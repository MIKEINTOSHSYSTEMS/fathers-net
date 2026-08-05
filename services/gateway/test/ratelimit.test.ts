import { buildApp } from '../src/app';
import { loadGatewayConfig } from '../src/config';
import { createTestLogger } from '@fathersnet/test-utils';
import type { PlatformStores } from '../src/app';
import Fastify from 'fastify';
import {
  createMemoryTokenBucketStore,
  createRateLimitStore,
  type RateLimitStore,
} from '../src/services/ratelimit';
import { RedisTokenBucketStore } from '../src/services/ratelimit/redis-token-bucket';
import { createIdempotencyStore, type IdempotencyStore } from '../src/services/idempotency';
import { tierForPath, limitForTier, rateLimitPlugin } from '../src/middleware/rate-limit';
import type { FastifyInstance } from 'fastify';
import type Redis from 'ioredis';

const REDIS_TEST_URL = process.env.REDIS_TEST_URL;

function testConfig(overrides: Record<string, string> = {}) {
  return loadGatewayConfig({
    ...process.env,
    ENV: 'dev',
    FN_PORT: '3000',
    FN_SERVICE_NAME: 'gateway',
    FN_VERSION: 'test',
    ...overrides,
  } as NodeJS.ProcessEnv);
}

function memoryStores(rateLimit?: RateLimitStore, idempotency?: IdempotencyStore): PlatformStores {
  return {
    rateLimit: rateLimit ?? createRateLimitStore({ driver: 'memory' }),
    idempotency: idempotency ?? createIdempotencyStore({ driver: 'memory' }),
  };
}

async function buildGateway(stores?: PlatformStores) {
  const { logger } = createTestLogger('info');
  return buildApp({ config: testConfig(), logger, stores });
}

describe('rate limit tier mapping', () => {
  it('maps paths to tiers', () => {
    expect(tierForPath('/v1/ping')).toBe('default');
    expect(tierForPath('/v1/ai/chat')).toBe('ai');
    expect(tierForPath('/v1/admin/exports')).toBe('admin-export');
    expect(tierForPath('/v1/admin/exports/123')).toBe('admin-export');
  });

  it('resolves limits from config', () => {
    const config = testConfig({
      FN_RATE_LIMIT_DEFAULT: '100',
      FN_RATE_LIMIT_AI: '25',
      FN_RATE_LIMIT_ADMIN_EXPORT: '5',
    });
    expect(limitForTier('default', config)).toBe(100);
    expect(limitForTier('ai', config)).toBe(25);
    expect(limitForTier('admin-export', config)).toBe(5);
  });
});

describe('memory token bucket store', () => {
  let now: number;
  let store: RateLimitStore;

  beforeEach(() => {
    now = 1_700_000_000_000;
    store = createMemoryTokenBucketStore(() => now);
  });

  afterEach(async () => {
    await store.dispose();
  });

  it('allows exactly `limit` requests in a window then blocks', async () => {
    for (let i = 0; i < 10; i += 1) {
      const result = await store.consume('k', 10, 60);
      expect(result.allowed).toBe(true);
      expect(result.limit).toBe(10);
      expect(result.remaining).toBe(9 - i);
    }
    const blocked = await store.consume('k', 10, 60);
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterSeconds).toBeGreaterThan(0);
    expect(blocked.remaining).toBe(0);
  });

  it('refills tokens as time passes', async () => {
    for (let i = 0; i < 10; i += 1) {
      await store.consume('k', 10, 60);
    }
    const blocked = await store.consume('k', 10, 60);
    expect(blocked.allowed).toBe(false);
    expect(blocked.remaining).toBe(0);

    now += 60_000;
    const refilled = await store.consume('k', 10, 60);
    expect(refilled.allowed).toBe(true);
  });

  it('tracks buckets independently by key', async () => {
    await store.consume('a', 1, 60);
    expect((await store.consume('a', 1, 60)).allowed).toBe(false);
    expect((await store.consume('b', 1, 60)).allowed).toBe(true);
  });
});

describe('gateway rate limiting', () => {
  let app: FastifyInstance;

  afterEach(async () => {
    await app.close();
  });

  it('returns rate limit headers on every /v1 request', async () => {
    app = await buildGateway();
    const response = await app.inject({ method: 'GET', url: '/v1/ping' });

    expect(response.statusCode).toBe(200);
    expect(response.headers['x-ratelimit-limit']).toBeDefined();
    expect(response.headers['x-ratelimit-remaining']).toBeDefined();
    expect(response.headers['x-ratelimit-reset']).toBeDefined();
  });

  it('rejects with 429 and a Retry-After when the default tier is exhausted', async () => {
    const config = testConfig({ FN_RATE_LIMIT_DEFAULT: '3' });
    const { logger } = createTestLogger('info');
    app = await buildApp({ config, logger, stores: memoryStores() });

    for (let i = 0; i < 3; i += 1) {
      const ok = await app.inject({ method: 'GET', url: '/v1/ping' });
      expect(ok.statusCode).toBe(200);
    }
    const blocked = await app.inject({ method: 'GET', url: '/v1/ping' });
    expect(blocked.statusCode).toBe(429);
    expect(Number(blocked.headers['retry-after'])).toBeGreaterThan(0);
    expect(blocked.headers['x-ratelimit-remaining']).toBe('0');
    expect(blocked.json().error.code).toBe('RATE_LIMITED');
    expect(blocked.json().error.request_id).toBeDefined();
  });

  it('applies stricter limits to the AI tier', async () => {
    const config = testConfig({
      FN_RATE_LIMIT_DEFAULT: '3',
      FN_RATE_LIMIT_AI: '1',
    });
    const store = createRateLimitStore({ driver: 'memory' });

    const bare = Fastify();
    await bare.register(
      async (api) => {
        await rateLimitPlugin(api, { store, config });
        api.get('/ping', async () => ({ status: 'ok' }));
        api.get('/ai/chat', async () => ({ status: 'ok' }));
      },
      { prefix: '/v1' },
    );

    expect((await bare.inject({ method: 'GET', url: '/v1/ai/chat' })).statusCode).toBe(200);
    const aiBlocked = await bare.inject({ method: 'GET', url: '/v1/ai/chat' });
    expect(aiBlocked.statusCode).toBe(429);
    expect(aiBlocked.json().error.code).toBe('RATE_LIMITED');

    expect((await bare.inject({ method: 'GET', url: '/v1/ping' })).statusCode).toBe(200);
    await bare.close();
    await store.dispose();
  });
});

const describeRedis = REDIS_TEST_URL ? describe : describe.skip;

describeRedis('redis token bucket store (integration)', () => {
  let client: Redis;
  let store: RedisTokenBucketStore;

  beforeEach(async () => {
    const { default: Redis } = await import('ioredis');
    client = new Redis(REDIS_TEST_URL as string);
    store = new RedisTokenBucketStore(client);
    await client.flushdb();
  });

  afterEach(async () => {
    await client.quit();
  });

  it('enforces the limit atomically across calls', async () => {
    const first = await store.consume('it:rl:1', 2, 60);
    expect(first.allowed).toBe(true);
    const second = await store.consume('it:rl:1', 2, 60);
    expect(second.allowed).toBe(true);
    const third = await store.consume('it:rl:1', 2, 60);
    expect(third.allowed).toBe(false);
    expect(third.retryAfterSeconds).toBeGreaterThan(0);
  });

  it('keeps separate buckets per key', async () => {
    await store.consume('it:rl:a', 1, 60);
    const other = await store.consume('it:rl:b', 1, 60);
    expect(other.allowed).toBe(true);
  });
});
