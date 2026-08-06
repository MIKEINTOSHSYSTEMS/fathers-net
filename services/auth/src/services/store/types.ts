export interface OtpRecord {
  /** sha256 hex digest of the OTP code — never the plaintext (D-09). */
  codeHash: string;
  /** Unix epoch milliseconds at which the code becomes invalid. */
  expiresAtMs: number;
}

export interface AttemptState {
  /** Number of failed OTP verifications in the current window. */
  attempts: number;
  /** Unix epoch milliseconds until which the phone is locked; 0 = not locked. */
  lockedUntilMs: number;
}

export interface RequestCount {
  allowed: boolean;
  count: number;
  /** Seconds until the current window resets; set so 429s can carry Retry-After. */
  retryAfterSeconds: number;
}

export interface RefreshTokenRecord {
  subjectId: string;
  role: string;
  tokenVersion: number;
  /** Session family id — links every token issued from one login (Phase 3 rotation). */
  familyId: string;
  /** Unix epoch milliseconds at which the refresh token expires. */
  expiresAtMs: number;
}

/**
 * Provider-agnostic auth-state store (D-09, M-08). All state is keyed by
 * hashed values (phoneDigest / tokenHash); nothing sensitive is stored in
 * plaintext. Implemented by an in-memory test-double and a Redis adapter.
 */
export interface AuthStateStore {
  saveOtp(phoneDigest: string, record: OtpRecord, ttlSeconds: number): Promise<void>;
  getOtp(phoneDigest: string): Promise<OtpRecord | null>;
  clearOtp(phoneDigest: string): Promise<void>;

  /** Sliding-window per-phone request counter (SRS §12.2: 5 requests/15 min). */
  countRequest(
    key: string,
    maxRequests: number,
    windowSeconds: number,
    nowMs?: number,
  ): Promise<RequestCount>;
  getAttemptState(phoneDigest: string): Promise<AttemptState>;
  /** Atomic failed-attempt increment with lockout (FR-005, SRS §12.2). */
  incrementAttempt(
    phoneDigest: string,
    maxAttempts: number,
    lockoutSeconds: number,
    nowMs?: number,
  ): Promise<AttemptState>;
  clearAttempts(phoneDigest: string): Promise<void>;

  saveRefreshToken(
    tokenHash: string,
    record: RefreshTokenRecord,
    ttlSeconds: number,
  ): Promise<void>;
  getRefreshToken(tokenHash: string): Promise<RefreshTokenRecord | null>;
  /** Mark a refresh token revoked with retention >= refresh lifetime (D-09). */
  revokeRefreshToken(tokenHash: string, retentionSeconds: number): Promise<void>;
  isRefreshTokenRevoked(tokenHash: string): Promise<boolean>;

  dispose(): Promise<void>;
}
