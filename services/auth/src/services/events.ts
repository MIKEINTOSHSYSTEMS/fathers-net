import { createEvent, type EventBus, type EventName } from '@fathersnet/events';
import type { Logger } from '@fathersnet/logger';

/**
 * Publish an auth event best-effort. WP-016 has no outbox (auth state is
 * Redis-only per D-09), so a bus failure never fails the auth operation; it is
 * logged instead. Payloads carry no PII — never phone numbers, OTP codes, or
 * tokens (FR-022).
 */
export async function publishAuthEvent(
  bus: EventBus,
  logger: Logger | undefined,
  type: EventName,
  payload: Record<string, unknown>,
  requestId?: string,
): Promise<void> {
  try {
    await bus.publish(
      createEvent({
        type,
        producer: 'auth-service',
        payload,
        request_id: requestId,
      }),
    );
  } catch (err) {
    logger?.error('auth.event_publish_failed', 'failed to publish auth event', {
      event_type: type,
      err: String(err),
    });
  }
}
