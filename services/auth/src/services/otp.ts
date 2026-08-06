import { randomUUID } from 'node:crypto';
import {
  RateLimitError,
  UnauthorizedError,
  ValidationError,
  type ErrorField,
} from '@fathersnet/errors';
import type { EventBus } from '@fathersnet/events';
import type { Logger } from '@fathersnet/logger';
import type { OtpChannel, OtpDeliveryProvider, OtpPurpose } from '../providers/otp-delivery';
import { constantTimeEqual, phoneDigest, randomOtp, sha256 } from './crypto';
import { publishAuthEvent } from './events';
import type { AuthStateStore } from './store/types';

export interface OtpServiceOptions {
  store: AuthStateStore;
  provider: OtpDeliveryProvider;
  eventBus: EventBus;
  logger: Logger;
  otpLength: number;
  otpTtlSeconds: number;
  otpMaxRequests: number;
  otpRequestWindowSeconds: number;
  otpMaxAttempts: number;
  otpLockoutSeconds: number;
  /** Injectable clock (milliseconds) for deterministic tests. */
  nowMs?: () => number;
}

export interface OtpRequestInput {
  phone: string;
  channel: OtpChannel;
  purpose: OtpPurpose;
  requestId?: string;
}

export interface OtpVerifyInput {
  phone: string;
  otpCode: string;
  requestId?: string;
}

export interface VerifiedIdentity {
  subjectId: string;
  role: string;
  tokenVersion: number;
  familyId: string;
}

const PHONE_PATTERN = /^\+[1-9]\d{7,14}$/;
const VALID_CHANNELS: readonly string[] = ['sms', 'whatsapp'];
const VALID_PURPOSES: readonly string[] = ['registration', 'login'];

/**
 * OTP request/verify flow (FR-005, SRS §12.2). Codes are stored only as
 * sha256 hashes (D-09), compared in constant time, and expired/locked per the
 * configured policy. Attempt counters survive new code requests so lockout
 * cannot be bypassed by re-requesting.
 */
export class OtpService {
  private readonly nowMs: () => number;

  constructor(private readonly options: OtpServiceOptions) {
    this.nowMs = options.nowMs ?? Date.now;
  }

  async requestOtp(input: OtpRequestInput): Promise<{ expiresIn: number }> {
    this.validateRequest(input);
    const digest = phoneDigest(input.phone);

    const { allowed, retryAfterSeconds } = await this.options.store.countRequest(
      digest,
      this.options.otpMaxRequests,
      this.options.otpRequestWindowSeconds,
      this.nowMs(),
    );
    if (!allowed) {
      throw new RateLimitError('Too many OTP requests. Try again later.', retryAfterSeconds);
    }

    const code = randomOtp(this.options.otpLength);
    await this.options.store.saveOtp(
      digest,
      { codeHash: sha256(code), expiresAtMs: this.nowMs() + this.options.otpTtlSeconds * 1000 },
      this.options.otpTtlSeconds,
    );

    // Never log the code or the phone number (FR-022).
    this.options.logger.info('auth.otp_requested', 'OTP requested', {
      channel: input.channel,
      purpose: input.purpose,
      expires_in_seconds: this.options.otpTtlSeconds,
    });

    await this.options.provider.deliver({
      phone: input.phone,
      code,
      channel: input.channel,
      purpose: input.purpose,
      requestId: input.requestId ?? '',
    });

    await publishAuthEvent(
      this.options.eventBus,
      this.options.logger,
      'auth.otp.requested',
      { channel: input.channel, purpose: input.purpose },
      input.requestId,
    );

    return { expiresIn: this.options.otpTtlSeconds };
  }

  async verifyOtp(input: OtpVerifyInput): Promise<VerifiedIdentity> {
    this.validateVerify(input);
    const digest = phoneDigest(input.phone);
    const now = this.nowMs();

    const attemptState = await this.options.store.getAttemptState(digest);
    if (attemptState.lockedUntilMs > now) {
      throw this.lockedError(attemptState.lockedUntilMs - now);
    }

    const record = await this.options.store.getOtp(digest);
    if (!record || record.expiresAtMs <= now) {
      throw new UnauthorizedError('Invalid or expired OTP');
    }

    if (!constantTimeEqual(sha256(input.otpCode), record.codeHash)) {
      const next = await this.options.store.incrementAttempt(
        digest,
        this.options.otpMaxAttempts,
        this.options.otpLockoutSeconds,
        now,
      );
      this.options.logger.warn('auth.otp_attempt_failed', 'OTP verification failed', {
        attempts: next.attempts,
      });
      if (next.lockedUntilMs > now) {
        throw this.lockedError(next.lockedUntilMs - now);
      }
      throw new UnauthorizedError('Invalid or expired OTP');
    }

    await this.options.store.clearOtp(digest);
    await this.options.store.clearAttempts(digest);

    // WP-016 issues a fresh UUID identity per verification; WP-017 (users
    // service) establishes the durable phone -> user mapping and real role.
    const identity: VerifiedIdentity = {
      subjectId: randomUUID(),
      role: 'father',
      tokenVersion: 1,
      familyId: randomUUID(),
    };

    this.options.logger.info('auth.otp_verified', 'OTP verified', {
      method: 'otp',
      token_version: identity.tokenVersion,
    });

    return identity;
  }

  private lockedError(remainingMs: number): RateLimitError {
    return new RateLimitError(
      'Too many failed attempts. Try again later.',
      Math.max(1, Math.ceil(remainingMs / 1000)),
    );
  }

  private validateRequest(input: OtpRequestInput): void {
    const fields: ErrorField[] = [];
    if (!PHONE_PATTERN.test(input.phone)) {
      fields.push({ field: 'phone', reason: 'must be a valid E.164 phone number' });
    }
    if (!VALID_CHANNELS.includes(input.channel)) {
      fields.push({ field: 'channel', reason: 'must be one of: sms, whatsapp' });
    }
    if (!VALID_PURPOSES.includes(input.purpose)) {
      fields.push({ field: 'purpose', reason: 'must be one of: registration, login' });
    }
    if (fields.length > 0) {
      throw new ValidationError('Invalid OTP request', fields);
    }
  }

  private validateVerify(input: OtpVerifyInput): void {
    const fields: ErrorField[] = [];
    if (!PHONE_PATTERN.test(input.phone)) {
      fields.push({ field: 'phone', reason: 'must be a valid E.164 phone number' });
    }
    if (!/^\d+$/.test(input.otpCode) || input.otpCode.length !== this.options.otpLength) {
      fields.push({
        field: 'otp_code',
        reason: `must be exactly ${this.options.otpLength} digits`,
      });
    }
    if (fields.length > 0) {
      throw new ValidationError('Invalid OTP verification', fields);
    }
  }
}
