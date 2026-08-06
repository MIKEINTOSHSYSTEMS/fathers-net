import { Pool } from 'pg';
import { ConflictError } from '@fathersnet/errors';
import { createPostgresUsersStore } from '../src/services/store/postgres-store';
import type { CreateUserInput } from '../src/services/store/types';

const TEST_DATABASE_URL = process.env.USERS_TEST_DATABASE_URL;
const describeIntegration = TEST_DATABASE_URL ? describe : describe.skip;

function buildInput(): CreateUserInput {
  return {
    phoneE164: `cipher.${Math.random().toString(36).slice(2)}`,
    phoneE164Digest: `digest.${Math.random().toString(36).slice(2)}`,
    role: 'father',
    profile: {
      firstName: 'Abebe',
      lastName: 'Kebede',
      country: 'ET',
      region: 'Addis Ababa',
      ageGroup: '25-34',
      language: 'am',
      cohort: 'urban_fathers',
    },
    pregnancy: {
      edd: '2025-10-01',
      lmp: null,
      pregnancyWeek: 9,
      trimester: 1,
    },
    preferences: {
      language: 'am',
      quietHours: { start: '22:00', end: '07:00' },
      notificationChannels: ['sms', 'whatsapp'],
      contentCategories: ['nutrition'],
    },
  };
}

