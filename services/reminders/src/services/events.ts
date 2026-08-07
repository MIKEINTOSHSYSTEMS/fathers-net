import { createEvent, type EventBus, type EventName } from '@fathersnet/events';
import type { Logger } from '@fathersnet/logger';

export interface PublishEventOptions {
  bus: EventBus;
  logger: Logger | undefined;
  type: EventName;
  payload: Record<string, unknown>;
  requestId?: string;
  aggregate?: { type: string; id: string };
  /** Emitting service. Defaults to `reminder-engine` (canonical vocabulary). */
  producer?: string;
  /** Vocabulary-documented idempotency semantics. Defaults to the event id. */
  idempotencyKey?: string;
}

/**
 * Publish an event best-effort. WP-021 has no outbox table (the DB boundary is
 * migration 018 only; a per-service outbox table requires a `05` §4.2 catalog
 * row + schema approval), so a bus failure never fails the operation — it is
 * logged instead. The outbox relay pattern (WP-024a) remains the upgrade path.
 * Payloads carry no PII (FR-022): reminder reference data and identifiers
 * only, never message content or phone numbers.
 */
export async function publishEvent(options: PublishEventOptions): Promise<void> {
  const { bus, logger, type, payload } = options;
  try {
    await bus.publish(
      createEvent({
        type,
        producer: options.producer ?? 'reminder-engine',
        payload,
        request_id: options.requestId,
        idempotency_key: options.idempotencyKey,
        ...(options.aggregate ? { aggregate: options.aggregate } : {}),
      }),
    );
  } catch (err) {
    logger?.error('events.publish_failed', 'failed to publish event', {
      event_type: type,
      err: String(err),
    });
  }
}
