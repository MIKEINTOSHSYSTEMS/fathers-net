import type Redis from 'ioredis';
import type {
  AttemptState,
  AuthStateStore,
  OtpRecord,
  RefreshTokenRecord,
  RequestCount,
} from './types';

const OTP_PREFIX = 'auth:otp:';
const REQUESTS_PREFIX = 'auth:otp-requests:';
const ATTEMPTS_PREFIX = 'auth:otp-attempts:';
const REFRESH_PREFIX = 'auth:refresh:';
const REVOKED_PREFIX = 'auth:revoked:';

const COUNT_REQUEST_LUA = `
local count = redis.call('INCR', KEYS[1])
local startKey = KEYS[1] .. ':start'
local windowStart = tonumber(redis.call('GET', startKey)) or tonumber(ARGV[3])
if windowStart == tonumber(ARGV[3]) then
  windowStart = tonumber(ARGV[3])
  redis.call('SET', startKey, ARGV[3])
end
redis.call('PEXPIRE', KEYS[1], tonumber(ARGV[2]))
redis.call('PEXPIRE', startKey, tonumber(ARGV[2]))
local remainingMs = tonumber(ARGV[2]) - (tonumber(ARGV[3]) - windowStart)
if remainingMs < 1 then remainingMs = 1 end
if count <= tonumber(ARGV[1]) then
  return { 1, count, remainingMs }
end
return { 0, count, remainingMs }
`;

const INCREMENT_ATTEMPT_LUA = `
local attempts = tonumber(redis.call('HGET', KEYS[1], 'attempts')) or 0
local lockedUntil = tonumber(redis.call('HGET', KEYS[1], 'locked_until')) or 0
local now = tonumber(ARGV[1])
local maxAttempts = tonumber(ARGV[2])
local lockoutMs = tonumber(ARGV[3])

if lockedUntil > now then
  return { attempts, lockedUntil }
end
if lockedUntil > 0 then
  attempts = 0
end
attempts = attempts + 1
local nextLockedUntil = 0
if attempts >= maxAttempts then
  nextLockedUntil = now + lockoutMs
end
redis.call('HMSET', KEYS[1], 'attempts', tostring(attempts), 'locked_until', tostring(nextLockedUntil))
redis.call('PEXPIRE', KEYS[1], lockoutMs)
return { attempts, nextLockedUntil }
`;

/**
 * Redis-backed auth-state store (D-09). OTP codes, attempt counters, and
 * refresh tokens are stored as hashed keys with TTL; the failed-attempt
 * increment runs atomically in Lua so the 5/15-min lockout holds across
 * auth-service instances. `nowMs` is injected for deterministic tests.
 */
export class RedisAuthStateStore implements AuthStateStore {
  private readonly nowMs: () => number;

  constructor(
    private readonly client: Redis,
    nowMs?: () => number,
  ) {
    this.nowMs = nowMs ?? Date.now;
  }

  async saveOtp(phoneDigest: string, record: OtpRecord, ttlSeconds: number): Promise<void> {
    await this.client.hset(
      OTP_PREFIX + phoneDigest,
      'code_hash',
      record.codeHash,
      'expires_at',
      String(record.expiresAtMs),
    );
    await this.client.pexpire(OTP_PREFIX + phoneDigest, ttlSeconds * 1000);
  }

  async getOtp(phoneDigest: string): Promise<OtpRecord | null> {
    const fields = await this.client.hgetall(OTP_PREFIX + phoneDigest);
    if (!fields.code_hash || !fields.expires_at) {
      return null;
    }
    const expiresAtMs = Number(fields.expires_at);
    if (expiresAtMs <= this.nowMs()) {
      await this.client.del(OTP_PREFIX + phoneDigest);
      return null;
    }
    return { codeHash: fields.code_hash, expiresAtMs };
  }

  async clearOtp(phoneDigest: string): Promise<void> {
    await this.client.del(OTP_PREFIX + phoneDigest);
  }

  async countRequest(
    key: string,
    maxRequests: number,
    windowSeconds: number,
  ): Promise<RequestCount> {
    const [allowed, count, remainingMs] = (await this.client.eval(
      COUNT_REQUEST_LUA,
      1,
      REQUESTS_PREFIX + key,
      maxRequests,
      windowSeconds * 1000,
      this.nowMs(),
    )) as [number, number, number];
    return {
      allowed: allowed === 1,
      count,
      retryAfterSeconds: Math.max(1, Math.ceil(remainingMs / 1000)),
    };
  }

  async getAttemptState(phoneDigest: string): Promise<AttemptState> {
    const attempts = await this.client.hget(ATTEMPTS_PREFIX + phoneDigest, 'attempts');
    const lockedUntil = await this.client.hget(ATTEMPTS_PREFIX + phoneDigest, 'locked_until');
    const attemptsCount = Number(attempts) || 0;
    const lockedUntilMs = Number(lockedUntil) || 0;
    if (lockedUntilMs > 0 && lockedUntilMs <= this.nowMs()) {
      return { attempts: 0, lockedUntilMs: 0 };
    }
    return { attempts: attemptsCount, lockedUntilMs };
  }

  async incrementAttempt(
    phoneDigest: string,
    maxAttempts: number,
    lockoutSeconds: number,
    now = this.nowMs(),
  ): Promise<AttemptState> {
    const [attempts, lockedUntilMs] = (await this.client.eval(
      INCREMENT_ATTEMPT_LUA,
      1,
      ATTEMPTS_PREFIX + phoneDigest,
      now,
      maxAttempts,
      lockoutSeconds * 1000,
    )) as [number, number];
    return { attempts, lockedUntilMs };
  }

  async clearAttempts(phoneDigest: string): Promise<void> {
    await this.client.del(ATTEMPTS_PREFIX + phoneDigest);
  }

  async saveRefreshToken(
    tokenHash: string,
    record: RefreshTokenRecord,
    ttlSeconds: number,
  ): Promise<void> {
    await this.client.hset(
      REFRESH_PREFIX + tokenHash,
      'subject_id',
      record.subjectId,
      'role',
      record.role,
      'token_version',
      String(record.tokenVersion),
      'family_id',
      record.familyId,
      'expires_at',
      String(record.expiresAtMs),
    );
    await this.client.pexpire(REFRESH_PREFIX + tokenHash, ttlSeconds * 1000);
  }

  async getRefreshToken(tokenHash: string): Promise<RefreshTokenRecord | null> {
    const fields = await this.client.hgetall(REFRESH_PREFIX + tokenHash);
    if (!fields.subject_id || !fields.expires_at) {
      return null;
    }
    const expiresAtMs = Number(fields.expires_at);
    if (expiresAtMs <= this.nowMs()) {
      await this.client.del(REFRESH_PREFIX + tokenHash);
      return null;
    }
    return {
      subjectId: fields.subject_id,
      role: fields.role ?? 'father',
      tokenVersion: Number(fields.token_version) || 1,
      familyId: fields.family_id ?? '',
      expiresAtMs,
    };
  }

  async revokeRefreshToken(tokenHash: string, retentionSeconds: number): Promise<void> {
    await this.client.set(REVOKED_PREFIX + tokenHash, '1', 'PX', retentionSeconds * 1000);
    await this.client.del(REFRESH_PREFIX + tokenHash);
  }

  async isRefreshTokenRevoked(tokenHash: string): Promise<boolean> {
    const exists = await this.client.exists(REVOKED_PREFIX + tokenHash);
    return exists === 1;
  }

  async dispose(): Promise<void> {
    // The shared Redis client is owned by the app, not this store.
  }
}
