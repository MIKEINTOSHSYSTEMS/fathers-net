/**
 * Event envelope + factory (03 §4.6, 06 §2.2). The envelope is the wire format
 * for every event on the bus. The event `id` doubles as the consumer
 * idempotency key (06 §2.2), so a redelivered event is a no-op for an
 * idempotent consumer.
 *
 * No-PII rule (FR-022): payloads must never carry phone numbers, tokens, OTP
 * values, or message content. The logger redacts those field paths as
 * defense-in-depth; producers still must not put them on the bus.
 */

import { randomUUID } from 'node:crypto';

import { isEventName, type EventName } from './vocabulary';

export interface AggregateRef {
  type: string;
  id: string;
}

export interface DomainEvent<T = unknown> {
  /** Unique event id (uuid v4). Doubles as the consumer idempotency key. */
  id: string;
  type: EventName;
  /** Emitting service name, e.g. `user-service`. */
  producer: string;
  /** ISO 8601 UTC timestamp of occurrence. */
  occurred_at: string;
  schema_version: number;
  /** Optional aggregate reference for the domain object the event belongs to. */
  aggregate: AggregateRef | null;
  /** Canonical idempotency key (03 §4.6); defaults to `id`. */
  idempotency_key: string;
  /** X-Request-Id correlation id (06 §3.7). */
  request_id?: string;
  /** W3C trace context, propagated across services and the bus (06 §3.7). */
  traceparent?: string;
  payload: T;
}

export interface CreateEventOptions<T> {
  type: EventName;
  producer: string;
  payload: T;
  id?: string;
  occurred_at?: string;
  schema_version?: number;
  aggregate?: AggregateRef | null;
  idempotency_key?: string;
  request_id?: string;
  traceparent?: string;
}

export class EventValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'EventValidationError';
  }
}

export function createEvent<T>(options: CreateEventOptions<T>): DomainEvent<T> {
  if (!isEventName(options.type)) {
    throw new EventValidationError(`Unknown event type '${options.type}'.`);
  }
  if (!options.producer || options.producer.trim() === '') {
    throw new EventValidationError(`Event '${options.type}' requires a producer.`);
  }
  const id = options.id ?? randomUUID();
  return {
    id,
    type: options.type,
    producer: options.producer,
    occurred_at: options.occurred_at ?? new Date().toISOString(),
    schema_version: options.schema_version ?? 1,
    aggregate: options.aggregate ?? null,
    idempotency_key: options.idempotency_key ?? id,
    request_id: options.request_id,
    traceparent: options.traceparent,
    payload: options.payload,
  };
}

export function serializeEvent<T>(event: DomainEvent<T>): string {
  return JSON.stringify(event);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Parse + validate a serialized event. Throws EventValidationError on any
 * malformed or unknown event so a consumer never processes garbage.
 */
export function parseEvent<T = unknown>(raw: string): DomainEvent<T> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new EventValidationError('Event payload is not valid JSON.');
  }
  if (!isRecord(parsed)) {
    throw new EventValidationError('Event payload must be a JSON object.');
  }
  const { id, type, producer, occurred_at, schema_version, idempotency_key } = parsed;
  if (typeof id !== 'string' || id.length === 0) {
    throw new EventValidationError("Event 'id' must be a non-empty string.");
  }
  if (typeof type !== 'string' || !isEventName(type)) {
    throw new EventValidationError(`Unknown event type '${String(type)}'.`);
  }
  if (typeof producer !== 'string' || producer.length === 0) {
    throw new EventValidationError("Event 'producer' must be a non-empty string.");
  }
  if (typeof occurred_at !== 'string' || Number.isNaN(Date.parse(occurred_at))) {
    throw new EventValidationError("Event 'occurred_at' must be an ISO 8601 timestamp.");
  }
  if (typeof schema_version !== 'number') {
    throw new EventValidationError("Event 'schema_version' must be a number.");
  }
  if (typeof idempotency_key !== 'string' || idempotency_key.length === 0) {
    throw new EventValidationError("Event 'idempotency_key' must be a non-empty string.");
  }
  return parsed as unknown as DomainEvent<T>;
}
