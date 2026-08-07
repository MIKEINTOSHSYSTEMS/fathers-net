import Fastify, { LogController, type FastifyInstance, type FastifyBaseLogger } from 'fastify';
import { createLogger, type Logger } from '@fathersnet/logger';

import type { SchedulerConfig } from './config';
import { errorHandler } from './middleware/errors';
import { buildGenReqId, requestIdPlugin } from './middleware/request-id';

export interface SchedulerAppOptions {
  config: SchedulerConfig;
  logger?: Logger;
}

/**
 * Build the Fastify scheduler application. Pure — no sockets are opened here;
 * tests call this and use `app.inject`. The scheduler has no public `/v1/`
 * routes (WP-024b skeleton); it exposes `/healthz` for the compose healthcheck
 * and orchestrators.
 */
export async function buildSchedulerApp(options: SchedulerAppOptions): Promise<FastifyInstance> {
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

  // Liveness probe for orchestrators/healthchecks.
  app.get('/healthz', async () => ({
    status: 'ok',
    service: config.FN_SERVICE_NAME,
    env: config.ENV,
    version: config.FN_VERSION,
  }));

  return app;
}
