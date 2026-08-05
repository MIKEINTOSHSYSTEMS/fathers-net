import { createHash, randomUUID } from 'node:crypto';
import Fastify, { type FastifyInstance } from 'fastify';
import { buildApp } from '../src/app';
import { loadGatewayConfig } from '../src/config';
import { createTestLogger } from '@fathersnet/test-utils';
import type { PlatformStores } from '../src/app';
import { createIdempotencyStore, type IdempotencyStore } from '../src/services/idempotency';
import { createRateLimitStore } from '../src/services/ratelimit';
import { idempotencyPlugin } from '../src/middleware/idempotency';
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

function memoryStores(idempotency?: IdempotencyStore): PlatformStores {
  return {
    rateLimit: createRateLimitStore({ driver: 'memory' }),
    idempotency: idempotency ?? createIdempotencyStore({ driver: 'memory' }),
  };
}

async function buildGateway(idempotency?: IdempotencyStore) {
  const { logger } = createTestLogger('info');
  return buildApp({ config: testConfig(), logger, stores: memoryStores(idempotency) });
}

function derivedKey(method: string, url: string, key: string): string {
  const hash = createHash('sha256').update(`${method}:${url}:${key}`).digest('hex');
  return `idempotency:${hash}`;
}

describe('memory idempotency store', () => {
  let store: IdempotencyStore;

  beforeEach(() => {
    store = createIdempotencyStore({ driver: 'memory' });
  });

  afterEach(async () => {
    await store.dispose();
  });

  it('claims a key once, then blocks subsequent claims', async () => {
    expect(await store.claim('k', 60)).toBe(true);
    expect(await store.claim('k', 60)).toBe(false);
  });

  it('returns null while pending, then the saved result', async () => {
    await store.claim('k', 60);
    expect(await store.get('k')).toBeNull();
    const result = {
      statusCode: 200,
      headers: { 'content-type': 'application/json' },
      body: '{"ok":true}',
    };
    await store.save('k', result, 60);
    expect(await store.get('k')).toEqual(result);
  });

  it('releases the key on delete', async () => {
    await store.claim('k', 60);
    await store.delete('k');
    expect(await store.claim('k', 60)).toBe(true);
  });
});

describe('gateway idempotency', () => {
  let app: FastifyInstance;
  let store: IdempotencyStore;

  beforeEach(async () => {
    store = createIdempotencyStore({ driver: 'memory' });
    app = await buildGateway(store);
  });

  afterEach(async () => {
    await app.close();
  });

  it('stores and replays the response for repeated POSTs with the same key', async () => {
    const key = randomUUID();
    const payload = { hello: 'world' };

    const first = await app.inject({
      method: 'POST',
      url: '/v1/platform/echo',
      headers: { 'Idempotency-Key': key },
      payload,
    });
    expect(first.statusCode).toBe(200);
    expect(first.json()).toEqual({ echo: payload });
    expect(first.headers['x-idempotency-replayed']).toBeUndefined();

    const second = await app.inject({
      method: 'POST',
      url: '/v1/platform/echo',
      headers: { 'Idempotency-Key': key },
      payload: { different: 'payload' },
    });
    expect(second.statusCode).toBe(200);
    expect(second.json()).toEqual({ echo: payload });
    expect(second.headers['x-idempotency-replayed']).toBe('true');
  });

  it('allows POSTs without an idempotency key', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/v1/platform/echo',
      payload: { hello: 'world' },
    });
    expect(response.statusCode).toBe(200);
  });

  it('rejects malformed idempotency keys with 400', async () => {
    for (const badKey of ['short', 'has spaces in it!', 'x'.repeat(129)]) {
      const response = await app.inject({
        method: 'POST',
        url: '/v1/platform/echo',
        headers: { 'Idempotency-Key': badKey },
        payload: {},
      });
      expect(response.statusCode).toBe(400);
      expect(response.json().error.code).toBe('BAD_REQUEST');
    }
  });

  it('does not apply idempotency to non-mutating methods', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/v1/ping',
      headers: { 'Idempotency-Key': randomUUID() },
    });
    expect(response.statusCode).toBe(200);
  });

  it('returns 409 while the same key is still being processed', async () => {
    const key = randomUUID();
    await store.claim(derivedKey('POST', '/v1/platform/echo', key), 60);

    const response = await app.inject({
      method: 'POST',
      url: '/v1/platform/echo',
      headers: { 'Idempotency-Key': key },
      payload: {},
    });
    expect(response.statusCode).toBe(409);
    expect(response.json().error.code).toBe('CONFLICT');
  });
});

