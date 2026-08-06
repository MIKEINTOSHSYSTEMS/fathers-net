import { createHash, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';

/**
 * Low-level crypto helpers (WP-016). Only digests are ever stored or compared —
 * never plaintext OTP codes or tokens (D-09, FR-005).
 */

export function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

/** Key for the auth-state store derived from the phone number. The phone
 * number itself is never stored (FR-009, FR-022). */
export function phoneDigest(phone: string): string {
  return sha256(phone);
}

export function randomOtp(length: number): string {
  const digits: number[] = [];
  for (let i = 0; i < length; i += 1) {
    digits.push(randomInt(0, 10));
  }
  return digits.join('');
}

export function randomToken(): string {
  return randomBytes(32).toString('base64url');
}

/** Constant-time comparison of two hex digests. Always false on length
 * mismatch (the values are sha256 digests, so both inputs are 64 hex chars). */
export function constantTimeEqual(left: string, right: string): boolean {
  const leftBuf = Buffer.from(left, 'hex');
  const rightBuf = Buffer.from(right, 'hex');
  if (leftBuf.length !== rightBuf.length) {
    return false;
  }
  return timingSafeEqual(leftBuf, rightBuf);
}
