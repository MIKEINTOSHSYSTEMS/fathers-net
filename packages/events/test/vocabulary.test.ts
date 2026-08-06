import { describeEvent, EVENT_REGISTRY, isEventName } from '../src/vocabulary';

describe('@fathersnet/events canonical event vocabulary (FR-160)', () => {
  it('defines the Phase 2 canonical events from 06 §2.2 / 03 §4.6', () => {
    const phase2 = [
      'user.enrolled',
      'user.profile.updated',
      'user.consent.changed',
      'user.deletion.requested',
      'pregnancy.week.changed',
      'milestone.reached',
      'reminder.due',
      'auth.otp.requested',
      'auth.session.created',
      'auth.session.revoked',
      'content.published',
      'content.retired',
      'journal.entry.created',
      'ai.answer.completed',
      'safety.event.raised',
      'research.record.ready',
    ];
    for (const name of phase2) {
      expect(isEventName(name)).toBe(true);
      if (isEventName(name)) {
        expect(EVENT_REGISTRY[name].availability).toBe('phase2');
      }
    }
  });

  it('marks later-phase events as reserved', () => {
    const reserved = [
      'message.inbound',
      'message.outbound',
      'whatsapp.message.received',
      'whatsapp.media.received',
      'conversation.intent.detected',
      'prompt.due',
      'notification.delivered',
      'campaign.send.batch',
    ];
    for (const name of reserved) {
      if (isEventName(name)) {
        expect(EVENT_REGISTRY[name].availability).toBe('reserved');
      }
    }
  });

  it('records 06 §2.2 aliases for 03 §4.6 traceability', () => {
    expect(EVENT_REGISTRY['user.enrolled'].aliases).toContain('user.registered');
    expect(EVENT_REGISTRY['user.consent.changed'].aliases).toEqual([
      'consent.granted',
      'consent.withdrawn',
    ]);
    expect(EVENT_REGISTRY['pregnancy.week.changed'].aliases).toContain('pregnancy.week.advanced');
    expect(EVENT_REGISTRY['auth.session.created'].aliases).toContain('user.authenticated');
    expect(EVENT_REGISTRY['auth.session.revoked'].aliases).toContain('token.revoked');
  });

  it('has unique event names and complete definitions', () => {
    const names = Object.keys(EVENT_REGISTRY);
    expect(new Set(names).size).toBe(names.length);
    for (const [name, def] of Object.entries(EVENT_REGISTRY)) {
      expect(def.name).toBe(name);
      expect(def.producer.length).toBeGreaterThan(0);
      expect(def.consumers.length).toBeGreaterThan(0);
      expect(def.payload.length).toBeGreaterThan(0);
      expect(def.idempotency.length).toBeGreaterThan(0);
      expect(['phase2', 'reserved']).toContain(def.availability);
      const segments = name.split('.');
      expect(segments.length).toBeGreaterThanOrEqual(2);
      for (const segment of segments) {
        expect(segment).toMatch(/^[a-z0-9_]+$/);
      }
    }
  });

  it('exposes the idempotency keys from 03 §4.6', () => {
    expect(EVENT_REGISTRY['pregnancy.week.changed'].idempotency).toBe('per (user, week)');
    expect(EVENT_REGISTRY['whatsapp.message.received'].idempotency).toBe('provider_message_id');
    expect(EVENT_REGISTRY['auth.otp.requested'].idempotency).toBe('request id');
    expect(EVENT_REGISTRY['prompt.due'].idempotency).toBe('per (user, prompt, period)');
  });

  it('isEventName rejects unknown names', () => {
    expect(isEventName('nope.does-not-exist')).toBe(false);
    expect(isEventName('')).toBe(false);
    expect(isEventName('user')).toBe(false);
  });

  it('describeEvent returns the registry definition', () => {
    expect(describeEvent('user.enrolled').producer).toBe('user-service');
    expect(describeEvent('journal.entry.created').consumers).toContain('ai-orchestration');
  });
});
