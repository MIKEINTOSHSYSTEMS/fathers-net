import type { FastifyInstance } from 'fastify';
import type { GatewayConfig } from '../config';
import type { RateLimitStore } from '../services/ratelimit';
import type { IdempotencyStore } from '../services/idempotency';
import type { TokenVerifier } from '../services/tokens';
import { authPassThroughPlugin } from '../middleware/auth-pass-through';
import { rateLimitPlugin } from '../middleware/rate-limit';
import { idempotencyPlugin } from '../middleware/idempotency';
import { corsPlugin } from '../middleware/cors';

export interface V1Deps {
  config: GatewayConfig;
  rateLimitStore: RateLimitStore;
  idempotencyStore: IdempotencyStore;
  tokenVerifier: TokenVerifier | null;
  startedAt: number;
}

/**
 * API platform v1 surface (WP-015 + WP-016 auth wiring). Registers the platform
 * middleware — CORS allow-list, Bearer auth pass-through/validation (WP-016),
 * rate limiting (FR-169), idempotency (FR-161) — and the smoke routes that
 * exercise them. Business routes are added by later work packages.
 */
export async function v1Routes(app: FastifyInstance, deps: V1Deps): Promise<void> {
  const { config, startedAt } = deps;

  await corsPlugin(app, config);
  await authPassThroughPlugin(app, { verifier: deps.tokenVerifier });
  await rateLimitPlugin(app, { store: deps.rateLimitStore, config });
  await idempotencyPlugin(app, { store: deps.idempotencyStore, config });

  app.get('/ping', async (request) => ({
    status: 'ok',
    service: config.FN_SERVICE_NAME,
    version: config.FN_VERSION,
    env: config.ENV,
    authenticated: request.identity.authenticated,
    subject_id: request.identity.subjectId,
    uptime: (Date.now() - startedAt) / 1000,
  }));

  app.post('/platform/echo', async (request) => ({
    echo: request.body,
  }));
}
