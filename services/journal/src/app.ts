import Fastify, { LogController, type FastifyInstance, type FastifyBaseLogger } from 'fastify';
import type Redis from 'ioredis';
import { createLogger, type Logger } from '@fathersnet/logger';
import { createInMemoryEventBus, createRedisEventBus, type EventBus } from '@fathersnet/events';
import type { JournalConfig } from './config';
import { buildGenReqId, requestIdPlugin, REQUEST_ID_HEADER } from './middleware/request-id';
import { errorHandler } from './middleware/errors';
import { requireBearerPlugin } from './middleware/auth';
import { healthRoutes } from './routes/health';
import { entryRoutes, type EntryRouteDeps } from './routes/entries';
import { createJournalStore, type JournalStore } from './store';
import { JournalService } from './services/journal-service';
import { createTokenVerifier, type TokenVerifier } from './services/tokens';
import { createRedisClient } from './services/redis';
import { createJournalRelay, type JournalRelay } from './services/relay';

export interface JournalAppOptions {
  config: JournalConfig;
  logger?: Logger;
  /** Test seam: inject a hermetic store instead of building from config. */
  store?: JournalStore;
  /** Test seam: inject a token verifier (defaults to the shared HS256 contract). */
  tokenVerifier?: TokenVerifier;
  /** Test seam: inject an in-memory event bus instead of the broker. */
  eventBus?: EventBus;
}

/**
 * Build the Fastify journal application. Pure — no sockets are opened here;
 * tests call this and use `app.inject`/`listen(0)`. Registered as a factory so
 * CI can boot the same wiring as production (WP-022 §4).
 */
export async function buildJournalApp(options: JournalAppOptions): Promise<FastifyInstance> {
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

  const store: JournalStore =
    options.store ??
    createJournalStore({ driver: config.FN_STORE_DRIVER, databaseUrl: config.FN_DATABASE_URL });

  await healthRoutes(app, { config, store });

  let redisClient: Redis | null = null;
  const usePostgres = config.FN_STORE_DRIVER === 'postgres';
  if (usePostgres && !options.eventBus) {
    redisClient = createRedisClient(config.FN_REDIS_URL);
  }

  const eventBus: EventBus =
    options.eventBus ??
    (usePostgres && redisClient
      ? createRedisEventBus({ client: redisClient, logger })
      : createInMemoryEventBus());

  const tokenVerifier: TokenVerifier =
    options.tokenVerifier ??
    createTokenVerifier(
      config.FN_JOURNAL_JWT_SECRET,
      config.FN_JOURNAL_ISSUER,
      config.FN_JOURNAL_AUDIENCE,
    );

  const journalService = new JournalService({ store, logger });
  const deps: EntryRouteDeps = { journalService };

  // Outbox relay (WP-024c, D-03): `store.create` writes `journal_outbox` rows
  // in the same DB transaction as each entry INSERT; the relay publishes
  // committed rows to the bus and marks them published. Only wired on the real
  // Postgres store (never with an injected test store).
  let relayHandle: JournalRelay | null = null;
  if (usePostgres && !options.store) {
    relayHandle = createJournalRelay({
      bus: eventBus,
      logger,
      connectionString: config.FN_DATABASE_URL,
    });
    await relayHandle.start();
  }

  app.addHook('onClose', async () => {
    await relayHandle?.stop();
    await store.dispose();
    await eventBus.dispose();
    await redisClient?.quit();
  });

  await app.register(
    async (api) => {
      await requireBearerPlugin(api, tokenVerifier);
      await entryRoutes(api, deps);
    },
    { prefix: '/v1/journal' },
  );

  return app;
}

export { REQUEST_ID_HEADER };
