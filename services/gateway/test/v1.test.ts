import { buildApp } from '../src/app';
import { loadGatewayConfig } from '../src/config';
import { createTestLogger } from '@fathersnet/test-utils';
import type { FastifyInstance } from 'fastify';

function testConfig(overrides: Record<string, string> = {}) {
  return loadGatewayConfig({
    ...process.env,
    ENV: 'dev',
    FN_PORT: '3000',
    FN_SERVICE_NAME: 'gateway',
    FN_VERSION: 'test',
    FN_CORS_ORIGINS: 'http://localhost:3000,http://localhost:8080',
    ...overrides,
  } as NodeJS.ProcessEnv);
}

describe('gateway v1 platform routes', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    const { logger } = createTestLogger('info');
    app = await buildApp({ config: testConfig(), logger });
  });

  afterEach(async () => {
    await app.close();
  });

  it('GET /v1/ping reports the platform smoke status', async () => {
    const response = await app.inject({ method: 'GET', url: '/v1/ping' });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.status).toBe('ok');
    expect(body.service).toBe('gateway');
    expect(body.version).toBe('test');
    expect(body.env).toBe('dev');
    expect(body.authenticated).toBe(false);
  });

  it('GET /v1/ping exposes the bearer pass-through identity flag', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/v1/ping',
      headers: { authorization: 'Bearer abc.def.ghi' },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().authenticated).toBe(true);
  });

  it('treats non-Bearer schemes as unauthenticated', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/v1/ping',
      headers: { authorization: 'Basic dXNlcjpwYXNz' },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().authenticated).toBe(false);
  });

  it('POST /v1/platform/echo echoes the request body', async () => {
    const payload = { question: 'who writes idempotency tests' };
    const response = await app.inject({
      method: 'POST',
      url: '/v1/platform/echo',
      payload,
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ echo: payload });
  });

  it('allows only configured origins for cross-origin requests', async () => {
    const allowed = await app.inject({
      method: 'GET',
      url: '/v1/ping',
      headers: { origin: 'http://localhost:8080' },
    });
    expect(allowed.headers['access-control-allow-origin']).toBe('http://localhost:8080');

    const denied = await app.inject({
      method: 'GET',
      url: '/v1/ping',
      headers: { origin: 'https://evil.example' },
    });
    expect(denied.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('answers CORS preflight for allowed origins', async () => {
    const response = await app.inject({
      method: 'OPTIONS',
      url: '/v1/ping',
      headers: {
        origin: 'http://localhost:3000',
        'access-control-request-method': 'GET',
      },
    });

    expect(response.statusCode).toBe(204);
    expect(response.headers['access-control-allow-origin']).toBe('http://localhost:3000');
    expect(response.headers['access-control-allow-methods']).toContain('GET');
  });

  it('does not apply CORS or rate limiting outside the /v1 prefix', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/healthz',
      headers: { origin: 'http://localhost:3000' },
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers['access-control-allow-origin']).toBeUndefined();
    expect(response.headers['x-ratelimit-limit']).toBeUndefined();
  });

  it('keeps the standard error envelope for unknown /v1 routes', async () => {
    const response = await app.inject({ method: 'GET', url: '/v1/nope' });

    expect(response.statusCode).toBe(404);
    expect(response.json().error.code).toBe('NOT_FOUND');
    expect(response.json().error.request_id).toBeDefined();
  });
});
