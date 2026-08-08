import { createTestLogger } from '@fathersnet/test-utils';
import { ConflictError, NotFoundError, ValidationError } from '@fathersnet/errors';
import { ConsentsService } from '../src/services/consents-service';
import { createMemoryUsersStore, type MemoryUsersStore } from '../src/services/store/memory-store';

describe('ConsentsService (WP-018, AR-012, FR-125)', () => {
  const NOW = new Date('2025-03-01T12:00:00Z').getTime();
  const V1 = 'v1.0';
  const V2 = 'v2.0';

  let store: MemoryUsersStore;
  let service: ConsentsService;
  let userId: string;
  let clockMs: number;

  function tick(): number {
    // The DB assigns a fresh `now()` to each insert; advance the injectable
    // clock so records never share a `granted_at` (matching reality and the
    // `004` trigger's (granted_at, id) ordering).
    const t = clockMs;
    clockMs += 1000;
    return t;
  }

  function build(): void {
    const { logger } = createTestLogger('debug');
    store = createMemoryUsersStore();
    service = new ConsentsService({ store, logger, nowMs: tick });
  }

  beforeEach(async () => {
    clockMs = NOW;
    build();
    const user = await store.createUser({
      phoneE164: 'cipher.1',
      phoneE164Digest: 'digest-1',
      role: 'father',
      profile: {
        firstName: 'Abebe',
        lastName: 'Kebede',
        country: null,
        region: null,
        ageGroup: null,
        language: 'en',
        cohort: null,
      },
      pregnancy: null,
      preferences: null,
    });
    userId = user.id;
  });

  it('grants a consent, emits user.consent.changed (no PII), and returns the immutable record', async () => {
    const record = await service.grantConsent(userId, {
      consentType: 'participation',
      version: V1,
      requestId: 'req-1',
    });

    expect(record).toMatchObject({
      userId,
      consentType: 'participation',
      version: V1,
      state: 'granted',
      withdrawnAt: null,
    });
    expect(record.grantedAt).toBe(new Date(NOW).toISOString());

    expect(store.outboxLog).toHaveLength(1);
    const entry = store.outboxLog[0];
    expect(entry.eventType).toBe('user.consent.changed');
    expect(entry.producer).toBe('user-service');
    expect(entry.aggregateType).toBe('user');
    expect(entry.aggregateId).toBe(userId);
    expect(entry.payload).toMatchObject({
      user_id: userId,
      consent_type: 'participation',
      version: V1,
      state: 'granted',
    });
    expect(JSON.stringify(store.outboxLog)).not.toContain('Abebe');
  });

  it('rejects a second grant of the same type (single active grant)', async () => {
    await service.grantConsent(userId, { consentType: 'research', version: V1 });
    await expect(
      service.grantConsent(userId, { consentType: 'research', version: V2 }),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it('supports the full lifecycle: grant -> withdraw -> re-consent', async () => {
    const granted = await service.grantConsent(userId, {
      consentType: 'media',
      version: V1,
    });

    const withdrawn = await service.withdrawConsent(userId, { consentId: granted.id });
    expect(withdrawn).toMatchObject({ state: 'withdrawn', version: V1 });
    expect(withdrawn.withdrawnAt).toBe(new Date(NOW + 1000).toISOString());

    const reconsented = await service.grantConsent(userId, {
      consentType: 'media',
      version: V2,
    });
    expect(reconsented.state).toBe('granted');

    const { consents } = await service.getConsents(userId);
    const media = consents.find((c) => c.consentType === 'media') as NonNullable<
      (typeof consents)[number]
    >;
    expect(media.state).toBe('granted');
    expect(media.version).toBe(V2);
    expect(media.history).toHaveLength(3);
    expect(media.history.map((r) => r.state)).toEqual(['granted', 'withdrawn', 'granted']);

    const states = store.outboxLog.map((e) => (e.payload as { state?: string }).state ?? 'missing');
    expect(states).toEqual(['granted', 'withdrawn', 'granted']);
  });

  it('rejects withdrawing an already-withdrawn consent (idempotency, 409)', async () => {
    const granted = await service.grantConsent(userId, { consentType: 'media', version: V1 });
    await service.withdrawConsent(userId, { consentId: granted.id });
    await expect(service.withdrawConsent(userId, { consentId: granted.id })).rejects.toBeInstanceOf(
      ConflictError,
    );
  });

  it('returns 404 for an unknown or non-owned consent id (self-scoped)', async () => {
    const other = await store.createUser({
      phoneE164: 'cipher.2',
      phoneE164Digest: 'digest-2',
      role: 'father',
      profile: {
        firstName: 'A',
        lastName: 'B',
        country: null,
        region: null,
        ageGroup: null,
        language: 'en',
        cohort: null,
      },
      pregnancy: null,
      preferences: null,
    });
    const otherConsent = await store.insertConsent({
      userId: other.id,
      consentType: 'participation',
      version: V1,
      state: 'granted',
      grantedAt: new Date(NOW).toISOString(),
      withdrawnAt: null,
    });

    await expect(
      service.withdrawConsent(userId, { consentId: otherConsent.id }),
    ).rejects.toBeInstanceOf(NotFoundError);
    await expect(
      service.withdrawConsent(userId, { consentId: '00000000-0000-4000-8000-000000000000' }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it('returns 404 for an unknown user on grant/withdraw/view', async () => {
    const ghost = '00000000-0000-4000-8000-000000000000';
    await expect(
      service.grantConsent(ghost, { consentType: 'participation', version: V1 }),
    ).rejects.toBeInstanceOf(NotFoundError);
    await expect(service.withdrawConsent(ghost, { consentId: 'x' })).rejects.toBeInstanceOf(
      NotFoundError,
    );
    await expect(service.getConsents(ghost)).rejects.toBeInstanceOf(NotFoundError);
  });

  it('rejects an invalid consent type or version with field-level validation', async () => {
    await expect(
      service.grantConsent(userId, { consentType: 'crypto' as never, version: V1 }),
    ).rejects.toBeInstanceOf(ValidationError);
    await expect(
      service.grantConsent(userId, { consentType: 'research', version: '' }),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it('enforces no-over-collection and immutability: returned records cannot mutate the stream', async () => {
    const granted = await service.grantConsent(userId, {
      consentType: 'whatsapp_opt_in',
      version: V1,
    });

    // The caller's copy is safe to mutate without affecting the store.
    granted.state = 'withdrawn';
    granted.withdrawnAt = new Date(NOW).toISOString();
    (granted as unknown as Record<string, unknown>).extra = 'junk';

    const { consents } = await service.getConsents(userId);
    const whatsapp = consents[0];
    expect(whatsapp.state).toBe('granted');
    expect(whatsapp.withdrawnAt).toBeNull();
    expect(whatsapp.history[0]).not.toHaveProperty('extra');
    // The stream is the immutable source of truth — the stored record carries
    // only the minimum fields (FR-124), no injected attributes.
    expect(Object.keys(whatsapp.history[0]).sort()).toEqual(
      ['id', 'userId', 'consentType', 'version', 'state', 'grantedAt', 'withdrawnAt'].sort(),
    );
  });

  it('lets different consent types progress independently (FR-117)', async () => {
    await service.grantConsent(userId, { consentType: 'participation', version: V1 });
    await service.grantConsent(userId, { consentType: 'research', version: V1 });
    const { consents } = await service.getConsents(userId);

    expect(consents.map((c) => c.consentType).sort()).toEqual(['participation', 'research']);
    const research = consents.find(
      (c) => c.consentType === 'research',
    ) as (typeof consents)[number];
    // Withdrawing research must not affect the separate participation grant.
    const record = await service.withdrawConsent(userId, { consentId: research.history[0].id });
    expect(record.consentType).toBe('research');

    const after = await service.getConsents(userId);
    expect(after.consents.find((c) => c.consentType === 'research')?.state).toBe('withdrawn');
    expect(after.consents.find((c) => c.consentType === 'participation')?.state).toBe('granted');
  });
});
