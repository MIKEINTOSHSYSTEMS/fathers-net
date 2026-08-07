import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import jwt from 'jsonwebtoken';
import { createTestLogger } from '@fathersnet/test-utils';
import { createInMemoryEventBus, type InMemoryEventBus } from '@fathersnet/events';
import { buildRemindersApp } from '../src/app';
import { loadRemindersConfig } from '../src/config';
import { dayWindow } from '../src/engine/cap';
import { createMemoryReminderStore } from '../src/store/memory-store';
import type { ReminderStore } from '../src/store/types';
import type { CreateReminderTemplateInput } from '../src/types';

const SECRET = 'test-jwt-secret-0123456789abcdef0123456789abcdef';
const STAFF = '33333333-3333-4333-8333-333333333333';
const FATHER_A = '55555555-5555-4555-8555-555555555555';
const FATHER_B = '66666666-6666-4666-8666-666666666666';

function signAccessToken(subjectId: string, role = 'father'): string {
  return jwt.sign({ role, token_version: 1, typ: 'access', sid: 'test-family' }, SECRET, {
    algorithm: 'HS256',
    issuer: 'fathersnet',
    audience: 'fathersnet-api',
    subject: subjectId,
    expiresIn: 900,
    jwtid: randomUUID(),
  });
}

function buildEnv(overrides: Record<string, string> = {}): NodeJS.ProcessEnv {
  return {
    ENV: 'dev',
    FN_PORT: '3500',
    FN_SERVICE_NAME: 'reminders',
    FN_REMINDERS_JWT_SECRET: SECRET,
    ...overrides,
  } as NodeJS.ProcessEnv;
}

const TEMPLATE_INPUT: CreateReminderTemplateInput = {
  code: 'antenatal_visit',
  channel: 'whatsapp',
  priority: 'normal',
  titleEn: 'ANC visit reminder',
  titleAm: 'የቅድመ ወሊድ ጉብኝት ማስታወሻ',
  bodyEn: 'Your antenatal visit is coming up.',
  bodyAm: 'የቅድመ ወሊድ ጉብኝትዎ ቀርቧል።',
};

