import type { FastifyInstance } from 'fastify';
import { createTestLogger, createRequestId } from '@fathersnet/test-utils';
import { createInMemoryEventBus } from '@fathersnet/events';
import { loadAuthConfig } from '../src/config';
import { buildAuthApp } from '../src/app';
import {
  createInMemoryOtpDeliveryProvider,
  type InMemoryOtpDeliveryProvider,
} from '../src/providers/otp-delivery';
import type { InMemoryEventBus } from '@fathersnet/events';

describe('auth routes (SRS §12.2)', () => {
  const PHONE = '+251911111111';

  function buildEnv(overrides: Record<string, string> = {}): NodeJS.ProcessEnv {
    return {
      ENV: 'dev',
      FN_PORT: '3100',
      FN_SERVICE_NAME: 'auth',
      FN_AUTH_JWT_SECRET: 'test-secret-0123456789abcdef0123456789abcdef',
      FN_AUTH_OTP_LENGTH: '6',
      FN_AUTH_OTP_MAX_REQUESTS: '5',
      FN_AUTH_OTP_MAX_ATTEMPTS: '5',
      FN_AUTH_OTP_LOCKOUT_SECONDS: '900',
      ...overrides,
    } as NodeJS.ProcessEnv;
  }

  let app: FastifyInstance;
  let provider: InMemoryOtpDeliveryProvider;
  let eventBus: InMemoryEventBus;

  async function boot(env: NodeJS.ProcessEnv = buildEnv()): Promise<void> {
    const config = loadAuthConfig(env);
    provider = createInMemoryOtpDeliveryProvider();
    eventBus = createInMemoryEventBus();
    const { logger } = createTestLogger('debug');
    app = await buildAuthApp({ config, otpProvider: provider, eventBus, logger });
    await app.ready();
  }

  afterEach(async () => {
    await app?.close();
  });

  it('serves the liveness probe', async () => {
    await boot();
    const response = await app.inject({ method: 'GET', url: '/healthz' });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ status: 'ok', service: 'auth' });
  });

  it('runs the §12.2 flow: request -> verify -> refresh -> logout', async () => {
    await boot();

    const request = await app.inject({
      method: 'POST',
      url: '/v1/auth/otp/request',
      headers: { 'x-request-id': createRequestId() },
      payload: { phone: PHONE, channel: 'sms', purpose: 'login' },
    });
    expect(request.statusCode).toBe(200);
    expect(request.json()).toEqual({ status: 'sent', expires_in: 300 });

    const verify = await app.inject({
      method: 'POST',
      url: '/v1/auth/otp/verify',
      payload: { phone: PHONE, otp_code: provider.lastCode as string },
    });
    expect(verify.statusCode).toBe(200);
    const session = verify.json();
    expect(session.token_type).toBe('Bearer');
    expect(session.expires_in).toBe(900);
    expect(session.access_token.split('.')).toHaveLength(3);
    expect(session.refresh_token).toBeTruthy();
    expect(JSON.stringify(session)).not.toContain(provider.lastCode);
    expect(JSON.stringify(session)).not.toContain(PHONE);

    const refresh = await app.inject({
      method: 'POST',
      url: '/v1/auth/refresh',
      headers: { authorization: `Bearer ${session.refresh_token}` },
    });
    expect(refresh.statusCode).toBe(200);
    const refreshed = refresh.json();
    expect(refreshed.access_token).not.toBe(session.access_token);
    expect(refreshed.refresh_token).toBe(session.refresh_token);

    const logout = await app.inject({
      method: 'POST',
      url: '/v1/auth/logout',
      payload: { refresh_token: session.refresh_token },
    });
    expect(logout.statusCode).toBe(200);
    expect(logout.json()).toEqual({ status: 'revoked' });

    const reuse = await app.inject({
      method: 'POST',
      url: '/v1/auth/refresh',
      headers: { authorization: `Bearer ${session.refresh_token}` },
    });
    expect(reuse.statusCode).toBe(401);
    expect(reuse.json()).toMatchObject({ error: { code: 'UNAUTHORIZED' } });

    expect(eventBus.published.map((e) => e.type)).toEqual([
      'auth.otp.requested',
      'auth.session.created',
      'auth.session.revoked',
    ]);
  });

  it('returns a 422 envelope for invalid bodies', async () => {
    await boot();

    const badPhone = await app.inject({
      method: 'POST',
      url: '/v1/auth/otp/request',
      payload: { phone: '911111111', channel: 'sms', purpose: 'login' },
    });
    expect(badPhone.statusCode).toBe(422);
    expect(badPhone.json()).toMatchObject({ error: { code: 'VALIDATION_ERROR' } });

    const badChannel = await app.inject({
      method: 'POST',
      url: '/v1/auth/otp/request',
      payload: { phone: PHONE, channel: 'email', purpose: 'login' },
    });
    expect(badChannel.statusCode).toBe(422);

    const shortCode = await app.inject({
      method: 'POST',
      url: '/v1/auth/otp/verify',
      payload: { phone: PHONE, otp_code: '123' },
    });
    expect(shortCode.statusCode).toBe(422);
  });

  it('rate-limits OTP requests with Retry-After', async () => {
    await boot(buildEnv({ FN_AUTH_OTP_MAX_REQUESTS: '2' }));
    for (let i = 0; i < 2; i += 1) {
      const ok = await app.inject({
        method: 'POST',
        url: '/v1/auth/otp/request',
        payload: { phone: PHONE, channel: 'sms', purpose: 'login' },
      });
      expect(ok.statusCode).toBe(200);
    }
    const limited = await app.inject({
      method: 'POST',
      url: '/v1/auth/otp/request',
      payload: { phone: PHONE, channel: 'sms', purpose: 'login' },
    });
    expect(limited.statusCode).toBe(429);
    expect(limited.headers['retry-after']).toBeTruthy();
    expect(limited.json()).toMatchObject({ error: { code: 'RATE_LIMITED' } });
  });

  it('locks a phone out after too many failed attempts with Retry-After', async () => {
    await boot(buildEnv({ FN_AUTH_OTP_MAX_ATTEMPTS: '3', FN_AUTH_OTP_LOCKOUT_SECONDS: '600' }));
    await app.inject({
      method: 'POST',
      url: '/v1/auth/otp/request',
      payload: { phone: PHONE, channel: 'sms', purpose: 'login' },
    });

    for (let i = 0; i < 2; i += 1) {
      const fail = await app.inject({
        method: 'POST',
        url: '/v1/auth/otp/verify',
        payload: { phone: PHONE, otp_code: '000000' },
      });
      expect(fail.statusCode).toBe(401);
    }

    const locked = await app.inject({
      method: 'POST',
      url: '/v1/auth/otp/verify',
      payload: { phone: PHONE, otp_code: '000000' },
    });
    expect(locked.statusCode).toBe(429);
    expect(locked.headers['retry-after']).toBe('600');
  });

  it('rejects missing or invalid refresh tokens', async () => {
    await boot();

    const missing = await app.inject({ method: 'POST', url: '/v1/auth/refresh' });
    expect(missing.statusCode).toBe(401);

    const bogus = await app.inject({
      method: 'POST',
      url: '/v1/auth/refresh',
      headers: { authorization: 'Bearer not-a-token' },
    });
    expect(bogus.statusCode).toBe(401);

    const badLogout = await app.inject({
      method: 'POST',
      url: '/v1/auth/logout',
      payload: { refresh_token: 'not-a-token' },
    });
    expect(badLogout.statusCode).toBe(401);
  });

  it('exposes the request id on error envelopes', async () => {
    await boot();
    const requestId = createRequestId();
    const bad = await app.inject({
      method: 'POST',
      url: '/v1/auth/otp/request',
      headers: { 'x-request-id': requestId },
      payload: { phone: 'bad', channel: 'sms', purpose: 'login' },
    });
    expect(bad.json().error.request_id).toBe(requestId);
  });

  it('does not leak OTP codes in any response', async () => {
    await boot();
    const request = await app.inject({
      method: 'POST',
      url: '/v1/auth/otp/request',
      payload: { phone: PHONE, channel: 'sms', purpose: 'login' },
    });
    expect(request.body).not.toContain(provider.lastCode as string);
  });
});
