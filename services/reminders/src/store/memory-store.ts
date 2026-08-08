import { randomUUID } from 'node:crypto';
import { ConflictError } from '@fathersnet/errors';
import { parseQuietHours } from '../engine/quiet-hours';
import type {
  Channel,
  CreateReminderDispatchInput,
  CreateReminderInstanceInput,
  CreateReminderTemplateInput,
  Priority,
  QuietHoursConfig,
  ReminderDispatch,
  ReminderInstance,
  ReminderStatus,
  ReminderTemplate,
} from '../types';
import type {
  DispatchInstanceInput,
  DispatchListQuery,
  DispatchOutcome,
  OutboxEntry,
  ReminderStore,
} from './types';

/** In-memory reminder store with an outbox capture surface (WP-024c): every
 *  outbox entry passed to a published-write store call is appended to
 *  `outboxLog` so unit tests can assert what the relay would publish. */
export interface MemoryReminderStore extends ReminderStore {
  outboxLog: OutboxEntry[];
}

/**
 * In-memory reminder store — the hermetic test-double (M-08). Mirrors the
 * Postgres adapter's invariants: `dispatchInstance` claims the instance and
 * enforces `UNIQUE(instance_id, run_id)` plus the per-user daily cap inside one
 * logical step; `createInstance` enforces the partial-unique `dedupe_key`
 * (ConflictError on duplicate, FR-048 readiness); due selection and expiry
 * follow the same status predicates as the SQL adapter.
 *
 * `initialUserQuietHours` is a test seam for `user_preferences.quiet_hours`
 * (FR-038) so quiet-hours behavior can be exercised hermetically; production
 * quiet hours come from the Postgres adapter.
 *
 * WP-024c: `ackDispatch` appends its outbox entries to `outboxLog` (the same
 * atomic join the Postgres adapter commits in its ack transaction).
 */
