import Redis from 'ioredis';
import { createJobRunStore } from '@fathersnet/idempotency';

import { JobRegistry } from '../src/jobs/registry';
import { createJobDlq } from '../src/scheduler/dlq';
import { createLeaderElector } from '../src/scheduler/leader';
import { SchedulerWorker } from '../src/scheduler/worker';

const REDIS_TEST_URL = process.env.REDIS_TEST_URL;
const describeRedis = REDIS_TEST_URL ? describe : describe.skip;

describeRedis('scheduler Redis integration', () => {
  let client: Redis;

  beforeAll(() => {
    client = new Redis(REDIS_TEST_URL as string);
  });

  afterAll(async () => {
    await client.quit();
  });

  afterEach(async () => {
    await client.flushall();
  });

  it('leader election: exactly one of two replicas acquires', async () => {
    const a = createLeaderElector({ driver: 'redis', redis: client, name: 'test' });
    const b = createLeaderElector({ driver: 'redis', redis: client, name: 'test' });
    const results = [await a.tryAcquire(), await b.tryAcquire()];
    expect(results.filter(Boolean)).toHaveLength(1);
    await a.release();
    await b.release();
  });

  it('leader election: the leader renews; a released lease is acquirable', async () => {
    const a = createLeaderElector({ driver: 'redis', redis: client, name: 'test', leaseMs: 5000 });
    const b = createLeaderElector({ driver: 'redis', redis: client, name: 'test', leaseMs: 5000 });
    await a.tryAcquire();
    await expect(a.isLeader()).resolves.toBe(true);
    await expect(a.renew()).resolves.toBeUndefined();
    await a.release();
    await expect(a.isLeader()).resolves.toBe(false);
    await expect(b.tryAcquire()).resolves.toBe(true);
    await b.release();
  });

  it('run-id binding: a duplicate firing across a worker restart is a no-op (FR-163 M2 evidence)', async () => {
    const registry = new JobRegistry();
    const runs: string[] = [];
    registry.register({
      name: 'sync',
      intervalSeconds: 60,
      run: async (ctx) => {
        runs.push(ctx.runId);
      },
    });
    const runStore = createJobRunStore({ driver: 'redis', redis: client, name: 'scheduler' });
    const dlq = createJobDlq({ driver: 'redis', redis: client, name: 'scheduler' });
    const leader = createLeaderElector({
      driver: 'redis',
      redis: client,
      name: 'scheduler',
      leaseMs: 5000,
    });
    const retry = { maxAttempts: 3, retryBaseMs: 10, retryMaxMs: 50, jitterFactor: 0 };

    const workerA = new SchedulerWorker({
      registry,
      runStore,
      leader,
      dlq,
      runTtlSeconds: 3600,
      tickIntervalMs: 1000,
      retry,
      nowMs: () => 60_000,
    });
    await workerA.runOnce();

    // Simulate a restart: new worker, same run slot, same run-id store.
    const workerB = new SchedulerWorker({
      registry,
      runStore,
      leader,
      dlq,
      runTtlSeconds: 3600,
      tickIntervalMs: 1000,
      retry,
      nowMs: () => 60_000,
    });
    const summary = await workerB.runOnce();

    expect(runs).toHaveLength(1);
    expect(summary).toMatchObject({ due: 1, started: 0, skipped: 1, failed: 0 });
    await runStore.dispose();
    await dlq.dispose();
  });

  it('worker dead-letters a persistently failing job to the Redis DLQ (12 §16 I-13)', async () => {
    const registry = new JobRegistry();
    registry.register({
      name: 'flaky',
      intervalSeconds: 60,
      run: async () => {
        throw new Error('boom');
      },
    });
    const runStore = createJobRunStore({ driver: 'redis', redis: client, name: 'scheduler' });
    const dlq = createJobDlq({ driver: 'redis', redis: client, name: 'scheduler' });
    const leader = createLeaderElector({
      driver: 'redis',
      redis: client,
      name: 'scheduler',
      leaseMs: 5000,
    });
    const worker = new SchedulerWorker({
      registry,
      runStore,
      leader,
      dlq,
      runTtlSeconds: 3600,
      tickIntervalMs: 1000,
      retry: { maxAttempts: 2, retryBaseMs: 10, retryMaxMs: 20, jitterFactor: 0 },
      nowMs: () => 120_000,
    });

    const summary = await worker.runOnce();
    expect(summary.failed).toBe(1);
    await expect(dlq.len()).resolves.toBe(1);
    const entries = await dlq.list();
    expect(entries[0]).toMatchObject({ job: 'flaky', attempts: 2, error: 'boom' });
    await runStore.dispose();
    await dlq.dispose();
  });
});
