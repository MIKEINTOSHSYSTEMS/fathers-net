import { Pool } from 'pg';
import { ConflictError } from '@fathersnet/errors';
import { createPostgresReminderStore } from '../src/store/postgres-store';

jest.mock('pg', () => ({
  Pool: jest.fn(),
}));

interface PgCall {
  text: string;
  values?: unknown[];
}

interface PgResponse {
  rows?: Record<string, unknown>[];
  rowCount?: number;
}

interface ScriptedError {
  at: number;
  code?: string;
}

/**
 * Hermetic Postgres-store unit tests (WP-021). A fake Pool scripts query
 * results and records every statement so the SQL generation and row mappers
 * are exercised without a live database; the real end-to-end adapter is
 * verified by the gated integration test against REMINDERS_TEST_DATABASE_URL.
 */
class FakePg {
  calls: PgCall[] = [];
  responses: PgResponse[] = [];
  errors: ScriptedError[] = [];
  ended = false;

  private run = async (text: string, values?: unknown[]): Promise<PgResponse> => {
    this.calls.push({ text, values });
    const fail = this.errors.find((e) => e.at === this.calls.length);
    if (fail) {
      const err: Error & { code?: string } = new Error('synthetic db error');
      if (fail.code) {
        err.code = fail.code;
      }
      throw err;
    }
    return this.responses.shift() ?? { rows: [] };
  };

  query = this.run;

  connect = async (): Promise<{
    query: (text: string, values?: unknown[]) => Promise<PgResponse>;
    release: jest.Mock;
  }> => {
    return {
      query: this.run,
      release: jest.fn(),
    };
  };

  end = async (): Promise<void> => {
    this.ended = true;
  };
}

const TEMPLATE_ROW = {
  id: '00000000-0000-4000-8000-000000000001',
  code: 'antenatal_visit',
  channel: 'whatsapp',
  priority: 'normal',
  title_en: 'ANC visit reminder',
  title_am: 'የቅድመ ወሊድ ጉብኝት ማስታወሻ',
  body_en: 'Your antenatal visit is coming up.',
  body_am: 'የቅድመ ወሊድ ጉብኝትዎ ቀርቧል።',
  lead_time_minutes: 60,
  quiet_hours: { enabled: true, start: '21:00', end: '07:00' },
  recurrence: { type: 'weekly', intervalWeeks: 2, endWeek: 40 },
  pregnancy_week: 12,
  active: true,
  created_at: new Date('2025-01-01T00:00:00Z'),
  updated_at: new Date('2025-01-01T00:00:00Z'),
};

const INSTANCE_ROW = {
  id: '00000000-0000-4000-8000-000000000002',
  template_id: TEMPLATE_ROW.id,
  user_id: '55555555-5555-4555-8555-555555555555',
  due_at: new Date('2025-01-05T09:00:00Z'),
  status: 'scheduled',
  priority: 'normal',
  channel: 'whatsapp',
  dedupe_key: null,
  dispatched_at: null,
  acknowledged_at: null,
  last_error: null,
  created_at: new Date('2025-01-01T00:00:00Z'),
};

const DISPATCH_ROW = {
  id: '00000000-0000-4000-8000-000000000003',
  instance_id: INSTANCE_ROW.id,
  user_id: INSTANCE_ROW.user_id,
  run_id: 'run-1',
  channel: 'whatsapp',
  priority: 'normal',
  status: 'dispatched',
  dispatched_at: new Date('2025-01-05T09:00:00Z'),
  ack_received_at: null,
  ack_payload: null,
  last_error: null,
  created_at: new Date('2025-01-01T00:00:00Z'),
};

const TEMPLATE_INPUT = {
  code: 'antenatal_visit',
  channel: 'whatsapp' as const,
  priority: 'normal' as const,
  titleEn: 'ANC visit reminder',
  titleAm: 'የቅድመ ወሊድ ጉብኝት ማስታወሻ',
  bodyEn: 'Your antenatal visit is coming up.',
  bodyAm: 'የቅድመ ወሊድ ጉብኝትዎ ቀርቧል።',
  leadTimeMinutes: 60,
  quietHours: { enabled: true, start: '21:00', end: '07:00' },
  recurrence: { type: 'weekly' as const, intervalWeeks: 2, endWeek: 40 },
  pregnancyWeek: 12,
};

