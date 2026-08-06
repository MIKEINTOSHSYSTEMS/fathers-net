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

  async function boot(env: NodeJS.ProcessEnv = buildEnv(), nowMs?: () => number): Promise<void> {
    const config = loadUsersConfig(env);
    eventBus = createInMemoryEventBus();
    const { logger } = createTestLogger('debug');
    app = await buildUsersApp({
      config,
      eventBus,
      logger,
      nowMs: nowMs ?? (() => new Date('2025-03-01T12:00:00Z').getTime()),
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

  describe('consent lifecycle routes (WP-018, SRS §12.3, AR-012)', () => {
    let clockMs: number;
    // The consent stream orders records by (granted_at, id); a distinct
    // timestamp per write mirrors the DB's per-insert now().
    function advancingClock(): () => number {
      return () => {
        const t = clockMs;
        clockMs += 1000;
        return t;
      };
    }

    async function bootConsents(): Promise<void> {
      clockMs = new Date('2025-03-01T12:00:00Z').getTime();
      await boot(undefined, advancingClock());
    }

    async function registerAndAuth(
      phone = PHONE,
    ): Promise<{ auth: Record<string, string>; userId: string }> {
      const register = await app.inject({
        method: 'POST',
        url: '/v1/users/register',
        payload: { phone, first_name: 'Abebe', last_name: 'Kebede', language: 'en' },
      });
      expect(register.statusCode).toBe(201);
      const userId = register.json().userId as string;
      return { auth: { authorization: `Bearer ${signAccessToken(userId)}` }, userId };
    }

    it('requires a bearer token for every consent endpoint', async () => {
      await bootConsents();
      const get = await app.inject({ method: 'GET', url: '/v1/users/me/consents' });
      expect(get.statusCode).toBe(401);
      const post = await app.inject({
        method: 'POST',
        url: '/v1/users/me/consents',
        payload: { consent_type: 'participation', version: 'v1.0' },
      });
      expect(post.statusCode).toBe(401);
      const withdraw = await app.inject({
        method: 'POST',
        url: '/v1/users/me/consents/00000000-0000-4000-8000-000000000000/withdraw',
      });
      expect(withdraw.statusCode).toBe(401);
    });

    it('runs the consent lifecycle end-to-end: grant -> view -> withdraw -> re-consent', async () => {
      await bootConsents();
      const { auth } = await registerAndAuth();

      const grant = await app.inject({
        method: 'POST',
        url: '/v1/users/me/consents',
        headers: auth,
        payload: { consent_type: 'participation', version: 'v1.0' },
      });
      expect(grant.statusCode).toBe(201);
      expect(grant.json()).toMatchObject({
        consentType: 'participation',
        version: 'v1.0',
        state: 'granted',
        withdrawnAt: null,
      });
      const grantId = grant.json().id as string;

      const view = await app.inject({ method: 'GET', url: '/v1/users/me/consents', headers: auth });
      expect(view.statusCode).toBe(200);
      expect(view.json().consents).toHaveLength(1);
      expect(view.json().consents[0]).toMatchObject({
        consentType: 'participation',
        state: 'granted',
        version: 'v1.0',
      });
      expect(view.json().consents[0].history).toHaveLength(1);

      const withdraw = await app.inject({
        method: 'POST',
        url: `/v1/users/me/consents/${grantId}/withdraw`,
        headers: auth,
      });
      expect(withdraw.statusCode).toBe(200);
      expect(withdraw.json()).toMatchObject({ state: 'withdrawn', consentType: 'participation' });

      const afterWithdraw = await app.inject({
        method: 'GET',
        url: '/v1/users/me/consents',
        headers: auth,
      });
      expect(afterWithdraw.json().consents[0].state).toBe('withdrawn');
      expect(afterWithdraw.json().consents[0].history).toHaveLength(2);

      const reconsent = await app.inject({
        method: 'POST',
        url: '/v1/users/me/consents',
        headers: auth,
        payload: { consent_type: 'participation', version: 'v2.0' },
      });
      expect(reconsent.statusCode).toBe(201);
      expect(reconsent.json().state).toBe('granted');

      const final = await app.inject({
        method: 'GET',
        url: '/v1/users/me/consents',
        headers: auth,
      });
      expect(final.json().consents[0].state).toBe('granted');
      expect(final.json().consents[0].history).toHaveLength(3);
      expect(final.json().consents[0].history.map((r: { state: string }) => r.state)).toEqual([
        'granted',
        'withdrawn',
        'granted',
      ]);

      const consentEvents = eventBus.published.filter((e) => e.type === 'user.consent.changed');
      expect(consentEvents.map((e) => (e.payload as { state: string }).state)).toEqual([
        'granted',
        'withdrawn',
        'granted',
      ]);
      expect(JSON.stringify(consentEvents)).not.toContain('Abebe');
    });

    it('returns 409 granting an already-granted type and withdrawing an already-withdrawn one', async () => {
      await bootConsents();
      const { auth } = await registerAndAuth();
      const first = await app.inject({
        method: 'POST',
        url: '/v1/users/me/consents',
        headers: auth,
        payload: { consent_type: 'media', version: 'v1.0' },
      });
      const id = first.json().id as string;

      const duplicateGrant = await app.inject({
        method: 'POST',
        url: '/v1/users/me/consents',
        headers: auth,
        payload: { consent_type: 'media', version: 'v2.0' },
      });
      expect(duplicateGrant.statusCode).toBe(409);
      expect(duplicateGrant.json()).toMatchObject({ error: { code: 'CONFLICT' } });

      const withdraw = await app.inject({
        method: 'POST',
        url: `/v1/users/me/consents/${id}/withdraw`,
        headers: auth,
      });
      expect(withdraw.statusCode).toBe(200);

      const doubleWithdraw = await app.inject({
        method: 'POST',
        url: `/v1/users/me/consents/${id}/withdraw`,
        headers: auth,
      });
      expect(doubleWithdraw.statusCode).toBe(409);
      expect(doubleWithdraw.json()).toMatchObject({ error: { code: 'CONFLICT' } });
    });

    it("is self-scoped: cannot withdraw another user's consent (404)", async () => {
      await bootConsents();
      const { auth: authA } = await registerAndAuth(PHONE);
      const { auth: authB } = await registerAndAuth('+251922222222');

      const grantB = await app.inject({
        method: 'POST',
        url: '/v1/users/me/consents',
        headers: authB,
        payload: { consent_type: 'research', version: 'v1.0' },
      });
      const idB = grantB.json().id as string;

      const crossUserWithdraw = await app.inject({
        method: 'POST',
        url: `/v1/users/me/consents/${idB}/withdraw`,
        headers: authA,
      });
      expect(crossUserWithdraw.statusCode).toBe(404);
      expect(crossUserWithdraw.json()).toMatchObject({ error: { code: 'NOT_FOUND' } });

      const unknown = await app.inject({
        method: 'POST',
        url: '/v1/users/me/consents/00000000-0000-4000-8000-000000000000/withdraw',
        headers: authA,
      });
      expect(unknown.statusCode).toBe(404);
    });

    it('returns 422 for invalid consent_type, version, and consent id', async () => {
      await bootConsents();
      const { auth } = await registerAndAuth();

      const badType = await app.inject({
        method: 'POST',
        url: '/v1/users/me/consents',
        headers: auth,
        payload: { consent_type: 'crypto', version: 'v1.0' },
      });
      expect(badType.statusCode).toBe(422);
      expect(badType.json()).toMatchObject({ error: { code: 'VALIDATION_ERROR' } });

      const missingVersion = await app.inject({
        method: 'POST',
        url: '/v1/users/me/consents',
        headers: auth,
        payload: { consent_type: 'research' },
      });
      expect(missingVersion.statusCode).toBe(422);

      const badId = await app.inject({
        method: 'POST',
        url: '/v1/users/me/consents/not-a-uuid/withdraw',
        headers: auth,
      });
      expect(badId.statusCode).toBe(422);
    });

    it('returns 404 for a token subject with no durable user record', async () => {
      await bootConsents();
      const ghost = {
        authorization: `Bearer ${signAccessToken('00000000-0000-4000-8000-000000000000')}`,
      };
      const get = await app.inject({ method: 'GET', url: '/v1/users/me/consents', headers: ghost });
      expect(get.statusCode).toBe(404);
    });
  });
});
