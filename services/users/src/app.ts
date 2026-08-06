import Fastify, { LogController, type FastifyInstance, type FastifyBaseLogger } from 'fastify';
import type Redis from 'ioredis';
import { createLogger, type Logger } from '@fathersnet/logger';
import { createInMemoryEventBus, createRedisEventBus, type EventBus } from '@fathersnet/events';
import type { UsersConfig } from './config';
import { buildGenReqId, requestIdPlugin, REQUEST_ID_HEADER } from './middleware/request-id';
import { errorHandler } from './middleware/errors';
import { requireBearerPlugin } from './middleware/auth';
import { usersMeRoutes, usersRegisterRoute, type UsersRouteDeps } from './routes';
import { createUsersStore, type UsersStore } from './services/store';
import { UsersService } from './services/users-service';
import { createTokenVerifier, type TokenVerifier } from './services/tokens';
import { createPregnancyEngineStub, type PregnancyEngine } from './services/pregnancy';
import { createAesGcmPhoneEncryptor, type PhoneEncryptor } from './providers/phone-encryption';
import { createRedisClient } from './services/redis';

export interface UsersAppOptions {
  config: UsersConfig;
  logger?: Logger;
  /** Test seam: inject a hermetic store instead of building from config. */
  store?: UsersStore;
  /** Test seam: inject a token verifier (defaults to the shared HS256 contract). */
  tokenVerifier?: TokenVerifier;
  /** Test seam: inject a phone encryptor (defaults to AES-256-GCM). */
  phoneEncryptor?: PhoneEncryptor;
  /** Test seam: inject a pregnancy engine (defaults to the WP-017 stub). */
  pregnancyEngine?: PregnancyEngine;
  /** Test seam: inject an in-memory event bus instead of the broker. */
  eventBus?: EventBus;
  /** Test seam: injectable clock (milliseconds). */
  nowMs?: () => number;
}

/**
 * Build the Fastify users application. Pure — no sockets are opened here; tests
 * call this and use `app.inject`/`listen(0)`. Registered as a factory so CI can
 * boot the same wiring as production.
 */
export async function buildUsersApp(options: UsersAppOptions): Promise<FastifyInstance> {
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
  const store: UsersStore =
    options.store ??
    createUsersStore({ driver: config.FN_STORE_DRIVER, databaseUrl: config.FN_DATABASE_URL });

  const eventBus: EventBus =
    options.eventBus ??
    (usePostgres && redisClient
      ? createRedisEventBus({ client: redisClient, logger })
      : createInMemoryEventBus());

  const phoneEncryptor: PhoneEncryptor =
    options.phoneEncryptor ?? createAesGcmPhoneEncryptor(config.FN_USERS_PHONE_ENC_KEY);
  const pregnancyEngine: PregnancyEngine = options.pregnancyEngine ?? createPregnancyEngineStub();
  const tokenVerifier: TokenVerifier =
    options.tokenVerifier ??
    createTokenVerifier(
      config.FN_USERS_JWT_SECRET,
      config.FN_USERS_ISSUER,
      config.FN_USERS_AUDIENCE,
    );
  const nowMs = options.nowMs ?? Date.now;

  const usersService = new UsersService({
    store,
    eventBus,
    logger,
    phoneEncryptor,
    phoneDigestKey: config.FN_USERS_PHONE_DIGEST_KEY,
    pregnancyEngine,
    nowMs,
  });
  const deps: UsersRouteDeps = { usersService, eventBus, logger };

  app.addHook('onClose', async () => {
    await store.dispose();
    await eventBus.dispose();
    await redisClient?.quit();
  });

  await app.register(
    async (api) => {
      usersRegisterRoute(api, deps);
    },
    { prefix: '/v1/users' },
  );

  await app.register(
    async (api) => {
      await requireBearerPlugin(api, tokenVerifier);
      await usersMeRoutes(api, deps);
    },
    { prefix: '/v1/users' },
  );

  return app;
}

export { REQUEST_ID_HEADER };
