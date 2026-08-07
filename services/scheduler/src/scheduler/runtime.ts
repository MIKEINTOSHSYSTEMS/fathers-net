import { createJobRunStore, type JobRunStore } from '@fathersnet/idempotency';
import type { Logger } from '@fathersnet/logger';

import type { SchedulerConfig } from '../config';
import { JobRegistry } from '../jobs/registry';
import type { JobDefinition } from '../jobs/types';
import type { JobDlq } from './dlq';
import { createJobDlq } from './dlq';
import type { LeaderElector } from './leader';
import { createLeaderElector } from './leader';
import { SchedulerWorker } from './worker';
import { createRedisClient } from '../services/redis';

export interface SchedulerRuntimeOptions {
  config: SchedulerConfig;
  logger: Logger;
  /** Job definitions registered at boot (WP-021 registers its jobs here). */
  jobs?: readonly JobDefinition[];
  registry?: JobRegistry;
  /** Test seams — injected doubles keep unit tests hermetic (M-08). */
  runStore?: JobRunStore;
  leader?: LeaderElector;
  dlq?: JobDlq;
  nowMs?: () => number;
}

export interface SchedulerRuntime {
  registry: JobRegistry;
  worker: SchedulerWorker;
  leader: LeaderElector;
  dlq: JobDlq;
  start(): Promise<void>;
  stop(): Promise<void>;
}

/**
 * Assemble the scheduler runtime from config + optional test seams. Pure — no
 * sockets are opened until `start()` is called. Redis-backed in production;
 * memory driver keeps dev/CI hermetic (M-08).
 */
export function createSchedulerRuntime(options: SchedulerRuntimeOptions): SchedulerRuntime {
  const { config, logger } = options;
  const registry = options.registry ?? new JobRegistry();
  for (const job of options.jobs ?? []) {
    registry.register(job);
  }

  const useRedis = config.FN_SCHEDULER_DRIVER === 'redis';
  const redis = useRedis ? createRedisClient(config.FN_REDIS_URL) : null;

  const runStore =
    options.runStore ??
    createJobRunStore({
      driver: config.FN_SCHEDULER_DRIVER,
      ...(redis ? { redis } : {}),
      name: 'scheduler',
    });
  const leader =
    options.leader ??
    createLeaderElector({
      driver: config.FN_SCHEDULER_DRIVER,
      ...(redis ? { redis } : {}),
      name: 'scheduler',
      leaseMs: config.FN_SCHEDULER_LEADER_LEASE_MS,
    });
  const dlq =
    options.dlq ??
    createJobDlq({
      driver: config.FN_SCHEDULER_DRIVER,
      ...(redis ? { redis } : {}),
      name: 'scheduler',
    });

  const worker = new SchedulerWorker({
    registry,
    runStore,
    leader,
    dlq,
    logger,
    runTtlSeconds: config.FN_SCHEDULER_RUN_TTL_SECONDS,
    tickIntervalMs: config.FN_SCHEDULER_TICK_MS,
    retry: {
      maxAttempts: config.FN_SCHEDULER_RETRY_ATTEMPTS,
      retryBaseMs: config.FN_SCHEDULER_RETRY_BASE_MS,
      retryMaxMs: config.FN_SCHEDULER_RETRY_MAX_MS,
      jitterFactor: config.FN_SCHEDULER_RETRY_JITTER,
    },
    nowMs: options.nowMs,
  });

  return {
    registry,
    worker,
    leader,
    dlq,
    async start(): Promise<void> {
      await leader.tryAcquire();
      worker.start();
      logger.info('scheduler.started', 'Scheduler runtime started', {
        driver: config.FN_SCHEDULER_DRIVER,
        jobs: registry.size,
      });
    },
    async stop(): Promise<void> {
      await worker.stop();
      await leader.release();
      await redis?.quit();
    },
  };
}
