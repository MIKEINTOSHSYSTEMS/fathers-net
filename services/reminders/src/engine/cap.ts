const MINUTES_PER_DAY = 24 * 60;
const MS_PER_MINUTE = 60000;
const MS_PER_DAY = MINUTES_PER_DAY * MS_PER_MINUTE;

/**
 * Per-user daily outbound cap (06 §4.14). `countSoFar` is the number of
 * dispatches already recorded for the user on the current Addis day; the cap is
 * inclusive — a count equal to the cap blocks the next dispatch.
 */
export function withinDailyCap(countSoFar: number, dailyCap: number): boolean {
  return countSoFar < dailyCap;
}

export interface DayWindow {
  /** ISO 8601 start (inclusive) of the local day for `nowMs`. */
  startIso: string;
  /** ISO 8601 end (exclusive) of the local day for `nowMs`. */
  endIso: string;
}

/**
 * Compute the inclusive/exclusive bounds of the current day in the service
 * timezone. Ethiopia uses a fixed UTC+3 offset with no DST, so a wall-clock
 * shift is all that is needed (R5/R9).
 */
export function dayWindow(nowMs: number, tzOffsetMinutes: number): DayWindow {
  const shifted = nowMs + tzOffsetMinutes * MS_PER_MINUTE;
  const localDayStart = Math.floor(shifted / MS_PER_DAY) * MS_PER_DAY;
  const startMs = localDayStart - tzOffsetMinutes * MS_PER_MINUTE;
  return {
    startIso: new Date(startMs).toISOString(),
    endIso: new Date(startMs + MS_PER_DAY).toISOString(),
  };
}
