import { createTestLogger, type RecordedLog } from '@fathersnet/test-utils';
import { ConflictError, NotFoundError, ValidationError } from '@fathersnet/errors';
import { UsersService } from '../src/services/users-service';
import { PregnancyService } from '../src/services/pregnancy-service';
import { createMemoryUsersStore, type MemoryUsersStore } from '../src/services/store/memory-store';
import { createAesGcmPhoneEncryptor } from '../src/providers/phone-encryption';
import { createPregnancyEngine } from '../src/services/pregnancy';

describe('UsersService (WP-017, SRS §12.3)', () => {
  const PHONE = '+251900000000';
  const ENC_KEY = 'test-phone-encryption-key';
  const DIGEST_KEY = 'test-phone-digest-key';
  const NOW = new Date('2025-03-01T12:00:00Z').getTime();

  let service: UsersService;
  let store: MemoryUsersStore;
  let logs: RecordedLog[];

  function build(): void {
    const { logger, logs: recorded } = createTestLogger('debug');
    logs = recorded;
    store = createMemoryUsersStore();
    const engine = createPregnancyEngine();
    const pregnancyService = new PregnancyService({
      store,
      logger,
      engine,
      nowMs: () => NOW,
    });
    service = new UsersService({
      store,
      logger,
      phoneEncryptor: createAesGcmPhoneEncryptor(ENC_KEY),
      phoneDigestKey: DIGEST_KEY,
      pregnancyEngine: engine,
      pregnancyService,
      nowMs: () => NOW,
    });
  }

  beforeEach(() => {
    build();
  });

  it('registers a user with a masked phone and emits user.enrolled (no PII)', async () => {
    const result = await service.register({
      phone: PHONE,
      firstName: 'Abebe',
      lastName: 'Kebede',
      country: 'ET',
      region: 'Addis Ababa',
      language: 'am',
      cohort: 'urban_fathers',
      requestId: 'req-123',
    });

    expect(result.userId).toMatch(/^[0-9a-f-]{36}$/i);
    expect(result.role).toBe('father');
    expect(result.status).toBe('active');
    expect(result.phoneMasked).toBe('+2519****0000');
    expect(result.phoneMasked).not.toContain('900000');
    expect(result.profile).toMatchObject({
      firstName: 'Abebe',
      lastName: 'Kebede',
      country: 'ET',
      region: 'Addis Ababa',
      language: 'am',
      cohort: 'urban_fathers',
    });
    expect(result.pregnancy).toBeNull();
    expect(result.preferences).toEqual({
      language: 'am',
      quietHours: null,
      notificationChannels: null,
      contentCategories: null,
    });

    expect(store.outboxLog.map((e) => e.eventType)).toEqual(['user.enrolled']);
    const enrolled = store.outboxLog[0];
    expect(enrolled.producer).toBe('user-service');
    expect(enrolled.eventId).toMatch(/^[0-9a-f-]{36}$/i);
    expect(enrolled.aggregateType).toBe('user');
    expect(enrolled.aggregateId).toBe(result.userId);
    expect(enrolled.payload).toMatchObject({
      user_id: result.userId,
      language: 'am',
      region: 'Addis Ababa',
      cohort: 'urban_fathers',
    });
    expect(JSON.stringify(store.outboxLog)).not.toContain(PHONE);
    expect(JSON.stringify(store.outboxLog)).not.toContain('Abebe');
  });

  it('rejects a duplicate phone with a conflict', async () => {
    await service.register({ phone: PHONE, firstName: 'A', lastName: 'B', language: 'en' });
    await expect(
      service.register({ phone: PHONE, firstName: 'C', lastName: 'D', language: 'en' }),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it('rejects invalid registrations with field-level validation', async () => {
    await expect(
      service.register({
        phone: '0911000000',
        firstName: 'A',
        lastName: 'B',
        language: 'sw',
      }),
    ).rejects.toMatchObject({
      name: 'ValidationError',
      fields: expect.arrayContaining([
        { field: 'phone', reason: expect.stringContaining('E.164') },
        { field: 'language', reason: expect.stringContaining('en, am') },
      ]),
    });
  });

  it('computes week/trimester via the pregnancy engine when EDD/LMP provided', async () => {
    const result = await service.register({
      phone: PHONE,
      firstName: 'A',
      lastName: 'B',
      language: 'en',
      lmp: '2025-01-01',
    });
    // 2025-01-01 -> 2025-03-01 = 59 days => week 9, trimester 1.
    expect(result.pregnancy).toEqual({
      edd: null,
      lmp: '2025-01-01',
      pregnancyWeek: 9,
      trimester: 1,
    });
  });

  it('returns the full profile for getProfile and 404 for unknown users', async () => {
    const registered = await service.register({
      phone: PHONE,
      firstName: 'A',
      lastName: 'B',
      language: 'en',
    });
    const profile = await service.getProfile(registered.userId);
    expect(profile.userId).toBe(registered.userId);
    expect(profile.phoneMasked).toBe('+2519****0000');

    await expect(service.getProfile('00000000-0000-4000-8000-000000000000')).rejects.toBeInstanceOf(
      NotFoundError,
    );
  });

  it('updates profile fields, emits user.profile.updated with changed[], and no-ops on empty', async () => {
    const registered = await service.register({
      phone: PHONE,
      firstName: 'A',
      lastName: 'B',
      language: 'en',
    });

    const updated = await service.updateProfile(registered.userId, {
      firstName: 'Abebe',
      cohort: 'cohort_2',
      requestId: 'req-upd',
    });
    expect(updated.profile.firstName).toBe('Abebe');
    expect(updated.profile.cohort).toBe('cohort_2');
    expect(updated.profile.lastName).toBe('B');

    const profileUpdated = store.outboxLog[1];
    expect(profileUpdated.eventType).toBe('user.profile.updated');
    expect(profileUpdated.payload).toEqual({
      user_id: registered.userId,
      changed: ['firstName', 'cohort'],
    });
    expect(JSON.stringify(store.outboxLog)).not.toContain('Abebe');

    const before = store.outboxLog.length;
    await service.updateProfile(registered.userId, {});
    expect(store.outboxLog.length).toBe(before);
  });

  it('validates profile updates', async () => {
    const registered = await service.register({
      phone: PHONE,
      firstName: 'A',
      lastName: 'B',
      language: 'en',
    });
    await expect(
      service.updateProfile(registered.userId, { language: 'fr' }),
    ).rejects.toBeInstanceOf(ValidationError);
    await expect(
      service.updateProfile(registered.userId, { firstName: '' }),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it('upserts pregnancy for the current user and validates EDD/LMP', async () => {
    const registered = await service.register({
      phone: PHONE,
      firstName: 'A',
      lastName: 'B',
      language: 'en',
    });

    const result = await service.updatePregnancy(registered.userId, {
      edd: '2025-10-01',
      requestId: 'req-preg',
    });
    expect(result.pregnancyWeek).toBe(9);
    expect(result.trimester).toBe(1);
    expect(result.edd).toBe('2025-10-01');
    expect(result.lmp).toBeNull();

    expect(store.outboxLog.map((e) => e.eventType)).toEqual([
      'user.enrolled',
      'pregnancy.week.changed',
      'user.profile.updated',
    ]);
    const week = store.outboxLog[1];
    expect(week.producer).toBe('pregnancy-engine');
    expect(week.idempotencyKey).toBe(`${registered.userId}:9`);
    expect(week.payload).toMatchObject({
      user_id: registered.userId,
      week: 9,
      trimester: 1,
      edd: '2025-10-01',
    });

    await expect(
      service.updatePregnancy(registered.userId, { edd: 'not-a-date' }),
    ).rejects.toBeInstanceOf(ValidationError);
    await expect(service.updatePregnancy(registered.userId, {})).rejects.toBeInstanceOf(
      ValidationError,
    );
    await expect(
      service.updatePregnancy('00000000-0000-4000-8000-000000000000', { edd: '2025-10-01' }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it('upserts preferences with validation', async () => {
    const registered = await service.register({
      phone: PHONE,
      firstName: 'A',
      lastName: 'B',
      language: 'en',
    });

    const prefs = await service.updatePreferences(registered.userId, {
      quietHours: { start: '22:00', end: '07:00' },
      notificationChannels: ['sms', 'whatsapp'],
      contentCategories: ['nutrition', 'milestones'],
    });
    expect(prefs.preferences).toEqual({
      language: 'en',
      quietHours: { start: '22:00', end: '07:00' },
      notificationChannels: ['sms', 'whatsapp'],
      contentCategories: ['nutrition', 'milestones'],
    });

    await expect(
      service.updatePreferences(registered.userId, {
        quietHours: { start: '25:00', end: '07:00' },
      }),
    ).rejects.toBeInstanceOf(ValidationError);
    await expect(
      service.updatePreferences(registered.userId, { notificationChannels: ['email'] }),
    ).rejects.toBeInstanceOf(ValidationError);
    await expect(
      service.updatePreferences(registered.userId, {
        contentCategories: ['nutrition', 'nutrition'],
      }),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it('does not log PII anywhere', async () => {
    await service.register({
      phone: PHONE,
      firstName: 'Abebe',
      lastName: 'Kebede',
      language: 'en',
    });
    const serialized = JSON.stringify(logs);
    expect(serialized).not.toContain(PHONE);
    expect(serialized).not.toContain('Abebe');
    expect(serialized).not.toContain('Kebede');
  });
});
