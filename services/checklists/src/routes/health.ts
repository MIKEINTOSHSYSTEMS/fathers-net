import type { FastifyInstance } from 'fastify';
import type { ChecklistsConfig } from '../config';
import type { ChecklistBudgetStore } from '../store';

export interface HealthRouteDeps {
  config: ChecklistsConfig;
  store: ChecklistBudgetStore;
}

/**
 * Liveness/readiness probes (plan §7). `/healthz` is the process-liveness
 * probe used by compose/orchestrators; `/readyz` additionally verifies the
 * store can answer a round-trip (Postgres `SELECT 1`) so the container is only
 * marked ready once the data layer is reachable.
 */
export async function healthRoutes(app: FastifyInstance, deps: HealthRouteDeps): Promise<void> {
  app.get('/healthz', async () => ({
    status: 'ok',
    service: deps.config.FN_SERVICE_NAME,
    env: deps.config.ENV,
    version: deps.config.FN_VERSION,
  }));

  app.get('/readyz', async (_request, reply) => {
    const dbReady = await deps.store.ping();
    if (!dbReady) {
      reply.status(503);
      return { status: 'unavailable', driver: deps.config.FN_CHECKLISTS_STORE_DRIVER };
    }
    return { status: 'ok', driver: deps.config.FN_CHECKLISTS_STORE_DRIVER };
  });
}
