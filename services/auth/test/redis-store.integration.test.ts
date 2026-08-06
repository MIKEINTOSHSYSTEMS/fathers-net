import Redis from 'ioredis';
import { createMemoryAuthStateStore } from '../src/services/store/memory-store';
import { RedisAuthStateStore } from '../src/services/store/redis-store';
import type { AuthStateStore } from '../src/services/store/types';

const REDIS_TEST_URL = process.env.REDIS_TEST_URL;
const describeIntegration = REDIS_TEST_URL ? describe : describe.skip;

describeIntegration('auth-state store Redis adapter (D-09)', () => {
  let redisClient: Redis;
  let store: AuthStateStore;

  beforeAll(() => {
    redisClient = new Redis(REDIS_TEST_URL as string);
  });

  afterAll(async () => {
    await redisClient.quit();
  });

  beforeEach(async () => {
    await redisClient.flushall();
    store = new RedisAuthStateStore(redisClient);
  });

  it('stores, reads, and clears OTP codes', async () => {
    await store.saveOtp('digest1', { codeHash: 'abc', expiresAtMs: Date.now() + 300_000 }, 300);
    await expect(store.getOtp('digest1')).resolves.toEqual({
      codeHash: 'abc',
      expiresAtMs: expect.any(Number),
    });

    await store.clearOtp('digest1');
    await expect(store.getOtp('digest1')).resolves.toBeNull();
  });

  it('counts requests atomically across instances', async () => {
    const a = new RedisAuthStateStore(redisClient);
    const b = new RedisAuthStateStore(redisClient);
    for (let i = 0; i < 4; i += 1) {
      await expect(a.countRequest('phone', 5, 900)).resolves.toEqual({
        allowed: true,
        count: i + 1,
        retryAfterSeconds: expect.any(Number),
      });
    }
    await expect(b.countRequest('phone', 5, 900)).resolves.toEqual({
      allowed: true,
      count: 5,
      retryAfterSeconds: expect.any(Number),
    });
    await expect(a.countRequest('phone', 5, 900)).resolves.toMatchObject({
      allowed: false,
      count: 6,
    });
  });

  it('locks after the attempt cap and respects the lockout window', async () => {
    for (let i = 0; i < 4; i += 1) {
      const state = await store.incrementAttempt('phone', 5, 900);
      expect(state.lockedUntilMs).toBe(0);
    }
    const locked = await store.incrementAttempt('phone', 5, 900);
    expect(locked.attempts).toBe(5);
    expect(locked.lockedUntilMs).toBeGreaterThan(Date.now());
    await expect(store.getAttemptState('phone')).resolves.toEqual(locked);
  });

  it('stores, reads, revokes, and expires refresh tokens', async () => {
    const record = {
      subjectId: 'u1',
      role: 'father',
      tokenVersion: 1,
      familyId: 'fam1',
      expiresAtMs: Date.now() + 2_592_000_000,
    };
    await store.saveRefreshToken('hash1', record, 2_592_000);
    await expect(store.getRefreshToken('hash1')).resolves.toEqual(record);

    await store.revokeRefreshToken('hash1', 2_592_000);
    await expect(store.isRefreshTokenRevoked('hash1')).resolves.toBe(true);
    await expect(store.getRefreshToken('hash1')).resolves.toBeNull();
  });

  it('matches the in-memory store contract for the same inputs', async () => {
    const memory = createMemoryAuthStateStore();
    await memory.saveRefreshToken(
      'h',
      {
        subjectId: 'u1',
        role: 'father',
        tokenVersion: 1,
        familyId: 'f',
        expiresAtMs: Date.now() + 60_000,
      },
      60,
    );
    await store.saveRefreshToken(
      'h',
      {
        subjectId: 'u1',
        role: 'father',
        tokenVersion: 1,
        familyId: 'f',
        expiresAtMs: Date.now() + 60_000,
      },
      60,
    );

    await expect(store.getRefreshToken('h')).resolves.toEqual(await memory.getRefreshToken('h'));
  });
});
