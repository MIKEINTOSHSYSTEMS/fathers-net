import { NotFoundError, ValidationError } from '@fathersnet/errors';
import type { EventBus } from '@fathersnet/events';
import type { Logger } from '@fathersnet/logger';
import type { RemindersConfig } from '../config';
import type { ChannelDispatcher } from '../services/dispatcher';
import { publishEvent } from '../services/events';
import type { ReminderDispatch, ReminderInstance, ReminderStore } from '../store';
import type { CreateReminderTemplateInput, ReminderTemplate } from '../types';
import { dayWindow } from './cap';
import { applyLeadTime } from './lead-time';
import { resolvePriority } from './priority';
import { parseQuietHours, quietHoursFor, isInQuietHours } from './quiet-hours';
import { parseRecurrence } from './recurrence';
import { renderReminder } from './template-engine';

export type ReminderServiceConfig = Pick<
  RemindersConfig,
  | 'FN_REMINDERS_DAILY_CAP'
  | 'FN_REMINDERS_TZ_OFFSET_MINUTES'
  | 'FN_REMINDERS_QUIET_HOURS_ENABLED'
  | 'FN_REMINDERS_QUIET_HOURS_START'
  | 'FN_REMINDERS_QUIET_HOURS_END'
  | 'FN_REMINDERS_EXPIRY_MINUTES'
  | 'FN_REMINDERS_DISPATCH_BATCH_LIMIT'
>;

export interface ReminderServiceOptions {
  store: ReminderStore;
  dispatcher: ChannelDispatcher;
  bus: EventBus;
  logger?: Logger;
  config: ReminderServiceConfig;
  /** Injectable clock (hermetic tests). Defaults to `new Date()`. */
  now?: () => Date;
}

export interface ScheduleReminderInput {
  templateCode: string;
  userId: string;
  /** Event/appointment time (ISO). Lead time is subtracted from this to get
   *  the instance due time (FR-043). */
  dueAt: string;
  /** Explicit priority override (else the template's priority, FR-046). */
  priority?: 'normal' | 'critical';
}

export interface DispatchCycleOutcome {
  dispatched: number;
  skippedQuietHours: number;
  rateLimited: number;
  failed: number;
  conflict: number;
}

export interface DispatchCycleResult {
  /** Instances expired before selection (never sent late). */
  expired: number;
  /** Instances selected as due this cycle. */
  selected: number;
  outcomes: DispatchCycleOutcome;
}

/**
 * Reminder orchestration (WP-021). The dispatch cycle is the engine core:
 *
 *   1. expire stale scheduled instances (due + expiry window → `expired`)
 *   2. select due instances (`status='scheduled' AND due_at <= now`)
 *   3. per instance: quiet-hours gate (FR-029/FR-043/FR-046) → render (FR-047)
 *      → atomic claim + cap + dispatch-log insert (FR-163, 06 §4.14)
 *      → channel send (stub) → ack → best-effort `reminder.due`
 *
 * Everything on the hot path is a store call; the pure engine modules
 * (`template-engine`, `quiet-hours`, `cap`, `lead-time`, `priority`) hold the
 * decision math so it is unit-testable without I/O.
 */
export function createReminderService(options: ReminderServiceOptions): ReminderService {
  return new ReminderService(options);
}

export class ReminderService {
  readonly #store: ReminderStore;
  readonly #dispatcher: ChannelDispatcher;
  readonly #bus: EventBus;
  readonly #logger?: Logger;
  readonly #config: ReminderServiceConfig;
  readonly #now: () => Date;

  constructor(options: ReminderServiceOptions) {
    this.#store = options.store;
    this.#dispatcher = options.dispatcher;
    this.#bus = options.bus;
    this.#logger = options.logger;
    this.#config = options.config;
    this.#now = options.now ?? (() => new Date());
  }

  async createTemplate(input: CreateReminderTemplateInput): Promise<ReminderTemplate> {
    if (!input.code || !input.code.trim()) {
      throw new ValidationError('Template code is required');
    }
    const template: CreateReminderTemplateInput = {
      ...input,
      quietHours: input.quietHours ?? null,
      recurrence: input.recurrence ?? null,
    };
    this.#validateTemplate(template);
    return this.#store.createTemplate(template);
  }

  async findTemplateByCode(code: string): Promise<ReminderTemplate | null> {
    return this.#store.findTemplateByCode(code);
  }

