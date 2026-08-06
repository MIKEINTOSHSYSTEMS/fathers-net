import { createHash } from 'node:crypto';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { TokenVerifier } from '../services/tokens';

export interface GatewayIdentity {
  authenticated: boolean;
  scheme: string | null;
  tokenHash: string | null;
  subjectId: string | null;
  role: string | null;
  tokenVersion: number | null;
}

declare module 'fastify' {
  interface FastifyRequest {
    identity: GatewayIdentity;
  }
}

const ANONYMOUS: GatewayIdentity = {
  authenticated: false,
  scheme: null,
  tokenHash: null,
  subjectId: null,
  role: null,
  tokenVersion: null,
};

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex').slice(0, 16);
}

export interface AuthPassThroughOptions {
  /**
   * Access-token verifier (WP-016). When null, Bearer tokens pass through
   * unvalidated — the pre-WP-016 dev/CI mode (no FN_AUTH_JWT_SECRET set).
   */
  verifier: TokenVerifier | null;
}

/**
 * Auth middleware (WP-015 pass-through → WP-016 validation). Parses the
 * Authorization header, and when a verifier is configured validates the JWT
 * (signature, issuer, audience, expiry, typ). Exposes the resolved identity on
 * `request.identity` — never the token itself; only a truncated hash is kept
 * for observability. Invalid tokens are treated as unauthenticated (fail
 * closed), so route handlers must enforce authz where required.
 */
export async function authPassThroughPlugin(
  app: FastifyInstance,
  options: AuthPassThroughOptions,
): Promise<void> {
  app.addHook('onRequest', async (request: FastifyRequest) => {
    const header = request.headers.authorization;
    if (!header) {
      request.identity = ANONYMOUS;
      return;
    }
    const match = /^Bearer\s+(.+)$/i.exec(header);
    if (!match || !match[1]) {
      request.identity = { ...ANONYMOUS, scheme: header.split(/\s+/)[0] ?? null };
      return;
    }
    const token = match[1];
    const tokenHash = hashToken(token);
    if (options.verifier) {
      const claims = options.verifier.verifyAccessToken(token);
      if (claims) {
        request.identity = {
          authenticated: true,
          scheme: 'Bearer',
          tokenHash,
          subjectId: claims.subjectId,
          role: claims.role,
          tokenVersion: claims.tokenVersion,
        };
        return;
      }
      request.identity = { ...ANONYMOUS, scheme: 'Bearer', tokenHash };
      return;
    }
    request.identity = {
      authenticated: true,
      scheme: 'Bearer',
      tokenHash,
      subjectId: null,
      role: null,
      tokenVersion: null,
    };
  });
}
