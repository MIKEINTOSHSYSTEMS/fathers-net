/**
 * WP-021 reminder domain types. These mirror the migration-018 schema
 * (`reminder_templates`, `reminder_instances`, `reminder_dispatches`) plus the
 * app-layer JSONB shapes for quiet hours (FR-043) and recurrence (FR-044) that
 * are validated here, not in the database (same convention as
 * `user_preferences.quiet_hours`, migration 004).
 */

/** Outbound channels. WhatsApp is the only Phase-2 channel (SRS §9, FR-045). */
export type Channel = 'whatsapp';

/** Template/instance priority. `critical` bypasses quiet hours (FR-046). */
export type Priority = 'normal' | 'critical';

/**
 * Materialized instance lifecycle (migration 018 CHECK). `scheduled` is the
 * due-selection target; the dispatch job moves instances to `dispatched` on a
 * successful send, `skipped_quiet_hours` when the Addis night window applies
 * to a normal reminder, `rate_limited` when the per-user daily cap is reached
 * (06 §4.14), `failed` on render/dispatch errors, and `expired` when a
 * scheduled instance is older than the expiry window (never sent late).
 */
export type ReminderStatus =
  'scheduled' | 'dispatched' | 'skipped_quiet_hours' | 'rate_limited' | 'failed' | 'expired';

/** Append-only dispatch/ack log lifecycle (migration 018 CHECK). */
export type DispatchStatus = 'dispatched' | 'acked' | 'failed';

/**
 * Quiet-hours config (FR-029, FR-043). Free-form JSONB in the DB; this is the
 * shape the application layer reads and validates. `start`/`end` are 24h
 * `HH:MM` in the service timezone (UTC+3 — Ethiopia has no DST).
 */
export interface QuietHoursConfig {
  enabled: boolean;
  start: string;
  end: string;
}

/**
 * Recurrence rule (FR-044). Free-form JSONB in the DB; validated here.
 * `null` or `{ type: 'one_time' }` = single reminder; a weekly rule repeats
 * every `intervalWeeks` up to `endWeek` (bounded by the 1–45 pregnancy
 * window, FR-041).
 */
export type RecurrenceRule =
  { type: 'one_time' } | { type: 'weekly'; intervalWeeks: number; endWeek: number };

/** Reminder template library row (migration 018, FR-044/FR-047). */
export interface ReminderTemplate {
  id: string;
  code: string;
  channel: Channel;
  priority: Priority;
  titleEn: string;
  titleAm: string;
  bodyEn: string;
  bodyAm: string;
  leadTimeMinutes: number | null;
  quietHours: QuietHoursConfig | null;
  recurrence: RecurrenceRule | null;
  pregnancyWeek: number | null;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CreateReminderTemplateInput {
  code: string;
  channel: Channel;
  priority: Priority;
  titleEn: string;
  titleAm: string;
  bodyEn: string;
  bodyAm: string;
  leadTimeMinutes?: number | null;
  quietHours?: QuietHoursConfig | null;
  recurrence?: RecurrenceRule | null;
  pregnancyWeek?: number | null;
  active?: boolean;
}

/** Materialized per-user scheduled instance (migration 018). */
export interface ReminderInstance {
  id: string;
  templateId: string;
  userId: string;
  dueAt: string;
  status: ReminderStatus;
  priority: Priority;
  channel: Channel;
  dedupeKey: string | null;
  dispatchedAt: string | null;
  acknowledgedAt: string | null;
  lastError: string | null;
  createdAt: string;
}

export interface CreateReminderInstanceInput {
  templateId: string;
  userId: string;
  dueAt: string;
  priority: Priority;
  channel: Channel;
  dedupeKey: string | null;
}

/** Append-only dispatch/ack log row (migration 018, FR-045, FR-163). */
export interface ReminderDispatch {
  id: string;
  instanceId: string;
  userId: string;
  runId: string;
  channel: Channel;
  priority: Priority;
  status: DispatchStatus;
  dispatchedAt: string;
  ackReceivedAt: string | null;
  ackPayload: Record<string, unknown> | null;
  lastError: string | null;
  createdAt: string;
}

export interface CreateReminderDispatchInput {
  instanceId: string;
  userId: string;
  runId: string;
  channel: Channel;
  priority: Priority;
  dispatchedAt: string;
}
