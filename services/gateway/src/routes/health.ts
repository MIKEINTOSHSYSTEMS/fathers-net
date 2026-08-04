import type { FastifyInstance } from 'fastify';
import type { GatewayConfig } from '../config';
import type { ReadinessRegistry } from '../services/readiness';

export interface HealthDeps {
  config: GatewayConfig;
  readiness: ReadinessRegistry;
  startedAt: number;
}

export async function healthRoutes(app: FastifyInstance, deps: HealthDeps): Promise<void> {
  const { config, readiness, startedAt } = deps;

  app.get('/healthz', async () => {
    return {
      status: 'ok',
      service: config.FN_SERVICE_NAME,
      env: config.ENV,
      version: config.FN_VERSION,
      uptime: (Date.now() - startedAt) / 1000,
    };
  });

  app.get('/readyz', async (_request, reply) => {
    const result = await readiness.checkAll();
    reply.code(result.status === 'ready' ? 200 : 503);
    return {
      status: result.status === 'ready' ? 'ready' : 'not_ready',
      checks: result.checks,
    };
  });
}
