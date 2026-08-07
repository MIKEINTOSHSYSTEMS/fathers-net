const MS_PER_MINUTE = 60000;

/**
 * Lead time (FR-043): a reminder should reach the parent `leadTimeMinutes`
 * before the event. Returns the ISO due time for the instance.
 */
export function applyLeadTime(eventAtIso: string, leadTimeMinutes: number | null): string {
  if (leadTimeMinutes == null || leadTimeMinutes <= 0) {
    return eventAtIso;
  }
  return new Date(Date.parse(eventAtIso) - leadTimeMinutes * MS_PER_MINUTE).toISOString();
}

/** The due window is open when the instance `due_at` has been reached. */
export function dispatchWindowOpen(dueAtIso: string, nowMs: number): boolean {
  return Date.parse(dueAtIso) <= nowMs;
}

/**
 * A scheduled instance that has waited longer than `expiryMinutes` past its
 * due time is `expired` — the reminder is never sent late.
 */
export function isExpired(dueAtIso: string, nowMs: number, expiryMinutes: number): boolean {
  return nowMs - Date.parse(dueAtIso) > expiryMinutes * MS_PER_MINUTE;
}
