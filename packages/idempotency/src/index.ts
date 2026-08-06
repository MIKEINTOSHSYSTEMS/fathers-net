/**
 * @fathersnet/idempotency — consumer dedup + scheduler run-id idempotency
 * primitives (FR-161, FR-163; 06 §2.3). The gateway's API-write idempotency
 * store stays in the gateway; this package owns the event-consumer and
 * job-run primitives shared across services.
 */

import type Redis from 'ioredis';

import type { ConsumerDedupStore, JobRunStore, StoreDriver } from './types';
import { createMemoryConsumerDedupStore } from './memory-store';
import { RedisConsumerDedupStore } from './redis-store';

export type { ConsumerDedupStore, JobRunStore, StoreDriver } from './types';

export interface ConsumerDedupStoreOptions {
  driver: StoreDriver;
  redis?: Redis;
  /** Consumer identity — isolates dedup state between independent consumers. */
  name?: string;
}

export function createConsumerDedupStore(options: ConsumerDedupStoreOptions): ConsumerDedupStore {
  if (options.driver === 'redis' && options.redis) {
    return new RedisConsumerDedupStore(options.redis, options.name ?? 'default');
  }
  return createMemoryConsumerDedupStore(options.name ?? 'default');
}

export interface JobRunStoreOptions {
  driver: StoreDriver;
  redis?: Redis;
  name?: string;
}

export function createJobRunStore(options: JobRunStoreOptions): JobRunStore {
  const dedup = createConsumerDedupStore({
    ...options,
    name: options.name ?? 'scheduler',
  });
  return {
    async claimRun(runId: string, ttlSeconds: number): Promise<boolean> {
      return dedup.claim(runId, ttlSeconds);
    },
    async dispose(): Promise<void> {
      await dedup.dispose();
    },
  };
}