  async listActiveTemplates(): Promise<ReminderTemplate[]> {
    return this.#store.listActiveTemplates();
  }

  async scheduleInstance(input: ScheduleReminderInput): Promise<ReminderInstance> {
    const template = await this.#store.findTemplateByCode(input.templateCode);
    if (!template) {
      throw new NotFoundError(`Reminder template '${input.templateCode}' not found`);
    }
    if (!template.active) {
      throw new ValidationError(`Reminder template '${input.templateCode}' is not active`);
    }
    if (Number.isNaN(Date.parse(input.dueAt))) {
      throw new ValidationError(`Invalid dueAt '${input.dueAt}'. Expected ISO 8601.`);
    }
    const priority = resolvePriority(template.priority, input.priority ?? null);
    const dueAt = applyLeadTime(input.dueAt, template.leadTimeMinutes);
    return this.#store.createInstance({
      templateId: template.id,
      userId: input.userId,
      dueAt,
      priority,
      channel: template.channel,
      dedupeKey: null,
    });
  }

  async getInstance(id: string): Promise<ReminderInstance | null> {
    return this.#store.findInstanceById(id);
  }

  async getDispatch(id: string): Promise<ReminderDispatch | null> {
    return this.#store.findDispatchById(id);
  }

  async listDispatches(query: {
    userId?: string;
    limit: number;
    offset: number;
  }): Promise<ReminderDispatch[]> {
    const limit = Math.max(1, Math.min(100, query.limit));
    const offset = Math.max(0, query.offset);
    return this.#store.listDispatches({ userId: query.userId, limit, offset });
  }

  async acknowledgeDispatch(
    dispatchId: string,
    ackPayload: Record<string, unknown>,
  ): Promise<ReminderDispatch | null> {
    return this.#store.ackDispatch(dispatchId, ackPayload, this.#now().toISOString());
  }

  /** One dispatch cycle for a scheduler run slot. Idempotent under re-run
   *  (FR-163): the store's claim + `UNIQUE(instance_id, run_id)` make a
   *  second run a no-op for already-dispatched instances. */
  async runDispatchCycle(runId: string): Promise<DispatchCycleResult> {
    const now = this.#now();
    const nowMs = now.getTime();
    const nowIso = now.toISOString();
    const expiryMinutes = this.#config.FN_REMINDERS_EXPIRY_MINUTES;
    const cutoffIso = new Date(nowMs - expiryMinutes * 60000).toISOString();

    const expired = await this.#store.expireStaleInstances(cutoffIso);
    const due = await this.#store.selectDueInstances(
      nowIso,
      this.#config.FN_REMINDERS_DISPATCH_BATCH_LIMIT,
    );

    const outcomes: DispatchCycleOutcome = {
      dispatched: 0,
      skippedQuietHours: 0,
      rateLimited: 0,
      failed: 0,
      conflict: 0,
    };

    for (const instance of due) {
      await this.#processInstance(instance, runId, nowIso, nowMs, outcomes);
    }

    return { expired, selected: due.length, outcomes };
  }

  async dispose(): Promise<void> {
    await this.#store.dispose();
  }

  async #processInstance(
    instance: ReminderInstance,
    runId: string,
    nowIso: string,
    nowMs: number,
    outcomes: DispatchCycleOutcome,
  ): Promise<void> {
    const template = await this.#store.findTemplateById(instance.templateId);
    if (!template) {
      await this.#failInstance(instance.id, `Template '${instance.templateId}' not found`);
      outcomes.failed += 1;
      return;
    }

    if (!(await this.#quietHoursOpen(instance, template, nowIso))) {
      outcomes.skippedQuietHours += 1;
      return;
    }

    let title: string;
    let body: string;
    let language: 'en' | 'am';
    try {
      const languagePreference = await this.#store.getUserLanguage(instance.userId);
      const rendered = renderReminder(template, languagePreference, {});
      title = rendered.title;
      body = rendered.body;
      language = rendered.language;
    } catch (err) {
      await this.#failInstance(instance.id, String(err instanceof Error ? err.message : err));
      outcomes.failed += 1;
      return;
    }

    const window = dayWindow(nowMs, this.#config.FN_REMINDERS_TZ_OFFSET_MINUTES);
    const outcome = await this.#store.dispatchInstance({
      instanceId: instance.id,
      userId: instance.userId,
      runId,
      channel: instance.channel,
      priority: instance.priority,
      dispatchedAt: nowIso,
      dayStart: window.startIso,
      dayEnd: window.endIso,
      dailyCap: this.#config.FN_REMINDERS_DAILY_CAP,
    });

    if (outcome === 'conflict') {
      outcomes.conflict += 1;
      return;
    }
    if (outcome === 'rate_limited') {
      outcomes.rateLimited += 1;
      return;
    }

    const dispatch = await this.#store.findDispatchForInstanceRun(instance.id, runId);
    if (!dispatch) {
      await this.#failInstance(instance.id, 'Dispatch row missing after claim');
      outcomes.failed += 1;
      return;
    }

    const send = await this.#dispatcher.dispatch({
      instanceId: instance.id,
      userId: instance.userId,
      runId,
      templateCode: template.code,
      channel: instance.channel,
      priority: instance.priority,
      title,
      body,
    });

    if (!send.ok) {
      await this.#store.failDispatch(dispatch.id, send.providerRef || 'provider failed', nowIso);
      outcomes.failed += 1;
      return;
    }

    const acked = await this.#store.ackDispatch(
      dispatch.id,
      { providerRef: send.providerRef, simulated: send.simulated },
      nowIso,
    );
    if (!acked) {
      this.#logger?.warn('reminders.ack_missing', 'dispatch already terminal', {
        dispatch_id: dispatch.id,
      });
    }

    await publishEvent({
      bus: this.#bus,
      logger: this.#logger,
      type: 'reminder.due',
      requestId: runId,
      aggregate: { type: 'reminder_instance', id: instance.id },
      idempotencyKey: dispatch.id,
      payload: {
        instanceId: instance.id,
        dispatchId: dispatch.id,
        userId: instance.userId,
        templateCode: template.code,
        runId,
        channel: instance.channel,
        priority: instance.priority,
        language,
        providerRef: send.providerRef,
        simulated: send.simulated,
      },
    });

    outcomes.dispatched += 1;
  }

  /** Quiet-hours gate (FR-029/FR-043/FR-046). `critical` bypasses the window;
   *  a `normal` reminder inside the Addis night window is skipped, not sent.
   *  Per-user preference wins, then template config, then service defaults. */
  async #quietHoursOpen(
    instance: ReminderInstance,
    template: ReminderTemplate,
    nowIso: string,
  ): Promise<boolean> {
    if (instance.priority === 'critical') {
      return true;
    }
    const defaults = {
      enabled: this.#config.FN_REMINDERS_QUIET_HOURS_ENABLED,
      start: this.#config.FN_REMINDERS_QUIET_HOURS_START,
      end: this.#config.FN_REMINDERS_QUIET_HOURS_END,
    };
    const userConfig = await this.#store.getUserQuietHours(instance.userId);
    const config = quietHoursFor(userConfig, template.quietHours, defaults);
    return !isInQuietHours(nowIso, config, this.#config.FN_REMINDERS_TZ_OFFSET_MINUTES);
  }

  async #failInstance(instanceId: string, error: string): Promise<void> {
    await this.#store.setInstanceStatus(instanceId, 'failed', { lastError: error });
    this.#logger?.warn('reminders.instance_failed', 'reminder instance failed', {
      instance_id: instanceId,
      error,
    });
  }

  #validateTemplate(input: CreateReminderTemplateInput): void {
    if (input.leadTimeMinutes != null && input.leadTimeMinutes < 0) {
      throw new ValidationError('leadTimeMinutes must be >= 0');
    }
    if (input.pregnancyWeek != null && (input.pregnancyWeek < 1 || input.pregnancyWeek > 45)) {
      throw new ValidationError('pregnancyWeek must be within 1–45');
    }
    if (input.quietHours != null && parseQuietHours(input.quietHours) === null) {
      throw new ValidationError(
        `Invalid quietHours for template '${input.code}'. Expected {enabled, start, end} with HH:MM times.`,
      );
    }
    if (input.recurrence != null && parseRecurrence(input.recurrence) === null) {
      throw new ValidationError(
        `Invalid recurrence for template '${input.code}'. Expected {type:"one_time"} or {type:"weekly", intervalWeeks, endWeek}.`,
      );
    }
  }
}
