import { randomUUID } from 'node:crypto';

import type Redis from 'ioredis';

import { SchedulerError } from '../jobs/types';

export type SchedulerDriver = 'memory' | 'redis';

/**
 * Leader election (WP-024b; milestone-2 §5.3). Exactly one scheduler replica
 * may drive the worker at a time; the Redis lease (SET NX PX) makes the
 * election atomic, and the worker renews the lease on every tick. A crashed
 * leader's lease expires and another replica takes over — split-brain is
 * further neutralised by run-id binding (FR-163), which makes a duplicate
 * firing a no-op regardless of how many leaders tick the same slot.
 *
 * M-08: the contract is provider-agnostic; the Redis adapter is the pilot, the
 * in-memory double keeps dev/CI hermetic.
 */
export interface LeaderElector {
  /** Attempt to become the leader for the lease window. `false` if another replica holds it. */
  tryAcquire(): Promise<boolean>;
  /** Extend the lease. Throws if this instance is no longer the leader. */
  renew(): Promise<void>;
  /** `true` while this instance still holds the lease. */
  isLeader(): Promise<boolean>;
  /** Relinquish the lease (graceful shutdown). */
  release(): Promise<void>;
  dispose(): Promise<void>;
}

export interface LeaderElectorOptions {
  driver: SchedulerDriver;
  redis?: Redis;
  /** Election scope — isolates independent schedulers sharing one Redis. */
  name?: string;
  leaseMs?: number;
}

const RENEW_SCRIPT = `
if redis.call('get', KEYS[1]) == ARGV[1] then
  return redis.call('pexpire', KEYS[1], ARGV[2])
else
  return 0
end`;

const RELEASE_SCRIPT = `
if redis.call('get', KEYS[1]) == ARGV[1] then
  return redis.call('del', KEYS[1])
else
  return 0
end`;

export class RedisLeaderElector implements LeaderElector {
  private readonly key: string;
  private readonly token: string;
  private readonly leaseMs: number;
  private leading = false;

  constructor(
    private readonly client: Redis,
    name = 'scheduler',
    leaseMs = 10_000,
  ) {
    this.key = `scheduler:leader:${name}`;
    this.token = randomUUID();
    this.leaseMs = leaseMs;
  }

  async tryAcquire(): Promise<boolean> {
    const result = await this.client.set(this.key, this.token, 'PX', this.leaseMs, 'NX');
    this.leading = result === 'OK';
    return this.leading;
  }

  async renew(): Promise<void> {
    if (!this.leading) {
      return;
    }
    const result = await this.client.eval(RENEW_SCRIPT, 1, this.key, this.token, this.leaseMs);
    if (result !== 1) {
      this.leading = false;
      throw new SchedulerError(`Leader lease for '${this.key}' was lost.`);
    }
  }

  async isLeader(): Promise<boolean> {
    if (!this.leading) {
      return false;
    }
    const current = await this.client.get(this.key);
    this.leading = current === this.token;
    return this.leading;
  }

  async release(): Promise<void> {
    if (this.leading) {
      await this.client.eval(RELEASE_SCRIPT, 1, this.key, this.token);
      this.leading = false;
    }
  }

  async dispose(): Promise<void> {
    // The Redis client is owned by the caller (runtime), not the elector.
  }
}

/** In-process test-double: one holder, per-instance token, M-08 hermetic. */
export function createMemoryLeaderElector(): LeaderElector {
  let holder: string | null = null;
  const token = randomUUID();

  return {
    async tryAcquire(): Promise<boolean> {
      if (holder !== null) {
        return false;
      }
      holder = token;
      return true;
    },
    async renew(): Promise<void> {
      // eslint-disable-next-line security/detect-possible-timing-attacks -- comparing our own random-UUID token (never attacker input) in an in-process election double.
      if (holder !== token) {
        throw new SchedulerError('Leader lease was lost.');
      }
    },
    async isLeader(): Promise<boolean> {
      // eslint-disable-next-line security/detect-possible-timing-attacks -- same as renew: the token is generated internally, not supplied by a caller.
      return holder === token;
    },
    async release(): Promise<void> {
      // eslint-disable-next-line security/detect-possible-timing-attacks -- same as renew: internal token, not attacker input.
      if (holder === token) {
        holder = null;
      }
    },
    async dispose(): Promise<void> {
      // stateless
    },
  };
}

export function createLeaderElector(options: LeaderElectorOptions): LeaderElector {
  if (options.driver === 'redis' && options.redis) {
    return new RedisLeaderElector(options.redis, options.name ?? 'scheduler', options.leaseMs);
  }
  return createMemoryLeaderElector();
}
