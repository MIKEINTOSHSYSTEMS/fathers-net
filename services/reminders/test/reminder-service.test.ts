import { randomUUID } from 'node:crypto';
import { NotFoundError, ValidationError } from '@fathersnet/errors';
import { createTestLogger } from '@fathersnet/test-utils';
import {
  createReminderService,
  type ReminderServiceConfig,
  type ReminderServiceOptions,
} from '../src/engine/reminder-service';
import type { ChannelDispatcher, DispatchRequest } from '../src/services/dispatcher';
import { createMemoryReminderStore, type MemoryReminderStore } from '../src/store/memory-store';
import type { CreateReminderTemplateInput, ReminderTemplate } from '../src/types';

const BASE_CONFIG: ReminderServiceConfig = {
  FN_REMINDERS_DAILY_CAP: 5,
  FN_REMINDERS_TZ_OFFSET_MINUTES: 180,
  FN_REMINDERS_QUIET_HOURS_ENABLED: true,
  FN_REMINDERS_QUIET_HOURS_START: '21:00',
  FN_REMINDERS_QUIET_HOURS_END: '07:00',
  FN_REMINDERS_EXPIRY_MINUTES: 60,
  FN_REMINDERS_DISPATCH_BATCH_LIMIT: 100,
};

const USER = '55555555-5555-4555-8555-555555555555';

const TEMPLATE_INPUT: CreateReminderTemplateInput = {
  code: 'antenatal_visit',
  channel: 'whatsapp',
  priority: 'normal',
  titleEn: 'ANC visit reminder',
  titleAm: 'የቅድመ ወሊድ ጉብኝት ማስታወሻ',
  bodyEn: 'Your antenatal visit is coming up.',
  bodyAm: 'የቅድመ ወሊድ ጉብኝትዎ ቀርቧል።',
};

function recordingDispatcher(): { requests: DispatchRequest[]; dispatcher: ChannelDispatcher } {
  const requests: DispatchRequest[] = [];
  const dispatcher: ChannelDispatcher = {
    async dispatch(request: DispatchRequest) {
      requests.push(request);
      return { ok: true, providerRef: `stub:${randomUUID()}`, simulated: true };
    },
  };
  return { requests, dispatcher };
}

interface Harness {
  service: ReturnType<typeof createReminderService>;
  store: MemoryReminderStore;
  setNow: (iso: string) => void;
  logs: ReturnType<typeof createTestLogger>['logs'];
  requests: DispatchRequest[];
}

function buildHarness(overrides: Partial<ReminderServiceOptions> = {}): Harness {
  const store = (overrides.store ?? createMemoryReminderStore()) as MemoryReminderStore;
  const { logger, logs } = createTestLogger('info');
  const { requests, dispatcher } = recordingDispatcher();
  let nowMs = Date.parse('2025-01-01T10:00:00Z');

  const service = createReminderService({
    store,
    dispatcher,
    logger,
    config: BASE_CONFIG,
    now: () => new Date(nowMs),
    ...overrides,
  });

  return {
    service,
    store,
    setNow: (iso) => {
      nowMs = Date.parse(iso);
    },
    logs,
    requests,
  };
}

type TemplateCreator = {
  createTemplate(input: CreateReminderTemplateInput): Promise<ReminderTemplate>;
};

async function seedTemplate(
  creator: TemplateCreator,
  overrides: Partial<CreateReminderTemplateInput> = {},
): Promise<string> {
  const template = await creator.createTemplate({ ...TEMPLATE_INPUT, ...overrides });
  return template.id;
}

describe('reminder service — template lifecycle', () => {
  it('validates templates at creation time', async () => {
    const { service } = buildHarness();
    await expect(service.createTemplate({ ...TEMPLATE_INPUT, code: '   ' })).rejects.toBeInstanceOf(
      ValidationError,
    );
    await expect(
      service.createTemplate({ ...TEMPLATE_INPUT, leadTimeMinutes: -1 }),
    ).rejects.toBeInstanceOf(ValidationError);
    await expect(
      service.createTemplate({ ...TEMPLATE_INPUT, pregnancyWeek: 46 }),
    ).rejects.toBeInstanceOf(ValidationError);
    await expect(
      service.createTemplate({
        ...TEMPLATE_INPUT,
        quietHours: { enabled: true, start: 'oops', end: '07:00' },
      }),
    ).rejects.toBeInstanceOf(ValidationError);
    await expect(
      service.createTemplate({
        ...TEMPLATE_INPUT,
        recurrence: { type: 'weekly', intervalWeeks: 0, endWeek: 40 },
      }),
    ).rejects.toBeInstanceOf(ValidationError);

    const created = await service.createTemplate(TEMPLATE_INPUT);
    expect(created).toMatchObject({ code: 'antenatal_visit', recurrence: null });
  });
});

