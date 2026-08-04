import Fastify, { LogController, type FastifyInstance, type FastifyBaseLogger } from 'fastify';
import { createLogger, type Logger } from '@fathersnet/logger';
import type { GatewayConfig } from './config';
import { buildGenReqId, requestIdPlugin, REQUEST_ID_HEADER } from './middleware/request-id';
import { errorHandler } from './middleware/errors';
import { healthRoutes } from './routes/health';
import { createReadinessRegistry } from './services/readiness';

export interface AppContext {
  config: GatewayConfig;
  logger: Logger;
  startedAt: number;
}

export interface BuildAppOptions {
  config: GatewayConfig;
  logger?: Logger;
  startedAt?: number;
}

/**
 * Build the Fastify gateway application. Pure — no sockets are opened here;
 * tests call this and use `app.inject`/`listen(0)`. Registered as a factory so
 * CI can boot the same wiring as production.
 */
export async function buildApp(options: BuildAppOptions): Promise<FastifyInstance> {
  const { config } = options;
  const logger =
    options.logger ?? createLogger({ service: config.FN_SERVICE_NAME, env: config.ENV });
  const startedAt = options.startedAt ?? Date.now();

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

  const readiness = createReadinessRegistry();

  await healthRoutes(app, { config, readiness, startedAt });

  return app;
}

export { REQUEST_ID_HEADER };
