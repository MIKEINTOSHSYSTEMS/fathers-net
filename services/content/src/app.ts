import Fastify, { LogController, type FastifyInstance, type FastifyBaseLogger } from 'fastify';
import type Redis from 'ioredis';
import { Client } from 'pg';
import { createLogger, type Logger } from '@fathersnet/logger';
import {
  createInMemoryEventBus,
  createRedisEventBus,
  OutboxRelay,
  PostgresOutboxReader,
  type EventBus,
} from '@fathersnet/events';
import type { ContentConfig } from './config';
import { buildGenReqId, requestIdPlugin, REQUEST_ID_HEADER } from './middleware/request-id';
import { errorHandler } from './middleware/errors';
import { requireBearerPlugin } from './middleware/auth';
import { contentRoutes, type ContentRouteDeps } from './routes';
import { createContentStore, type ContentStore } from './services/store';
import { ContentService } from './services/content-service';
import { createTokenVerifier, type TokenVerifier } from './services/tokens';
import { createRedisClient } from './services/redis';

export interface ContentAppOptions {
  config: ContentConfig;
  logger?: Logger;
  /** Test seam: inject a hermetic store instead of building from config. */
  store?: ContentStore;
  /** Test seam: inject a token verifier (defaults to the shared HS256 contract). */
  tokenVerifier?: TokenVerifier;
  /** Test seam: inject an in-memory event bus instead of the broker. */
  eventBus?: EventBus;
}

/**
 * Build the Fastify content application. Pure — no sockets are opened here;
 * tests call this and use `app.inject`/`listen(0)`. Registered as a factory so
 * CI can boot the same wiring as production.
 */
export async function buildContentApp(options: ContentAppOptions): Promise<FastifyInstance> {
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

  let redisClient: Redis | null = null;
  const usePostgres = config.FN_STORE_DRIVER === 'postgres';
  if (usePostgres) {
    redisClient = createRedisClient(config.FN_REDIS_URL);
  }
  const store: ContentStore =
    options.store ??
    createContentStore({ driver: config.FN_STORE_DRIVER, databaseUrl: config.FN_DATABASE_URL });

  const eventBus: EventBus =
    options.eventBus ??
    (usePostgres && redisClient
      ? createRedisEventBus({ client: redisClient, logger })
      : createInMemoryEventBus());

  const tokenVerifier: TokenVerifier =
    options.tokenVerifier ??
    createTokenVerifier(
      config.FN_CONTENT_JWT_SECRET,
      config.FN_CONTENT_ISSUER,
      config.FN_CONTENT_AUDIENCE,
    );

  const contentService = new ContentService({ store, logger });
  const deps: ContentRouteDeps = { contentService, logger };

  // Outbox relay (WP-024c, D-03): the service writes `content_outbox` rows in
  // the same DB transaction as each domain write; the relay publishes committed
  // rows to the bus and marks them published. Only wired on the real Postgres
  // store (never with an injected test store). `onDead` is the OR-008 alerting
  // surface — the current sink is an error log, upgraded when an alerting
  // channel ships.
  let relay: OutboxRelay | null = null;
  let relayClient: Client | null = null;
  if (usePostgres && !options.store) {
    relayClient = new Client({ connectionString: config.FN_DATABASE_URL });
    await relayClient.connect();
    relay = new OutboxRelay({
      bus: eventBus,
      reader: new PostgresOutboxReader(relayClient, 'content_outbox'),
      logger,
      onDead: async (row, error) => {
        logger.error('outbox.dead_alert', 'Outbox row dead-lettered (OR-008)', {
          event_id: row.event_id,
          event_type: row.event_type,
          error: error.message,
        });
      },
    });
    relay.start();
  }

  app.addHook('onClose', async () => {
    await relay?.stop();
    await relayClient?.end();
    await store.dispose();
    await eventBus.dispose();
    await redisClient?.quit();
  });

  await app.register(
    async (api) => {
      await requireBearerPlugin(api, tokenVerifier);
      await contentRoutes(api, deps);
    },
    { prefix: '/v1/content' },
  );

  return app;
}

export { REQUEST_ID_HEADER };
