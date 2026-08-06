import { createMemoryAuthStateStore } from '../src/services/store/memory-store';

describe('memory auth-state store', () => {
  let now = 1_000_000_000;

  const store = () => {
    const s = createMemoryAuthStateStore(() => now);
    return {
      s,
      advance: (ms: number): number => {
        now += ms;
        return now;
      },
      setNow: (value: number): number => {
        now = value;
        return now;
      },
    };
  };

  it('stores, reads, and expires OTP codes', async () => {
    const { s } = store();
    await s.saveOtp('digest', { codeHash: 'abc', expiresAtMs: now + 300_000 }, 300);
    await expect(s.getOtp('digest')).resolves.toEqual({
      codeHash: 'abc',
      expiresAtMs: now + 300_000,
    });

    await s.clearOtp('digest');
    await expect(s.getOtp('digest')).resolves.toBeNull();
  });

  it('returns null for an expired OTP', async () => {
    const { s, advance } = store();
    await s.saveOtp('digest', { codeHash: 'abc', expiresAtMs: now + 300_000 }, 300);
    advance(300_001);
    await expect(s.getOtp('digest')).resolves.toBeNull();
  });

  it('counts requests in a sliding window and resets after the window', async () => {
    const { s, advance } = store();
    for (let i = 0; i < 5; i += 1) {
      await expect(s.countRequest('phone', 5, 900, now)).resolves.toEqual({
        allowed: true,
        count: i + 1,
        retryAfterSeconds: expect.any(Number),
      });
    }
    await expect(s.countRequest('phone', 5, 900, now)).resolves.toEqual({
      allowed: false,
      count: 6,
      retryAfterSeconds: 900,
    });
    advance(900_001);
    await expect(s.countRequest('phone', 5, 900, now)).resolves.toEqual({
      allowed: true,
      count: 1,
      retryAfterSeconds: expect.any(Number),
    });
  });

  it('increments attempts and locks at the cap', async () => {
    const { s } = store();
    for (let i = 0; i < 4; i += 1) {
      const state = await s.incrementAttempt('phone', 5, 900, now);
      expect(state).toEqual({ attempts: i + 1, lockedUntilMs: 0 });
    }
    const locked = await s.incrementAttempt('phone', 5, 900, now);
    expect(locked.attempts).toBe(5);
    expect(locked.lockedUntilMs).toBe(now + 900_000);

    await expect(s.getAttemptState('phone')).resolves.toEqual(locked);
  });

  it('keeps the lock active and does not increment while locked', async () => {
    const { s } = store();
    for (let i = 0; i < 5; i += 1) {
      await s.incrementAttempt('phone', 5, 900, now);
    }
    const still = await s.incrementAttempt('phone', 5, 900, now);
    expect(still.attempts).toBe(5);
    expect(still.lockedUntilMs).toBe(now + 900_000);
  });

  it('clears attempts and unlocks after the lockout window', async () => {
    const { s, advance } = store();
    for (let i = 0; i < 5; i += 1) {
      await s.incrementAttempt('phone', 5, 900, now);
    }
    advance(900_001);
    await expect(s.getAttemptState('phone')).resolves.toEqual({ attempts: 0, lockedUntilMs: 0 });

    const next = await s.incrementAttempt('phone', 5, 900, now);
    expect(next).toEqual({ attempts: 1, lockedUntilMs: 0 });
  });

  it('clears attempts explicitly after success', async () => {
    const { s } = store();
    await s.incrementAttempt('phone', 5, 900, now);
    await s.clearAttempts('phone');
    await expect(s.getAttemptState('phone')).resolves.toEqual({ attempts: 0, lockedUntilMs: 0 });
  });

  it('stores, reads, and expires refresh tokens', async () => {
    const { s, advance } = store();
    const record = {
      subjectId: 'u1',
      role: 'father',
      tokenVersion: 1,
      familyId: 'fam1',
      expiresAtMs: now + 2_592_000_000,
    };
    await s.saveRefreshToken('hash', record, 2_592_000);
    await expect(s.getRefreshToken('hash')).resolves.toEqual(record);

    advance(2_592_000_001);
    await expect(s.getRefreshToken('hash')).resolves.toBeNull();
  });

  it('revokes refresh tokens with retention, then forgets after retention', async () => {
    const { s, advance } = store();
    await s.saveRefreshToken(
      'hash',
      {
        subjectId: 'u1',
        role: 'father',
        tokenVersion: 1,
        familyId: 'fam1',
        expiresAtMs: now + 2_592_000_000,
      },
      2_592_000,
    );

    await s.revokeRefreshToken('hash', 2_592_000);
    await expect(s.isRefreshTokenRevoked('hash')).resolves.toBe(true);
    await expect(s.getRefreshToken('hash')).resolves.toBeNull();

    advance(2_592_000_001);
    await expect(s.isRefreshTokenRevoked('hash')).resolves.toBe(false);
  });
});