describeIntegration('users store Postgres adapter (baseline schema)', () => {
  let store: ReturnType<typeof createPostgresUsersStore>;

  beforeEach(async () => {
    store = createPostgresUsersStore(TEST_DATABASE_URL as string);
  });

  afterEach(async () => {
    await store.dispose();
  });

  it('creates a user atomically with profile, pregnancy, and preferences', async () => {
    const input = buildInput();
    const user = await store.createUser(input);
    expect(user.id).toMatch(/^[0-9a-f-]{36}$/i);
    expect(user.phoneE164).toBe(input.phoneE164);
    expect(user.phoneE164Digest).toBe(input.phoneE164Digest);

    await expect(store.findByPhoneDigest(input.phoneE164Digest)).resolves.toMatchObject({
      id: user.id,
    });
    await expect(store.findById(user.id)).resolves.toMatchObject({ id: user.id });
    await expect(store.getProfile(user.id)).resolves.toMatchObject({
      firstName: 'Abebe',
      country: 'ET',
    });
    await expect(store.getPregnancy(user.id)).resolves.toMatchObject({
      edd: '2025-10-01',
      pregnancyWeek: 9,
      trimester: 1,
    });
    await expect(store.getPreferences(user.id)).resolves.toMatchObject({
      language: 'am',
      notificationChannels: ['sms', 'whatsapp'],
      contentCategories: ['nutrition'],
      quietHours: { start: '22:00', end: '07:00' },
    });
  });

  it('rejects a duplicate digest (unique index)', async () => {
    const input = buildInput();
    await store.createUser(input);
    await expect(store.createUser(input)).rejects.toThrow();
  });

  it('updates profile columns and touches updated_at', async () => {
    const user = await store.createUser(buildInput());
    const updated = await store.updateProfile(user.id, { firstName: 'Updated', cohort: 'c2' });
    expect(updated.firstName).toBe('Updated');
    expect(updated.cohort).toBe('c2');
    expect(updated.lastName).toBe('Kebede');
  });

  it('upserts pregnancy by updating the existing row', async () => {
    const user = await store.createUser(buildInput());
    const first = await store.getPregnancy(user.id);
    const second = await store.upsertPregnancy(user.id, {
      edd: '2025-10-15',
      lmp: null,
      pregnancyWeek: 10,
      trimester: 1,
    });
    expect(second.id).toBe(first?.id);
    expect(second.edd).toBe('2025-10-15');
  });

  it('upserts preferences preserving unspecified fields via COALESCE', async () => {
    const user = await store.createUser(buildInput());
    await store.upsertPreferences(user.id, {
      language: null,
      quietHours: null,
      notificationChannels: ['sms'],
      contentCategories: null,
    });
    const prefs = await store.getPreferences(user.id);
    expect(prefs?.language).toBe('am');
    expect(prefs?.quietHours).toEqual({ start: '22:00', end: '07:00' });
    expect(prefs?.notificationChannels).toEqual(['sms']);
    expect(prefs?.contentCategories).toEqual(['nutrition']);
  });

  describe('consent stream (WP-018, AR-012)', () => {
    let userId: string;

    beforeEach(async () => {
      const user = await store.createUser(buildInput());
      userId = user.id;
    });

    it('appends the immutable lifecycle: grant -> withdraw -> re-consent', async () => {
      const granted = await store.insertConsent({
        userId,
        consentType: 'participation',
        version: 'v1.0',
        state: 'granted',
        grantedAt: new Date('2025-03-01T12:00:00Z').toISOString(),
        withdrawnAt: null,
      });
      expect(granted).toMatchObject({ userId, consentType: 'participation', state: 'granted' });
      expect(granted.withdrawnAt).toBeNull();

      await expect(store.getConsents(userId)).resolves.toHaveLength(1);
      await expect(store.findConsentById(userId, granted.id)).resolves.toMatchObject({
        consentType: 'participation',
      });
      // Self-scoping: the record is invisible to another owner.
      await expect(
        store.findConsentById('00000000-0000-4000-8000-000000000000', granted.id),
      ).resolves.toBeNull();

      const withdrawn = await store.insertConsent({
        userId,
        consentType: 'participation',
        version: 'v1.0',
        state: 'withdrawn',
        grantedAt: new Date('2025-03-01T12:00:02Z').toISOString(),
        withdrawnAt: new Date('2025-03-01T12:00:02Z').toISOString(),
      });
      expect(withdrawn).toMatchObject({ state: 'withdrawn' });
      expect(withdrawn.withdrawnAt).toBeTruthy();

      await store.insertConsent({
        userId,
        consentType: 'participation',
        version: 'v2.0',
        state: 'granted',
        grantedAt: new Date('2025-03-01T12:00:03Z').toISOString(),
        withdrawnAt: null,
      });

      const consents = await store.getConsents(userId);
      expect(consents).toHaveLength(3);
      expect(consents.map((c) => c.state)).toEqual(['granted', 'withdrawn', 'granted']);
      expect(consents.map((c) => c.version)).toEqual(['v1.0', 'v1.0', 'v2.0']);
    });

    it('rejects a duplicate grant as a ConflictError (single active grant)', async () => {
      await store.insertConsent({
        userId,
        consentType: 'research',
        version: 'v1.0',
        state: 'granted',
        grantedAt: new Date('2025-03-01T12:00:00Z').toISOString(),
        withdrawnAt: null,
      });
      await expect(
        store.insertConsent({
          userId,
          consentType: 'research',
          version: 'v2.0',
          state: 'granted',
          grantedAt: new Date('2025-03-01T12:00:01Z').toISOString(),
          withdrawnAt: null,
        }),
      ).rejects.toBeInstanceOf(ConflictError);
    });

    it('rejects a first record that is not a grant', async () => {
      await expect(
        store.insertConsent({
          userId,
          consentType: 'media',
          version: 'v1.0',
          state: 'withdrawn',
          grantedAt: new Date('2025-03-01T12:00:00Z').toISOString(),
          withdrawnAt: new Date('2025-03-01T12:00:00Z').toISOString(),
        }),
      ).rejects.toBeInstanceOf(ConflictError);
    });
  });

  it('enforces the append-only trigger: consents rows cannot be updated or deleted', async () => {
    const user = await store.createUser(buildInput());
    const granted = await store.insertConsent({
      userId: user.id,
      consentType: 'participation',
      version: 'v1.0',
      state: 'granted',
      grantedAt: new Date('2025-03-01T12:00:00Z').toISOString(),
      withdrawnAt: null,
    });
    const pool = new Pool({ connectionString: TEST_DATABASE_URL });

    try {
      await expect(
        pool.query(`UPDATE consents SET version = 'v9.9' WHERE id = $1`, [granted.id]),
      ).rejects.toThrow(/append-only/);
      await expect(pool.query(`DELETE FROM consents WHERE id = $1`, [granted.id])).rejects.toThrow(
        /append-only/,
      );
    } finally {
      await pool.end();
    }
  });
});
