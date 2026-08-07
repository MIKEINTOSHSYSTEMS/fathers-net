import Fastify, { LogController, type FastifyInstance, type FastifyBaseLogger } from 'fastify';
import type Redis from 'ioredis';
import { createLogger, type Logger } from '@fathersnet/logger';
import { createInMemoryEventBus, createRedisEventBus, type EventBus } from '@fathersnet/events';
import type { RemindersConfig } from './config';
import { buildGenReqId, requestIdPlugin, REQUEST_ID_HEADER } from './middleware/request-id';
import { errorHandler } from './middleware/errors';
import { requireBearerPlugin } from './middleware/auth';
import { healthRoutes } from './routes/health';
import { internalRoutes } from './routes/internal';
import { createReminderStore, type ReminderStore } from './store';
import { createReminderService, type ReminderService } from './engine/reminder-service';
import { createStubDispatcher, type ChannelDispatcher } from './services/dispatcher';
import { createTokenVerifier, type TokenVerifier } from './services/tokens';
import { createRedisClient } from './services/redis';

export interface RemindersAppOptions {
  config: RemindersConfig;
  logger?: Logger;
  /** Test seam: inject a hermetic store instead of building from config. */
  store?: ReminderStore;
  /** Test seam: inject a token verifier (defaults to the shared HS256 contract). */
  tokenVerifier?: TokenVerifier;
  /** Test seam: inject an in-memory event bus instead of the broker. */
  eventBus?: EventBus;
  /** Test seam: inject a channel dispatcher (defaults to the stub). */
  dispatcher?: ChannelDispatcher;
  /** Test seam: inject the service (defaults to building from store + config). */
  service?: ReminderService;
}

/**
 * Build the Fastify reminders application. Pure — no sockets are opened here;
 * tests call this and use `app.inject`/`listen(0)`. Registered as a factory so
 * CI can boot the same wiring as production (WP-021 §2).
 */
export async function buildRemindersApp(options: RemindersAppOptions): Promise<FastifyInstance> {
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

  const store: ReminderStore =
    options.store ??
    createReminderStore({ driver: config.FN_STORE_DRIVER, databaseUrl: config.FN_DATABASE_URL });

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
      config.FN_REMINDERS_JWT_SECRET,
      config.FN_REMINDERS_ISSUER,
      config.FN_REMINDERS_AUDIENCE,
    );

  const reminderService: ReminderService =
    options.service ??
    createReminderService({
      store,
      dispatcher: options.dispatcher ?? createStubDispatcher(logger),
      bus: eventBus,
      logger,
      config,
    });

  app.addHook('onClose', async () => {
    await reminderService.dispose();
    await eventBus.dispose();
    await redisClient?.quit();
  });

  await app.register(
    async (api) => {
      await requireBearerPlugin(api, tokenVerifier);
      await internalRoutes(api, { reminderService, logger });
    },
    { prefix: '/internal/reminders' },
  );

  return app;
}

export { REQUEST_ID_HEADER };
