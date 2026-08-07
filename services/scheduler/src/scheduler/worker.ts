import type { JobRunStore } from '@fathersnet/idempotency';
import type { Logger } from '@fathersnet/logger';

import { runIdFor, runSlotStartMs, type JobDefinition, type JobRunContext } from '../jobs/types';
import { backoffMs } from './backoff';
import type { JobDlq } from './dlq';
import type { LeaderElector } from './leader';

export interface RetryPolicy {
  maxAttempts: number;
  retryBaseMs: number;
  retryMaxMs: number;
  jitterFactor: number;
}

export interface WorkerOptions {
  registry: { list(): readonly JobDefinition[] };
  runStore: JobRunStore;
  leader: LeaderElector;
  dlq: JobDlq;
  logger?: Logger;
  /** Window during which a run id cannot be re-claimed (FR-163). */
  runTtlSeconds: number;
  /** Background tick cadence (only used by `start`). */
  tickIntervalMs: number;
  retry: RetryPolicy;
  /** Injectable clock for deterministic slot tests. */
  nowMs?: () => number;
}

export interface WorkerRunSummary {
  /** `false` when this replica is not the leader (no work attempted). */
  leader: boolean;
  /** Job slots that reached their scheduled time this tick. */
  due: number;
  /** Slots executed to success. */
  started: number;
  /** Slots whose run id was already claimed (duplicate firing → no-op). */
  skipped: number;
  /** Slots that exhausted retries and were moved to the DLQ. */
  failed: number;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Worker execution framework (WP-024b). One replica is the leader (see
 * `LeaderElector`); the leader ticks the registry, slices time into run slots,
 * and for each due slot claims the deterministic run id through the run-id
 * store (`@fathersnet/idempotency`, FR-163). A claim failure means another
 * replica already fired the slot → skip. The handler runs with a bounded retry
 * policy (exponential backoff + jitter); after max attempts the run is
 * dead-lettered (12 §16 I-13).
 */
export class SchedulerWorker {
  private readonly registry: WorkerOptions['registry'];
  private readonly runStore: JobRunStore;
  private readonly leader: LeaderElector;
  private readonly dlq: JobDlq;
  private readonly logger?: Logger;
  private readonly runTtlSeconds: number;
  private readonly tickIntervalMs: number;
  private readonly retry: RetryPolicy;
  private readonly nowMs: () => number;
  private readonly lastFiredAt = new Map<string, number>();
  private running = false;
  private timer: NodeJS.Timeout | null = null;

  constructor(options: WorkerOptions) {
    this.registry = options.registry;
    this.runStore = options.runStore;
    this.leader = options.leader;
    this.dlq = options.dlq;
    this.logger = options.logger;
    this.runTtlSeconds = options.runTtlSeconds;
    this.tickIntervalMs = options.tickIntervalMs;
    this.retry = options.retry;
    this.nowMs = options.nowMs ?? Date.now;
  }

  /** One tick: re-acquire/renew leadership, then fire every due slot once. */
  async runOnce(nowMs = this.nowMs()): Promise<WorkerRunSummary> {
    const summary: WorkerRunSummary = { leader: true, due: 0, started: 0, skipped: 0, failed: 0 };

    if (!(await this.leader.isLeader())) {
      const acquired = await this.leader.tryAcquire();
      if (!acquired) {
        summary.leader = false;
        return summary;
      }
    } else {
      try {
        await this.leader.renew();
      } catch (err) {
        this.logger?.warn('scheduler.leader.lost', 'Leader lease lost; awaiting re-election', {
          error: err instanceof Error ? err.message : String(err),
        });
        summary.leader = false;
        return summary;
      }
    }

    for (const job of this.registry.list()) {
      const slotStart = runSlotStartMs(nowMs, job.intervalSeconds);
      const lastFired = this.lastFiredAt.get(job.name) ?? -1;
      if (lastFired >= slotStart) {
        continue;
      }

      summary.due += 1;
      const runId = runIdFor(job.name, slotStart);
      const claimed = await this.runStore.claimRun(runId, this.runTtlSeconds);
      this.lastFiredAt.set(job.name, slotStart);
      if (!claimed) {
        summary.skipped += 1;
        continue;
      }

      const scheduledFor = new Date(slotStart).toISOString();
      const ok = await this.executeJob(job, { runId, scheduledFor });
      if (ok) {
        summary.started += 1;
      } else {
        summary.failed += 1;
      }
    }

    return summary;
  }

  private async executeJob(
    job: JobDefinition,
    base: { runId: string; scheduledFor: string },
  ): Promise<boolean> {
    let lastError: unknown;
    for (let attempt = 1; attempt <= this.retry.maxAttempts; attempt += 1) {
      const ctx: JobRunContext = { ...base, attempt };
      try {
        await job.run(ctx);
        return true;
      } catch (err) {
        lastError = err;
        if (attempt < this.retry.maxAttempts) {
          await sleep(
            backoffMs(
              attempt,
              this.retry.retryBaseMs,
              this.retry.retryMaxMs,
              this.retry.jitterFactor,
            ),
          );
        }
      }
    }
    const error = lastError instanceof Error ? lastError : new Error(String(lastError));
    await this.dlq.push({
      job: job.name,
      runId: base.runId,
      scheduledFor: base.scheduledFor,
      attempts: this.retry.maxAttempts,
      error: error.message,
      failedAt: new Date().toISOString(),
    });
    this.logger?.error(
      'scheduler.job.dead',
      `Job '${job.name}' dead-lettered after ${this.retry.maxAttempts} attempts`,
      {
        job: job.name,
        run_id: base.runId,
        error: error.message,
      },
    );
    return false;
  }

  /** Background polling loop. `runOnce` remains the primary testable path. */
  start(): void {
    if (this.running) {
      return;
    }
    this.running = true;
    const tick = async (): Promise<void> => {
      if (!this.running) {
        return;
      }
      try {
        await this.runOnce();
      } catch (err) {
        this.logger?.error('scheduler.tick.failed', 'Scheduler tick failed', {
          error: err instanceof Error ? err.message : String(err),
        });
      }
      if (this.running) {
        this.timer = setTimeout(tick, this.tickIntervalMs);
        this.timer.unref?.();
      }
    };
    void tick();
  }

  async stop(): Promise<void> {
    this.running = false;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }
}
