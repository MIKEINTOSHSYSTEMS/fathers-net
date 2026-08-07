/**
 * Job model (WP-024b; milestone-2 §5.3, FR-163). A job is a named, interval
 * -driven unit of work executed by the worker. Run slots are deterministic:
 * the wall-clock time is sliced into fixed `intervalSeconds` windows and the
 * run id encodes the slot start (`<job.name>:<slot-start-ms>`), so any number
 * of scheduler replicas racing to fire the same slot claim the same run id —
 * and the run-id store lets exactly one win (FR-163, `06` §2.3 item 4).
 */

export interface JobRunContext {
  /** Deterministic run id: `<job.name>:<slot-start-ms>` (FR-163 run-id binding). */
  runId: string;
  /** ISO 8601 UTC start of the run slot. */
  scheduledFor: string;
  /** 1-based attempt number within this run (retry handling). */
  attempt: number;
}

export interface JobDefinition {
  /** Unique job name (registry key). */
  name: string;
  /** Interval between run slots, in whole seconds (> 0). */
  intervalSeconds: number;
  /**
   * Execute one run slot. Throw to trigger the retry/DLQ path: the worker
   * retries up to the configured max attempts with exponential backoff, then
   * moves the run to the dead-letter queue.
   */
  run(ctx: JobRunContext): Promise<void>;
}

export class SchedulerError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SchedulerError';
  }
}

/** Wall-clock slot start for `nowMs` under the given interval (UTC ms). */
export function runSlotStartMs(nowMs: number, intervalSeconds: number): number {
  const intervalMs = intervalSeconds * 1000;
  return Math.floor(nowMs / intervalMs) * intervalMs;
}

/** Deterministic run id for a job + slot — the FR-163 idempotency key. */
export function runIdFor(jobName: string, slotStartMs: number): string {
  return `${jobName}:${slotStartMs}`;
}
