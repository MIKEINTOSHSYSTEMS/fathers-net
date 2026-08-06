import { randomUUID } from 'node:crypto';
import jwt from 'jsonwebtoken';
import type { Logger } from '@fathersnet/logger';
import { randomToken, sha256 } from './crypto';
import type { AuthStateStore, RefreshTokenRecord } from './store/types';
import type { VerifiedIdentity } from './otp';

export interface AccessTokenClaims {
  subjectId: string;
  role: string;
  tokenVersion: number;
  familyId: string;
  expiresAtSeconds: number;
}

export interface TokenResult {
  accessToken: string;
  refreshToken: string;
  tokenType: 'Bearer';
  expiresIn: number;
}

export interface TokenServiceOptions {
  store: AuthStateStore;
  logger: Logger;
  secret: string;
  issuer: string;
  audience: string;
  accessTtlSeconds: number;
  refreshTtlSeconds: number;
  /** Injectable clock (milliseconds) for deterministic tests. */
  nowMs?: () => number;
}

/**
 * Token issuance/verification (§14.6, NFR-018). Access tokens are short-lived
 * HS256 JWTs (claims: sub UUID — never phone (FR-009), role, token_version,
 * typ, sid/familyId, iss/aud/iat/exp/jti). Refresh tokens are opaque random
 * values stored only as sha256 hashes (D-09), revocable, with a familyId to
 * support Phase 3 rotation. Rotation + reuse detection remain Phase 3 (WP-025).
 */
export class TokenService {
  private readonly nowMs: () => number;

  constructor(private readonly options: TokenServiceOptions) {
    this.nowMs = options.nowMs ?? Date.now;
  }

  async issueTokens(identity: VerifiedIdentity): Promise<TokenResult> {
    const accessToken = this.signAccessToken(identity.subjectId, identity);
    const refreshToken = randomToken();
    await this.options.store.saveRefreshToken(
      sha256(refreshToken),
      {
        subjectId: identity.subjectId,
        role: identity.role,
        tokenVersion: identity.tokenVersion,
        familyId: identity.familyId,
        expiresAtMs: this.nowMs() + this.options.refreshTtlSeconds * 1000,
      },
      this.options.refreshTtlSeconds,
    );
    return {
      accessToken,
      refreshToken,
      tokenType: 'Bearer',
      expiresIn: this.options.accessTtlSeconds,
    };
  }

  verifyAccessToken(token: string): AccessTokenClaims | null {
    try {
      const decoded = jwt.verify(token, this.options.secret, {
        algorithms: ['HS256'],
        issuer: this.options.issuer,
        audience: this.options.audience,
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
  }

  async verifyRefreshToken(token: string): Promise<RefreshTokenRecord | null> {
    const tokenHash = sha256(token);
    if (await this.options.store.isRefreshTokenRevoked(tokenHash)) {
      return null;
    }
    const record = await this.options.store.getRefreshToken(tokenHash);
    if (!record || record.expiresAtMs <= this.nowMs()) {
      return null;
    }
    return record;
  }

  async refreshAccessToken(token: string): Promise<TokenResult | null> {
    const record = await this.verifyRefreshToken(token);
    if (!record) {
      return null;
    }
    const accessToken = this.signAccessToken(record.subjectId, record);
    return {
      accessToken,
      refreshToken: token,
      tokenType: 'Bearer',
      expiresIn: this.options.accessTtlSeconds,
    };
  }

  async revokeRefreshToken(token: string): Promise<RefreshTokenRecord | null> {
    const record = await this.verifyRefreshToken(token);
    if (!record) {
      return null;
    }
    await this.options.store.revokeRefreshToken(sha256(token), this.options.refreshTtlSeconds);
    this.options.logger.info('auth.token_revoked', 'refresh token revoked', {
      token_version: record.tokenVersion,
    });
    return record;
  }

  private signAccessToken(
    subjectId: string,
    source: Pick<VerifiedIdentity | RefreshTokenRecord, 'role' | 'tokenVersion' | 'familyId'>,
  ): string {
    return jwt.sign(
      {
        role: source.role,
        token_version: source.tokenVersion,
        typ: 'access',
        sid: source.familyId,
      },
      this.options.secret,
      {
        algorithm: 'HS256',
        issuer: this.options.issuer,
        audience: this.options.audience,
        subject: subjectId,
        expiresIn: this.options.accessTtlSeconds,
        jwtid: randomUUID(),
      },
    );
  }
}
