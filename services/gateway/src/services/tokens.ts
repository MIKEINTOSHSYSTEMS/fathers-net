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
 * Stateless access-token verifier for the gateway (WP-016, AR-008). Validates
 * the HS256 signature, issuer, audience, expiry, and `typ: access` claim using
 * the shared auth secret — no per-request Redis round-trip. Revocation of
 * long-lived sessions is handled at the auth service (refresh-token level);
 * access-token revocation is bounded by the short TTL (SRS §14.6).
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
