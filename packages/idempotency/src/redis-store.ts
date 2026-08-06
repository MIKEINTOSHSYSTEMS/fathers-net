import type Redis from 'ioredis';

import type { ConsumerDedupStore } from './types';

/**
 * Redis-backed consumer dedup store (FR-161). `SET ... NX PX` is atomic, so
 * concurrent redeliveries of the same event cannot double-process. Keyed per
 * consumer name to isolate independent consumers (06 §2.3).
 */
export class RedisConsumerDedupStore implements ConsumerDedupStore {
  private readonly prefix: string;

  constructor(
    private readonly client: Redis,
    name = 'default',
  ) {
    this.prefix = `consumer-dedup:${name}:`;
  }

  async claim(id: string, ttlSeconds: number): Promise<boolean> {
    const result = await this.client.set(this.prefix + id, '1', 'PX', ttlSeconds * 1000, 'NX');
    return result === 'OK';
  }

  async isProcessed(id: string): Promise<boolean> {
    return (await this.client.exists(this.prefix + id)) === 1;
  }

  async dispose(): Promise<void> {
    // The Redis client is owned by the caller, not the store.
  }
}
