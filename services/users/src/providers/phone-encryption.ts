import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_BYTES = 12;

/**
 * Phone-at-rest encryption provider (05 §8.1, FR-009/FR-123). `users.phone_e164`
 * stores AES-256-GCM ciphertext, never plaintext. Phase 2 uses a local key
 * derived from config; the planned KMS envelope (05 §8.1) lands behind this
 * same interface. Providers must never log plaintext phones.
 */
export interface PhoneEncryptor {
  encrypt(plaintext: string): string;
  decrypt(ciphertext: string): string;
}

/**
 * AES-256-GCM implementation. The configured secret is hashed to a 32-byte key
 * so any secret value works; output is `iv.authTag.ciphertext` (base64url) and
 * is self-validating (GCM auth tag) so tampered ciphertext throws.
 */
export function createAesGcmPhoneEncryptor(secret: string): PhoneEncryptor {
  const key = createHash('sha256').update(secret).digest();

  return {
    encrypt(plaintext: string): string {
      const iv = randomBytes(IV_BYTES);
      const cipher = createCipheriv(ALGORITHM, key, iv);
      const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
      const tag = cipher.getAuthTag();
      return [iv, tag, encrypted].map((part) => part.toString('base64url')).join('.');
    },
    decrypt(ciphertext: string): string {
      const [ivRaw, tagRaw, dataRaw] = ciphertext.split('.');
      if (!ivRaw || !tagRaw || !dataRaw) {
        throw new Error('Malformed phone ciphertext');
      }
      const iv = Buffer.from(ivRaw, 'base64url');
      const tag = Buffer.from(tagRaw, 'base64url');
      const data = Buffer.from(dataRaw, 'base64url');
      const decipher = createDecipheriv(ALGORITHM, key, iv);
      decipher.setAuthTag(tag);
      return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8');
    },
  };
}
