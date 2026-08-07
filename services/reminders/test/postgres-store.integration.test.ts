import { Pool } from 'pg';
import { ConflictError } from '@fathersnet/errors';
import { dayWindow } from '../src/engine/cap';
import { createPostgresReminderStore } from '../src/store/postgres-store';
import type { CreateReminderTemplateInput } from '../src/types';

const TEST_DATABASE_URL = process.env.REMINDERS_TEST_DATABASE_URL;
const describeIntegration = TEST_DATABASE_URL ? describe : describe.skip;

/** The instance/dispatch FKs reference `users`, so a user row must exist. */
const USER_ID = '55555555-5555-4555-8555-555555555555';

function buildTemplate(): CreateReminderTemplateInput {
  return {
    code: `antenatal_visit_${Math.random().toString(36).slice(2)}`,
    channel: 'whatsapp',
    priority: 'normal',
    titleEn: 'ANC visit reminder',
    titleAm: 'የቅድመ ወሊድ ጉብኝት ማስታወሻ',
    bodyEn: 'Your antenatal visit is coming up.',
    bodyAm: 'የቅድመ ወሊድ ጉብኝትዎ ቀርቧል።',
    quietHours: { enabled: false, start: '21:00', end: '07:00' },
  };
}

describeIntegration('reminder store Postgres adapter (migration 018 schema)', () => {
  let store: ReturnType<typeof createPostgresReminderStore>;

  beforeEach(async () => {
    const pool = new Pool({ connectionString: TEST_DATABASE_URL });
    try {
      await pool.query(
        'TRUNCATE reminder_dispatches, reminder_instances, reminder_templates CASCADE',
      );
      await pool.query(
        `INSERT INTO users (id, phone_e164, phone_e164_digest, role, status)
         VALUES ($1, 'cipher.reminders', 'digest.reminders', 'father', 'active')
         ON CONFLICT (id) DO NOTHING`,
        [USER_ID],
      );
      await pool.query(
        `INSERT INTO user_preferences (user_id, language, quiet_hours)
         VALUES ($1, 'am', $2::jsonb)
         ON CONFLICT (user_id) DO UPDATE SET language = 'am', quiet_hours = $2::jsonb`,
        [USER_ID, JSON.stringify({ enabled: false, start: '21:00', end: '07:00' })],
      );
    } finally {
      await pool.end();
    }
    store = createPostgresReminderStore(TEST_DATABASE_URL as string);
  });

  afterEach(async () => {
    await store.dispose();
  });

  it('round-trips a template with app-layer JSONB fields', async () => {
    const created = await store.createTemplate(buildTemplate());
    expect(created.id).toMatch(/^[0-9a-f-]{36}$/i);
    expect(created).toMatchObject({ channel: 'whatsapp', priority: 'normal', active: true });
    expect(created.quietHours).toEqual({ enabled: false, start: '21:00', end: '07:00' });

    const found = await store.findTemplateByCode(created.code);
    expect(found).toMatchObject({ id: created.id });
  });

  it('reads the user language and quiet-hours preferences (FR-038, FR-047)', async () => {
    await expect(store.getUserLanguage(USER_ID)).resolves.toBe('am');
    await expect(store.getUserQuietHours(USER_ID)).resolves.toEqual({
      enabled: false,
      start: '21:00',
      end: '07:00',
    });
    await expect(store.getUserLanguage('00000000-0000-4000-8000-000000000000')).resolves.toBe('en');
  });

  it('creates, selects, and expires instances', async () => {
    const template = await store.createTemplate(buildTemplate());
    const due = await store.createInstance({
      templateId: template.id,
      userId: USER_ID,
      dueAt: '2025-01-01T09:00:00Z',
      priority: 'normal',
      channel: 'whatsapp',
      dedupeKey: null,
    });
    const stale = await store.createInstance({
      templateId: template.id,
      userId: USER_ID,
      dueAt: '2024-01-01T09:00:00Z',
      priority: 'normal',
      channel: 'whatsapp',
      dedupeKey: null,
    });

    const selected = await store.selectDueInstances('2025-01-05T09:00:00Z', 100);
    expect(selected.map((i) => i.id)).toContain(due.id);
    expect(selected.map((i) => i.id)).not.toContain(stale.id);

    const expired = await store.expireStaleInstances('2025-01-05T09:00:00Z');
    expect(expired).toBe(1);
    await expect(store.findInstanceById(stale.id)).resolves.toMatchObject({ status: 'expired' });
  });

  it('rejects a duplicate dedupe key with ConflictError (FR-048)', async () => {
    const template = await store.createTemplate(buildTemplate());
    const input = {
      templateId: template.id,
      userId: USER_ID,
      dueAt: '2025-01-01T09:00:00Z',
      priority: 'normal' as const,
      channel: 'whatsapp' as const,
      dedupeKey: 'visit-2025-01-01',
    };
    await store.createInstance(input);
    await expect(store.createInstance(input)).rejects.toBeInstanceOf(ConflictError);
  });

  it('dispatches atomically and guards (instance, run) (FR-163)', async () => {
    const template = await store.createTemplate(buildTemplate());
    const instance = await store.createInstance({
      templateId: template.id,
      userId: USER_ID,
      dueAt: '2025-01-01T09:00:00Z',
      priority: 'normal',
      channel: 'whatsapp',
      dedupeKey: null,
    });
    const window = dayWindow(Date.now(), 180);

    await expect(
      store.dispatchInstance({
        instanceId: instance.id,
        userId: USER_ID,
        runId: 'run-1',
        channel: 'whatsapp',
        priority: 'normal',
        dispatchedAt: new Date().toISOString(),
        dayStart: window.startIso,
        dayEnd: window.endIso,
        dailyCap: 5,
      }),
    ).resolves.toBe('dispatched');

    const dispatch = await store.findDispatchForInstanceRun(instance.id, 'run-1');
    expect(dispatch).toMatchObject({ runId: 'run-1', status: 'dispatched' });
    await expect(store.findInstanceById(instance.id)).resolves.toMatchObject({
      status: 'dispatched',
    });

    await expect(
      store.dispatchInstance({
        instanceId: instance.id,
        userId: USER_ID,
        runId: 'run-1',
        channel: 'whatsapp',
        priority: 'normal',
        dispatchedAt: new Date().toISOString(),
        dayStart: window.startIso,
        dayEnd: window.endIso,
        dailyCap: 5,
      }),
    ).resolves.toBe('conflict');
  });

  it('rate-limits the user at the per-day cap (06 §4.14)', async () => {
    const template = await store.createTemplate(buildTemplate());
    const mk = async () =>
      store.createInstance({
        templateId: template.id,
        userId: USER_ID,
        dueAt: '2025-01-01T09:00:00Z',
        priority: 'normal',
        channel: 'whatsapp',
        dedupeKey: null,
      });
    const window = dayWindow(Date.now(), 180);
    const input = (instanceId: string, runId: string) => ({
      instanceId,
      userId: USER_ID,
      runId,
      channel: 'whatsapp' as const,
      priority: 'normal' as const,
      dispatchedAt: new Date().toISOString(),
      dayStart: window.startIso,
      dayEnd: window.endIso,
      dailyCap: 1,
    });

    const first = await mk();
    await expect(store.dispatchInstance(input(first.id, 'run-a'))).resolves.toBe('dispatched');

    const second = await mk();
    await expect(store.dispatchInstance(input(second.id, 'run-b'))).resolves.toBe('rate_limited');
    await expect(store.findInstanceById(second.id)).resolves.toMatchObject({
      status: 'rate_limited',
    });
  });

  it('acks a dispatch and stamps the instance acknowledged time', async () => {
    const template = await store.createTemplate(buildTemplate());
    const instance = await store.createInstance({
      templateId: template.id,
      userId: USER_ID,
      dueAt: '2025-01-01T09:00:00Z',
      priority: 'normal',
      channel: 'whatsapp',
      dedupeKey: null,
    });
    const window = dayWindow(Date.now(), 180);
    await store.dispatchInstance({
      instanceId: instance.id,
      userId: USER_ID,
      runId: 'run-1',
      channel: 'whatsapp',
      priority: 'normal',
      dispatchedAt: new Date().toISOString(),
      dayStart: window.startIso,
      dayEnd: window.endIso,
      dailyCap: 5,
    });
    const dispatch = (await store.findDispatchForInstanceRun(instance.id, 'run-1'))!;

    const acked = await store.ackDispatch(
      dispatch.id,
      { providerRef: 'stub:1' },
      new Date().toISOString(),
    );
    expect(acked).toMatchObject({ status: 'acked', ackPayload: { providerRef: 'stub:1' } });
    await expect(store.findInstanceById(instance.id)).resolves.toMatchObject({
      acknowledgedAt: expect.any(String),
    });
  });

  it('fails a dispatch and its instance', async () => {
    const template = await store.createTemplate(buildTemplate());
    const instance = await store.createInstance({
      templateId: template.id,
      userId: USER_ID,
      dueAt: '2025-01-01T09:00:00Z',
      priority: 'normal',
      channel: 'whatsapp',
      dedupeKey: null,
    });
    const window = dayWindow(Date.now(), 180);
    await store.dispatchInstance({
      instanceId: instance.id,
      userId: USER_ID,
      runId: 'run-1',
      channel: 'whatsapp',
      priority: 'normal',
      dispatchedAt: new Date().toISOString(),
      dayStart: window.startIso,
      dayEnd: window.endIso,
      dailyCap: 5,
    });
    const dispatch = (await store.findDispatchForInstanceRun(instance.id, 'run-1'))!;

    const failed = await store.failDispatch(
      dispatch.id,
      'provider error',
      new Date().toISOString(),
    );
    expect(failed).toMatchObject({ status: 'failed', lastError: 'provider error' });
    await expect(store.findInstanceById(instance.id)).resolves.toMatchObject({
      status: 'failed',
      lastError: 'provider error',
    });
  });
});
