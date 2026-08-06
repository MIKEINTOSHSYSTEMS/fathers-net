/**
 * Canonical event vocabulary (FR-160) — the shared, versioned set of event
 * names used across every service on the bus.
 *
 * Authority (milestone-2 §5.2 WP-024): the canonical catalog is `03` §4.6;
 * `06` §2.2 is the naming authority for Phase 2 service events. Where the two
 * plans name the same semantic event differently, the `06` §2.2 name is
 * canonical for Phase 2 and the `03` alias is recorded in `aliases` for
 * traceability (milestone-2 §5.2 examples follow `06` §2.2: `user.enrolled`,
 * `user.consent.changed`, `pregnancy.week.changed`).
 *
 * `availability`:
 *   - `phase2`  — producers emit this event during Milestone 2 (WP-015…WP-024).
 *   - `reserved`— defined in the catalog but the emitting service lands later
 *     (e.g. WhatsApp / conversation engine, Phase 4 per milestone-2 §5.2).
 */

export type EventProducer =
  | 'user-service'
  | 'pregnancy-engine'
  | 'reminder-engine'
  | 'content-service'
  | 'whatsapp-service'
  | 'journal-service'
  | 'ai-orchestration'
  | 'research-service'
  | 'auth-service'
  | 'medical-safety'
  | 'campaign-service'
  | 'conversation-engine'
  | 'notification-service';

export type EventAvailability = 'phase2' | 'reserved';

export interface EventDefinition {
  /** Canonical event name; the bus topic for this event is derived from it. */
  name: string;
  /** Owning service that publishes the event. */
  producer: EventProducer;
  /** Services expected to consume the event (per 03 §4.6 / 06 §2.2). */
  consumers: readonly string[];
  availability: EventAvailability;
  /** What the payload carries. */
  payload: string;
  /** Canonical idempotency key (03 §4.6). Phase 2 producers use the event `id`. */
  idempotency: string;
  /** Alternative names for the same semantic event in other plan documents. */
  aliases?: readonly string[];
}