export function createMemoryReminderStore(
  initialUserQuietHours: Record<string, QuietHoursConfig> = {},
): MemoryReminderStore {
  const templates = new Map<string, ReminderTemplate>();
  const instances = new Map<string, ReminderInstance>();
  const dispatches = new Map<string, ReminderDispatch>();
  const userQuietHours = new Map<string, QuietHoursConfig>(Object.entries(initialUserQuietHours));
  const userLanguage = new Map<string, 'en' | 'am'>();
  const outboxLog: OutboxEntry[] = [];

  return {
    outboxLog,

    async createTemplate(input: CreateReminderTemplateInput): Promise<ReminderTemplate> {
      const now = new Date().toISOString();
      const template: ReminderTemplate = {
        id: randomUUID(),
        code: input.code,
        channel: input.channel as Channel,
        priority: input.priority as Priority,
        titleEn: input.titleEn,
        titleAm: input.titleAm,
        bodyEn: input.bodyEn,
        bodyAm: input.bodyAm,
        leadTimeMinutes: input.leadTimeMinutes ?? null,
        quietHours: input.quietHours ?? null,
        recurrence: input.recurrence ?? null,
        pregnancyWeek: input.pregnancyWeek ?? null,
        active: input.active ?? true,
        createdAt: now,
        updatedAt: now,
      };
      templates.set(template.id, template);
      return { ...template };
    },

    async findTemplateByCode(code: string): Promise<ReminderTemplate | null> {
      for (const template of templates.values()) {
        if (template.code === code) {
          return { ...template };
        }
      }
      return null;
    },

    async findTemplateById(id: string): Promise<ReminderTemplate | null> {
      const template = templates.get(id);
      return template ? { ...template } : null;
    },

    async listActiveTemplates(): Promise<ReminderTemplate[]> {
      return [...templates.values()]
        .filter((template) => template.active)
        .map((template) => ({ ...template }));
    },

    async getUserQuietHours(userId: string): Promise<QuietHoursConfig | null> {
      const value = userQuietHours.get(userId);
      return value ? parseQuietHours(value) : null;
    },

    async getUserLanguage(userId: string): Promise<'en' | 'am'> {
      return userLanguage.get(userId) ?? 'en';
    },

    async createInstance(input: CreateReminderInstanceInput): Promise<ReminderInstance> {
      if (input.dedupeKey !== null) {
        for (const instance of instances.values()) {
          if (instance.dedupeKey === input.dedupeKey) {
            throw new ConflictError(
              `Reminder instance with dedupe key '${input.dedupeKey}' already exists`,
            );
          }
        }
      }
      const now = new Date().toISOString();
      const instance: ReminderInstance = {
        id: randomUUID(),
        templateId: input.templateId,
        userId: input.userId,
        dueAt: input.dueAt,
        status: 'scheduled',
        priority: input.priority,
        channel: input.channel,
        dedupeKey: input.dedupeKey,
        dispatchedAt: null,
        acknowledgedAt: null,
        lastError: null,
        createdAt: now,
      };
      instances.set(instance.id, instance);
      return { ...instance };
    },

    async findInstanceById(id: string): Promise<ReminderInstance | null> {
      const instance = instances.get(id);
      return instance ? { ...instance } : null;
    },

    async findInstanceByDedupeKey(dedupeKey: string): Promise<ReminderInstance | null> {
      for (const instance of instances.values()) {
        if (instance.dedupeKey === dedupeKey) {
          return { ...instance };
        }
      }
      return null;
    },

    async selectDueInstances(nowIso: string, limit: number): Promise<ReminderInstance[]> {
      return [...instances.values()]
        .filter((instance) => instance.status === 'scheduled' && instance.dueAt <= nowIso)
        .sort((a, b) =>
          a.dueAt === b.dueAt ? a.id.localeCompare(b.id) : a.dueAt < b.dueAt ? -1 : 1,
        )
        .slice(0, limit)
        .map((instance) => ({ ...instance }));
    },

    async expireStaleInstances(cutoffIso: string): Promise<number> {
      let count = 0;
      for (const [id, instance] of instances) {
        if (instance.status === 'scheduled' && instance.dueAt < cutoffIso) {
          instances.set(id, { ...instance, status: 'expired' });
          count += 1;
        }
      }
      return count;
    },

    async setInstanceStatus(
      instanceId: string,
      status: ReminderStatus,
      fields?: { dispatchedAt?: string | null; lastError?: string | null },
    ): Promise<ReminderInstance | null> {
      const instance = instances.get(instanceId);
      if (!instance) {
        return null;
      }
      const next: ReminderInstance = {
        ...instance,
        status,
        dispatchedAt:
          fields?.dispatchedAt === undefined ? instance.dispatchedAt : fields.dispatchedAt,
        lastError: fields?.lastError === undefined ? instance.lastError : fields.lastError,
      };
      instances.set(instanceId, next);
      return { ...next };
    },

    async dispatchInstance(input: DispatchInstanceInput): Promise<DispatchOutcome> {
      const instance = instances.get(input.instanceId);
      if (!instance || instance.status !== 'scheduled') {
        return 'conflict';
      }
      const alreadyDispatched = [...dispatches.values()].some(
        (dispatch) => dispatch.instanceId === input.instanceId && dispatch.runId === input.runId,
      );
      if (alreadyDispatched) {
        return 'conflict';
      }
      const dayCount = [...dispatches.values()].filter(
        (dispatch) =>
          dispatch.userId === input.userId &&
          dispatch.dispatchedAt >= input.dayStart &&
          dispatch.dispatchedAt < input.dayEnd,
      ).length;
      if (dayCount >= input.dailyCap) {
        instances.set(input.instanceId, { ...instance, status: 'rate_limited' });
        return 'rate_limited';
      }
      instances.set(input.instanceId, {
        ...instance,
        status: 'dispatched',
        dispatchedAt: input.dispatchedAt,
      });
      const now = new Date().toISOString();
      const dispatch: ReminderDispatch = {
        id: randomUUID(),
        instanceId: input.instanceId,
        userId: input.userId,
        runId: input.runId,
        channel: input.channel,
        priority: input.priority,
        status: 'dispatched',
        dispatchedAt: input.dispatchedAt,
        ackReceivedAt: null,
        ackPayload: null,
        lastError: null,
        createdAt: now,
      };
      dispatches.set(dispatch.id, dispatch);
      return 'dispatched';
    },

    async findDispatchById(id: string): Promise<ReminderDispatch | null> {
      const dispatch = dispatches.get(id);
      return dispatch ? { ...dispatch } : null;
    },

    async findDispatchForInstanceRun(
      instanceId: string,
      runId: string,
    ): Promise<ReminderDispatch | null> {
      for (const dispatch of dispatches.values()) {
        if (dispatch.instanceId === instanceId && dispatch.runId === runId) {
          return { ...dispatch };
        }
      }
      return null;
    },

    async ackDispatch(
      dispatchId: string,
      ackPayload: Record<string, unknown>,
      ackedAt: string,
      outbox: OutboxEntry[] = [],
    ): Promise<ReminderDispatch | null> {
      const dispatch = dispatches.get(dispatchId);
      if (!dispatch || dispatch.status !== 'dispatched') {
        return null;
      }
      const next: ReminderDispatch = {
        ...dispatch,
        status: 'acked',
        ackReceivedAt: ackedAt,
        ackPayload,
      };
      dispatches.set(dispatchId, next);
      const instance = instances.get(dispatch.instanceId);
      if (instance) {
        instances.set(instance.id, { ...instance, acknowledgedAt: ackedAt });
      }
      outboxLog.push(...outbox);
      return { ...next };
    },

    async failDispatch(
      dispatchId: string,
      error: string,
      _failedAt: string,
    ): Promise<ReminderDispatch | null> {
      const dispatch = dispatches.get(dispatchId);
      if (!dispatch || dispatch.status !== 'dispatched') {
        return null;
      }
      const next: ReminderDispatch = {
        ...dispatch,
        status: 'failed',
        lastError: error,
      };
      dispatches.set(dispatchId, next);
      const instance = instances.get(dispatch.instanceId);
      if (instance) {
        instances.set(instance.id, { ...instance, status: 'failed', lastError: error });
      }
      return { ...next };
    },

    async listDispatches(query: DispatchListQuery): Promise<ReminderDispatch[]> {
      return [...dispatches.values()]
        .filter((dispatch) => (query.userId ? dispatch.userId === query.userId : true))
        .sort((a, b) =>
          a.dispatchedAt === b.dispatchedAt
            ? a.id.localeCompare(b.id)
            : a.dispatchedAt > b.dispatchedAt
              ? -1
              : 1,
        )
        .slice(query.offset, query.offset + query.limit)
        .map((dispatch) => ({ ...dispatch }));
    },

    async ping(): Promise<boolean> {
      return true;
    },

    async dispose(): Promise<void> {
      templates.clear();
      instances.clear();
      dispatches.clear();
      outboxLog.length = 0;
    },
  };
}

export type { CreateReminderDispatchInput };