describe('idempotency middleware hooks', () => {
  async function buildBare() {
    const store: IdempotencyStore = {
      claim: jest.fn(),
      get: jest.fn(),
      save: jest.fn(),
      delete: jest.fn(),
      dispose: jest.fn(),
    };
    const config = testConfig();
    const app = Fastify();
    await app.register(
      async (api) => {
        await idempotencyPlugin(api, { store, config });
        api.post('/echo', async () => ({ ok: true }));
        api.post('/boom', async () => {
          throw new Error('boom');
        });
      },
      { prefix: '/v1' },
    );
    return { app, store };
  }

  it('releases the idempotency slot when the response is a 5xx', async () => {
    const { app, store } = await buildBare();
    const key = randomUUID();
    (store.claim as jest.Mock).mockResolvedValue(true);

    const response = await app.inject({
      method: 'POST',
      url: '/v1/boom',
      headers: { 'Idempotency-Key': key },
      payload: {},
    });

    expect(response.statusCode).toBe(500);
    expect(store.delete).toHaveBeenCalledWith(derivedKey('POST', '/v1/boom', key));
    await app.close();
  });

  it('stores successful responses', async () => {
    const { app, store } = await buildBare();
    const key = randomUUID();
    (store.claim as jest.Mock).mockResolvedValue(true);

    const response = await app.inject({
      method: 'POST',
      url: '/v1/echo',
      headers: { 'Idempotency-Key': key },
      payload: {},
    });

    expect(response.statusCode).toBe(200);
    expect(store.delete).not.toHaveBeenCalled();
    expect(store.save).toHaveBeenCalledTimes(1);
    const [savedKey, result] = (store.save as jest.Mock).mock.calls[0];
    expect(savedKey).toBe(derivedKey('POST', '/v1/echo', key));
    expect(result.statusCode).toBe(200);
    expect(JSON.parse(result.body)).toEqual({ ok: true });
    await app.close();
  });

  it('replays a completed stored response', async () => {
    const { app, store } = await buildBare();
    const key = randomUUID();
    (store.claim as jest.Mock).mockResolvedValue(false);
    (store.get as jest.Mock).mockResolvedValue({
      statusCode: 200,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ok: true }),
    });

    const response = await app.inject({
      method: 'POST',
      url: '/v1/echo',
      headers: { 'Idempotency-Key': key },
      payload: {},
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ ok: true });
    expect(response.headers['x-idempotency-replayed']).toBe('true');
    expect(store.save).not.toHaveBeenCalled();
    await app.close();
  });

  it('returns 409 when the claim fails and nothing is stored yet', async () => {
    const { app, store } = await buildBare();
    const key = randomUUID();
    (store.claim as jest.Mock).mockResolvedValue(false);
    (store.get as jest.Mock).mockResolvedValue(null);

    const response = await app.inject({
      method: 'POST',
      url: '/v1/echo',
      headers: { 'Idempotency-Key': key },
      payload: {},
    });

    expect(response.statusCode).toBe(409);
    expect(response.json().error.code).toBe('CONFLICT');
    await app.close();
  });
});

const describeRedis = REDIS_TEST_URL ? describe : describe.skip;

describeRedis('redis idempotency store (integration)', () => {
  let client: Redis;
  let store: IdempotencyStore;

  beforeEach(async () => {
    const { default: Redis } = await import('ioredis');
    client = new Redis(REDIS_TEST_URL as string);
    store = createIdempotencyStore({ driver: 'redis', redis: client });
    await client.flushdb();
  });

  afterEach(async () => {
    await client.quit();
  });

  it('claims, saves, reads and releases a key', async () => {
    expect(await store.claim('it:idem:1', 60)).toBe(true);
    expect(await store.claim('it:idem:1', 60)).toBe(false);
    expect(await store.get('it:idem:1')).toBeNull();

    const result = { statusCode: 201, headers: { 'content-type': 'application/json' }, body: '{}' };
    await store.save('it:idem:1', result, 60);
    expect(await store.get('it:idem:1')).toEqual(result);

    await store.delete('it:idem:1');
    expect(await store.claim('it:idem:1', 60)).toBe(true);
  });
});
