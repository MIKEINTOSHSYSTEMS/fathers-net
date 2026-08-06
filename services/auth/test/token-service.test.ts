import jwt from 'jsonwebtoken';
import { createTestLogger } from '@fathersnet/test-utils';
import { createMemoryAuthStateStore } from '../src/services/store/memory-store';
import { TokenService } from '../src/services/tokens';
import { sha256 } from '../src/services/crypto';

describe('TokenService', () => {
  const SECRET = 'test-secret-0123456789abcdef0123456789abcdef';
  const IDENTITY = {
    subjectId: '6f8b1f21-7a0c-4b6a-9f2c-2d4e5f6a7b8c',
    role: 'father',
    tokenVersion: 1,
    familyId: 'c2b8f4e0-9b3a-4c1d-8e5f-6a7b8c9d0e1f',
  };

  function setup() {
    let now = 1_000_000_000;
    const store = createMemoryAuthStateStore(() => now);
    const { logger } = createTestLogger('debug');
    const service = new TokenService({
      store,
      logger,
      secret: SECRET,
      issuer: 'fathersnet',
      audience: 'fathersnet-api',
      accessTtlSeconds: 900,
      refreshTtlSeconds: 2_592_000,
      nowMs: () => now,
    });
    return {
      store,
      service,
      advance: (ms: number): number => {
        now += ms;
        return now;
      },
      now: (): number => now,
    };
  }

  it('issues access and refresh tokens with the right claims and shape', async () => {
    const { service, store } = setup();
    const result = await service.issueTokens(IDENTITY);

    expect(result.tokenType).toBe('Bearer');
    expect(result.expiresIn).toBe(900);
    expect(result.accessToken.split('.')).toHaveLength(3);
    expect(result.refreshToken).toBeTruthy();
    expect(result.refreshToken).not.toBe(result.accessToken);

    const claims = jwt.decode(result.accessToken) as jwt.JwtPayload;
    expect(claims.sub).toBe(IDENTITY.subjectId);
    expect(claims.role).toBe('father');
    expect(claims.token_version).toBe(1);
    expect(claims.sid).toBe(IDENTITY.familyId);
    expect(claims.typ).toBe('access');
    expect(claims.iss).toBe('fathersnet');
    expect(claims.aud).toBe('fathersnet-api');
    expect(claims.exp).toBe(claims.iat! + 900);
    expect(claims.jti).toBeTruthy();
    expect(JSON.stringify(claims)).not.toContain('phone');

    // Refresh token stored only as a hash.
    const record = await store.getRefreshToken(sha256(result.refreshToken));
    expect(record).toEqual({
      subjectId: IDENTITY.subjectId,
      role: 'father',
      tokenVersion: 1,
      familyId: IDENTITY.familyId,
      expiresAtMs: 1_000_000_000 + 2_592_000 * 1000,
    });
  });

  it('verifies an access token and rejects bad secrets, expiry, and wrong typ', async () => {
    const { service } = setup();
    const { accessToken } = await service.issueTokens(IDENTITY);

    const verified = service.verifyAccessToken(accessToken);
    expect(verified?.subjectId).toBe(IDENTITY.subjectId);
    expect(verified?.role).toBe('father');
    expect(verified?.tokenVersion).toBe(1);

    const tampered = jwt.sign(
      { sub: 'other', role: 'father', token_version: 1, typ: 'access' },
      'wrong-secret',
      { algorithm: 'HS256', issuer: 'fathersnet', audience: 'fathersnet-api', expiresIn: 900 },
    );
    expect(service.verifyAccessToken(tampered)).toBeNull();

    const wrongTyp = jwt.sign(
      { sub: IDENTITY.subjectId, role: 'father', token_version: 1, typ: 'refresh' },
      SECRET,
      { algorithm: 'HS256', issuer: 'fathersnet', audience: 'fathersnet-api', expiresIn: 900 },
    );
    expect(service.verifyAccessToken(wrongTyp)).toBeNull();
  });

  it('expires access tokens after the configured TTL', async () => {
    const { service } = setup();
    // jsonwebtoken validates exp against the system clock, so an already
    // expired token must be rejected (the issued token's exp = iat + TTL is
    // asserted in the issuance test above).
    const expired = jwt.sign({ role: 'father', token_version: 1, typ: 'access' }, SECRET, {
      algorithm: 'HS256',
      issuer: 'fathersnet',
      audience: 'fathersnet-api',
      subject: IDENTITY.subjectId,
      expiresIn: -10,
    });
    expect(service.verifyAccessToken(expired)).toBeNull();
  });

  it('refreshes an access token and keeps the same refresh token', async () => {
    const { service } = setup();
    const issued = await service.issueTokens(IDENTITY);

    const refreshed = await service.refreshAccessToken(issued.refreshToken);
    expect(refreshed).not.toBeNull();
    expect(refreshed?.refreshToken).toBe(issued.refreshToken);
    expect(refreshed?.accessToken).not.toBe(issued.accessToken);
    const claims = jwt.decode(refreshed!.accessToken) as jwt.JwtPayload;
    expect(claims.sub).toBe(IDENTITY.subjectId);
    expect(claims.exp).toBe(claims.iat! + 900);
  });

  it('rejects an unknown, revoked, or expired refresh token', async () => {
    const { service, store, advance } = setup();
    const issued = await service.issueTokens(IDENTITY);

    await expect(service.refreshAccessToken('not-a-real-token')).resolves.toBeNull();

    await service.revokeRefreshToken(issued.refreshToken);
    await expect(service.refreshAccessToken(issued.refreshToken)).resolves.toBeNull();
    await expect(store.isRefreshTokenRevoked(sha256(issued.refreshToken))).resolves.toBe(true);

    const second = await service.issueTokens(IDENTITY);
    advance(2_592_000_001);
    await expect(service.refreshAccessToken(second.refreshToken)).resolves.toBeNull();
  });

  it('revokes a refresh token and reports the revoked record', async () => {
    const { service } = setup();
    const issued = await service.issueTokens(IDENTITY);

    const revoked = await service.revokeRefreshToken(issued.refreshToken);
    expect(revoked?.subjectId).toBe(IDENTITY.subjectId);
    await expect(service.revokeRefreshToken(issued.refreshToken)).resolves.toBeNull();
  });
});
