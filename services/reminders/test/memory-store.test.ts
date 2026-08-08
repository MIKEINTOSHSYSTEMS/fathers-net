import { ConflictError } from '@fathersnet/errors';
import { createMemoryReminderStore } from '../src/store/memory-store';
import type { CreateReminderTemplateInput } from '../src/types';

function buildTemplate(
  overrides: Partial<CreateReminderTemplateInput> = {},
): CreateReminderTemplateInput {
  return {
    code: 'antenatal_visit',
    channel: 'whatsapp',
    priority: 'normal',
    titleEn: 'ANC visit reminder',
    titleAm: 'የቅድመ ወሊድ ጉብኝት ማስታወሻ',
    bodyEn: 'Your antenatal visit is coming up.',
    bodyAm: 'የቅድመ ወሊድ ጉብኝትዎ ቀርቧል።',
    ...overrides,
  };
}

const USER_A = '55555555-5555-4555-8555-555555555555';
const USER_B = '66666666-6666-4666-8666-666666666666';

describe('memory reminder store (M-08 test-double)', () => {
  it('creates a template and finds it by code and id', async () => {
    const store = createMemoryReminderStore();
    const created = await store.createTemplate(buildTemplate());
    expect(created).toMatchObject({ code: 'antenatal_visit', active: true, leadTimeMinutes: null });

    await expect(store.findTemplateByCode('antenatal_visit')).resolves.toMatchObject({
      id: created.id,
    });
    await expect(store.findTemplateById(created.id)).resolves.toMatchObject({ id: created.id });
    await expect(store.findTemplateByCode('missing')).resolves.toBeNull();
  });

  it('lists only active templates', async () => {
    const store = createMemoryReminderStore();
    const active = await store.createTemplate(buildTemplate());
    await store.createTemplate(buildTemplate({ code: 'vaccination', active: false }));

    const listed = await store.listActiveTemplates();
    expect(listed.map((t) => t.code)).toEqual(['antenatal_visit']);
    expect(listed[0].id).toBe(active.id);
  });

  it('reads user quiet hours, returning null when absent or malformed', async () => {
    const store = createMemoryReminderStore({
      [USER_A]: { enabled: true, start: '21:00', end: '07:00' },
      [USER_B]: { enabled: true, start: 'bad-time', end: '07:00' },
    });
    await expect(store.getUserQuietHours(USER_A)).resolves.toEqual({
      enabled: true,
      start: '21:00',
      end: '07:00',
    });
    await expect(store.getUserQuietHours(USER_B)).resolves.toBeNull();
    await expect(
      store.getUserQuietHours('00000000-0000-4000-8000-000000000000'),
    ).resolves.toBeNull();
  });

  it('defaults the rendering language to en', async () => {
    const store = createMemoryReminderStore();
    await expect(store.getUserLanguage(USER_A)).resolves.toBe('en');
  });

  it('creates an instance and enforces the partial-unique dedupe key (FR-048)', async () => {
    const store = createMemoryReminderStore();
    const template = await store.createTemplate(buildTemplate());

    const instance = await store.createInstance({
      templateId: template.id,
      userId: USER_A,
      dueAt: '2025-01-05T09:00:00Z',
      priority: 'normal',
      channel: 'whatsapp',
      dedupeKey: 'visit-2025-01-05',
    });
    expect(instance).toMatchObject({ status: 'scheduled', dedupeKey: 'visit-2025-01-05' });

    await expect(
      store.createInstance({
        templateId: template.id,
        userId: USER_A,
        dueAt: '2025-01-05T09:00:00Z',
        priority: 'normal',
        channel: 'whatsapp',
        dedupeKey: 'visit-2025-01-05',
      }),
    ).rejects.toBeInstanceOf(ConflictError);

    await expect(store.findInstanceByDedupeKey('visit-2025-01-05')).resolves.toMatchObject({
      id: instance.id,
    });
    await expect(store.findInstanceById(instance.id)).resolves.toMatchObject({ id: instance.id });
  });

  it('selects only due scheduled instances, oldest first, bounded by the limit', async () => {
    const store = createMemoryReminderStore();
    const template = await store.createTemplate(buildTemplate());
    const mk = async (dueAt: string): Promise<string> => {
      const instance = await store.createInstance({
        templateId: template.id,
        userId: USER_A,
        dueAt,
        priority: 'normal',
        channel: 'whatsapp',
        dedupeKey: null,
      });
      return instance.id;
    };
    const lateId = await mk('2025-01-05T09:00:00Z');
    const earlyId = await mk('2025-01-05T08:00:00Z');
    await mk('2025-01-07T10:00:00Z'); // not due yet

    const due = await store.selectDueInstances('2025-01-05T09:30:00Z', 100);
    expect(due.map((i) => i.id)).toEqual([earlyId, lateId]);

    const limited = await store.selectDueInstances('2025-01-05T09:30:00Z', 1);
    expect(limited.map((i) => i.id)).toEqual([earlyId]);
  });

  it('expires stale scheduled instances and never selects them', async () => {
    const store = createMemoryReminderStore();
    const template = await store.createTemplate(buildTemplate());
    const stale = await store.createInstance({
      templateId: template.id,
      userId: USER_A,
      dueAt: '2025-01-05T08:00:00Z',
      priority: 'normal',
      channel: 'whatsapp',
      dedupeKey: null,
    });
    const recent = await store.createInstance({
      templateId: template.id,
      userId: USER_A,
      dueAt: '2025-01-05T09:30:00Z',
      priority: 'normal',
      channel: 'whatsapp',
      dedupeKey: null,
    });

    const count = await store.expireStaleInstances('2025-01-05T09:00:00Z');
    expect(count).toBe(1);
    await expect(store.findInstanceById(stale.id)).resolves.toMatchObject({ status: 'expired' });
    const due = await store.selectDueInstances('2025-01-05T10:00:00Z', 100);
    expect(due.map((i) => i.id)).toEqual([recent.id]);
  });

  it('updates an instance status with optional dispatch/error fields', async () => {
    const store = createMemoryReminderStore();
    const template = await store.createTemplate(buildTemplate());
    const instance = await store.createInstance({
      templateId: template.id,
      userId: USER_A,
      dueAt: '2025-01-05T09:00:00Z',
      priority: 'normal',
      channel: 'whatsapp',
      dedupeKey: null,
    });

    await store.setInstanceStatus(instance.id, 'failed', {
      lastError: 'boom',
    });
    await expect(store.findInstanceById(instance.id)).resolves.toMatchObject({
      status: 'failed',
      lastError: 'boom',
    });
    await expect(
      store.setInstanceStatus('00000000-0000-4000-8000-000000000000', 'failed'),
    ).resolves.toBeNull();
  });

  it('atomically claims and dispatches an instance, guarding (instance, run) (FR-163)', async () => {
    const store = createMemoryReminderStore();
    const template = await store.createTemplate(buildTemplate());
    const instance = await store.createInstance({
      templateId: template.id,
      userId: USER_A,
      dueAt: '2025-01-05T09:00:00Z',
      priority: 'normal',
      channel: 'whatsapp',
      dedupeKey: null,
    });
    const input = {
      instanceId: instance.id,
      userId: USER_A,
      runId: 'run-1',
      channel: 'whatsapp' as const,
      priority: 'normal' as const,
      dispatchedAt: '2025-01-05T09:00:00Z',
      dayStart: '2025-01-04T21:00:00Z',
      dayEnd: '2025-01-05T21:00:00Z',
      dailyCap: 5,
    };

    await expect(store.dispatchInstance(input)).resolves.toBe('dispatched');
    await expect(store.dispatchInstance(input)).resolves.toBe('conflict');

    const dispatch = await store.findDispatchForInstanceRun(instance.id, 'run-1');
    expect(dispatch).toMatchObject({ status: 'dispatched', runId: 'run-1' });
    await expect(store.findInstanceById(instance.id)).resolves.toMatchObject({
      status: 'dispatched',
      dispatchedAt: '2025-01-05T09:00:00Z',
    });
  });

  it('returns conflict when the instance is no longer scheduled', async () => {
    const store = createMemoryReminderStore();
    const template = await store.createTemplate(buildTemplate());
    const instance = await store.createInstance({
      templateId: template.id,
      userId: USER_A,
      dueAt: '2025-01-05T09:00:00Z',
      priority: 'normal',
      channel: 'whatsapp',
      dedupeKey: null,
    });
    const input = {
      instanceId: instance.id,
      userId: USER_A,
      runId: 'run-1',
      channel: 'whatsapp' as const,
      priority: 'normal' as const,
      dispatchedAt: '2025-01-05T09:00:00Z',
      dayStart: '2025-01-04T21:00:00Z',
      dayEnd: '2025-01-05T21:00:00Z',
      dailyCap: 5,
    };
    await store.setInstanceStatus(instance.id, 'expired');
    await expect(store.dispatchInstance(input)).resolves.toBe('conflict');
  });

  it('rate-limits a user once the per-day cap is reached', async () => {
    const store = createMemoryReminderStore();
    const template = await store.createTemplate(buildTemplate());
    const inputFor = async (id: string) => {
      const instance = await store.createInstance({
        templateId: template.id,
        userId: USER_A,
        dueAt: '2025-01-05T09:00:00Z',
        priority: 'normal',
        channel: 'whatsapp',
        dedupeKey: null,
      });
      return {
        instanceId: instance.id,
        userId: USER_A,
        runId: id,
        channel: 'whatsapp' as const,
        priority: 'normal' as const,
        dispatchedAt: '2025-01-05T10:00:00Z',
        dayStart: '2025-01-04T21:00:00Z',
        dayEnd: '2025-01-05T21:00:00Z',
        dailyCap: 2,
      };
    };

    await expect(store.dispatchInstance(await inputFor('run-a'))).resolves.toBe('dispatched');
    await expect(store.dispatchInstance(await inputFor('run-b'))).resolves.toBe('dispatched');
    const third = await inputFor('run-c');
    await expect(store.dispatchInstance(third)).resolves.toBe('rate_limited');
    await expect(store.findInstanceById(third.instanceId)).resolves.toMatchObject({
      status: 'rate_limited',
    });
  });

  it('counts the cap per Addis day, not across days', async () => {
    const store = createMemoryReminderStore();
    const template = await store.createTemplate(buildTemplate());
    const mk = async (): Promise<string> => {
      const instance = await store.createInstance({
        templateId: template.id,
        userId: USER_A,
        dueAt: '2025-01-05T09:00:00Z',
        priority: 'normal',
        channel: 'whatsapp',
        dedupeKey: null,
      });
      return instance.id;
    };
    await expect(
      store.dispatchInstance({
        instanceId: await mk(),
        userId: USER_A,
        runId: 'run-a',
        channel: 'whatsapp',
        priority: 'normal',
        dispatchedAt: '2025-01-01T10:00:00Z',
        dayStart: '2024-12-31T21:00:00Z',
        dayEnd: '2025-01-01T21:00:00Z',
        dailyCap: 1,
      }),
    ).resolves.toBe('dispatched');
    await expect(
      store.dispatchInstance({
        instanceId: await mk(),
        userId: USER_A,
        runId: 'run-b',
        channel: 'whatsapp',
        priority: 'normal',
        dispatchedAt: '2025-01-02T10:00:00Z',
        dayStart: '2025-01-01T21:00:00Z',
        dayEnd: '2025-01-02T21:00:00Z',
        dailyCap: 1,
      }),
    ).resolves.toBe('dispatched');
  });

  it('acks a dispatched row and stamps the instance acknowledged time', async () => {
    const store = createMemoryReminderStore();
    const template = await store.createTemplate(buildTemplate());
    const instance = await store.createInstance({
      templateId: template.id,
      userId: USER_A,
      dueAt: '2025-01-05T09:00:00Z',
      priority: 'normal',
      channel: 'whatsapp',
      dedupeKey: null,
    });
    await store.dispatchInstance({
      instanceId: instance.id,
      userId: USER_A,
      runId: 'run-1',
      channel: 'whatsapp',
      priority: 'normal',
      dispatchedAt: '2025-01-05T09:00:00Z',
      dayStart: '2025-01-04T21:00:00Z',
      dayEnd: '2025-01-05T21:00:00Z',
      dailyCap: 5,
    });
    const dispatch = (await store.findDispatchForInstanceRun(instance.id, 'run-1'))!;

    const acked = await store.ackDispatch(
      dispatch.id,
      { providerRef: 'stub:1' },
      '2025-01-05T09:05:00Z',
    );
    expect(acked).toMatchObject({ status: 'acked', ackPayload: { providerRef: 'stub:1' } });
    await expect(store.findInstanceById(instance.id)).resolves.toMatchObject({
      acknowledgedAt: '2025-01-05T09:05:00Z',
    });

    await expect(store.ackDispatch(dispatch.id, {}, '2025-01-05T09:10:00Z')).resolves.toBeNull();
  });

  it('appends reminder.due outbox entries on ack and clears them on dispose (WP-024c)', async () => {
    const store = createMemoryReminderStore();
    const template = await store.createTemplate(buildTemplate());
    const instance = await store.createInstance({
      templateId: template.id,
      userId: USER_A,
      dueAt: '2025-01-05T09:00:00Z',
      priority: 'normal',
      channel: 'whatsapp',
      dedupeKey: null,
    });
    await store.dispatchInstance({
      instanceId: instance.id,
      userId: USER_A,
      runId: 'run-1',
      channel: 'whatsapp',
      priority: 'normal',
      dispatchedAt: '2025-01-05T09:00:00Z',
      dayStart: '2025-01-04T21:00:00Z',
      dayEnd: '2025-01-05T21:00:00Z',
      dailyCap: 5,
    });
    const dispatch = (await store.findDispatchForInstanceRun(instance.id, 'run-1'))!;
    const entry = {
      eventId: 'e-1',
      eventType: 'reminder.due',
      producer: 'reminder-engine',
      schemaVersion: 1,
      occurredAt: '2025-01-05T09:05:00.000Z',
      aggregateType: 'reminder_instance',
      aggregateId: instance.id,
      idempotencyKey: dispatch.id,
      payload: { instanceId: instance.id, dispatchId: dispatch.id, simulated: true },
    };

    expect(store.outboxLog).toHaveLength(0);
    await store.ackDispatch(dispatch.id, { simulated: true }, '2025-01-05T09:05:00Z', [entry]);
    expect(store.outboxLog).toEqual([entry]);

    await store.ackDispatch(dispatch.id, {}, '2025-01-05T09:10:00Z', [entry]);
    expect(store.outboxLog).toHaveLength(1); // null ack appends nothing

    await store.dispose();
    expect(store.outboxLog).toHaveLength(0);
  });

  it('fails a dispatched row and its instance', async () => {
    const store = createMemoryReminderStore();
    const template = await store.createTemplate(buildTemplate());
    const instance = await store.createInstance({
      templateId: template.id,
      userId: USER_A,
      dueAt: '2025-01-05T09:00:00Z',
      priority: 'normal',
      channel: 'whatsapp',
      dedupeKey: null,
    });
    await store.dispatchInstance({
      instanceId: instance.id,
      userId: USER_A,
      runId: 'run-1',
      channel: 'whatsapp',
      priority: 'normal',
      dispatchedAt: '2025-01-05T09:00:00Z',
      dayStart: '2025-01-04T21:00:00Z',
      dayEnd: '2025-01-05T21:00:00Z',
      dailyCap: 5,
    });
    const dispatch = (await store.findDispatchForInstanceRun(instance.id, 'run-1'))!;

    const failed = await store.failDispatch(
      dispatch.id,
      'provider exploded',
      '2025-01-05T09:05:00Z',
    );
    expect(failed).toMatchObject({ status: 'failed', lastError: 'provider exploded' });
    await expect(store.findInstanceById(instance.id)).resolves.toMatchObject({
      status: 'failed',
      lastError: 'provider exploded',
    });

    await expect(
      store.failDispatch(dispatch.id, 'again', '2025-01-05T09:06:00Z'),
    ).resolves.toBeNull();
  });

  it('lists dispatches newest first with user filter and pagination', async () => {
    const store = createMemoryReminderStore();
    const template = await store.createTemplate(buildTemplate());
    const dispatchFor = async (userId: string, runId: string, at: string): Promise<string> => {
      const instance = await store.createInstance({
        templateId: template.id,
        userId,
        dueAt: '2025-01-05T09:00:00Z',
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
        dispatchedAt: at,
        dayStart: '2025-01-04T21:00:00Z',
        dayEnd: '2025-01-05T21:00:00Z',
        dailyCap: 5,
      });
      return instance.id;
    };
    await dispatchFor(USER_A, 'run-a', '2025-01-05T10:00:00Z');
    await dispatchFor(USER_B, 'run-b', '2025-01-05T09:00:00Z');
    await dispatchFor(USER_A, 'run-c', '2025-01-05T11:00:00Z');

    const all = await store.listDispatches({ limit: 10, offset: 0 });
    expect(all.map((d) => d.runId)).toEqual(['run-c', 'run-a', 'run-b']);

    const onlyA = await store.listDispatches({ userId: USER_A, limit: 10, offset: 0 });
    expect(onlyA.map((d) => d.runId)).toEqual(['run-c', 'run-a']);

    const paged = await store.listDispatches({ userId: USER_A, limit: 1, offset: 1 });
    expect(paged.map((d) => d.runId)).toEqual(['run-a']);
  });

  it('pings true and disposes cleanly', async () => {
    const store = createMemoryReminderStore();
    await expect(store.ping()).resolves.toBe(true);
    await store.createTemplate(buildTemplate());
    await store.dispose();
    await expect(store.findTemplateByCode('antenatal_visit')).resolves.toBeNull();
    await expect(store.listActiveTemplates()).resolves.toEqual([]);
  });
});
