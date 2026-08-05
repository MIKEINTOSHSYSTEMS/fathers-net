export interface StoredIdempotencyResult {
  statusCode: number;
  headers: Record<string, string>;
  body: string;
}

export interface IdempotencyStore {
  /**
   * Atomically claim the idempotency slot for a key. Returns true when this
   * caller owns the slot (first request); false when another request already
   * claimed it.
   */
  claim(key: string, ttlSeconds: number): Promise<boolean>;
  /** Completed response for the key, or null when pending/absent. */
  get(key: string): Promise<StoredIdempotencyResult | null>;
  save(key: string, result: StoredIdempotencyResult, ttlSeconds: number): Promise<void>;
  /** Release the slot so a failed request can be retried. */
  delete(key: string): Promise<void>;
  dispose(): Promise<void>;
}
