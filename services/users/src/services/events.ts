import { createEvent, type EventBus, type EventName } from '@fathersnet/events';
import type { Logger } from '@fathersnet/logger';

export interface PublishEventOptions {
  bus: EventBus;
  logger: Logger | undefined;
  type: EventName;
  payload: Record<string, unknown>;
  requestId?: string;
  aggregate?: { type: string; id: string };
  /** Emitting service. Defaults to `user-service`; the canonical vocabulary
   *  (06 §2.2) declares `pregnancy-engine` for pregnancy events, which the
   *  in-process pregnancy service honours. */
  producer?: string;
  /** Vocabulary-documented idempotency semantics (e.g. per (user, week)).
   *  Defaults to the event id, as in WP-024a. */
  idempotencyKey?: string;
}

/**
 * Publish an event best-effort. WP-017 has no outbox table (the baseline
 * schema is unchanged per the WP-017 DB boundary; a per-service outbox table
 * requires a `05` §4.2 catalog row + schema approval), so a bus failure never
 * fails the operation — it is logged instead. The outbox relay pattern
 * (WP-024a) remains the upgrade path. Payloads carry no PII — never phone
 * numbers, names, or token material (FR-022).
 */
export async function publishEvent(options: PublishEventOptions): Promise<void> {
  const { bus, logger, type, payload } = options;
  try {
    await bus.publish(
      createEvent({
        type,
        producer: options.producer ?? 'user-service',
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

/** Convenience wrapper for user-service events (producer `user-service`). */
export async function publishUsersEvent(
  bus: EventBus,
  logger: Logger | undefined,
  type: EventName,
  payload: Record<string, unknown>,
  requestId?: string,
  aggregate?: { type: string; id: string },
): Promise<void> {
  return publishEvent({
    bus,
    logger,
    type,
    payload,
    requestId,
    aggregate,
    producer: 'user-service',
  });
}
