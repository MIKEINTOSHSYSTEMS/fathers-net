import { RecurrenceRule } from '../types';

const MS_PER_WEEK = 7 * 24 * 60 * 60 * 1000;

/**
 * Validate an app-layer recurrence value (template `recurrence` JSONB).
 * Returns a normalized rule, or null when the value is absent. Malformed
 * weekly rules (non-positive interval / out-of-window end week) also yield
 * null so a bad template degrades to one-time instead of crashing the engine.
 */
export function parseRecurrence(value: unknown): RecurrenceRule | null {
  if (value === null || value === undefined) {
    return null;
  }
  if (typeof value !== 'object') {
    return null;
  }
  const candidate = value as Record<string, unknown>;
  if (candidate.type === 'one_time') {
    return { type: 'one_time' };
  }
  if (candidate.type === 'weekly') {
    const intervalWeeks = candidate.intervalWeeks;
    const endWeek = candidate.endWeek;
    if (
      typeof intervalWeeks === 'number' &&
      Number.isInteger(intervalWeeks) &&
      intervalWeeks > 0 &&
      typeof endWeek === 'number' &&
      Number.isInteger(endWeek) &&
      endWeek >= 1 &&
      endWeek <= 45
    ) {
      return { type: 'weekly', intervalWeeks, endWeek };
    }
  }
  return null;
}

export interface Occurrence {
  /** Pregnancy week this occurrence targets (1–45, FR-041); null for
   *  non-week-bound one-time reminders. */
  week: number | null;
  /** ISO due time for this occurrence. */
  dueAt: string;
}

/** A null or `one_time` rule is a single reminder (FR-044). */
export function isRecurring(rule: RecurrenceRule | null): boolean {
  return rule !== null && rule.type === 'weekly';
}

/**
 * Expand a recurrence rule into concrete occurrences (FR-044). One-time rules
 * yield a single occurrence at `startWeek`; weekly rules repeat every
 * `intervalWeeks` while the week stays within `min(endWeek, maxWeek)` (the
 * pregnancy window 1–45, FR-041). Each occurrence's due time is offset by the
 * number of weeks advanced from `startWeek`.
 */
export function expandOccurrences(
  rule: RecurrenceRule | null,
  startWeek: number,
  firstDueAtIso: string,
  maxWeek: number,
): Occurrence[] {
  const start = Math.max(1, Math.min(maxWeek, startWeek));
  if (rule === null || rule.type === 'one_time') {
    return [
      { week: startWeek >= 1 && startWeek <= maxWeek ? startWeek : null, dueAt: firstDueAtIso },
    ];
  }
  const endWeek = Math.min(rule.endWeek, maxWeek);
  const occurrences: Occurrence[] = [];
  for (let week = start; week <= endWeek; week += rule.intervalWeeks) {
    const weeksFromStart = week - start;
    occurrences.push({
      week,
      dueAt: new Date(Date.parse(firstDueAtIso) + weeksFromStart * MS_PER_WEEK).toISOString(),
    });
  }
  return occurrences;
}
