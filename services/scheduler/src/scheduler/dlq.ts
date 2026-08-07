import type Redis from 'ioredis';

import { SchedulerError } from '../jobs/types';
import type { SchedulerDriver } from './leader';

export type { SchedulerDriver };

/** Dead-letter entry for a failed job run (12 §16 I-13, OR-008). */
export interface JobDlqEntry {
  job: string;
  runId: string;
  scheduledFor: string;
  attempts: number;
  error: string;
  failedAt: string;
}

export interface JobDlq {
  /** Move a failed run to the DLQ; returns the entry id. */
  push(entry: JobDlqEntry): Promise<string>;
  /** Number of entries currently in the DLQ (OR-008 alerting surface). */
  len(): Promise<number>;
  /** Newest-first entries (default limit 50). */
  list(limit?: number): Promise<JobDlqEntry[]>;
  dispose(): Promise<void>;
}

export interface JobDlqOptions {
  driver: SchedulerDriver;
  redis?: Redis;
  /** DLQ scope — isolates independent schedulers sharing one Redis. */
  name?: string;
}

export class RedisJobDlq implements JobDlq {
  private readonly stream: string;

  constructor(
    private readonly client: Redis,
    name = 'scheduler',
  ) {
    this.stream = `scheduler:dlq:${name}`;
  }

  async push(entry: JobDlqEntry): Promise<string> {
    const id = await this.client.xadd(this.stream, '*', 'data', JSON.stringify(entry));
    if (id == null) {
      throw new SchedulerError(`XADD returned no entry id for DLQ stream '${this.stream}'.`);
    }
    return id;
  }

  async len(): Promise<number> {
    return this.client.xlen(this.stream);
  }

  async list(limit = 50): Promise<JobDlqEntry[]> {
    const raw = await this.client.xrevrange(this.stream, '+', '-', 'COUNT', limit);
    const entries: JobDlqEntry[] = [];
    for (const [, fields] of raw) {
      const record: Record<string, string> = {};
      for (let i = 0; i < fields.length; i += 2) {
        // eslint-disable-next-line security/detect-object-injection -- keys come from the fixed field set the worker writes ('data'), never user input.
        record[String(fields[i])] = String(fields[i + 1]);
      }
      const data = record.data;
      if (typeof data !== 'string') {
        continue;
      }
      entries.push(JSON.parse(data) as JobDlqEntry);
    }
    return entries;
  }

  async dispose(): Promise<void> {
    // The Redis client is owned by the caller (runtime), not the DLQ.
  }
}

/** In-process test-double for unit tests and hermetic CI (M-08). */
export function createMemoryJobDlq(): JobDlq {
  const entries: JobDlqEntry[] = [];

  return {
    async push(entry: JobDlqEntry): Promise<string> {
      entries.push(entry);
      return `mem:${entries.length}`;
    },
    async len(): Promise<number> {
      return entries.length;
    },
    async list(limit = 50): Promise<JobDlqEntry[]> {
      return [...entries].reverse().slice(0, limit);
    },
    async dispose(): Promise<void> {
      entries.length = 0;
    },
  };
}

export function createJobDlq(options: JobDlqOptions): JobDlq {
  if (options.driver === 'redis' && options.redis) {
    return new RedisJobDlq(options.redis, options.name ?? 'scheduler');
  }
  return createMemoryJobDlq();
}