const ENTRY = {
  eventId: 'e-reminder-due-1',
  eventType: 'reminder.due',
  producer: 'reminder-engine',
  schemaVersion: 1,
  occurredAt: '2025-03-01T12:00:00.000Z',
  aggregateType: 'reminder_instance',
  aggregateId: INSTANCE_ROW.id,
  idempotencyKey: DISPATCH_ROW.id,
  payload: { instanceId: INSTANCE_ROW.id, dispatchId: DISPATCH_ROW.id },
};

describe('reminder store Postgres adapter (SQL generation, hermetic)', () => {
  let fake: FakePg;

  beforeEach(() => {
    fake = new FakePg();
    (Pool as unknown as jest.Mock).mockImplementation(() => fake);
  });

  it('inserts a template with jsonb casts and parses the row', async () => {
    const store = createPostgresReminderStore('postgres://test');
    fake.responses.push({ rows: [TEMPLATE_ROW] });

    const created = await store.createTemplate(TEMPLATE_INPUT);
    expect(created).toMatchObject({
      id: TEMPLATE_ROW.id,
      code: 'antenatal_visit',
      leadTimeMinutes: 60,
      pregnancyWeek: 12,
      active: true,
    });
    expect(created.quietHours).toEqual({ enabled: true, start: '21:00', end: '07:00' });
    expect(created.recurrence).toEqual({ type: 'weekly', intervalWeeks: 2, endWeek: 40 });

    const call = fake.calls[0];
    expect(call.text).toContain('INSERT INTO reminder_templates');
    expect(call.text).toContain('$9::jsonb, $10::jsonb');
    expect(call.text).toContain('RETURNING id, code, channel');
    expect(call.values).toEqual([
      'antenatal_visit',
      'whatsapp',
      'normal',
      'ANC visit reminder',
      'የቅድመ ወሊድ ጉብኝት ማስታወሻ',
      'Your antenatal visit is coming up.',
      'የቅድመ ወሊድ ጉብኝትዎ ቀርቧል።',
      60,
      JSON.stringify({ enabled: true, start: '21:00', end: '07:00' }),
      JSON.stringify({ type: 'weekly', intervalWeeks: 2, endWeek: 40 }),
      12,
      true,
    ]);
  });

  it('finds templates by code and id, listing only active ones', async () => {
    const store = createPostgresReminderStore('postgres://test');
    fake.responses.push({ rows: [TEMPLATE_ROW] });
    await expect(store.findTemplateByCode('antenatal_visit')).resolves.toMatchObject({
      id: TEMPLATE_ROW.id,
    });
    expect(fake.calls[0].text).toContain('WHERE code = $1');

    fake.responses.push({ rows: [TEMPLATE_ROW] });
    await expect(store.findTemplateById(TEMPLATE_ROW.id)).resolves.toMatchObject({
      id: TEMPLATE_ROW.id,
    });
    expect(fake.calls[1].text).toContain('WHERE id = $1');

    fake.responses.push({ rows: [] });
    await expect(store.findTemplateByCode('missing')).resolves.toBeNull();

    fake.responses.push({ rows: [TEMPLATE_ROW] });
    await expect(store.listActiveTemplates()).resolves.toHaveLength(1);
    expect(fake.calls[3].text).toContain('WHERE active = true');
    expect(fake.calls[3].text).toContain('ORDER BY code');
  });

  it('reads user_preferences.quiet_hours, tolerating absence and malformed JSONB', async () => {
    const store = createPostgresReminderStore('postgres://test');

    fake.responses.push({ rows: [] });
    await expect(store.getUserQuietHours('u-1')).resolves.toBeNull();
    expect(fake.calls[0].text).toContain('FROM user_preferences');

    fake.responses.push({
      rows: [{ quiet_hours: { enabled: true, start: '21:00', end: '07:00' } }],
    });
    await expect(store.getUserQuietHours('u-1')).resolves.toEqual({
      enabled: true,
      start: '21:00',
      end: '07:00',
    });

    fake.responses.push({ rows: [{ quiet_hours: 'not-an-object' }] });
    await expect(store.getUserQuietHours('u-1')).resolves.toBeNull();
  });

  it('maps the user language preference, defaulting to en', async () => {
    const store = createPostgresReminderStore('postgres://test');
    fake.responses.push({ rows: [{ language: 'am' }] });
    await expect(store.getUserLanguage('u-1')).resolves.toBe('am');
    fake.responses.push({ rows: [{ language: 'en' }] });
    await expect(store.getUserLanguage('u-1')).resolves.toBe('en');
    fake.responses.push({ rows: [] });
    await expect(store.getUserLanguage('u-1')).resolves.toBe('en');
  });

  it('inserts a scheduled instance and maps unique-violation dedupe to ConflictError', async () => {
    const store = createPostgresReminderStore('postgres://test');
    fake.responses.push({ rows: [INSTANCE_ROW] });
    const instance = await store.createInstance({
      templateId: TEMPLATE_ROW.id,
      userId: INSTANCE_ROW.user_id,
      dueAt: '2025-01-05T09:00:00Z',
      priority: 'normal',
      channel: 'whatsapp',
      dedupeKey: null,
    });
    expect(instance).toMatchObject({ status: 'scheduled', dueAt: '2025-01-05T09:00:00.000Z' });
    expect(fake.calls[0].text).toContain("'scheduled'");

    fake.errors.push({ at: 2, code: '23505' }); // the second createInstance is call #2
    await expect(
      store.createInstance({
        templateId: TEMPLATE_ROW.id,
        userId: INSTANCE_ROW.user_id,
        dueAt: '2025-01-05T09:00:00Z',
        priority: 'normal',
        channel: 'whatsapp',
        dedupeKey: 'dup-key',
      }),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it('selects due instances with status/now predicate and limit', async () => {
    const store = createPostgresReminderStore('postgres://test');
    fake.responses.push({ rows: [INSTANCE_ROW] });
    const due = await store.selectDueInstances('2025-01-05T10:00:00Z', 100);
    expect(due).toHaveLength(1);
    const call = fake.calls[0];
    expect(call.text).toContain("WHERE status = 'scheduled' AND due_at <= $1");
    expect(call.text).toContain('ORDER BY due_at ASC');
    expect(call.text).toContain('LIMIT $2');
    expect(call.values).toEqual(['2025-01-05T10:00:00Z', 100]);
  });

  it('expires stale instances and reports the row count', async () => {
    const store = createPostgresReminderStore('postgres://test');
    fake.responses.push({ rows: [], rowCount: 3 });
    const count = await store.expireStaleInstances('2025-01-05T08:00:00Z');
    expect(count).toBe(3);
    expect(fake.calls[0].text).toContain("SET status = 'expired'");
    expect(fake.calls[0].text).toContain("WHERE status = 'scheduled' AND due_at < $1");
  });

  it('sets an instance status with COALESCE-preserving fields', async () => {
    const store = createPostgresReminderStore('postgres://test');
    fake.responses.push({
      rows: [
        { ...INSTANCE_ROW, status: 'dispatched', dispatched_at: new Date('2025-01-05T09:00:00Z') },
      ],
    });
    const updated = await store.setInstanceStatus(INSTANCE_ROW.id, 'dispatched', {
      dispatchedAt: '2025-01-05T09:00:00.000Z',
    });
    expect(updated).toMatchObject({ status: 'dispatched' });
    expect(fake.calls[0].text).toContain('dispatched_at = COALESCE($3, dispatched_at)');
    expect(fake.calls[0].text).toContain('last_error = COALESCE($4, last_error)');
    expect(fake.calls[0].values).toEqual([
      INSTANCE_ROW.id,
      'dispatched',
      '2025-01-05T09:00:00.000Z',
      null,
    ]);
  });

  it('claims, inserts, and commits a dispatch transaction', async () => {
    const store = createPostgresReminderStore('postgres://test');
    fake.responses.push({ rows: [] }); // BEGIN
    fake.responses.push({ rows: [{ count: 0 }] }); // cap count
    fake.responses.push({ rows: [INSTANCE_ROW], rowCount: 1 }); // claim
    fake.responses.push({ rows: [] }); // INSERT dispatch
    fake.responses.push({ rows: [] }); // COMMIT

    const outcome = await store.dispatchInstance({
      instanceId: INSTANCE_ROW.id,
      userId: INSTANCE_ROW.user_id,
      runId: 'run-1',
      channel: 'whatsapp',
      priority: 'normal',
      dispatchedAt: '2025-01-05T09:00:00Z',
      dayStart: '2025-01-04T21:00:00Z',
      dayEnd: '2025-01-05T21:00:00Z',
      dailyCap: 5,
    });
    expect(outcome).toBe('dispatched');

    const texts = fake.calls.map((c) => c.text);
    expect(texts[0]).toBe('BEGIN');
    expect(texts[1]).toContain('FROM reminder_dispatches');
    expect(texts[1]).toContain('dispatched_at >= $2');
    expect(texts[2]).toContain("SET status = 'dispatched'");
    expect(texts[2]).toContain("WHERE id = $1 AND status = 'scheduled'");
    expect(texts[3]).toContain('INSERT INTO reminder_dispatches');
    expect(texts[4]).toBe('COMMIT');
  });

  it('returns conflict and rolls back when the claim misses', async () => {
    const store = createPostgresReminderStore('postgres://test');
    fake.responses.push({ rows: [] }); // BEGIN
    fake.responses.push({ rows: [{ count: 0 }] });
    fake.responses.push({ rows: [], rowCount: 0 }); // claim missed

    const outcome = await store.dispatchInstance({
      instanceId: INSTANCE_ROW.id,
      userId: INSTANCE_ROW.user_id,
      runId: 'run-1',
      channel: 'whatsapp',
      priority: 'normal',
      dispatchedAt: '2025-01-05T09:00:00Z',
      dayStart: '2025-01-04T21:00:00Z',
      dayEnd: '2025-01-05T21:00:00Z',
      dailyCap: 5,
    });
    expect(outcome).toBe('conflict');
    expect(fake.calls.map((c) => c.text)).toContain('ROLLBACK');
  });

  it('rate-limits inside the transaction when the daily cap is reached', async () => {
    const store = createPostgresReminderStore('postgres://test');
    fake.responses.push({ rows: [] }); // BEGIN
    fake.responses.push({ rows: [{ count: 5 }] }); // cap already reached
    fake.responses.push({ rows: [], rowCount: 1 }); // mark rate_limited
    fake.responses.push({ rows: [] }); // COMMIT

    const outcome = await store.dispatchInstance({
      instanceId: INSTANCE_ROW.id,
      userId: INSTANCE_ROW.user_id,
      runId: 'run-1',
      channel: 'whatsapp',
      priority: 'normal',
      dispatchedAt: '2025-01-05T09:00:00Z',
      dayStart: '2025-01-04T21:00:00Z',
      dayEnd: '2025-01-05T21:00:00Z',
      dailyCap: 5,
    });
    expect(outcome).toBe('rate_limited');
    const texts = fake.calls.map((c) => c.text);
    expect(texts[2]).toContain("SET status = 'rate_limited'");
    expect(texts[3]).toBe('COMMIT');
  });

  it('returns conflict when the dispatch insert hits the (instance, run) unique guard (FR-163)', async () => {
    const store = createPostgresReminderStore('postgres://test');
    fake.responses.push({ rows: [] }); // BEGIN
    fake.responses.push({ rows: [{ count: 0 }] });
    fake.responses.push({ rows: [INSTANCE_ROW], rowCount: 1 }); // claim
    fake.errors.push({ at: 4, code: '23505' }); // INSERT duplicate

    const outcome = await store.dispatchInstance({
      instanceId: INSTANCE_ROW.id,
      userId: INSTANCE_ROW.user_id,
      runId: 'run-1',
      channel: 'whatsapp',
      priority: 'normal',
      dispatchedAt: '2025-01-05T09:00:00Z',
      dayStart: '2025-01-04T21:00:00Z',
      dayEnd: '2025-01-05T21:00:00Z',
      dailyCap: 5,
    });
    expect(outcome).toBe('conflict');
    expect(fake.calls.map((c) => c.text)).toContain('ROLLBACK');
  });

  it('rethrows non-unique transaction failures after a rollback', async () => {
    const store = createPostgresReminderStore('postgres://test');
    fake.responses.push({ rows: [] }); // BEGIN
    fake.errors.push({ at: 2 }); // cap count explodes (no unique code)

    await expect(
      store.dispatchInstance({
        instanceId: INSTANCE_ROW.id,
        userId: INSTANCE_ROW.user_id,
        runId: 'run-1',
        channel: 'whatsapp',
        priority: 'normal',
        dispatchedAt: '2025-01-05T09:00:00Z',
        dayStart: '2025-01-04T21:00:00Z',
        dayEnd: '2025-01-05T21:00:00Z',
        dailyCap: 5,
      }),
    ).rejects.toThrow('synthetic db error');
    expect(fake.calls.map((c) => c.text)).toContain('ROLLBACK');
  });

  it('finds a dispatch for an instance run', async () => {
    const store = createPostgresReminderStore('postgres://test');
    fake.responses.push({ rows: [DISPATCH_ROW] });
    const dispatch = await store.findDispatchForInstanceRun(INSTANCE_ROW.id, 'run-1');
    expect(dispatch).toMatchObject({ id: DISPATCH_ROW.id, runId: 'run-1', status: 'dispatched' });
    expect(fake.calls[0].text).toContain('instance_id = $1 AND run_id = $2');

    fake.responses.push({ rows: [] });
    await expect(store.findDispatchById('missing')).resolves.toBeNull();
  });

  it('acks a dispatch in a transaction and stamps the instance', async () => {
    const store = createPostgresReminderStore('postgres://test');
    fake.responses.push({ rows: [] }); // BEGIN
    fake.responses.push({
      rows: [
        {
          ...DISPATCH_ROW,
          status: 'acked',
          ack_received_at: new Date('2025-01-05T09:05:00Z'),
          ack_payload: { providerRef: 'stub:1', simulated: true },
        },
      ],
    });
    fake.responses.push({ rows: [] }); // UPDATE instance acknowledged_at
    fake.responses.push({ rows: [] }); // COMMIT

    const acked = await store.ackDispatch(
      DISPATCH_ROW.id,
      { providerRef: 'stub:1', simulated: true },
      '2025-01-05T09:05:00.000Z',
    );
    expect(acked).toMatchObject({
      status: 'acked',
      ackPayload: { providerRef: 'stub:1', simulated: true },
    });
    const texts = fake.calls.map((c) => c.text);
    expect(texts[1]).toContain("SET status = 'acked'");
    expect(texts[1]).toContain("WHERE id = $1 AND status = 'dispatched'");
    expect(texts[2]).toContain('UPDATE reminder_instances SET acknowledged_at = $2');
    expect(texts[3]).toBe('COMMIT');
  });

  it('returns null when acking a non-dispatched row', async () => {
    const store = createPostgresReminderStore('postgres://test');
    fake.responses.push({ rows: [] }); // BEGIN
    fake.responses.push({ rows: [] }); // UPDATE matched nothing
    await expect(
      store.ackDispatch(DISPATCH_ROW.id, {}, '2025-01-05T09:05:00.000Z', [ENTRY]),
    ).resolves.toBeNull();
    expect(fake.calls.map((c) => c.text)).toContain('ROLLBACK');
    expect(fake.calls.every((c) => !c.text.includes('INSERT INTO reminder_outbox'))).toBe(true);
  });

  describe('reminder store outbox transactional write (WP-024c, D-03)', () => {
    it('writes the reminder.due outbox row in the same transaction as the ack', async () => {
      const store = createPostgresReminderStore('postgres://test');
      fake.responses.push({ rows: [] }); // BEGIN
      fake.responses.push({
        rows: [
          {
            ...DISPATCH_ROW,
            status: 'acked',
            ack_received_at: new Date('2025-01-05T09:05:00Z'),
            ack_payload: { providerRef: 'stub:1', simulated: true },
          },
        ],
      });
      fake.responses.push({ rows: [] }); // UPDATE instance acknowledged_at
      fake.responses.push({ rows: [] }); // INSERT INTO reminder_outbox
      fake.responses.push({ rows: [] }); // COMMIT

      const acked = await store.ackDispatch(
        DISPATCH_ROW.id,
        { providerRef: 'stub:1', simulated: true },
        '2025-01-05T09:05:00.000Z',
        [ENTRY],
      );
      expect(acked).toMatchObject({ status: 'acked' });

      const texts = fake.calls.map((c) => c.text);
      expect(texts[3]).toContain('INSERT INTO reminder_outbox');
      expect(texts[4]).toBe('COMMIT');

      const outboxCall = fake.calls[3];
      expect(outboxCall.text).toContain(
        '(event_id, event_type, producer, schema_version, occurred_at',
      );
      expect(outboxCall.values).toEqual([
        ENTRY.eventId,
        'reminder.due',
        'reminder-engine',
        1,
        '2025-03-01T12:00:00.000Z',
        'reminder_instance',
        INSTANCE_ROW.id,
        DISPATCH_ROW.id,
        JSON.stringify(ENTRY.payload),
      ]);
    });

    it('rolls back the outbox row with the ack transaction when the commit fails', async () => {
      const store = createPostgresReminderStore('postgres://test');
      fake.responses.push({ rows: [] }); // BEGIN
      fake.responses.push({
        rows: [{ ...DISPATCH_ROW, status: 'acked' }],
      });
      fake.responses.push({ rows: [] }); // UPDATE instance acknowledged_at
      fake.responses.push({ rows: [] }); // INSERT INTO reminder_outbox
      fake.errors.push({ at: 5 }); // COMMIT explodes

      await expect(
        store.ackDispatch(
          DISPATCH_ROW.id,
          { providerRef: 'stub:1', simulated: true },
          '2025-01-05T09:05:00.000Z',
          [ENTRY],
        ),
      ).rejects.toThrow('synthetic db error');

      const texts = fake.calls.map((c) => c.text);
      const outboxIdx = texts.findIndex((t) => t.includes('INSERT INTO reminder_outbox'));
      const rollbackIdx = texts.indexOf('ROLLBACK');
      expect(outboxIdx).toBeGreaterThan(-1);
      expect(rollbackIdx).toBeGreaterThan(outboxIdx);
      expect(texts).toContain('ROLLBACK');
    });
  });

  it('fails a dispatch and its instance in a transaction', async () => {
    const store = createPostgresReminderStore('postgres://test');
    fake.responses.push({ rows: [] }); // BEGIN
    fake.responses.push({
      rows: [{ ...DISPATCH_ROW, status: 'failed', last_error: 'provider error' }],
    });
    fake.responses.push({ rows: [] }); // UPDATE instance failed
    fake.responses.push({ rows: [] }); // COMMIT

    const failed = await store.failDispatch(
      DISPATCH_ROW.id,
      'provider error',
      '2025-01-05T09:05:00.000Z',
    );
    expect(failed).toMatchObject({ status: 'failed', lastError: 'provider error' });
    const texts = fake.calls.map((c) => c.text);
    expect(texts[1]).toContain("SET status = 'failed', last_error = $2");
    expect(texts[2]).toContain("SET status = 'failed', last_error = $2");
  });

  it('lists dispatches newest first with an optional user filter', async () => {
    const store = createPostgresReminderStore('postgres://test');
    fake.responses.push({ rows: [DISPATCH_ROW] });
    await store.listDispatches({ limit: 20, offset: 0 });
    const call = fake.calls[0];
    expect(call.text).toContain('($1::uuid IS NULL OR user_id = $1)');
    expect(call.text).toContain('ORDER BY dispatched_at DESC');
    expect(call.text).toContain('LIMIT $2 OFFSET $3');
    expect(call.values).toEqual([null, 20, 0]);

    fake.responses.push({ rows: [] });
    await store.listDispatches({ userId: INSTANCE_ROW.user_id, limit: 10, offset: 5 });
    expect(fake.calls[1].values).toEqual([INSTANCE_ROW.user_id, 10, 5]);
  });

  it('pings the database and reports failure', async () => {
    const store = createPostgresReminderStore('postgres://test');
    fake.responses.push({ rows: [] });
    await expect(store.ping()).resolves.toBe(true);
    expect(fake.calls[0].text).toBe('SELECT 1');

    fake.errors.push({ at: 2 });
    await expect(store.ping()).resolves.toBe(false);
  });

  it('dispose ends the pool', async () => {
    const store = createPostgresReminderStore('postgres://test');
    await store.dispose();
    expect(fake.ended).toBe(true);
  });
});