export const EVENT_REGISTRY = {
  'user.enrolled': {
    name: 'user.enrolled',
    producer: 'user-service',
    consumers: [
      'pregnancy-engine',
      'reminder-engine',
      'research-service',
      'whatsapp-service',
      'campaign-service',
    ],
    availability: 'phase2',
    payload: 'user_id, language, region, cohort',
    idempotency: 'event id',
    aliases: ['user.registered'],
  },
  'user.profile.updated': {
    name: 'user.profile.updated',
    producer: 'user-service',
    consumers: ['pregnancy-engine', 'research-service'],
    availability: 'phase2',
    payload: 'user_id, changed fields',
    idempotency: 'event id',
  },
  'user.consent.changed': {
    name: 'user.consent.changed',
    producer: 'user-service',
    consumers: ['research-service', 'campaign-service', 'whatsapp-service'],
    availability: 'phase2',
    payload: 'user_id, consent_type, version, state',
    idempotency: 'event id',
    aliases: ['consent.granted', 'consent.withdrawn'],
  },
  'user.deletion.requested': {
    name: 'user.deletion.requested',
    producer: 'user-service',
    consumers: [
      'pregnancy-engine',
      'reminder-engine',
      'research-service',
      'whatsapp-service',
      'campaign-service',
      'content-service',
      'journal-service',
      'ai-orchestration',
      'auth-service',
    ],
    availability: 'phase2',
    payload: 'user_id, reason, scheduled_at',
    idempotency: 'event id',
  },
  'pregnancy.week.changed': {
    name: 'pregnancy.week.changed',
    producer: 'pregnancy-engine',
    consumers: ['reminder-engine', 'content-service', 'campaign-service', 'ai-orchestration'],
    availability: 'phase2',
    payload: 'user_id, week, trimester, edd',
    idempotency: 'per (user, week)',
    aliases: ['pregnancy.week.advanced'],
  },
  'milestone.reached': {
    name: 'milestone.reached',
    producer: 'pregnancy-engine',
    consumers: ['reminder-engine', 'notification-service'],
    availability: 'phase2',
    payload: 'user_id, milestone, week',
    idempotency: 'per (user, milestone)',
    aliases: ['pregnancy.milestone.due'],
  },
  'reminder.due': {
    name: 'reminder.due',
    producer: 'reminder-engine',
    consumers: ['notification-service'],
    availability: 'phase2',
    payload: 'user_id, reminder_type, channel, scheduled_for',
    idempotency: 'per (user, reminder, period)',
  },
  'auth.otp.requested': {
    name: 'auth.otp.requested',
    producer: 'auth-service',
    consumers: ['research-service', 'notification-service'],
    availability: 'phase2',
    payload: 'user_id (if known), channel, purpose',
    idempotency: 'request id',
  },
  'auth.session.created': {
    name: 'auth.session.created',
    producer: 'auth-service',
    consumers: ['research-service', 'notification-service'],
    availability: 'phase2',
    payload: 'user_id, method, version',
    idempotency: 'session id',
    aliases: ['user.authenticated'],
  },
  'auth.session.revoked': {
    name: 'auth.session.revoked',
    producer: 'auth-service',
    consumers: ['research-service', 'notification-service'],
    availability: 'phase2',
    payload: 'user_id, reason',
    idempotency: 'session id',
    aliases: ['token.revoked'],
  },
  'content.published': {
    name: 'content.published',
    producer: 'content-service',
    consumers: ['ai-orchestration'],
    availability: 'phase2',
    payload: 'content_id, version, language',
    idempotency: 'content version',
    aliases: ['content.approved'],
  },
  'content.retired': {
    name: 'content.retired',
    producer: 'content-service',
    consumers: ['ai-orchestration'],
    availability: 'phase2',
    payload: 'content_id, version',
    idempotency: 'content version',
    aliases: ['content.archived', 'content.expired'],
  },
  'journal.entry.created': {
    name: 'journal.entry.created',
    producer: 'journal-service',
    consumers: ['ai-orchestration', 'research-service'],
    availability: 'phase2',
    payload: 'entry_id, type, week, consent flags',
    idempotency: 'entry id',
  },
  'ai.answer.completed': {
    name: 'ai.answer.completed',
    producer: 'ai-orchestration',
    consumers: ['research-service', 'notification-service'],
    availability: 'phase2',
    payload: 'conversation_id, model, latency, safety_status',
    idempotency: 'conversation id',
  },
  'safety.event.raised': {
    name: 'safety.event.raised',
    producer: 'ai-orchestration',
    consumers: ['notification-service', 'ai-orchestration'],
    availability: 'phase2',
    payload: 'user_id, severity, event',
    idempotency: 'safety event id',
    aliases: ['safety.emergency.detected'],
  },
  'research.record.ready': {
    name: 'research.record.ready',
    producer: 'research-service',
    consumers: ['notification-service'],
    availability: 'phase2',
    payload: 'anonymized_id, category, themes',
    idempotency: 'source event id',
    aliases: ['research.record.created'],
  },
  'message.inbound': {
    name: 'message.inbound',
    producer: 'whatsapp-service',
    consumers: ['ai-orchestration', 'research-service', 'notification-service'],
    availability: 'reserved',
    payload: 'provider_message_id, sender, type, media_ref',
    idempotency: 'provider_message_id',
  },
  'message.outbound': {
    name: 'message.outbound',
    producer: 'whatsapp-service',
    consumers: ['notification-service'],
    availability: 'reserved',
    payload: 'message_id, channel, status',
    idempotency: 'message id',
  },
  'media.processed': {
    name: 'media.processed',
    producer: 'whatsapp-service',
    consumers: ['ai-orchestration', 'research-service'],
    availability: 'reserved',
    payload: 'media_ref, type, transcript',
    idempotency: 'media id',
  },
  'pregnancy.trimester.changed': {
    name: 'pregnancy.trimester.changed',
    producer: 'pregnancy-engine',
    consumers: ['reminder-engine', 'content-service', 'notification-service'],
    availability: 'reserved',
    payload: 'user_id, trimester, week',
    idempotency: 'per (user, trimester)',
  },
  'prompt.due': {
    name: 'prompt.due',
    producer: 'reminder-engine',
    consumers: ['conversation-engine'],
    availability: 'reserved',
    payload: 'user_id, prompt_id, week, channel',
    idempotency: 'per (user, prompt, period)',
  },
  'notification.delivered': {
    name: 'notification.delivered',
    producer: 'reminder-engine',
    consumers: ['conversation-engine', 'notification-service'],
    availability: 'reserved',
    payload: 'user_id, type, channel, status',
    idempotency: 'notification id',
  },
  'notification.failed': {
    name: 'notification.failed',
    producer: 'reminder-engine',
    consumers: ['conversation-engine', 'notification-service'],
    availability: 'reserved',
    payload: 'user_id, type, channel, error',
    idempotency: 'notification id',
  },
  'whatsapp.message.received': {
    name: 'whatsapp.message.received',
    producer: 'whatsapp-service',
    consumers: ['conversation-engine', 'research-service', 'notification-service'],
    availability: 'reserved',
    payload: 'provider_message_id, sender, type, media_ref',
    idempotency: 'provider_message_id',
  },
  'whatsapp.media.received': {
    name: 'whatsapp.media.received',
    producer: 'whatsapp-service',
    consumers: ['ai-orchestration'],
    availability: 'reserved',
    payload: 'media_ref, type, size',
    idempotency: 'media id',
  },
  'whatsapp.message.delivered': {
    name: 'whatsapp.message.delivered',
    producer: 'conversation-engine',
    consumers: ['campaign-service', 'notification-service'],
    availability: 'reserved',
    payload: 'message_id, status, retry_count',
    idempotency: 'provider message id',
  },
  'whatsapp.message.failed': {
    name: 'whatsapp.message.failed',
    producer: 'conversation-engine',
    consumers: ['campaign-service', 'notification-service'],
    availability: 'reserved',
    payload: 'message_id, status, retry_count, error',
    idempotency: 'provider message id',
  },
  'whatsapp.optout.registered': {
    name: 'whatsapp.optout.registered',
    producer: 'conversation-engine',
    consumers: ['campaign-service', 'user-service', 'research-service'],
    availability: 'reserved',
    payload: 'user_id, timestamp',
    idempotency: 'opt-out id',
  },
  'conversation.intent.detected': {
    name: 'conversation.intent.detected',
    producer: 'conversation-engine',
    consumers: ['ai-orchestration', 'research-service', 'notification-service'],
    availability: 'reserved',
    payload: 'user_id, intent, language',
    idempotency: 'intent id',
  },
  'campaign.scheduled': {
    name: 'campaign.scheduled',
    producer: 'campaign-service',
    consumers: ['conversation-engine', 'notification-service'],
    availability: 'reserved',
    payload: 'campaign_id, batch, recipients',
    idempotency: 'batch id',
  },
  'campaign.send.batch': {
    name: 'campaign.send.batch',
    producer: 'campaign-service',
    consumers: ['conversation-engine', 'notification-service'],
    availability: 'reserved',
    payload: 'campaign_id, batch, recipients',
    idempotency: 'batch id',
  },
  'prompt.response.captured': {
    name: 'prompt.response.captured',
    producer: 'conversation-engine',
    consumers: ['research-service', 'notification-service'],
    availability: 'reserved',
    payload: 'response_id, category, week',
    idempotency: 'response id',
  },
  'myth.captured': {
    name: 'myth.captured',
    producer: 'conversation-engine',
    consumers: ['research-service', 'notification-service'],
    availability: 'reserved',
    payload: 'id, text_hash, category',
    idempotency: 'capture id',
  },
  'challenge.captured': {
    name: 'challenge.captured',
    producer: 'conversation-engine',
    consumers: ['research-service', 'notification-service'],
    availability: 'reserved',
    payload: 'id, text_hash, category',
    idempotency: 'capture id',
  },
} as const satisfies Record<string, EventDefinition>;

export type EventName = keyof typeof EVENT_REGISTRY;

export function isEventName(value: string): value is EventName {
  return Object.keys(EVENT_REGISTRY).includes(value);
}

export function describeEvent(name: EventName): EventDefinition {
  // eslint-disable-next-line security/detect-object-injection -- `name` is a key of the closed registry, never user input.
  return EVENT_REGISTRY[name];
}
