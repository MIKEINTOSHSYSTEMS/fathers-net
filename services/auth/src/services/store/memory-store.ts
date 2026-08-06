import type {
  AttemptState,
  AuthStateStore,
  OtpRecord,
  RefreshTokenRecord,
  RequestCount,
} from './types';

interface RequestCounter {
  count: number;
  resetAtMs: number;
}

const STALE_MS = 24 * 60 * 60 * 1000;

/**
 * In-memory auth-state store — the hermetic test-double (M-08). Used by unit
 * tests and local development; production/staging use the Redis adapter so
 * state holds across auth-service instances. The clock is injectable for
 * deterministic lockout/expiry tests.
 */
export function createMemoryAuthStateStore(nowMs: () => number = Date.now): AuthStateStore {
  const otps = new Map<string, OtpRecord>();
  const requests = new Map<string, RequestCounter>();
  const attempts = new Map<string, AttemptState>();
  const refreshTokens = new Map<string, RefreshTokenRecord>();
  const revoked = new Map<string, number>();

  async function saveOtp(
    phoneDigest: string,
    record: OtpRecord,
    _ttlSeconds: number,
  ): Promise<void> {
    otps.set(phoneDigest, record);
    schedulePrune();
  }

  async function getOtp(phoneDigest: string): Promise<OtpRecord | null> {
    const record = otps.get(phoneDigest);
    if (!record) {
      return null;
    }
    if (record.expiresAtMs <= nowMs()) {
      otps.delete(phoneDigest);
      return null;
    }
    return record;
  }

  async function clearOtp(phoneDigest: string): Promise<void> {
    otps.delete(phoneDigest);
  }

  async function countRequest(
    key: string,
    maxRequests: number,
    windowSeconds: number,
    now = nowMs(),
  ): Promise<RequestCount> {
    const windowMs = windowSeconds * 1000;
    let counter = requests.get(key);
    if (!counter || counter.resetAtMs <= now) {
      counter = { count: 0, resetAtMs: now + windowMs };
      requests.set(key, counter);
      if (requests.size > 10_000) {
        prune(cutoff());
      }
    }
    counter.count += 1;
    return {
      allowed: counter.count <= maxRequests,
      count: counter.count,
      retryAfterSeconds: Math.max(1, Math.ceil((counter.resetAtMs - now) / 1000)),
    };
  }

  async function getAttemptState(phoneDigest: string): Promise<AttemptState> {
    const state = attempts.get(phoneDigest);
    if (!state) {
      return { attempts: 0, lockedUntilMs: 0 };
    }
    if (state.lockedUntilMs > 0 && state.lockedUntilMs <= nowMs()) {
      attempts.delete(phoneDigest);
      return { attempts: 0, lockedUntilMs: 0 };
    }
    return state;
  }

  async function incrementAttempt(
    phoneDigest: string,
    maxAttempts: number,
    lockoutSeconds: number,
    now = nowMs(),
  ): Promise<AttemptState> {
    const lockoutMs = lockoutSeconds * 1000;
    const existing = attempts.get(phoneDigest);
    let attemptsCount = 0;
    let lockedUntilMs = 0;
    if (existing && existing.lockedUntilMs > now) {
      return { attempts: existing.attempts, lockedUntilMs: existing.lockedUntilMs };
    }
    if (existing && existing.lockedUntilMs > 0) {
      // Lock expired — restart the window.
      attemptsCount = 0;
    } else if (existing) {
      attemptsCount = existing.attempts;
    }
    attemptsCount += 1;
    if (attemptsCount >= maxAttempts) {
      lockedUntilMs = now + lockoutMs;
    }
    attempts.set(phoneDigest, { attempts: attemptsCount, lockedUntilMs });
    if (attempts.size > 10_000) {
      prune(cutoff());
    }
    return { attempts: attemptsCount, lockedUntilMs };
  }

  async function clearAttempts(phoneDigest: string): Promise<void> {
    attempts.delete(phoneDigest);
  }

  async function saveRefreshToken(
    tokenHash: string,
    record: RefreshTokenRecord,
    _ttlSeconds: number,
  ): Promise<void> {
    refreshTokens.set(tokenHash, record);
    revoked.delete(tokenHash);
    if (refreshTokens.size > 10_000) {
      prune(cutoff());
    }
  }

  async function getRefreshToken(tokenHash: string): Promise<RefreshTokenRecord | null> {
    const record = refreshTokens.get(tokenHash);
    if (!record) {
      return null;
    }
    if (record.expiresAtMs <= nowMs()) {
      refreshTokens.delete(tokenHash);
      return null;
    }
    return record;
  }

  async function revokeRefreshToken(tokenHash: string, retentionSeconds: number): Promise<void> {
    revoked.set(tokenHash, nowMs() + retentionSeconds * 1000);
    refreshTokens.delete(tokenHash);
  }

  async function isRefreshTokenRevoked(tokenHash: string): Promise<boolean> {
    const until = revoked.get(tokenHash);
    if (until === undefined) {
      return false;
    }
    if (until <= nowMs()) {
      revoked.delete(tokenHash);
      return false;
    }
    return true;
  }

  function cutoff(): number {
    return nowMs() - STALE_MS;
  }

  function prune(cutoffMs: number): void {
    for (const [key, record] of otps) {
      if (record.expiresAtMs < cutoffMs) {
        otps.delete(key);
      }
    }
    for (const [key, counter] of requests) {
      if (counter.resetAtMs < cutoffMs) {
        requests.delete(key);
      }
    }
    for (const [key, state] of attempts) {
      if (state.lockedUntilMs > 0 && state.lockedUntilMs < cutoffMs) {
        attempts.delete(key);
      }
    }
    for (const [key, record] of refreshTokens) {
      if (record.expiresAtMs < cutoffMs) {
        refreshTokens.delete(key);
      }
    }
    for (const [key, until] of revoked) {
      if (until < cutoffMs) {
        revoked.delete(key);
      }
    }
  }

  function schedulePrune(): void {
    // Prune is cheap and bounded; run it inline on the next mutation when the
    // maps grow. Kept as a no-op marker so TTL semantics are centralized.
  }

  return {
    saveOtp,
    getOtp,
    clearOtp,
    countRequest,
    getAttemptState,
    incrementAttempt,
    clearAttempts,
    saveRefreshToken,
    getRefreshToken,
    revokeRefreshToken,
    isRefreshTokenRevoked,
    async dispose(): Promise<void> {
      otps.clear();
      requests.clear();
      attempts.clear();
      refreshTokens.clear();
      revoked.clear();
    },
  };
}
