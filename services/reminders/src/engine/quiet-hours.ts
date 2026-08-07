import type { QuietHoursConfig } from '../types';

const MINUTES_PER_DAY = 24 * 60;
const TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/;

/** Parse `HH:MM` into minutes since local midnight. Throws on malformed input. */
export function parseTimeOfDay(value: string): number {
  const match = TIME_PATTERN.exec(value);
  if (!match) {
    throw new RangeError(`Invalid quiet-hours time '${value}'. Expected 24h HH:MM.`);
  }
  return Number(match[1]) * 60 + Number(match[2]);
}

function isValidQuietHours(config: QuietHoursConfig): boolean {
  if (typeof config.enabled !== 'boolean') {
    return false;
  }
  if (!TIME_PATTERN.test(config.start) || !TIME_PATTERN.test(config.end)) {
    return false;
  }
  return true;
}

/**
 * Validate an app-layer quiet-hours value (from `user_preferences.quiet_hours`
 * or a template). Returns a normalized config, or null when the value is
 * absent/unparseable (absent user pref = fall back; malformed = fall back and
 * log at the caller).
 */
export function parseQuietHours(value: unknown): QuietHoursConfig | null {
  if (typeof value !== 'object' || value === null) {
    return null;
  }
  const candidate = value as Record<string, unknown>;
  if (typeof candidate.start !== 'string' || typeof candidate.end !== 'string') {
    return null;
  }
  const enabled = candidate.enabled === undefined ? true : Boolean(candidate.enabled);
  const config: QuietHoursConfig = { enabled, start: candidate.start, end: candidate.end };
  return isValidQuietHours(config) ? config : null;
}

/**
 * Resolve the effective quiet-hours config for an instance: per-user
 * preference wins (FR-038), then per-template config (FR-043), then service
 * defaults. A user/template value may disable quiet hours explicitly.
 */
export function quietHoursFor(
  userConfig: QuietHoursConfig | null,
  templateConfig: QuietHoursConfig | null,
  defaults: QuietHoursConfig,
): QuietHoursConfig {
  return userConfig ?? templateConfig ?? defaults;
}

/**
 * Is `dateIso` inside the quiet-hours window for the configured timezone?
 * Window semantics: `[start, end)` — the end minute itself is outside.
 * Wraparound windows (end < start, e.g. 21:00–07:00) span local midnight.
 * A disabled window or start === end is never "in quiet hours".
 */
export function isInQuietHours(
  dateIso: string,
  config: QuietHoursConfig,
  tzOffsetMinutes: number,
): boolean {
  if (!config.enabled) {
    return false;
  }
  const start = parseTimeOfDay(config.start);
  const end = parseTimeOfDay(config.end);
  if (start === end) {
    return false;
  }
  const date = new Date(dateIso);
  const localMinutes =
    (((Math.floor(date.getTime() / 60000) + tzOffsetMinutes) % MINUTES_PER_DAY) + MINUTES_PER_DAY) %
    MINUTES_PER_DAY;

  if (start < end) {
    return localMinutes >= start && localMinutes < end;
  }
  // Overnight window: inside from start → 23:59, or 00:00 → end.
  return localMinutes >= start || localMinutes < end;
}
