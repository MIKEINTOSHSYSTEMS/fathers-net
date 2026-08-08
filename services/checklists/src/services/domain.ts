import type { ChecklistItem } from '../types';

/**
 * Checklist & budget domain helpers (WP-023, plan §7 — domain services own the
 * rules). Shared by the memory store and the Postgres adapter so both sides of
 * the M-08 boundary compute identical values.
 */

/** Checklist progress 0–100, rounded to 2 decimals. Empty checklist → 0. */
export function computeProgress(items: Pick<ChecklistItem, 'completed'>[]): number {
  if (items.length === 0) {
    return 0;
  }
  const completed = items.filter((i) => i.completed).length;
  return Math.round((completed / items.length) * 10000) / 100;
}

/** Round a money value to 2 decimal places (NUMERIC(12,2) fidelity). */
export function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

/** Today's local date as YYYY-MM-DD (default `entry_date`). */
export function todayIso(): string {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${now.getFullYear()}-${month}-${day}`;
}

/** Format a JS Date as YYYY-MM-DD using local components (node-postgres
 *  returns DATE columns as local-midnight Date objects). */
export function formatDate(value: Date): string {
  const month = String(value.getMonth() + 1).padStart(2, '0');
  const day = String(value.getDate()).padStart(2, '0');
  return `${value.getFullYear()}-${month}-${day}`;
}

/** ISO-8601 timestamp from a Postgres TIMESTAMPTZ column. */
export function isoFrom(value: Date | null): string | null {
  return value == null ? null : value.toISOString();
}
