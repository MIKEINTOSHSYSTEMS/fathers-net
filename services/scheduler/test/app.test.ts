import { loadSchedulerConfig } from '../src/config';
import { buildSchedulerApp } from '../src/app';
import { createTestLogger } from '@fathersnet/test-utils';

describe('scheduler app', () => {
  it('serves /healthz with the standard envelope', async () => {
    const config = loadSchedulerConfig({});
    const { logger } = createTestLogger();
    const app = await buildSchedulerApp({ config, logger });
    try {
      const response = await app.inject({ method: 'GET', url: '/healthz' });
      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({
        status: 'ok',
        service: 'scheduler',
        env: 'dev',
        version: '0.1.0',
      });
    } finally {
      await app.close();
    }
  });

  it('returns the standard 404 envelope for unknown routes', async () => {
    const config = loadSchedulerConfig({});
    const { logger } = createTestLogger();
    const app = await buildSchedulerApp({ config, logger });
    try {
      const response = await app.inject({ method: 'GET', url: '/nope' });
      expect(response.statusCode).toBe(404);
      expect(response.json().error.code).toBe('NOT_FOUND');
    } finally {
      await app.close();
    }
  });

  it('echoes a valid X-Request-Id header', async () => {
    const config = loadSchedulerConfig({});
    const { logger } = createTestLogger();
    const app = await buildSchedulerApp({ config, logger });
    try {
      const response = await app.inject({
        method: 'GET',
        url: '/healthz',
        headers: { 'x-request-id': 'req-12345678' },
      });
      expect(response.headers['x-request-id']).toBe('req-12345678');
    } finally {
      await app.close();
    }
  });
});
