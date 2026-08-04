import { buildApp } from '../src/app';
import { loadGatewayConfig } from '../src/config';
import { createTestLogger } from '@fathersnet/test-utils';
import { REQUEST_ID_HEADER } from '../src/middleware/request-id';
import type { FastifyInstance } from 'fastify';

function testConfig(overrides: Partial<ReturnType<typeof loadGatewayConfig>> = {}) {
  return loadGatewayConfig({
    ...process.env,
    ENV: 'dev',
    FN_PORT: '3000',
    FN_SERVICE_NAME: 'gateway',
    FN_VERSION: 'test',
    ...(overrides as Record<string, string>),
  } as NodeJS.ProcessEnv);
}

describe('gateway health endpoints', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    const { logger } = createTestLogger('info');
    app = await buildApp({ config: testConfig(), logger });
  });

  afterEach(async () => {
    await app.close();
  });

  it('GET /healthz reports ok with service metadata', async () => {
    const response = await app.inject({ method: 'GET', url: '/healthz' });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.status).toBe('ok');
    expect(body.service).toBe('gateway');
    expect(body.env).toBe('dev');
    expect(body.version).toBe('test');
    expect(typeof body.uptime).toBe('number');
  });

  it('GET /readyz reports ready with empty checks in Milestone 1', async () => {
    const response = await app.inject({ method: 'GET', url: '/readyz' });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: 'ready', checks: [] });
  });

  it('echoes a valid caller-provided X-Request-Id', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/healthz',
      headers: { [REQUEST_ID_HEADER]: 'caller-trace-12345678' },
    });

    expect(response.headers[REQUEST_ID_HEADER]).toBe('caller-trace-12345678');
  });

  it('rejects malformed caller X-Request-Id and generates its own', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/healthz',
      headers: { [REQUEST_ID_HEADER]: 'bad value with spaces!' },
    });

    const echoed = response.headers[REQUEST_ID_HEADER];
    expect(echoed).toBeDefined();
    expect(echoed).toMatch(/^[a-f0-9]{32}$/);
    expect(echoed).not.toBe('bad value with spaces!');
  });

  it('unknown routes return the standard error envelope', async () => {
    const response = await app.inject({ method: 'GET', url: '/nope' });

    expect(response.statusCode).toBe(404);
    const body = response.json();
    expect(body.error).toBeDefined();
    expect(body.error.code).toBe('NOT_FOUND');
    expect(body.error.request_id).toBeDefined();
  });
});
