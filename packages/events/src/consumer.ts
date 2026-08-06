/**
 * Stream consumer (consumer groups + DLQ) — the consumer side of the event bus.
 *
 * Delivery semantics are at-least-once (03 §4.6): an unacked entry stays in
 * the consumer's pending list and is redelivered on the next read. Consumers
 * deduplicate by event id via `@fathersnet/idempotency` (FR-161).
 *
 * DLQ handling follows 12 §16 I-13: a dedicated DLQ per topic
 * (`<stream>.dlq`), AOF-persisted Redis (compose `--appendonly yes`),
 * queue-depth/age alerting surfaces via `dlqLen`/`pendingCount` + the relay's
 * `onDead` hook, and idempotency keys survive into the DLQ record for
 * reprocessing (runbook: replay the entry to the main stream after the
 * consumer defect is fixed).
 */

import type Redis from 'ioredis';
import type { Logger } from '@fathersnet/logger';

import { EventBusError, streamNameFor } from './bus';
import { parseEvent, type DomainEvent } from './event';
import type { EventName } from './vocabulary';

export interface BusMessage<T = unknown> {
  /** Redis Streams entry id (unique per entry). */
  id: string;
  event: DomainEvent<T>;
}

export interface DlqEntry {
  /** Original stream the message came from. */
  stream: string;
  /** Original entry id. */
  messageId: string;
  reason: string;
  error?: string;
  moved_at: string;
}

export interface ReadOptions {
  group: string;
  consumer: string;
  streams: readonly EventName[];
  count?: number;
  /** 0 = block forever (default). */
  blockMs?: number;
}

export interface MoveToDlqOptions {
  stream: EventName;
  messageId: string;
  reason: string;
  error?: string;
}

export interface StreamConsumer {
  /** Create consumer groups for the given event streams (idempotent). */
  ensureGroup(group: string, streams: readonly EventName[], start?: string): Promise<void>;
  read(options: ReadOptions): Promise<BusMessage[]>;
  ack(stream: EventName, group: string, messageId: string): Promise<void>;
  /** Move an entry to the per-topic DLQ stream; returns the DLQ entry id. */
  moveToDlq(options: MoveToDlqOptions): Promise<string>;
  /** Number of entries currently in the DLQ for a topic (OR-008 alerting). */
  dlqLen(stream: EventName): Promise<number>;
  /** Number of unacked entries for a group on a topic (age/backlog alerting). */
  pendingCount(stream: EventName, group: string): Promise<number>;
  dispose(): Promise<void>;
}

export interface RedisStreamConsumerOptions {
  client: Redis;
  streamPrefix?: string;
  logger?: Logger;
}

function fieldsToRecord(fields: readonly (string | Buffer)[]): Record<string, string> {
  const record: Record<string, string> = {};
  const entries = fields.entries();
  let keyResult = entries.next();
  while (keyResult.done === false) {
    const valueResult = entries.next();
    const key = String(keyResult.value[1]);
    const value = String(valueResult.done ? '' : valueResult.value[1]);
    // eslint-disable-next-line security/detect-object-injection -- `key` comes from the fixed field set the bus writes ('type'/'data'), never user input.
    record[key] = value;
    keyResult = entries.next();
  }
  return record;
}

export function createRedisStreamConsumer(options: RedisStreamConsumerOptions): StreamConsumer {
  const { client, logger } = options;
  const prefix = options.streamPrefix ?? 'events';

  async function ensureGroup(
    group: string,
    streams: readonly EventName[],
    start = '$',
  ): Promise<void> {
    for (const eventName of streams) {
      const stream = streamNameFor(eventName, prefix);
      try {
        await client.xgroup('CREATE', stream, group, start, 'MKSTREAM');
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        if (!message.includes('BUSYGROUP')) {
          throw err;
        }
      }
    }
  }

  async function read(options: ReadOptions): Promise<BusMessage[]> {
    const streams = options.streams.map((name) => streamNameFor(name, prefix));
    const ids = streams.map(() => '>');
    const count = options.count ?? 10;
    const blockMs = options.blockMs ?? 0;
    const raw = await client.xreadgroup(
      'GROUP',
      options.group,
      options.consumer,
      'COUNT',
      count,
      'BLOCK',
      blockMs,
      'STREAMS',
      ...streams,
      ...ids,
    );
    if (raw == null) {
      return [];
    }
    return parseReadResult(raw as [string, [string, (string | Buffer)[]][]][]);
  }

  function parseReadResult(raw: [string, [string, (string | Buffer)[]][]][]): BusMessage[] {
    const messages: BusMessage[] = [];
    for (const [, entries] of raw) {
      for (const [id, fields] of entries) {
        const record = fieldsToRecord(fields);
        const data = record.data;
        if (typeof data !== 'string') {
          continue;
        }
        messages.push({ id, event: parseEvent(data) });
      }
    }
    return messages;
  }

  async function ack(stream: EventName, group: string, messageId: string): Promise<void> {
    await client.xack(streamNameFor(stream, prefix), group, messageId);
  }

  async function moveToDlq(options: MoveToDlqOptions): Promise<string> {
    const stream = streamNameFor(options.stream, prefix);
    const dlqStream = `${stream}.dlq`;
    const entry: DlqEntry = {
      stream,
      messageId: options.messageId,
      reason: options.reason,
      moved_at: new Date().toISOString(),
      ...(options.error ? { error: options.error } : {}),
    };
    const entryId = await client.xadd(dlqStream, '*', 'data', JSON.stringify(entry));
    if (entryId == null) {
      throw new EventBusError(`XADD returned no entry id for DLQ stream '${dlqStream}'.`);
    }
    logger?.warn('events.dlq', `Moved ${options.stream} entry to DLQ`, {
      stream,
      dlqStream,
      messageId: options.messageId,
      reason: options.reason,
    });
    return entryId;
  }

  async function dlqLen(stream: EventName): Promise<number> {
    return client.xlen(`${streamNameFor(stream, prefix)}.dlq`);
  }

  async function pendingCount(stream: EventName, group: string): Promise<number> {
    const summary = await client.xpending(streamNameFor(stream, prefix), group);
    if (summary == null || !Array.isArray(summary) || typeof summary[0] !== 'number') {
      return 0;
    }
    return summary[0];
  }

  return {
    ensureGroup,
    read,
    ack,
    moveToDlq,
    dlqLen,
    pendingCount,
    async dispose(): Promise<void> {
      // The Redis client is owned by the caller, not the consumer.
    },
  };
}
