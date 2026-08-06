import {
  createEvent,
  EventValidationError,
  parseEvent,
  serializeEvent,
  type CreateEventOptions,
  type DomainEvent,
} from '../src/event';

describe('@fathersnet/events envelope + factory', () => {
  it('builds an envelope with the event id as the default idempotency key', () => {
    const event = createEvent({
      type: 'user.enrolled',
      producer: 'user-service',
      payload: { user_id: 'u1' },
    });
    expect(event.id).toMatch(/^[0-9a-f]{8}-[0-9a-f-]{27}$/);
    expect(event.idempotency_key).toBe(event.id);
    expect(event.schema_version).toBe(1);
    expect(event.aggregate).toBeNull();
    expect(Number.isNaN(Date.parse(event.occurred_at))).toBe(false);
    expect(event.occurred_at.endsWith('Z')).toBe(true);
  });

  it('honors caller-supplied id, timestamp, and correlation fields', () => {
    const event = createEvent({
      id: '00000000-0000-4000-8000-000000000001',
      type: 'journal.entry.created',
      producer: 'journal-service',
      payload: { entry_id: 'e1' },
      occurred_at: '2026-08-06T08:00:00.000Z',
      schema_version: 2,
      aggregate: { type: 'journal-entry', id: 'e1' },
      idempotency_key: 'entry-id:e1',
      request_id: 'req-123',
      traceparent: '00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01',
    });
    expect(event.id).toBe('00000000-0000-4000-8000-000000000001');
    expect(event.occurred_at).toBe('2026-08-06T08:00:00.000Z');
    expect(event.schema_version).toBe(2);
    expect(event.aggregate).toEqual({ type: 'journal-entry', id: 'e1' });
    expect(event.idempotency_key).toBe('entry-id:e1');
    expect(event.request_id).toBe('req-123');
    expect(event.traceparent).toBe('00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01');
  });

  it('rejects unknown event types', () => {
    const options = {
      type: 'nope',
      producer: 'x',
      payload: {},
    } as unknown as CreateEventOptions<unknown>;
    expect(() => createEvent(options)).toThrow(EventValidationError);
  });

  it('rejects events without a producer', () => {
    const options = {
      type: 'user.enrolled',
      producer: '  ',
      payload: {},
    } as unknown as CreateEventOptions<unknown>;
    expect(() => createEvent(options)).toThrow('requires a producer');
  });

  it('serialize/parse round-trips the full envelope and payload', () => {
    const original = createEvent({
      id: '00000000-0000-4000-8000-000000000002',
      type: 'pregnancy.week.changed',
      producer: 'pregnancy-engine',
      payload: { user_id: 'u1', week: 12, trimester: 2, edd: '2027-02-01' },
      idempotency_key: 'user:u1:week:12',
      aggregate: { type: 'pregnancy', id: 'u1' },
    });
    const parsed = parseEvent<typeof original.payload>(serializeEvent(original));
    expect(parsed).toEqual(original);
    expect(parsed.payload.week).toBe(12);
  });

  it('parseEvent rejects malformed input', () => {
    expect(() => parseEvent('not json')).toThrow('not valid JSON');
    expect(() => parseEvent('[1,2,3]')).toThrow('must be a JSON object');
    expect(() => parseEvent('null')).toThrow('must be a JSON object');
  });

  it('parseEvent rejects missing or invalid envelope fields', () => {
    const base: DomainEvent = {
      id: '00000000-0000-4000-8000-000000000003',
      type: 'user.enrolled',
      producer: 'user-service',
      occurred_at: '2026-08-06T08:00:00.000Z',
      schema_version: 1,
      aggregate: null,
      idempotency_key: '00000000-0000-4000-8000-000000000003',
      payload: {},
    };
    expect(() => parseEvent(JSON.stringify({ ...base, id: '' }))).toThrow("'id'");
    expect(() => parseEvent(JSON.stringify({ ...base, type: 'nope' }))).toThrow(
      'Unknown event type',
    );
    expect(() => parseEvent(JSON.stringify({ ...base, producer: '' }))).toThrow("'producer'");
    expect(() => parseEvent(JSON.stringify({ ...base, occurred_at: 'yesterday' }))).toThrow(
      "'occurred_at'",
    );
    expect(() => parseEvent(JSON.stringify({ ...base, schema_version: '1' }))).toThrow(
      "'schema_version'",
    );
    expect(() => parseEvent(JSON.stringify({ ...base, idempotency_key: '' }))).toThrow(
      "'idempotency_key'",
    );
  });
});
