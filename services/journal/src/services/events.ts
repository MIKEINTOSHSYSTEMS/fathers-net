import { createEvent, type EventBus, type EventName } from '@fathersnet/events';
import type { Logger } from '@fathersnet/logger';

export interface PublishEventOptions {
  bus: EventBus;
  logger: Logger | undefined;
  type: EventName;
  payload: Record<string, unknown>;
  requestId?: string;
  aggregate?: { type: string; id: string };
  /** Emitting service. Defaults to `journal-service` (canonical vocabulary). */
  producer?: string;
  /** Vocabulary-documented idempotency semantics (e.g. entry id). Defaults to
   *  the event id, as in WP-024a. */
  idempotencyKey?: string;
}

/**
 * Publish an event best-effort (WP-022 §6). The journal service has no outbox
 * table (the DB boundary is migration 019 only; a per-service outbox requires a
 * `05` §4.2 catalog row + approval), so a bus failure never fails the journal
 * operation — it is logged instead. The WP-024a outbox relay is the upgrade
 * path. Payloads carry no PII — `{ entry_id, type, week, consent flags }` only;
 * the journal body/content is NEVER published (FR-022, FR-123).
 */
export async function publishEvent(options: PublishEventOptions): Promise<void> {
  const { bus, logger, type, payload } = options;
  try {
    await bus.publish(
      createEvent({
        type,
        producer: options.producer ?? 'journal-service',
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
