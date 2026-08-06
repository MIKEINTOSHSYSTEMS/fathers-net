import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import jwt from 'jsonwebtoken';
import { createTestLogger, createRequestId } from '@fathersnet/test-utils';
import { createInMemoryEventBus, type InMemoryEventBus } from '@fathersnet/events';
import { loadUsersConfig } from '../src/config';
import { buildUsersApp } from '../src/app';

const SECRET = 'test-jwt-secret-0123456789abcdef0123456789abcdef';
const PHONE = '+251911111111';

function signAccessToken(subjectId: string): string {
  return jwt.sign({ role: 'father', token_version: 1, typ: 'access', sid: 'test-family' }, SECRET, {
    algorithm: 'HS256',
    issuer: 'fathersnet',
    audience: 'fathersnet-api',
    subject: subjectId,
    expiresIn: 900,
    jwtid: randomUUID(),
  });
}

describe('users routes (SRS §12.3)', () => {
  function buildEnv(overrides: Record<string, string> = {}): NodeJS.ProcessEnv {
    return {
      ENV: 'dev',
      FN_PORT: '3200',
      FN_SERVICE_NAME: 'users',
      FN_USERS_JWT_SECRET: SECRET,
      FN_USERS_PHONE_ENC_KEY: 'test-enc-key',
      FN_USERS_PHONE_DIGEST_KEY: 'test-digest-key',
      ...overrides,
    } as NodeJS.ProcessEnv;
  }

  let app: FastifyInstance;
  let eventBus: InMemoryEventBus;

  async function boot(env: NodeJS.ProcessEnv = buildEnv()): Promise<void> {
    const config = loadUsersConfig(env);
    eventBus = createInMemoryEventBus();
    const { logger } = createTestLogger('debug');
    app = await buildUsersApp({
      config,
      eventBus,
      logger,
      nowMs: () => new Date('2025-03-01T12:00:00Z').getTime(),
    });
    await app.ready();
  }

  afterEach(async () => {
    await app?.close();
  });

  it('serves the liveness probe', async () => {
    await boot();
    const response = await app.inject({ method: 'GET', url: '/healthz' });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ status: 'ok', service: 'users' });
  });

  it('registers a user and never returns the plaintext phone', async () => {
    await boot();
    const response = await app.inject({
      method: 'POST',
      url: '/v1/users/register',
      headers: { 'x-request-id': createRequestId() },
      payload: {
        phone: PHONE,
        first_name: 'Abebe',
        last_name: 'Kebede',
        language: 'am',
        region: 'Addis Ababa',
      },
    });
    expect(response.statusCode).toBe(201);
    const body = response.json();
    expect(body.userId).toBeTruthy();
    expect(body.phoneMasked).toBe('+2519****1111');
    expect(response.body).not.toContain('911111111');

    expect(eventBus.published.map((e) => e.type)).toEqual(['user.enrolled']);
    expect(JSON.stringify(eventBus.published[0])).not.toContain(PHONE);
    expect(JSON.stringify(eventBus.published[0])).not.toContain('Abebe');
  });

  it('returns 409 for a duplicate phone', async () => {
    await boot();
    const payload = { phone: PHONE, first_name: 'A', last_name: 'B', language: 'en' };
    const first = await app.inject({ method: 'POST', url: '/v1/users/register', payload });
    expect(first.statusCode).toBe(201);
    const dup = await app.inject({ method: 'POST', url: '/v1/users/register', payload });
    expect(dup.statusCode).toBe(409);
    expect(dup.json()).toMatchObject({ error: { code: 'CONFLICT' } });
  });

  it('returns 422 for invalid register bodies', async () => {
    await boot();
    const bad = await app.inject({
      method: 'POST',
      url: '/v1/users/register',
      payload: { phone: '0911000000', first_name: '', last_name: 'B', language: 'sw' },
    });
    expect(bad.statusCode).toBe(422);
    expect(bad.json()).toMatchObject({ error: { code: 'VALIDATION_ERROR' } });
  });

  it('requires a bearer token for /me endpoints', async () => {
    await boot();
    const missing = await app.inject({ method: 'GET', url: '/v1/users/me' });
    expect(missing.statusCode).toBe(401);
    expect(missing.json()).toMatchObject({ error: { code: 'UNAUTHORIZED' } });

    const bogus = await app.inject({
      method: 'GET',
      url: '/v1/users/me',
      headers: { authorization: 'Bearer not-a-token' },
    });
    expect(bogus.statusCode).toBe(401);
  });

  it('runs the §12.3 self-scoped flow: register -> me -> patch -> pregnancy -> preferences', async () => {
    await boot();
    const register = await app.inject({
      method: 'POST',
      url: '/v1/users/register',
      payload: { phone: PHONE, first_name: 'A', last_name: 'B', language: 'en' },
    });
    expect(register.statusCode).toBe(201);
    const userId = register.json().userId as string;
    const auth = { authorization: `Bearer ${signAccessToken(userId)}` };

    const me = await app.inject({ method: 'GET', url: '/v1/users/me', headers: auth });
    expect(me.statusCode).toBe(200);
    expect(me.json().userId).toBe(userId);
    expect(me.json().phoneMasked).toBe('+2519****1111');

    const patch = await app.inject({
      method: 'PATCH',
      url: '/v1/users/me',
      headers: auth,
      payload: { first_name: 'Abebe', cohort: 'urban_fathers' },
    });
    expect(patch.statusCode).toBe(200);
    expect(patch.json().profile.firstName).toBe('Abebe');
    expect(patch.json().profile.cohort).toBe('urban_fathers');

    const pregnancy = await app.inject({
      method: 'PUT',
      url: '/v1/users/me/pregnancy',
      headers: auth,
      payload: { edd: '2025-10-01' },
    });
    expect(pregnancy.statusCode).toBe(200);
    expect(pregnancy.json().pregnancyWeek).toBe(9);
    expect(pregnancy.json().trimester).toBe(1);

    const prefs = await app.inject({
      method: 'PUT',
      url: '/v1/users/me/preferences',
      headers: auth,
      payload: { quiet_hours: { start: '22:00', end: '07:00' }, notification_channels: ['sms'] },
    });
    expect(prefs.statusCode).toBe(200);
    expect(prefs.json().preferences).toMatchObject({
      quietHours: { start: '22:00', end: '07:00' },
      notificationChannels: ['sms'],
    });

    const final = await app.inject({ method: 'GET', url: '/v1/users/me', headers: auth });
    expect(final.json().pregnancy).toMatchObject({ edd: '2025-10-01', pregnancyWeek: 9 });

    const events = eventBus.published.map((e) => e.type);
    expect(events).toEqual(['user.enrolled', 'user.profile.updated', 'user.profile.updated']);
  });

  it('returns 404 when the token subject is not a registered user', async () => {
    await boot();
    const auth = {
      authorization: `Bearer ${signAccessToken('00000000-0000-4000-8000-000000000000')}`,
    };
    const me = await app.inject({ method: 'GET', url: '/v1/users/me', headers: auth });
    expect(me.statusCode).toBe(404);
    expect(me.json()).toMatchObject({ error: { code: 'NOT_FOUND' } });
  });

  it('returns 422 for invalid me mutations', async () => {
    await boot();
    const register = await app.inject({
      method: 'POST',
      url: '/v1/users/register',
      payload: { phone: PHONE, first_name: 'A', last_name: 'B', language: 'en' },
    });
    const auth = {
      authorization: `Bearer ${signAccessToken(register.json().userId as string)}`,
    };

    const badPatch = await app.inject({
      method: 'PATCH',
      url: '/v1/users/me',
      headers: auth,
      payload: { language: 'fr' },
    });
    expect(badPatch.statusCode).toBe(422);

    const badPregnancy = await app.inject({
      method: 'PUT',
      url: '/v1/users/me/pregnancy',
      headers: auth,
      payload: { edd: 'nope' },
    });
    expect(badPregnancy.statusCode).toBe(422);

    const badPrefs = await app.inject({
      method: 'PUT',
      url: '/v1/users/me/preferences',
      headers: auth,
      payload: { notification_channels: ['email'] },
    });
    expect(badPrefs.statusCode).toBe(422);
  });

  it('rejects unknown routes with the standard envelope', async () => {
    await boot();
    const missing = await app.inject({ method: 'GET', url: '/v1/users/nope' });
    expect(missing.statusCode).toBe(404);
    expect(missing.json()).toMatchObject({ error: { code: 'NOT_FOUND' } });
  });

  it('echoes the request id on error envelopes', async () => {
    await boot();
    const requestId = createRequestId();
    const bad = await app.inject({
      method: 'POST',
      url: '/v1/users/register',
      headers: { 'x-request-id': requestId },
      payload: { phone: 'bad', first_name: 'A', last_name: 'B', language: 'en' },
    });
    expect(bad.json().error.request_id).toBe(requestId);
    expect(bad.headers['x-request-id']).toBe(requestId);
  });

  it('never returns the plaintext phone in me responses', async () => {
    await boot();
    const register = await app.inject({
      method: 'POST',
      url: '/v1/users/register',
      payload: { phone: PHONE, first_name: 'Abebe', last_name: 'Kebede', language: 'en' },
    });
    const auth = {
      authorization: `Bearer ${signAccessToken(register.json().userId as string)}`,
    };
    const me = await app.inject({ method: 'GET', url: '/v1/users/me', headers: auth });
    expect(me.body).not.toContain('911111111');
  });
});
