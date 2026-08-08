import Fastify, { LogController, type FastifyInstance, type FastifyBaseLogger } from 'fastify';
import { createLogger, type Logger } from '@fathersnet/logger';
import type { ChecklistsConfig } from './config';
import { buildGenReqId, requestIdPlugin, REQUEST_ID_HEADER } from './middleware/request-id';
import { errorHandler } from './middleware/errors';
import { requireBearerPlugin } from './middleware/auth';
import { healthRoutes } from './routes/health';
import { checklistRoutes, type ChecklistRouteDeps } from './routes/checklists';
import { budgetRoutes, type BudgetRouteDeps } from './routes/budget';
import { createChecklistBudgetStore, type ChecklistBudgetStore } from './store';
import { ChecklistService } from './services/checklist-service';
import { BudgetService } from './services/budget-service';
import { createTokenVerifier, type TokenVerifier } from './services/tokens';

export interface ChecklistAppOptions {
  config: ChecklistsConfig;
  logger?: Logger;
  /** Test seam: inject a hermetic store instead of building from config. */
  store?: ChecklistBudgetStore;
  /** Test seam: inject a token verifier (defaults to the shared HS256 contract). */
  tokenVerifier?: TokenVerifier;
}

/**
 * Build the Fastify checklist & budget application. Pure — no sockets are
 * opened here; tests call this and use `app.inject`/`listen(0)`. Registered as
 * a factory so CI can boot the same wiring as production (plan §7).
 *
 * No event bus: WP-023 emits NO events (the canonical vocabulary has no
 * checklist/budget event; plan §5), so Redis is not wired.
 */
export async function buildChecklistApp(options: ChecklistAppOptions): Promise<FastifyInstance> {
  const { config } = options;
  const logger =
    options.logger ?? createLogger({ service: config.FN_SERVICE_NAME, env: config.ENV });

  const app = Fastify({
    loggerInstance: logger.pino() as unknown as FastifyBaseLogger,
    logController: new LogController({ disableRequestLogging: true }),
    genReqId: buildGenReqId(),
    trustProxy: true,
  });

  await requestIdPlugin(app, (request) => {
    return logger.child({ request_id: request.id });
  });

  errorHandler(app);

  const store: ChecklistBudgetStore =
    options.store ??
    createChecklistBudgetStore({
      driver: config.FN_CHECKLISTS_STORE_DRIVER,
      databaseUrl: config.FN_CHECKLISTS_DATABASE_URL,
    });

  await healthRoutes(app, { config, store });

  const tokenVerifier: TokenVerifier =
    options.tokenVerifier ??
    createTokenVerifier(
      config.FN_CHECKLISTS_JWT_SECRET,
      config.FN_CHECKLISTS_ISSUER,
      config.FN_CHECKLISTS_AUDIENCE,
    );

  const checklistService = new ChecklistService({ store, logger });
  const budgetService = new BudgetService({ store, logger, cap: config.FN_BUDGET_CAP });
  const checklistDeps: ChecklistRouteDeps = { checklistService };
  const budgetDeps: BudgetRouteDeps = { budgetService };

  app.addHook('onClose', async () => {
    await store.dispose();
  });

  await app.register(
    async (api) => {
      await requireBearerPlugin(api, tokenVerifier);
      await checklistRoutes(api, checklistDeps);
      await budgetRoutes(api, budgetDeps);
    },
    { prefix: '/v1' },
  );

  return app;
}

export { REQUEST_ID_HEADER };
