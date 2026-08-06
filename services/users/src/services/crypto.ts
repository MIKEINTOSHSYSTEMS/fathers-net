import { createHash, createHmac } from 'node:crypto';

/** Plain sha256 hex digest (used for token/session hashing only, D-09). */
export function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

/**
 * Keyed HMAC-SHA256 hex digest. `users.phone_e164_digest` is a keyed digest
 * (05 §8.1) so an attacker with the DB cannot brute-force phone numbers via a
 * dictionary table.
 */
export function keyedDigest(value: string, key: string): string {
  return createHmac('sha256', key).update(value).digest('hex');
}

/** UUID v4 pattern used to sanity-check ids that were not generated here. */
export const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Mask an E.164 phone for display (QR-009 prep): keep the country prefix and
 * the last four digits, redact the middle. `+251900000000` -> `+2519****0000`.
 * Plaintext phones never appear in responses.
 */
export function maskPhone(phone: string): string {
  if (phone.length < 9) {
    return '*'.repeat(Math.min(phone.length, 8));
  }
  return `${phone.slice(0, 5)}****${phone.slice(-4)}`;
}