describe('reminder service — scheduling (FR-043 lead time, FR-046 priority)', () => {
  it('rejects unknown or inactive templates and invalid dueAt values', async () => {
    const { service } = buildHarness();
    await seedTemplate(service);

    await expect(
      service.scheduleInstance({
        templateCode: 'missing',
        userId: USER,
        dueAt: '2025-01-05T09:00:00Z',
      }),
    ).rejects.toBeInstanceOf(NotFoundError);

    await service.createTemplate({ ...TEMPLATE_INPUT, code: 'retired', active: false });
    await expect(
      service.scheduleInstance({
        templateCode: 'retired',
        userId: USER,
        dueAt: '2025-01-05T09:00:00Z',
      }),
    ).rejects.toBeInstanceOf(ValidationError);

    await expect(
      service.scheduleInstance({
        templateCode: 'antenatal_visit',
        userId: USER,
        dueAt: 'not-a-date',
      }),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it('subtracts the template lead time and denormalizes priority/channel', async () => {
    const { service } = buildHarness();
    await service.createTemplate({ ...TEMPLATE_INPUT, leadTimeMinutes: 60 });

    const instance = await service.scheduleInstance({
      templateCode: 'antenatal_visit',
      userId: USER,
      dueAt: '2025-01-05T09:00:00Z',
    });
    expect(instance).toMatchObject({
      status: 'scheduled',
      priority: 'normal',
      channel: 'whatsapp',
      dedupeKey: null,
    });
    expect(instance.dueAt).toBe('2025-01-05T08:00:00.000Z');
  });

  it('honors an explicit critical priority override', async () => {
    const { service } = buildHarness();
    await seedTemplate(service);

    const instance = await service.scheduleInstance({
      templateCode: 'antenatal_visit',
      userId: USER,
      dueAt: '2025-01-05T09:00:00Z',
      priority: 'critical',
    });
    expect(instance.priority).toBe('critical');
  });
});

describe('reminder service — dispatch cycle', () => {
  it('renders, dispatches, acks, and records reminder.due in the outbox (FR-045, FR-047)', async () => {
    const harness = buildHarness();
    const { service, store, requests } = harness;
    await seedTemplate(store);

    const instance = await service.scheduleInstance({
      templateCode: 'antenatal_visit',
      userId: USER,
      dueAt: '2025-01-01T09:00:00Z',
    });

    const result = await service.runDispatchCycle('run-1');
    expect(result).toEqual({
      expired: 0,
      selected: 1,
      outcomes: {
        dispatched: 1,
        skippedQuietHours: 0,
        rateLimited: 0,
        failed: 0,
        conflict: 0,
      },
    });

    const after = await service.getInstance(instance.id);
    expect(after).toMatchObject({
      status: 'dispatched',
      dispatchedAt: '2025-01-01T10:00:00.000Z',
    });

    const dispatch = await store.findDispatchForInstanceRun(instance.id, 'run-1');
    expect(dispatch).toMatchObject({
      status: 'acked',
      runId: 'run-1',
      ackPayload: { simulated: true },
    });

    expect(requests).toHaveLength(1);
    expect(requests[0]).toMatchObject({
      instanceId: instance.id,
      userId: USER,
      runId: 'run-1',
      templateCode: 'antenatal_visit',
      channel: 'whatsapp',
      priority: 'normal',
      title: 'ANC visit reminder',
      body: 'Your antenatal visit is coming up.',
    });

    const entries = store.outboxLog.filter((e) => e.eventType === 'reminder.due');
    expect(entries).toHaveLength(1);
    const entry = entries[0];
    expect(entry.eventId).toMatch(/^[0-9a-f-]{36}$/i);
    expect(entry.schemaVersion).toBe(1);
    expect(entry.producer).toBe('reminder-engine');
    expect(entry.idempotencyKey).toBe(dispatch!.id);
    expect(entry.aggregateType).toBe('reminder_instance');
    expect(entry.aggregateId).toBe(instance.id);
    expect(entry.payload).toMatchObject({
      instanceId: instance.id,
      dispatchId: dispatch!.id,
      userId: USER,
      templateCode: 'antenatal_visit',
      runId: 'run-1',
      channel: 'whatsapp',
      priority: 'normal',
      language: 'en',
      simulated: true,
    });
  });

  it('is idempotent under re-runs of the same scheduler slot (FR-163)', async () => {
    const { service, store } = buildHarness();
    await seedTemplate(store);
    const instance = await service.scheduleInstance({
      templateCode: 'antenatal_visit',
      userId: USER,
      dueAt: '2025-01-01T09:00:00Z',
    });

    await service.runDispatchCycle('run-1');
    const second = await service.runDispatchCycle('run-1');
    expect(second).toEqual({
      expired: 0,
      selected: 0,
      outcomes: { dispatched: 0, skippedQuietHours: 0, rateLimited: 0, failed: 0, conflict: 0 },
    });

    await expect(service.getInstance(instance.id)).resolves.toMatchObject({ status: 'dispatched' });
    const dispatches = await store.listDispatches({ limit: 10, offset: 0 });
    expect(dispatches).toHaveLength(1);
  });

  it('skips normal reminders inside the quiet-hours window', async () => {
    const harness = buildHarness();
    const { service, store } = harness;
    harness.setNow('2025-01-01T20:30:00Z'); // 23:30 Addis
    await seedTemplate(store);
    const instance = await service.scheduleInstance({
      templateCode: 'antenatal_visit',
      userId: USER,
      dueAt: '2025-01-01T20:00:00Z',
    });

    const result = await service.runDispatchCycle('run-1');
    expect(result.outcomes).toMatchObject({ skippedQuietHours: 1, dispatched: 0 });
    await expect(service.getInstance(instance.id)).resolves.toMatchObject({ status: 'scheduled' });
  });

  it('lets critical reminders bypass the quiet-hours window (FR-046)', async () => {
    const harness = buildHarness();
    const { service, store } = harness;
    harness.setNow('2025-01-01T20:30:00Z'); // 23:30 Addis
    await seedTemplate(store, { code: 'emergency', priority: 'critical' });

    const instance = await service.scheduleInstance({
      templateCode: 'emergency',
      userId: USER,
      dueAt: '2025-01-01T20:00:00Z',
    });
    const result = await service.runDispatchCycle('run-1');
    expect(result.outcomes).toMatchObject({ dispatched: 1, skippedQuietHours: 0 });
    await expect(service.getInstance(instance.id)).resolves.toMatchObject({ status: 'dispatched' });
  });

  it('prefers a per-user quiet-hours preference over template/service config (FR-038)', async () => {
    const harness = buildHarness({
      store: createMemoryReminderStore({
        [USER]: { enabled: false, start: '21:00', end: '07:00' },
      }),
    });
    const { service } = harness;
    harness.setNow('2025-01-01T20:30:00Z'); // 23:30 Addis
    await service.createTemplate({
      ...TEMPLATE_INPUT,
      quietHours: { enabled: true, start: '20:00', end: '06:00' },
    });

    const instance = await service.scheduleInstance({
      templateCode: 'antenatal_visit',
      userId: USER,
      dueAt: '2025-01-01T20:00:00Z',
    });
    const result = await service.runDispatchCycle('run-1');
    expect(result.outcomes).toMatchObject({ dispatched: 1, skippedQuietHours: 0 });
    await expect(service.getInstance(instance.id)).resolves.toMatchObject({ status: 'dispatched' });
  });

  it('applies a template-specific quiet-hours window when no user preference exists', async () => {
    const harness = buildHarness();
    const { service } = harness;
    await service.createTemplate({
      ...TEMPLATE_INPUT,
      quietHours: { enabled: true, start: '00:00', end: '23:59' },
    });

    const instance = await service.scheduleInstance({
      templateCode: 'antenatal_visit',
      userId: USER,
      dueAt: '2025-01-01T09:00:00Z',
    });
    const result = await service.runDispatchCycle('run-1');
    expect(result.outcomes).toMatchObject({ skippedQuietHours: 1, dispatched: 0 });
    await expect(service.getInstance(instance.id)).resolves.toMatchObject({ status: 'scheduled' });
  });

  it('rate-limits a user at the daily cap (06 §4.14)', async () => {
    const { service, store } = buildHarness({
      config: { ...BASE_CONFIG, FN_REMINDERS_DAILY_CAP: 3 },
    });
    await seedTemplate(store);
    const instanceIds: string[] = [];
    for (let i = 0; i < 4; i += 1) {
      const instance = await service.scheduleInstance({
        templateCode: 'antenatal_visit',
        userId: USER,
        dueAt: new Date(Date.parse('2025-01-01T09:00:00Z') + i * 1000).toISOString(),
      });
      instanceIds.push(instance.id);
    }

    const result = await service.runDispatchCycle('run-1');
    expect(result.outcomes).toMatchObject({ dispatched: 3, rateLimited: 1 });

    const rateLimited = await service.getInstance(instanceIds[3]);
    expect(rateLimited?.status).toBe('rate_limited');
  });

  it('marks an instance failed when rendering fails (fail-closed)', async () => {
    const { service, store } = buildHarness();
    await store.createTemplate({
      ...TEMPLATE_INPUT,
      bodyEn: 'Hi {{first_name}}',
      bodyAm: 'ሰላም {{first_name}}',
    });

    const instance = await service.scheduleInstance({
      templateCode: 'antenatal_visit',
      userId: USER,
      dueAt: '2025-01-01T09:00:00Z',
    });
    const result = await service.runDispatchCycle('run-1');
    expect(result.outcomes).toMatchObject({ failed: 1, dispatched: 0 });

    const after = await service.getInstance(instance.id);
    expect(after?.status).toBe('failed');
    expect(after?.lastError).toContain('Template is missing required variables');
    expect(store.outboxLog).toHaveLength(0);
    expect(await store.listDispatches({ limit: 10, offset: 0 })).toEqual([]);
  });

  it('marks an instance failed when its template is gone', async () => {
    const { service, store } = buildHarness();
    const orphan = await store.createInstance({
      templateId: '00000000-0000-4000-8000-000000000000',
      userId: USER,
      dueAt: '2025-01-01T09:00:00Z',
      priority: 'normal',
      channel: 'whatsapp',
      dedupeKey: null,
    });

    const result = await service.runDispatchCycle('run-1');
    expect(result.outcomes).toMatchObject({ failed: 1 });
    await expect(service.getInstance(orphan.id)).resolves.toMatchObject({
      status: 'failed',
      lastError: expect.stringContaining('Template'),
    });
  });

  it('expires stale instances instead of sending them late', async () => {
    const { service, store } = buildHarness();
    await seedTemplate(store);
    await service.scheduleInstance({
      templateCode: 'antenatal_visit',
      userId: USER,
      dueAt: '2025-01-01T07:00:00Z', // 3h before now; expiry window is 60min
    });

    const result = await service.runDispatchCycle('run-1');
    expect(result).toMatchObject({ expired: 1, selected: 0 });
  });

  it('does not write an outbox entry for instances skipped in quiet hours', async () => {
    const harness = buildHarness();
    const { service, store } = harness;
    harness.setNow('2025-01-01T20:30:00Z'); // 23:30 Addis
    await seedTemplate(store);
    await service.scheduleInstance({
      templateCode: 'antenatal_visit',
      userId: USER,
      dueAt: '2025-01-01T20:00:00Z',
    });

    await service.runDispatchCycle('run-1');
    expect(store.outboxLog).toHaveLength(0);
  });

  it('renders Amharic when the user preference says so (FR-047)', async () => {
    const store = createMemoryReminderStore();
    const amStore: MemoryReminderStore = {
      ...store,
      getUserLanguage: async () => 'am',
    };
    const harness = buildHarness({ store: amStore });
    await harness.service.createTemplate(TEMPLATE_INPUT);

    await harness.service.scheduleInstance({
      templateCode: 'antenatal_visit',
      userId: USER,
      dueAt: '2025-01-01T09:00:00Z',
    });
    await harness.service.runDispatchCycle('run-1');

    expect(harness.requests[0].title).toBe('የቅድመ ወሊድ ጉብኝት ማስታወሻ');
    const entry = harness.store.outboxLog.find((e) => e.eventType === 'reminder.due');
    expect(entry?.payload).toMatchObject({ language: 'am' });
  });
});

describe('reminder service — dispatch log accessors', () => {
  it('acks a dispatch produced outside the cycle', async () => {
    const { service, store } = buildHarness();
    await seedTemplate(store);
    const instance = await service.scheduleInstance({
      templateCode: 'antenatal_visit',
      userId: USER,
      dueAt: '2025-01-01T09:00:00Z',
    });
    await store.dispatchInstance({
      instanceId: instance.id,
      userId: USER,
      runId: 'manual-run',
      channel: 'whatsapp',
      priority: 'normal',
      dispatchedAt: '2025-01-01T09:00:00Z',
      dayStart: '2024-12-31T21:00:00Z',
      dayEnd: '2025-01-01T21:00:00Z',
      dailyCap: 5,
    });
    const dispatch = (await store.findDispatchForInstanceRun(instance.id, 'manual-run'))!;

    const acked = await service.acknowledgeDispatch(dispatch.id, { providerRef: 'stub:9' });
    expect(acked).toMatchObject({ status: 'acked', ackPayload: { providerRef: 'stub:9' } });
  });

  it('clamps list limits and offsets', async () => {
    const store = createMemoryReminderStore();
    const spy = jest.spyOn(store, 'listDispatches').mockResolvedValue([]);
    const harness = buildHarness({ store });

    await harness.service.listDispatches({ limit: 500, offset: -3 });
    expect(spy).toHaveBeenCalledWith({ userId: undefined, limit: 100, offset: 0 });

    await harness.service.listDispatches({ userId: USER, limit: 0, offset: 10 });
    expect(spy).toHaveBeenLastCalledWith({ userId: USER, limit: 1, offset: 10 });
  });
});
