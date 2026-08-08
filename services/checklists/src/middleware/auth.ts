import type { FastifyInstance, FastifyRequest } from 'fastify';
import { UnauthorizedError } from '@fathersnet/errors';
import type { AccessTokenClaims, TokenVerifier } from '../services/tokens';

export interface AuthenticatedUser {
  subjectId: string;
  role: string;
  tokenVersion: number;
}

declare module 'fastify' {
  interface FastifyRequest {
    user: AuthenticatedUser | null;
  }
}

/**
 * Bearer-token authentication (SRS §12.5, 11 §3.2). Every `/v1/checklists` and
 * `/v1/budget` route runs through `requireBearer`, which verifies the WP-016
 * access JWT (HS256, issuer, audience, typ=access) and stamps the caller
 * identity on `request.user`. Ownership/authorization is resolved from the
 * token `sub` claim — the caller identity NEVER comes from the request body
 * (FR-126, plan §7 ownership core).
 */
export async function requireBearerPlugin(
  app: FastifyInstance,
  verifier: TokenVerifier,
): Promise<void> {
  app.decorateRequest('user', null);

  app.addHook('preHandler', async (request: FastifyRequest) => {
    const token = extractBearer(request);
    if (!token) {
      throw new UnauthorizedError('Missing bearer token');
    }
    const claims = verifier.verifyAccessToken(token);
    if (!claims) {
      throw new UnauthorizedError('Invalid or expired access token');
    }
    request.user = {
      subjectId: claims.subjectId,
      role: claims.role,
      tokenVersion: claims.tokenVersion,
    };
  });
}

function extractBearer(request: FastifyRequest): string | null {
  const header = request.headers.authorization;
  if (!header) {
    return null;
  }
  const match = /^Bearer\s+(.+)$/i.exec(header);
  return match && match[1] ? match[1] : null;
}

export type { AccessTokenClaims };
