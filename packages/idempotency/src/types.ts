export type StoreDriver = 'memory' | 'redis';

/**
 * Consumer dedup store (FR-161, 06 §2.3 item 3). Each consumer claims the
 * event `id` before processing; a duplicate bus delivery finds the id already
 * claimed and becomes a no-op. State is scoped per consumer via the store
 * `name` so independent consumers of the same event do not collide.
 */
export interface ConsumerDedupStore {
  /**
   * Atomically claim an id for processing. Returns `false` when the id was
   * already claimed/processed within the TTL window (a duplicate delivery).
   */
  claim(id: string, ttlSeconds: number): Promise<boolean>;
  /** `true` when the id was already claimed/processed (replay check). */
  isProcessed(id: string): Promise<boolean>;
  dispose(): Promise<void>;
}

/**
 * Scheduler run-id binding (FR-163, 06 §2.3 item 4). Claiming the same run id
 * twice returns `false`, so a job that fires twice (e.g. after leader
 * re-election) performs no duplicate work.
 */
export interface JobRunStore {
  claimRun(runId: string, ttlSeconds: number): Promise<boolean>;
  dispose(): Promise<void>;
}
