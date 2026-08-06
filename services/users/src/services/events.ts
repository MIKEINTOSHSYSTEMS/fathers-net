import { createEvent, type EventBus, type EventName } from '@fathersnet/events';
import type { Logger } from '@fathersnet/logger';

/**
 * Publish a users event best-effort. WP-017 has no outbox table (the baseline
 * schema is unchanged per the WP-017 DB boundary; a per-service outbox table
 * requires a `05` §4.2 catalog row + schema approval), so a bus failure never
 * fails the users operation — it is logged instead. The outbox relay pattern
 * (WP-024a) remains the upgrade path. Payloads carry no PII — never phone
 * numbers, names, or token material (FR-022).
 */
export async function publishUsersEvent(
  bus: EventBus,
  logger: Logger | undefined,
  type: EventName,
  payload: Record<string, unknown>,
  requestId?: string,
  aggregate?: { type: string; id: string },
): Promise<void> {
  try {
    await bus.publish(
      createEvent({
        type,
        producer: 'user-service',
        payload,
        request_id: requestId,
        ...(aggregate ? { aggregate } : {}),
      }),
    );
  } catch (err) {
    logger?.error('users.event_publish_failed', 'failed to publish users event', {
      event_type: type,
      err: String(err),
    });
  }
}
