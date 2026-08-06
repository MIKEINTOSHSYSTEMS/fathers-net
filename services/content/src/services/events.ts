import { createEvent, type EventBus, type EventName } from '@fathersnet/events';
import type { Logger } from '@fathersnet/logger';

export interface PublishEventOptions {
  bus: EventBus;
  logger: Logger | undefined;
  type: EventName;
  payload: Record<string, unknown>;
  requestId?: string;
  aggregate?: { type: string; id: string };
  /** Emitting service. Defaults to `content-service` (canonical vocabulary). */
  producer?: string;
  /** Vocabulary-documented idempotency semantics (e.g. content version).
   *  Defaults to the event id, as in WP-024a. */
  idempotencyKey?: string;
}

/**
 * Publish an event best-effort. WP-020 has no outbox table (the DB boundary is
 * migration 011 only; a per-service outbox table requires a `05` §4.2 catalog
 * row + schema approval), so a bus failure never fails the operation — it is
 * logged instead. The outbox relay pattern (WP-024a) remains the upgrade path.
 * Payloads carry no PII — content reference data only (content_id, version,
 * language), never user data (FR-022).
 */
export async function publishEvent(options: PublishEventOptions): Promise<void> {
  const { bus, logger, type, payload } = options;
  try {
    await bus.publish(
      createEvent({
        type,
        producer: options.producer ?? 'content-service',
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
