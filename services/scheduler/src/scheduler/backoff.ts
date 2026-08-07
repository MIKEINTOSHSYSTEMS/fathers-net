/**
 * Exponential backoff with jitter for job retries (03 §5.4). Mirrors the
 * `backoffMs` export of `@fathersnet/events` (single source of truth is the
 * outbox relay); kept local here so the scheduler service does not depend on
 * the events package for a pure math helper.
 */
export function backoffMs(
  attempts: number,
  baseMs: number,
  maxMs: number,
  jitterFactor: number,
): number {
  const exponent = Math.max(0, attempts - 1);
  const raw = baseMs * 2 ** exponent;
  const capped = Math.min(raw, maxMs);
  const jitter = jitterFactor * capped * (Math.random() - 0.5);
  return Math.max(0, Math.round(capped + jitter));
}