describe('reminder internal API (WP-021 contract, camelCase)', () => {
  let app: FastifyInstance;
  let store: ReminderStore;
  let eventBus: InMemoryEventBus;

  async function boot(env: NodeJS.ProcessEnv = buildEnv()): Promise<void> {
    const config = loadRemindersConfig(env);
    store = createMemoryReminderStore();
    await store.createTemplate(TEMPLATE_INPUT);
    eventBus = createInMemoryEventBus();
    const { logger } = createTestLogger('info');
    app = await buildRemindersApp({ config, store, eventBus, logger });
    await app.ready();
  }

  afterEach(async () => {
    await app?.close();
  });

  const staffAuth = { authorization: `Bearer ${signAccessToken(STAFF, 'staff')}` };
  const fatherAAuth = { authorization: `Bearer ${signAccessToken(FATHER_A)}` };
  const fatherBAuth = { authorization: `Bearer ${signAccessToken(FATHER_B)}` };

  it('serves liveness and readiness probes without auth', async () => {
    await boot();
    const health = await app.inject({ method: 'GET', url: '/healthz' });
    expect(health.statusCode).toBe(200);
    expect(health.json()).toMatchObject({ status: 'ok', service: 'reminders' });

    const ready = await app.inject({ method: 'GET', url: '/readyz' });
    expect(ready.statusCode).toBe(200);
    expect(ready.json()).toMatchObject({ status: 'ok', driver: 'memory' });
  });

  it('requires a bearer token on every internal route', async () => {
    await boot();
    const routes = [
      {
        method: 'POST',
        url: '/internal/reminders/instances',
        payload: {
          templateCode: 'antenatal_visit',
          userId: FATHER_A,
          dueAt: '2025-01-05T09:00:00Z',
        },
      },
      { method: 'GET', url: `/internal/reminders/instances/${randomUUID()}` },
      { method: 'GET', url: '/internal/reminders/dispatches' },
    ] as const;

    for (const route of routes) {
      const response = await app.inject(route as never);
      expect(response.statusCode).toBe(401);
      expect(response.json()).toMatchObject({ error: { code: 'UNAUTHORIZED' } });
    }

    const bogus = await app.inject({
      method: 'GET',
      url: '/internal/reminders/dispatches',
      headers: { authorization: 'Bearer not-a-token' },
    });
    expect(bogus.statusCode).toBe(401);
  });

  it("lets a father schedule their own reminder (201) but not another user's", async () => {
    await boot();
    const body = {
      templateCode: 'antenatal_visit',
      userId: FATHER_A,
      dueAt: '2025-01-05T09:00:00.000Z',
    };

    const own = await app.inject({
      method: 'POST',
      url: '/internal/reminders/instances',
      headers: fatherAAuth,
      payload: body,
    });
    expect(own.statusCode).toBe(201);
    expect(own.json()).toMatchObject({
      userId: FATHER_A,
      status: 'scheduled',
      priority: 'normal',
      channel: 'whatsapp',
      dueAt: '2025-01-05T09:00:00.000Z',
    });
    expect(own.json().id).toMatch(/^[0-9a-f-]{36}$/i);
    expect(own.json().templateId).toBeDefined();

    const crossUser = await app.inject({
      method: 'POST',
      url: '/internal/reminders/instances',
      headers: fatherBAuth,
      payload: { ...body, userId: FATHER_A },
    });
    expect(crossUser.statusCode).toBe(403);
    expect(crossUser.json()).toMatchObject({ error: { code: 'FORBIDDEN' } });
  });

  it('lets staff schedule for any user', async () => {
    await boot();
    const created = await app.inject({
      method: 'POST',
      url: '/internal/reminders/instances',
      headers: staffAuth,
      payload: { templateCode: 'antenatal_visit', userId: FATHER_A, dueAt: '2025-01-05T09:00:00Z' },
    });
    expect(created.statusCode).toBe(201);
  });

  it('enforces ownership on instance reads and 404s unknown ids', async () => {
    await boot();
    const created = await app.inject({
      method: 'POST',
      url: '/internal/reminders/instances',
      headers: staffAuth,
      payload: { templateCode: 'antenatal_visit', userId: FATHER_A, dueAt: '2025-01-05T09:00:00Z' },
    });
    const instanceId = created.json().id as string;

    const own = await app.inject({
      method: 'GET',
      url: `/internal/reminders/instances/${instanceId}`,
      headers: fatherAAuth,
    });
    expect(own.statusCode).toBe(200);
    expect(own.json()).toMatchObject({ id: instanceId, userId: FATHER_A });

    const other = await app.inject({
      method: 'GET',
      url: `/internal/reminders/instances/${instanceId}`,
      headers: fatherBAuth,
    });
    expect(other.statusCode).toBe(403);

    const staffRead = await app.inject({
      method: 'GET',
      url: `/internal/reminders/instances/${instanceId}`,
      headers: staffAuth,
    });
    expect(staffRead.statusCode).toBe(200);

    const missing = await app.inject({
      method: 'GET',
      url: `/internal/reminders/instances/${randomUUID()}`,
      headers: staffAuth,
    });
    expect(missing.statusCode).toBe(404);
    expect(missing.json()).toMatchObject({ error: { code: 'NOT_FOUND' } });
  });

  it('scopes dispatch listing to the caller, staff may cross users', async () => {
    await boot();
    const window = dayWindow(Date.now(), 180);
    const dispatchFor = async (userId: string, runId: string): Promise<void> => {
      const template = (await store.findTemplateByCode('antenatal_visit'))!;
      const instance = await store.createInstance({
        templateId: template.id,
        userId,
        dueAt: '2025-01-01T09:00:00Z',
        priority: 'normal',
        channel: 'whatsapp',
        dedupeKey: null,
      });
      await store.dispatchInstance({
        instanceId: instance.id,
        userId,
        runId,
        channel: 'whatsapp',
        priority: 'normal',
        dispatchedAt: new Date().toISOString(),
        dayStart: window.startIso,
        dayEnd: window.endIso,
        dailyCap: 5,
      });
    };
    await dispatchFor(FATHER_A, 'run-a');

    const fatherList = await app.inject({
      method: 'GET',
      url: '/internal/reminders/dispatches',
      headers: fatherAAuth,
    });
    expect(fatherList.statusCode).toBe(200);
    expect(fatherList.json().dispatches.map((d: { runId: string }) => d.runId)).toEqual(['run-a']);

    const crossUser = await app.inject({
      method: 'GET',
      url: `/internal/reminders/dispatches?userId=${FATHER_A}`,
      headers: fatherBAuth,
    });
    expect(crossUser.statusCode).toBe(403);

    const staffList = await app.inject({
      method: 'GET',
      url: `/internal/reminders/dispatches?userId=${FATHER_A}&limit=50`,
      headers: staffAuth,
    });
    expect(staffList.statusCode).toBe(200);
    expect(staffList.json().dispatches.map((d: { runId: string }) => d.runId)).toEqual(['run-a']);
  });

  it('rejects invalid bodies and malformed ids with 422', async () => {
    await boot();

    const badTemplate = await app.inject({
      method: 'POST',
      url: '/internal/reminders/instances',
      headers: staffAuth,
      payload: { userId: FATHER_A, dueAt: '2025-01-05T09:00:00Z' },
    });
    expect(badTemplate.statusCode).toBe(422);
    expect(badTemplate.json()).toMatchObject({ error: { code: 'VALIDATION_ERROR' } });

    const badUser = await app.inject({
      method: 'POST',
      url: '/internal/reminders/instances',
      headers: staffAuth,
      payload: {
        templateCode: 'antenatal_visit',
        userId: 'not-a-uuid',
        dueAt: '2025-01-05T09:00:00Z',
      },
    });
    expect(badUser.statusCode).toBe(422);

    const badDate = await app.inject({
      method: 'POST',
      url: '/internal/reminders/instances',
      headers: staffAuth,
      payload: { templateCode: 'antenatal_visit', userId: FATHER_A, dueAt: 'tomorrow' },
    });
    expect(badDate.statusCode).toBe(422);

    const badPriority = await app.inject({
      method: 'POST',
      url: '/internal/reminders/instances',
      headers: staffAuth,
      payload: {
        templateCode: 'antenatal_visit',
        userId: FATHER_A,
        dueAt: '2025-01-05T09:00:00Z',
        priority: 'urgent',
      },
    });
    expect(badPriority.statusCode).toBe(422);

    // Unknown body properties are silently ignored (Fastify default Ajv
    // `removeAdditional: true`, same behavior as the content service), so the
    // request still succeeds without echoing the extra field.
    const extraField = await app.inject({
      method: 'POST',
      url: '/internal/reminders/instances',
      headers: staffAuth,
      payload: {
        templateCode: 'antenatal_visit',
        userId: FATHER_A,
        dueAt: '2025-01-05T09:00:00Z',
        extra: true,
      },
    });
    expect(extraField.statusCode).toBe(201);
    expect(extraField.json()).not.toHaveProperty('extra');

    const badId = await app.inject({
      method: 'GET',
      url: '/internal/reminders/instances/not-a-uuid',
      headers: staffAuth,
    });
    expect(badId.statusCode).toBe(422);
  });

  it('returns 404 for unknown routes', async () => {
    await boot();
    const response = await app.inject({
      method: 'GET',
      url: '/internal/reminders/nope',
      headers: staffAuth,
    });
    expect(response.statusCode).toBe(404);
  });

  it('echoes the request id on error envelopes', async () => {
    await boot();
    const requestId = randomUUID();
    const bad = await app.inject({
      method: 'POST',
      url: '/internal/reminders/instances',
      headers: { ...staffAuth, 'x-request-id': requestId },
      payload: { templateCode: 'antenatal_visit', userId: FATHER_A, dueAt: 'tomorrow' },
    });
    expect(bad.json().error.request_id).toBe(requestId);
    expect(bad.headers['x-request-id']).toBe(requestId);
  });
});
