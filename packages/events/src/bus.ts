/**
 * Event bus client (WP-024a; 06 §2.2, D-02, M-08).
 *
 * `EventBus` is the provider-agnostic contract every producer and the outbox
 * relay talk to. The Redis Streams implementation is the pilot adapter
 * (`06` §2.2); a Kafka-compatible managed bus can replace it behind the same
 * interface (D-02). `createInMemoryEventBus` is the hermetic test-double for
 * unit tests and local development (M-08: no provider-coupled code in Phase 2).
 *
 * Topics are one stream per event type: `events:<event.name>`.
 */

import type Redis from 'ioredis';

import { serializeEvent, type DomainEvent } from './event';
import type { EventName } from './vocabulary';
import type { Logger } from '@fathersnet/logger';

export class EventBusError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'EventBusError';
  }
}

export interface EventBus {
  /** Publish one event to its topic stream. Resolves once the bus commits it. */
  publish<T>(event: DomainEvent<T>): Promise<string>;
  /** Publish many events. Throws on the first failure so callers can retry. */
  publishMany<T>(events: DomainEvent<T>[]): Promise<string[]>;
  dispose(): Promise<void>;
}

export interface RedisEventBusOptions {
  client: Redis;
  /** Stream name prefix. Default `events` -> `events:<event.name>`. */
  streamPrefix?: string;
  logger?: Logger;
}

export function streamNameFor(event: EventName, prefix = 'events'): string {
  return `${prefix}:${event}`;
}

export function createRedisEventBus(options: RedisEventBusOptions): EventBus {
  const { client, logger } = options;
  const prefix = options.streamPrefix ?? 'events';

  async function publish<T>(event: DomainEvent<T>): Promise<string> {
    const stream = streamNameFor(event.type, prefix);
    const entryId = await client.xadd(
      stream,
      '*',
      'type',
      event.type,
      'data',
      serializeEvent(event),
    );
    if (entryId == null) {
      throw new EventBusError(`XADD returned no entry id for stream '${stream}'.`);
    }
    logger?.debug('events.published', `Published ${event.type} to ${stream}`, {
      stream,
      entryId,
      event_id: event.id,
    });
    return entryId;
  }

  async function publishMany<T>(events: DomainEvent<T>[]): Promise<string[]> {
    const ids: string[] = [];
    for (const event of events) {
      ids.push(await publish(event));
    }
    return ids;
  }

  return {
    publish,
    publishMany,
    async dispose(): Promise<void> {
      // The Redis client is owned by the caller (service/app), not the bus.
    },
  };
}

export interface InMemoryEventBus extends EventBus {
  /** Every event published so far, in publish order. */
  published: DomainEvent<unknown>[];
}

/** Hermetic in-memory bus for unit tests, CI without Redis, and dev (M-08). */
export function createInMemoryEventBus(): InMemoryEventBus {
  const published: DomainEvent<unknown>[] = [];

  return {
    published,
    async publish<T>(event: DomainEvent<T>): Promise<string> {
      published.push(event);
      return `mem:${event.id}`;
    },
    async publishMany<T>(events: DomainEvent<T>[]): Promise<string[]> {
      for (const event of events) {
        published.push(event);
      }
      return events.map((event) => `mem:${event.id}`);
    },
    async dispose(): Promise<void> {
      published.length = 0;
    },
  };
}
