import { createTestLogger } from '@fathersnet/test-utils';
import { createInMemoryEventBus } from '@fathersnet/events';
import { RateLimitError, UnauthorizedError, ValidationError } from '@fathersnet/errors';
import { createMemoryAuthStateStore } from '../src/services/store/memory-store';
import {
  createInMemoryOtpDeliveryProvider,
  type InMemoryOtpDeliveryProvider,
} from '../src/providers/otp-delivery';
import { OtpService } from '../src/services/otp';
import { phoneDigest } from '../src/services/crypto';
import type { OtpChannel, OtpPurpose } from '../src/providers/otp-delivery';

describe('OtpService', () => {
  const PHONE = '+251911111111';
  const OPTIONS = {
    otpLength: 6,
    otpTtlSeconds: 300,
    otpMaxRequests: 5,
    otpRequestWindowSeconds: 900,
    otpMaxAttempts: 5,
    otpLockoutSeconds: 900,
  };

  function setup(overrides: Partial<typeof OPTIONS> = {}) {
    let now = 1_000_000_000;
    const store = createMemoryAuthStateStore(() => now);
    const provider: InMemoryOtpDeliveryProvider = createInMemoryOtpDeliveryProvider();
    const { logger, logs } = createTestLogger('debug');
    const eventBus = createInMemoryEventBus();
    const service = new OtpService({
      store,
      provider,
      eventBus,
      logger,
      ...OPTIONS,
      ...overrides,
      nowMs: () => now,
    });
    return {
      store,
      provider,
      logger,
      logs,
      eventBus,
      service,
      advance: (ms: number): number => {
        now += ms;
        return now;
      },
      now: (): number => now,
    };
  }

  it('issues an OTP, hashes it in the store, and delivers it without logging it', async () => {
    const { store, provider, service, logs } = setup();

    const result = await service.requestOtp({ phone: PHONE, channel: 'sms', purpose: 'login' });
    expect(result).toEqual({ expiresIn: 300 });

    expect(provider.deliveries).toHaveLength(1);
    expect(provider.deliveries[0]).toMatchObject({
      phone: PHONE,
      channel: 'sms',
      purpose: 'login',
    });

    const stored = await store.getOtp(phoneDigest(PHONE));
    expect(stored).not.toBeNull();
    expect(stored?.codeHash).not.toBe(provider.lastCode);
    expect(stored?.codeHash).toMatch(/^[0-9a-f]{64}$/);

    const serialized = JSON.stringify(logs);
    expect(serialized).not.toContain(provider.lastCode as string);
    expect(serialized).not.toContain(PHONE);
  });

  it('rejects an invalid phone, channel, or purpose', async () => {
    const { service } = setup();
    await expect(
      service.requestOtp({ phone: '251911111111', channel: 'sms', purpose: 'login' }),
    ).rejects.toThrow(ValidationError);
    await expect(
      service.requestOtp({ phone: PHONE, channel: 'email' as OtpChannel, purpose: 'login' }),
    ).rejects.toThrow(ValidationError);
    await expect(
      service.requestOtp({ phone: PHONE, channel: 'sms', purpose: 'reset' as OtpPurpose }),
    ).rejects.toThrow(ValidationError);
  });

  it('rate-limits to the configured number of requests per window', async () => {
    const { service, advance } = setup({ otpMaxRequests: 5 });
    for (let i = 0; i < 5; i += 1) {
      await expect(
        service.requestOtp({ phone: PHONE, channel: 'sms', purpose: 'login' }),
      ).resolves.toBeTruthy();
    }
    await expect(
      service.requestOtp({ phone: PHONE, channel: 'sms', purpose: 'login' }),
    ).rejects.toThrow(RateLimitError);

    advance(900_001);
    await expect(
      service.requestOtp({ phone: PHONE, channel: 'sms', purpose: 'login' }),
    ).resolves.toBeTruthy();
  });

  it('verifies a correct OTP and clears the code', async () => {
    const { store, provider, service, eventBus } = setup();
    await service.requestOtp({ phone: PHONE, channel: 'sms', purpose: 'login' });

    const identity = await service.verifyOtp({
      phone: PHONE,
      otpCode: provider.lastCode as string,
    });
    expect(identity.subjectId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
    expect(identity.role).toBe('father');
    expect(identity.tokenVersion).toBe(1);

    await expect(store.getOtp(phoneDigest(PHONE))).resolves.toBeNull();
    expect(eventBus.published.map((e) => e.type)).toEqual(['auth.otp.requested']);
  });

  it('rejects a wrong code and locks after the attempt cap', async () => {
    const { service, provider } = setup({ otpMaxAttempts: 5 });
    await service.requestOtp({ phone: PHONE, channel: 'sms', purpose: 'login' });

    for (let i = 0; i < 4; i += 1) {
      await expect(service.verifyOtp({ phone: PHONE, otpCode: '000000' })).rejects.toThrow(
        UnauthorizedError,
      );
    }

    const locked = service
      .verifyOtp({ phone: PHONE, otpCode: '000000' })
      .catch((err: unknown) => err);
    await expect(locked).resolves.toBeInstanceOf(RateLimitError);

    // Even the correct code is rejected while locked.
    const stillLocked = service
      .verifyOtp({ phone: PHONE, otpCode: provider.lastCode as string })
      .catch((err: unknown) => err);
    await expect(stillLocked).resolves.toBeInstanceOf(RateLimitError);
  });

  it('rejects an expired OTP', async () => {
    const { service, provider, advance } = setup({ otpTtlSeconds: 300 });
    await service.requestOtp({ phone: PHONE, channel: 'sms', purpose: 'login' });

    advance(300_001);
    await expect(
      service.verifyOtp({ phone: PHONE, otpCode: provider.lastCode as string }),
    ).rejects.toThrow(UnauthorizedError);
  });

  it('unlocks after the lockout window and accepts a fresh OTP', async () => {
    const { service, provider, advance } = setup({ otpMaxAttempts: 5, otpLockoutSeconds: 900 });
    await service.requestOtp({ phone: PHONE, channel: 'sms', purpose: 'login' });
    for (let i = 0; i < 5; i += 1) {
      await service.verifyOtp({ phone: PHONE, otpCode: '000000' }).catch(() => undefined);
    }

    advance(900_001);
    await service.requestOtp({ phone: PHONE, channel: 'sms', purpose: 'login' });
    await expect(
      service.verifyOtp({ phone: PHONE, otpCode: provider.lastCode as string }),
    ).resolves.toMatchObject({ role: 'father', tokenVersion: 1 });
  });

  it('keeps the attempt counter across new code requests (no lockout bypass)', async () => {
    const { service } = setup({ otpMaxAttempts: 5 });
    await service.requestOtp({ phone: PHONE, channel: 'sms', purpose: 'login' });
    for (let i = 0; i < 4; i += 1) {
      await service.verifyOtp({ phone: PHONE, otpCode: '000000' }).catch(() => undefined);
    }
    // A fresh request does not reset the counter.
    await service.requestOtp({ phone: PHONE, channel: 'sms', purpose: 'login' });
    const err = await service
      .verifyOtp({ phone: PHONE, otpCode: '000000' })
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(RateLimitError);
  });

  it('rejects non-numeric or wrong-length OTP codes', async () => {
    const { service } = setup();
    await expect(service.verifyOtp({ phone: PHONE, otpCode: 'abcdef' })).rejects.toThrow(
      ValidationError,
    );
    await expect(service.verifyOtp({ phone: PHONE, otpCode: '12345' })).rejects.toThrow(
      ValidationError,
    );
  });

  it('publishes auth.otp.requested with no PII', async () => {
    const { service, eventBus } = setup();
    await service.requestOtp({ phone: PHONE, channel: 'whatsapp', purpose: 'registration' });

    const event = eventBus.published[0];
    expect(event.type).toBe('auth.otp.requested');
    expect(event.producer).toBe('auth-service');
    expect(JSON.stringify(event.payload)).not.toContain(PHONE);
    expect(JSON.stringify(event.payload)).not.toContain('code');
  });
});
