import { createEvent, type EventName } from '@fathersnet/events';
import type { OutboxEntry } from './store/types';

export interface BuildOutboxEntryOptions {
  type: EventName;
  payload: Record<string, unknown>;
  aggregate?: { type: string; id: string };
  /** Emitting service. Defaults to `content-service` (canonical vocabulary). */
  producer?: string;
  /** Vocabulary-documented idempotency semantics (e.g. content version).
   *  Defaults to the event id. */
  idempotencyKey?: string;
}

/**
 * Build an outbox entry (WP-024c) for an event that must be published. The row
 * is written to `content_outbox` in the same DB transaction as the domain
 * write that produced it (approve → `content.published`, archive →
 * `content.retired`); the relay publishes it only after that transaction
 * commits. Payloads carry no PII — content reference data only (content_id,
 * version, language), never user data (FR-022).
 */
export function buildOutboxEntry(options: BuildOutboxEntryOptions): OutboxEntry {
  const event = createEvent({
    type: options.type,
    producer: options.producer ?? 'content-service',
    payload: options.payload,
    idempotency_key: options.idempotencyKey,
    ...(options.aggregate ? { aggregate: options.aggregate } : {}),
  });
  return {
    eventId: event.id,
    eventType: event.type,
    producer: event.producer,
    schemaVersion: event.schema_version,
    occurredAt: event.occurred_at,
    aggregateType: event.aggregate?.type ?? null,
    aggregateId: event.aggregate?.id ?? null,
    idempotencyKey: event.idempotency_key,
    payload: event.payload as Record<string, unknown>,
  };
}
