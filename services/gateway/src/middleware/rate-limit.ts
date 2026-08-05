import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { toErrorEnvelope, ERROR_CODES, FathersNetError } from '@fathersnet/errors';
import type { GatewayConfig } from '../config';
import type { RateLimitStore } from '../services/ratelimit';

export type RateLimitTier = 'default' | 'ai' | 'admin-export';

export function tierForPath(path: string): RateLimitTier {
  if (path.startsWith('/v1/ai')) {
    return 'ai';
  }
  if (path === '/v1/admin/exports' || path.startsWith('/v1/admin/exports/')) {
    return 'admin-export';
  }
  return 'default';
}

export function limitForTier(tier: RateLimitTier, config: GatewayConfig): number {
  switch (tier) {
    case 'ai':
      return config.FN_RATE_LIMIT_AI;
    case 'admin-export':
      return config.FN_RATE_LIMIT_ADMIN_EXPORT;
    default:
      return config.FN_RATE_LIMIT_DEFAULT;
  }
}

/**
 * Rate-limit bucket key. Authenticated requests share a bucket per subject;
 * anonymous requests share a bucket per client IP. The subjectId is only
 * populated once token validation lands (WP-016); until then everything is
 * keyed by IP.
 */
export function bucketKey(request: FastifyRequest): string {
  const identity = request.identity;
  if (identity?.authenticated && identity.subjectId) {
    return `user:${identity.subjectId}`;
  }
  return `ip:${request.ip}`;
}

export async function rateLimitPlugin(
  app: FastifyInstance,
  deps: { store: RateLimitStore; config: GatewayConfig },
): Promise<void> {
  const { store, config } = deps;

  app.addHook('onRequest', async (request: FastifyRequest, reply: FastifyReply) => {
    const tier = tierForPath(request.url);
    const limit = limitForTier(tier, config);
    const windowSeconds = config.FN_RATE_LIMIT_WINDOW_SECONDS;
    const result = await store.consume(`${tier}:${bucketKey(request)}`, limit, windowSeconds);

    reply.header('X-RateLimit-Limit', String(result.limit));
    reply.header('X-RateLimit-Remaining', String(result.remaining));
    reply.header('X-RateLimit-Reset', String(result.resetAtSeconds));

    if (!result.allowed) {
      reply.header('Retry-After', String(result.retryAfterSeconds));
      reply.status(429).send(
        toErrorEnvelope(
          new FathersNetError({
            code: ERROR_CODES.RATE_LIMITED,
            message: `Rate limit exceeded. Retry after ${result.retryAfterSeconds} second(s).`,
          }),
          request.id,
        ),
      );
    }
  });
}
