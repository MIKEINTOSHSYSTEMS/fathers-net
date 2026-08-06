import Fastify, { LogController, type FastifyInstance, type FastifyBaseLogger } from 'fastify';
import type Redis from 'ioredis';
import { createLogger, type Logger } from '@fathersnet/logger';
import type { GatewayConfig } from './config';
import { buildGenReqId, requestIdPlugin, REQUEST_ID_HEADER } from './middleware/request-id';
import { errorHandler } from './middleware/errors';
import { healthRoutes } from './routes/health';
import { v1Routes } from './routes/v1';
import { createReadinessRegistry } from './services/readiness';
import { createRedisClient } from './services/redis';
import { createRateLimitStore, type RateLimitStore } from './services/ratelimit';
import { createIdempotencyStore, type IdempotencyStore } from './services/idempotency';
import { createTokenVerifier, type TokenVerifier } from './services/tokens';

export interface AppContext {
  config: GatewayConfig;
  logger: Logger;
  startedAt: number;
}

export interface PlatformStores {
  rateLimit: RateLimitStore;
  idempotency: IdempotencyStore;
}

export interface BuildAppOptions {
  config: GatewayConfig;
  logger?: Logger;
  startedAt?: number;
  /** Test seam: inject hermetic stores instead of building from config. */
  stores?: PlatformStores;
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

  // Stateless access-token validation (WP-016). Enabled only when the shared
  // auth secret is configured; otherwise Bearer tokens pass through untouched
  // (pre-WP-016 dev mode). Failing closed: no secret => no authenticated id.
  const tokenVerifier: TokenVerifier | null = config.FN_AUTH_JWT_SECRET
    ? createTokenVerifier(config.FN_AUTH_JWT_SECRET, config.FN_AUTH_ISSUER, config.FN_AUTH_AUDIENCE)
    : null;

  let redisClient: Redis | null = null;
  const stores: PlatformStores =
    options.stores ??
    (() => {
      if (config.FN_STORE_DRIVER === 'redis') {
        redisClient = createRedisClient(config.FN_REDIS_URL);
        return {
          rateLimit: createRateLimitStore({ driver: 'redis', redis: redisClient }),
          idempotency: createIdempotencyStore({ driver: 'redis', redis: redisClient }),
        };
      }
      return {
        rateLimit: createRateLimitStore({ driver: 'memory' }),
        idempotency: createIdempotencyStore({ driver: 'memory' }),
      };
    })();

  app.addHook('onClose', async () => {
    await stores.rateLimit.dispose();
    await stores.idempotency.dispose();
    await redisClient?.quit();
  });

  await app.register(
    async (api) => {
      await v1Routes(api, {
        config,
        rateLimitStore: stores.rateLimit,
        idempotencyStore: stores.idempotency,
        tokenVerifier,
        startedAt,
      });
    },
    { prefix: '/v1' },
  );

  return app;
}

export { REQUEST_ID_HEADER };
