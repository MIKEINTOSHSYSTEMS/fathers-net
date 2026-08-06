import Fastify, { LogController, type FastifyInstance, type FastifyBaseLogger } from 'fastify';
import type Redis from 'ioredis';
import { createLogger, type Logger } from '@fathersnet/logger';
import { createInMemoryEventBus, createRedisEventBus, type EventBus } from '@fathersnet/events';
import type { AuthConfig } from './config';
import { buildGenReqId, requestIdPlugin, REQUEST_ID_HEADER } from './middleware/request-id';
import { errorHandler } from './middleware/errors';
import { authRoutes } from './routes/auth';
import { createAuthStateStore, type AuthStateStore } from './services/store';
import { createRedisClient } from './services/redis';
import { OtpService } from './services/otp';
import { TokenService } from './services/tokens';
import {
  createInMemoryOtpDeliveryProvider,
  type OtpDeliveryProvider,
} from './providers/otp-delivery';

export interface AuthAppOptions {
  config: AuthConfig;
  logger?: Logger;
  /** Test seam: inject a hermetic store instead of building from config. */
  store?: AuthStateStore;
  /** Test seam: inject an OTP delivery provider (test-double by default, M-02). */
  otpProvider?: OtpDeliveryProvider;
  /** Test seam: inject an in-memory event bus instead of Redis streams. */
  eventBus?: EventBus;
  /** Test seam: injectable clock (milliseconds). */
  nowMs?: () => number;
}

/**
 * Build the Fastify auth application. Pure — no sockets are opened here; tests
 * call this and use `app.inject`/`listen(0)`. Registered as a factory so CI
 * can boot the same wiring as production.
 */
export async function buildAuthApp(options: AuthAppOptions): Promise<FastifyInstance> {
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

  // Liveness probe for orchestrators/healthchecks. Readiness (deps) lands with
  // the readiness registry work package; this is the minimum for docker-compose.
  app.get('/healthz', async () => ({
    status: 'ok',
    service: config.FN_SERVICE_NAME,
    env: config.ENV,
    version: config.FN_VERSION,
  }));

  let redisClient: Redis | null = null;
  const useRedis = config.FN_STORE_DRIVER === 'redis';
  const store: AuthStateStore =
    options.store ??
    (() => {
      if (useRedis) {
        redisClient = createRedisClient(config.FN_REDIS_URL);
        return createAuthStateStore({ driver: 'redis', redis: redisClient });
      }
      return createAuthStateStore({ driver: 'memory' });
    })();

  const eventBus: EventBus =
    options.eventBus ??
    (useRedis && redisClient
      ? createRedisEventBus({ client: redisClient, logger })
      : createInMemoryEventBus());
  const otpProvider: OtpDeliveryProvider =
    options.otpProvider ?? createInMemoryOtpDeliveryProvider();
  const nowMs = options.nowMs ?? Date.now;

  const otpService = new OtpService({
    store,
    provider: otpProvider,
    eventBus,
    logger,
    otpLength: config.FN_AUTH_OTP_LENGTH,
    otpTtlSeconds: config.FN_AUTH_OTP_TTL_SECONDS,
    otpMaxRequests: config.FN_AUTH_OTP_MAX_REQUESTS,
    otpRequestWindowSeconds: config.FN_AUTH_OTP_REQUEST_WINDOW_SECONDS,
    otpMaxAttempts: config.FN_AUTH_OTP_MAX_ATTEMPTS,
    otpLockoutSeconds: config.FN_AUTH_OTP_LOCKOUT_SECONDS,
    nowMs,
  });

  const tokenService = new TokenService({
    store,
    logger,
    secret: config.FN_AUTH_JWT_SECRET,
    issuer: config.FN_AUTH_ISSUER,
    audience: config.FN_AUTH_AUDIENCE,
    accessTtlSeconds: config.FN_AUTH_ACCESS_TTL_SECONDS,
    refreshTtlSeconds: config.FN_AUTH_REFRESH_TTL_SECONDS,
    nowMs,
  });

  app.addHook('onClose', async () => {
    await store.dispose();
    await eventBus.dispose();
    await redisClient?.quit();
  });

  await app.register(
    async (api) => {
      await authRoutes(api, { otpService, tokenService, eventBus, logger });
    },
    { prefix: '/v1/auth' },
  );
  return app;
}

export { REQUEST_ID_HEADER };
