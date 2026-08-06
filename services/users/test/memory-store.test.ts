import { createMemoryUsersStore } from '../src/services/store/memory-store';

describe('memory users store (WP-017 test-double)', () => {
  const store = () => createMemoryUsersStore();

  const input = () => ({
    phoneE164: 'cipher.1',
    phoneE164Digest: 'digest-1',
    role: 'father' as const,
    profile: {
      firstName: 'Abebe',
      lastName: 'Kebede',
      country: 'ET',
      region: 'Addis Ababa',
      ageGroup: '25-34',
      language: 'am',
      cohort: 'urban_fathers',
    },
    pregnancy: null,
    preferences: {
      language: 'am',
      quietHours: null,
      notificationChannels: null,
      contentCategories: null,
    },
  });

  it('creates a user atomically with its child rows', async () => {
    const s = store();
    const user = await s.createUser(input());
    expect(user.id).toMatch(/^[0-9a-f-]{36}$/i);
    expect(user.role).toBe('father');
    expect(user.status).toBe('active');

    await expect(s.findById(user.id)).resolves.toEqual(user);
    await expect(s.findByPhoneDigest('digest-1')).resolves.toEqual(user);
    await expect(s.getProfile(user.id)).resolves.toMatchObject({ firstName: 'Abebe' });
    await expect(s.getPreferences(user.id)).resolves.toMatchObject({ language: 'am' });
    await expect(s.getPregnancy(user.id)).resolves.toBeNull();
  });

  it('enforces digest uniqueness on lookup', async () => {
    const s = store();
    await s.createUser(input());
    await expect(s.findByPhoneDigest('digest-1')).resolves.not.toBeNull();
    await expect(s.findByPhoneDigest('digest-other')).resolves.toBeNull();
  });

  it('stores only the ciphertext it is given (never plaintext)', async () => {
    const s = store();
    const user = await s.createUser({ ...input(), phoneE164: 'not-the-plaintext' });
    expect(user.phoneE164).toBe('not-the-plaintext');
    const read = await s.findById(user.id);
    expect(read?.phoneE164).toBe('not-the-plaintext');
  });

  it('merges profile updates onto the existing row', async () => {
    const s = store();
    const user = await s.createUser(input());
    const updated = await s.updateProfile(user.id, { firstName: 'Updated', cohort: 'cohort_2' });
    expect(updated.firstName).toBe('Updated');
    expect(updated.cohort).toBe('cohort_2');
    expect(updated.lastName).toBe('Kebede');
  });

  it('upserts pregnancy by inserting then updating the same row', async () => {
    const s = store();
    const user = await s.createUser(input());
    const first = await s.upsertPregnancy(user.id, {
      edd: '2025-10-01',
      lmp: null,
      pregnancyWeek: 9,
      trimester: 1,
    });
    const second = await s.upsertPregnancy(user.id, {
      edd: '2025-10-15',
      lmp: null,
      pregnancyWeek: 10,
      trimester: 1,
    });
    expect(first.id).toBe(second.id);
    expect(second.edd).toBe('2025-10-15');
  });

  it('upserts preferences preserving unspecified fields', async () => {
    const s = store();
    const user = await s.createUser(input());
    await s.upsertPreferences(user.id, {
      language: null,
      quietHours: { start: '22:00', end: '07:00' },
      notificationChannels: ['sms'],
      contentCategories: null,
    });
    const prefs = await s.getPreferences(user.id);
    expect(prefs).toEqual({
      userId: user.id,
      language: 'am',
      quietHours: { start: '22:00', end: '07:00' },
      notificationChannels: ['sms'],
      contentCategories: null,
    });
  });

  it('dispose clears all state', async () => {
    const s = store();
    const user = await s.createUser(input());
    await s.dispose();
    await expect(s.findById(user.id)).resolves.toBeNull();
  });
});
