import jwt from 'jsonwebtoken';

export interface AccessTokenClaims {
  subjectId: string;
  role: string;
  tokenVersion: number;
  familyId: string;
  expiresAtSeconds: number;
}

export interface TokenVerifier {
  /** Returns claims for a valid access JWT, or null when invalid/expired. */
  verifyAccessToken(token: string): AccessTokenClaims | null;
}

/**
 * Stateless access-token verifier for the checklist & budget service (WP-016
 * identity context, AR-008). Validates the HS256 signature, issuer, audience,
 * expiry, and `typ: access` claim using the shared auth secret — the same
 * contract the gateway, users and content services implement. The `sub` claim
 * is the caller identity for every ownership-scoped handler (FR-126); the
 * caller's identity NEVER comes from the request body.
 */
export function createTokenVerifier(
  secret: string,
  issuer: string,
  audience: string,
): TokenVerifier {
  return {
    verifyAccessToken(token: string): AccessTokenClaims | null {
      try {
        const decoded = jwt.verify(token, secret, {
          algorithms: ['HS256'],
          issuer,
          audience,
        });
        if (typeof decoded === 'string' || !decoded) {
          return null;
        }
        if (decoded.typ !== 'access') {
          return null;
        }
        if (typeof decoded.sub !== 'string' || decoded.sub.length === 0) {
          return null;
        }
        return {
          subjectId: decoded.sub,
          role: typeof decoded.role === 'string' && decoded.role ? decoded.role : 'father',
          tokenVersion: typeof decoded.token_version === 'number' ? decoded.token_version : 1,
          familyId: typeof decoded.sid === 'string' ? decoded.sid : '',
          expiresAtSeconds: typeof decoded.exp === 'number' ? decoded.exp : 0,
        };
      } catch {
        return null;
      }
    },
  };
}
