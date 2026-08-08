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

/** Atomic dispatch outcome. `conflict` = instance no longer `scheduled`, or
 *  the `(instance_id, run_id)` unique guard rejected a duplicate run (FR-163);
 *  `rate_limited` = the per-user daily cap is reached (06 §4.14). */
export type DispatchOutcome = 'dispatched' | 'conflict' | 'rate_limited';

export interface DispatchInstanceInput {
  instanceId: string;
  userId: string;
  runId: string;
  channel: Channel;
  priority: Priority;
  dispatchedAt: string;
  /** Local-day window (inclusive start, exclusive end) for cap counting. */
  dayStart: string;
  dayEnd: string;
  dailyCap: number;
}

export interface DispatchListQuery {
  userId?: string;
  limit: number;
  offset: number;
}

/**
 * Write-side outbox row (WP-024c, `021-outbox` `reminder_outbox` table).
 * Mirrors the canonical 16-column contract in `packages/events/src/outbox.ts`
 * for the columns a producer fills — `id` (uuid default), `status`,
 * `attempts`, `available_at`, `created_at`, `published_at`, `last_error` are
 * DB-managed.
 */
export interface OutboxEntry {
  eventId: string;
  eventType: string;
  producer: string;
  schemaVersion: number;
  /** ISO 8601. */
  occurredAt: string;
  aggregateType: string | null;
  aggregateId: string | null;
  idempotencyKey: string;
  payload: Record<string, unknown>;
}

/**
 * Provider-agnostic reminder store (M-08). WP-021 persists on the
 * migration-018 tables (`reminder_templates`, `reminder_instances`,
 * `reminder_dispatches`) via the Postgres adapter; the in-memory test-double
 * keeps unit/CI hermetic.
 *
 * FR-163 duplicate-run protection is enforced here: `dispatchInstance` claims
 * the instance (atomic `scheduled → dispatched` update guarded by the current
 * status) and inserts the dispatch row inside one transaction, where the
 * `UNIQUE(instance_id, run_id)` index rejects a second dispatch for the same
 * run. The per-user daily cap is counted from the dispatch log in that same
 * transaction (R5). `createInstance` enforces the partial-unique `dedupe_key`
 * (FR-048 readiness) by throwing ConflictError on a duplicate.
 */
export interface ReminderStore {
  createTemplate(input: CreateReminderTemplateInput): Promise<ReminderTemplate>;
  findTemplateByCode(code: string): Promise<ReminderTemplate | null>;
  findTemplateById(id: string): Promise<ReminderTemplate | null>;
  listActiveTemplates(): Promise<ReminderTemplate[]>;

  /** Raw `user_preferences.quiet_hours` JSONB value (FR-038), parsed to the
   *  app-layer shape when valid; null when absent or unparseable. */
  getUserQuietHours(userId: string): Promise<QuietHoursConfig | null>;

  /** Rendering language for a user (FR-047). Reads
   *  `user_preferences.language` (migration 004) — same read-only convention
   *  as quiet hours; defaults to `en` when absent. */
  getUserLanguage(userId: string): Promise<'en' | 'am'>;

  createInstance(input: CreateReminderInstanceInput): Promise<ReminderInstance>;
  findInstanceById(id: string): Promise<ReminderInstance | null>;
  findInstanceByDedupeKey(dedupeKey: string): Promise<ReminderInstance | null>;
  /** Due selection: `status='scheduled' AND due_at <= now`, oldest first. */
  selectDueInstances(nowIso: string, limit: number): Promise<ReminderInstance[]>;
  /** Mark `scheduled` instances whose due time is beyond the expiry cutoff as
   *  `expired` (never sent late). Returns the number of instances marked. */
  expireStaleInstances(cutoffIso: string): Promise<number>;
  setInstanceStatus(
    instanceId: string,
    status: ReminderStatus,
    fields?: { dispatchedAt?: string | null; lastError?: string | null },
  ): Promise<ReminderInstance | null>;

  /** Atomic claim + cap-count + dispatch insert (see contract docs). */
  dispatchInstance(input: DispatchInstanceInput): Promise<DispatchOutcome>;

  findDispatchById(id: string): Promise<ReminderDispatch | null>;
  findDispatchForInstanceRun(instanceId: string, runId: string): Promise<ReminderDispatch | null>;
  /** Acknowledge a dispatched send. WP-024c: `reminder.due` outbox rows are
   *  persisted atomically with the ack (D-03 — the event payload carries
   *  `providerRef`/`simulated`, which only exist after the channel send, so
   *  the ack TX is the last domain write before the publish at
   *  reminder-service.ts `#processInstance`). */
  ackDispatch(
    dispatchId: string,
    ackPayload: Record<string, unknown>,
    ackedAt: string,
    outbox?: OutboxEntry[],
  ): Promise<ReminderDispatch | null>;
  /** Mark a dispatch row and its instance `failed` (provider returned an error).
   *  The stub dispatcher never fails; reserved for real providers (Phase 4). */
  failDispatch(
    dispatchId: string,
    error: string,
    failedAt: string,
  ): Promise<ReminderDispatch | null>;
  listDispatches(query: DispatchListQuery): Promise<ReminderDispatch[]>;

  /** Store round-trip for the `/readyz` probe. Postgres executes `SELECT 1`. */
  ping(): Promise<boolean>;

  dispose(): Promise<void>;
}

export type { Channel, CreateReminderDispatchInput, Priority, QuietHoursConfig };
