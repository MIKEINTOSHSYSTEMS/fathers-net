export interface RateLimitResult {
  allowed: boolean;
  limit: number;
  remaining: number;
  /** Seconds until the caller may retry; 0 when the request was allowed. */
  retryAfterSeconds: number;
  /** Unix epoch seconds at which the window/tokens reset. */
  resetAtSeconds: number;
}

export interface RateLimitStore {
  consume(key: string, limit: number, windowSeconds: number): Promise<RateLimitResult>;
  dispose(): Promise<void>;
}
