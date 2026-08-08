import { createEvent, type DomainEvent, type EventName } from '@fathersnet/events';
import type { OutboxEntry } from '../store/types';

/**
 * Map a full event envelope to the write-side outbox row it is persisted as
 * (WP-024c). The relay reconstructs the wire envelope from the committed row,
 * so the `id`/`type`/`producer`/`occurred_at`/`schema_version`/aggregate/
 * `idempotency_key` all survive verbatim. The canonical 16-column outbox
 * contract carries no `request_id`, so request correlation stops at the
 * service boundary for outbox-published events (approved in wp-024c §9).
 */
export function toOutboxEntry(event: DomainEvent<unknown>): OutboxEntry {
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

export interface BuildOutboxEntryOptions {
  type: EventName;
  payload: Record<string, unknown>;
  /** Emitting service. Defaults to `reminder-engine` (canonical vocabulary). */
  producer?: string;
  aggregate?: { type: string; id: string };
  /** Vocabulary-documented idempotency semantics (e.g. the dispatch id). */
  idempotencyKey?: string;
}

/** Build the outbox row for an event a reminders path is about to emit. */
export function buildOutboxEntry(options: BuildOutboxEntryOptions): OutboxEntry {
  return toOutboxEntry(
    createEvent({
      type: options.type,
      producer: options.producer ?? 'reminder-engine',
      payload: options.payload,
      aggregate: options.aggregate,
      idempotency_key: options.idempotencyKey,
    }),
  );
}
