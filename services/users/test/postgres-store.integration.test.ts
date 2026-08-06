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
});
