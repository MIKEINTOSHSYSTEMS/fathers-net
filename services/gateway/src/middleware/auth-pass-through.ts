import { createHash } from 'node:crypto';
import type { FastifyInstance, FastifyRequest } from 'fastify';

export interface GatewayIdentity {
  authenticated: boolean;
  scheme: string | null;
  tokenHash: string | null;
  subjectId: string | null;
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
};

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex').slice(0, 16);
}

/**
 * Auth pass-through (06 Phase A). Parses the Authorization header and exposes
 * request.identity WITHOUT validating credentials — token validation is
 * deferred to WP-016. Never logs token material; only a truncated hash.
 */
export async function authPassThroughPlugin(app: FastifyInstance): Promise<void> {
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
    request.identity = {
      authenticated: true,
      scheme: 'Bearer',
      tokenHash: hashToken(match[1]),
      subjectId: null,
    };
  });
}
