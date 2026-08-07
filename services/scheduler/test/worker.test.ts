import { createJobRunStore, type JobRunStore } from '@fathersnet/idempotency';

import { JobRegistry } from '../src/jobs/registry';
import { runIdFor, runSlotStartMs, SchedulerError } from '../src/jobs/types';
import { createMemoryJobDlq, type JobDlq } from '../src/scheduler/dlq';
import type { LeaderElector } from '../src/scheduler/leader';
import { SchedulerWorker, type RetryPolicy } from '../src/scheduler/worker';

function fakeLeader(leading: boolean): LeaderElector {
  return {
    tryAcquire: async () => leading,
    renew: async () => {
      if (!leading) {
        throw new SchedulerError('Leader lease was lost.');
      }
    },
    isLeader: async () => leading,
    release: async () => {},
    dispose: async () => {},
  };
}

const RETRY: RetryPolicy = { maxAttempts: 3, retryBaseMs: 10, retryMaxMs: 50, jitterFactor: 0 };

interface Harness {
  registry: JobRegistry;
  runStore: JobRunStore;
  dlq: JobDlq;
  worker: SchedulerWorker;
}

function harness(
  nowMs: () => number,
  leading = true,
  runStore: JobRunStore = createJobRunStore({ driver: 'memory', name: 'scheduler' }),
): Harness {
  const registry = new JobRegistry();
  const dlq = createMemoryJobDlq();
  const worker = new SchedulerWorker({
    registry,
    runStore,
    leader: fakeLeader(leading),
    dlq,
    runTtlSeconds: 3600,
    tickIntervalMs: 1000,
    retry: RETRY,
    nowMs,
  });
  return { registry, runStore, dlq, worker };
}

describe('scheduler worker (WP-024b)', () => {
  it('does nothing when not the leader', async () => {
    const { registry, worker } = harness(() => 60_000, false);
    let ran = 0;
    registry.register({
      name: 'sync',
      intervalSeconds: 60,
      run: async () => {
        ran += 1;
      },
    });
    const summary = await worker.runOnce();
    expect(summary).toEqual({ leader: false, due: 0, started: 0, skipped: 0, failed: 0 });
    expect(ran).toBe(0);
  });

  it('fires a due slot exactly once with the deterministic run id', async () => {
    const { registry, worker } = harness(() => 60_000);
    const runs: string[] = [];
    registry.register({
      name: 'sync',
      intervalSeconds: 60,
      run: async (ctx) => {
        runs.push(ctx.runId);
        expect(ctx.attempt).toBe(1);
        expect(ctx.scheduledFor).toBe(new Date(60_000).toISOString());
      },
    });
    const summary = await worker.runOnce();
    expect(summary).toEqual({ leader: true, due: 1, started: 1, skipped: 0, failed: 0 });
    expect(runs).toEqual(['sync:60000']);
  });

  it('does not re-fire the same slot within its window', async () => {
    const now = () => 60_000;
    const { registry, worker } = harness(now);
    let ran = 0;
    registry.register({
      name: 'sync',
      intervalSeconds: 60,
      run: async () => {
        ran += 1;
      },
    });
    await worker.runOnce();
    await worker.runOnce(61_000);
    await worker.runOnce(119_000);
    expect(ran).toBe(1);
  });

  it('fires the next slot when the window advances', async () => {
    const { registry, worker } = harness(() => 60_000);
    const runs: string[] = [];
    registry.register({
      name: 'sync',
      intervalSeconds: 60,
      run: async (ctx) => {
        runs.push(ctx.runId);
      },
    });
    await worker.runOnce();
    await worker.runOnce(120_000);
    expect(runs).toEqual(['sync:60000', 'sync:120000']);
  });

  it('skips a slot whose run id was already claimed (FR-163 no-duplicates)', async () => {
    const { registry, runStore, worker } = harness(() => 60_000);
    let ran = 0;
    registry.register({
      name: 'sync',
      intervalSeconds: 60,
      run: async () => {
        ran += 1;
      },
    });
    await runStore.claimRun(runIdFor('sync', runSlotStartMs(60_000, 60)), 3600);
    const summary = await worker.runOnce();
    expect(summary).toEqual({ leader: true, due: 1, started: 0, skipped: 1, failed: 0 });
    expect(ran).toBe(0);
  });

  it('retries a failing handler up to max attempts then dead-letters it', async () => {
    const { registry, worker, dlq } = harness(() => 60_000);
    let attempts = 0;
    registry.register({
      name: 'flaky',
      intervalSeconds: 60,
      run: async () => {
        attempts += 1;
        throw new Error('boom');
      },
    });
    const summary = await worker.runOnce();
    expect(attempts).toBe(RETRY.maxAttempts);
    expect(summary).toEqual({ leader: true, due: 1, started: 0, skipped: 0, failed: 1 });
    await expect(dlq.len()).resolves.toBe(1);
    const entries = await dlq.list();
    expect(entries[0]).toMatchObject({
      job: 'flaky',
      runId: 'flaky:60000',
      attempts: RETRY.maxAttempts,
      error: 'boom',
    });
  });

  it('succeeds when the handler recovers on a later attempt', async () => {
    const { registry, worker, dlq } = harness(() => 60_000);
    let attempts = 0;
    registry.register({
      name: 'recover',
      intervalSeconds: 60,
      run: async () => {
        attempts += 1;
        if (attempts < 2) {
          throw new Error('transient');
        }
      },
    });
    const summary = await worker.runOnce();
    expect(attempts).toBe(2);
    expect(summary.started).toBe(1);
    await expect(dlq.len()).resolves.toBe(0);
  });

  it('runs multiple jobs independently in one tick', async () => {
    const { registry, worker } = harness(() => 60_000);
    const ran = new Set<string>();
    registry.register({
      name: 'a',
      intervalSeconds: 60,
      run: async () => {
        ran.add('a');
      },
    });
    registry.register({
      name: 'b',
      intervalSeconds: 30,
      run: async () => {
        ran.add('b');
      },
    });
    const summary = await worker.runOnce();
    expect(summary.due).toBe(2);
    expect(summary.started).toBe(2);
    expect([...ran].sort()).toEqual(['a', 'b']);
  });
});
