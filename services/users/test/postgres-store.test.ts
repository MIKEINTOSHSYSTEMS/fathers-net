import { Pool } from 'pg';
import { createPostgresUsersStore } from '../src/services/store/postgres-store';

jest.mock('pg', () => ({
  Pool: jest.fn(),
}));

interface PgCall {
  text: string;
  values?: unknown[];
}

/**
 * Hermetic Postgres-store unit tests (WP-017). A fake Pool scripts query
 * results and records every statement so the SQL generation and row mappers
 * are exercised without a live database; the real end-to-end adapter is
 * verified by the gated integration test against USERS_TEST_DATABASE_URL.
 */
class FakePg {
  calls: PgCall[] = [];
  responses: Array<{ rows: Record<string, unknown>[] }> = [];
  ended = false;
  throwAfter = Number.POSITIVE_INFINITY;

  private run = async (
    text: string,
    values?: unknown[],
  ): Promise<{ rows: Record<string, unknown>[] }> => {
    this.calls.push({ text, values });
    if (this.calls.length > this.throwAfter) {
      throw new Error('duplicate key');
    }
    return this.responses.shift() ?? { rows: [] };
  };

  query = this.run;

  connect = async (): Promise<{
    query: (text: string, values?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }>;
    release: jest.Mock;
  }> => {
    return {
      query: this.run,
      release: jest.fn(),
    };
  };

  end = async (): Promise<void> => {
    this.ended = true;
  };
}

const USER_ROW = {
  id: 'u1',
  phone_e164: 'cipher.1',
  phone_e164_digest: 'digest.1',
  role: 'father',
  status: 'active',
  created_at: new Date('2025-01-01T00:00:00Z'),
  updated_at: new Date('2025-01-01T00:00:00Z'),
  deleted_at: null,
};

const PROFILE_ROW = {
  user_id: 'u1',
  first_name: 'Abebe',
  last_name: 'Kebede',
  country: 'ET',
  region: 'Addis Ababa',
  age_group: '25-34',
  language: 'am',
  cohort: 'urban_fathers',
};

const PREGNANCY_ROW = {
  id: 'p1',
  user_id: 'u1',
  edd: new Date('2025-10-01T00:00:00Z'),
  lmp: null,
  pregnancy_week: 9,
  trimester: 1,
  partner_user_id: null,
};

const PREFERENCES_ROW = {
  user_id: 'u1',
  language: 'am',
  quiet_hours: { start: '22:00', end: '07:00' },
  notification_channels: ['sms'],
  content_categories: ['nutrition'],
};

describe('users store Postgres adapter (SQL generation, hermetic)', () => {
  let fake: FakePg;

  beforeEach(() => {
    fake = new FakePg();
    (Pool as unknown as jest.Mock).mockImplementation(() => fake);
  });

  it('finds a user by digest with parameterized SQL', async () => {
    const store = createPostgresUsersStore('postgres://test');
    fake.responses.push({ rows: [USER_ROW] });
    await expect(store.findByPhoneDigest('digest.1')).resolves.toMatchObject({
      id: 'u1',
      phoneE164: 'cipher.1',
      phoneE164Digest: 'digest.1',
      createdAt: '2025-01-01T00:00:00.000Z',
    });
    expect(fake.calls[0].text).toContain('FROM users');
    expect(fake.calls[0].text).toContain('phone_e164_digest = $1');
    expect(fake.calls[0].values).toEqual(['digest.1']);
  });

  it('returns null when the digest lookup misses', async () => {
    const store = createPostgresUsersStore('postgres://test');
    await expect(store.findByPhoneDigest('missing')).resolves.toBeNull();
  });

  it('returns null when a user row is missing', async () => {
    const store = createPostgresUsersStore('postgres://test');
    await expect(store.findById('u1')).resolves.toBeNull();
  });

  it('reads a profile row into a ProfileRecord', async () => {
    const store = createPostgresUsersStore('postgres://test');
    fake.responses.push({ rows: [PROFILE_ROW] });
    await expect(store.getProfile('u1')).resolves.toEqual({
      userId: 'u1',
      firstName: 'Abebe',
      lastName: 'Kebede',
      country: 'ET',
      region: 'Addis Ababa',
      ageGroup: '25-34',
      language: 'am',
      cohort: 'urban_fathers',
    });
    expect(fake.calls[0].text).toContain('FROM profiles');
  });

  it('reads the latest pregnancy row and parses DATE columns', async () => {
    const store = createPostgresUsersStore('postgres://test');
    fake.responses.push({ rows: [PREGNANCY_ROW] });
    await expect(store.getPregnancy('u1')).resolves.toEqual({
      id: 'p1',
      userId: 'u1',
      edd: '2025-10-01',
      lmp: null,
      pregnancyWeek: 9,
      trimester: 1,
      partnerUserId: null,
    });
    expect(fake.calls[0].text).toContain('ORDER BY id DESC LIMIT 1');
  });

  it('reads preferences and parses JSONB columns', async () => {
    const store = createPostgresUsersStore('postgres://test');
    fake.responses.push({ rows: [PREFERENCES_ROW] });
    await expect(store.getPreferences('u1')).resolves.toEqual({
      userId: 'u1',
      language: 'am',
      quietHours: { start: '22:00', end: '07:00' },
      notificationChannels: ['sms'],
      contentCategories: ['nutrition'],
    });
    expect(fake.calls[0].text).toContain('FROM user_preferences');
  });

  it('creates a user inside a transaction', async () => {
    const store = createPostgresUsersStore('postgres://test');
    fake.responses.push({ rows: [] }); // BEGIN
    fake.responses.push({ rows: [USER_ROW] }); // INSERT users ... RETURNING
    const user = await store.createUser({
      phoneE164: 'cipher.1',
      phoneE164Digest: 'digest.1',
      role: 'father',
      profile: {
        firstName: 'Abebe',
        lastName: 'Kebede',
        country: 'ET',
        region: null,
        ageGroup: null,
        language: 'am',
        cohort: null,
      },
      pregnancy: null,
      preferences: null,
    });
    expect(user.id).toBe('u1');

    const texts = fake.calls.map((c) => c.text);
    expect(texts[0]).toBe('BEGIN');
    expect(texts[1]).toContain('INSERT INTO users');
    expect(texts[2]).toContain('INSERT INTO profiles');
    expect(texts.join('\n')).toContain('COMMIT');
  });

  it('creates pregnancy and preferences rows when provided', async () => {
    const store = createPostgresUsersStore('postgres://test');
    fake.responses.push({ rows: [] }); // BEGIN
    fake.responses.push({ rows: [USER_ROW] }); // INSERT users ... RETURNING
    await store.createUser({
      phoneE164: 'cipher.1',
      phoneE164Digest: 'digest.1',
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
      pregnancy: { edd: '2025-10-01', lmp: null, pregnancyWeek: 9, trimester: 1 },
      preferences: {
        language: 'en',
        quietHours: { start: '22:00', end: '07:00' },
        notificationChannels: ['sms'],
        contentCategories: null,
      },
    });
    const texts = fake.calls.map((c) => c.text);
    expect(texts.join('\n')).toContain('INSERT INTO pregnancies');
    expect(texts.join('\n')).toContain('INSERT INTO user_preferences');
    const prefsCall = fake.calls.find((c) => c.text.includes('INSERT INTO user_preferences'));
    expect(prefsCall?.values).toEqual([
      'u1',
      'en',
      JSON.stringify({ start: '22:00', end: '07:00' }),
      JSON.stringify(['sms']),
      null,
    ]);
  });

  it('rolls back and rethrows when the transaction fails', async () => {
    const store = createPostgresUsersStore('postgres://test');
    fake.throwAfter = 1; // BEGIN ok; INSERT users throws; ROLLBACK runs.
    await expect(
      store.createUser({
        phoneE164: 'cipher.1',
        phoneE164Digest: 'digest.1',
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
      }),
    ).rejects.toThrow('duplicate key');
    expect(fake.calls.map((c) => c.text)).toContain('ROLLBACK');
  });

  it('updates the given profile columns only', async () => {
    const store = createPostgresUsersStore('postgres://test');
    fake.responses.push({ rows: [] }); // BEGIN
    fake.responses.push({ rows: [{ ...PROFILE_ROW, first_name: 'Updated', cohort: 'c2' }] });
    const updated = await store.updateProfile('u1', { firstName: 'Updated', cohort: 'c2' });
    expect(updated.firstName).toBe('Updated');
    expect(updated.cohort).toBe('c2');

    expect(fake.calls[0].text).toBe('BEGIN');
    const updateCall = fake.calls[1];
    expect(updateCall.text).toContain('UPDATE profiles SET first_name = $1, cohort = $2');
    expect(updateCall.text).toContain('WHERE user_id = $3');
    expect(updateCall.values).toEqual(['Updated', 'c2', 'u1']);
    expect(fake.calls[2].text).toContain('UPDATE users SET updated_at');
    expect(fake.calls.map((c) => c.text)).toContain('COMMIT');
  });

  it('throws when updating a missing profile', async () => {
    const store = createPostgresUsersStore('postgres://test');
    await expect(store.updateProfile('u1', { firstName: 'X' })).rejects.toThrow(
      'No profile for user u1',
    );
  });

  it('updates an existing pregnancy row when one exists', async () => {
    const store = createPostgresUsersStore('postgres://test');
    fake.responses.push({ rows: [] }); // BEGIN
    fake.responses.push({ rows: [{ id: 'p1' }] }); // SELECT id FROM pregnancies
    fake.responses.push({ rows: [PREGNANCY_ROW] }); // UPDATE pregnancies ... RETURNING
    const result = await store.upsertPregnancy('u1', {
      edd: '2025-10-01',
      lmp: null,
      pregnancyWeek: 9,
      trimester: 1,
    });
    expect(result.edd).toBe('2025-10-01');
    const texts = fake.calls.map((c) => c.text);
    expect(texts[0]).toBe('BEGIN');
    expect(texts[1]).toContain('SELECT id FROM pregnancies');
    expect(texts[2]).toContain('UPDATE pregnancies SET edd = $2');
    expect(texts).toContain('COMMIT');
  });

  it('inserts a pregnancy row when none exists', async () => {
    const store = createPostgresUsersStore('postgres://test');
    fake.responses.push({ rows: [] }); // BEGIN
    fake.responses.push({ rows: [] }); // SELECT id FROM pregnancies (no row)
    fake.responses.push({ rows: [PREGNANCY_ROW] }); // INSERT pregnancies ... RETURNING
    const result = await store.upsertPregnancy('u1', {
      edd: '2025-10-01',
      lmp: null,
      pregnancyWeek: 9,
      trimester: 1,
    });
    expect(result.id).toBe('p1');
    const texts = fake.calls.map((c) => c.text);
    expect(texts[0]).toBe('BEGIN');
    expect(texts[1]).toContain('SELECT id FROM pregnancies');
    expect(texts[2]).toContain('INSERT INTO pregnancies');
    expect(texts).toContain('COMMIT');
  });

  it('upserts preferences with COALESCE preserving unspecified fields', async () => {
    const store = createPostgresUsersStore('postgres://test');
    fake.responses.push({ rows: [PREFERENCES_ROW] });
    const result = await store.upsertPreferences('u1', {
      language: null,
      quietHours: null,
      notificationChannels: ['sms'],
      contentCategories: null,
    });
    expect(result.language).toBe('am');
    const insertCall = fake.calls[0];
    expect(insertCall.text).toContain('ON CONFLICT (user_id) DO UPDATE SET');
    expect(insertCall.text).toContain('COALESCE(EXCLUDED.notification_channels');
    expect(insertCall.values).toEqual(['u1', null, null, JSON.stringify(['sms']), null]);
  });

  it('dispose ends the pool', async () => {
    const store = createPostgresUsersStore('postgres://test');
    await store.dispose();
    expect(fake.ended).toBe(true);
  });
});

describe('users store outbox transactional write (WP-024c, D-03)', () => {
  let fake: FakePg;

  const ENTRY = {
    eventId: 'e-1',
    eventType: 'user.enrolled',
    producer: 'user-service',
    schemaVersion: 1,
    occurredAt: '2025-03-01T12:00:00.000Z',
    aggregateType: 'user',
    aggregateId: 'u1',
    idempotencyKey: 'u1',
    payload: { user_id: 'u1' },
  };

  beforeEach(() => {
    fake = new FakePg();
    (Pool as unknown as jest.Mock).mockImplementation(() => fake);
  });

  function userInput() {
    return {
      id: 'u1',
      phoneE164: 'cipher.1',
      phoneE164Digest: 'digest.1',
      role: 'father' as const,
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
    };
  }

  it('writes the outbox row inside the same transaction as the domain write (createUser)', async () => {
    const store = createPostgresUsersStore('postgres://test');
    fake.responses.push({ rows: [] }); // BEGIN
    fake.responses.push({ rows: [USER_ROW] }); // INSERT users ... RETURNING
    const user = await store.createUser(userInput(), [ENTRY]);
    expect(user.id).toBe('u1');

    const texts = fake.calls.map((c) => c.text);
    const outboxIdx = texts.findIndex((t) => t.includes('INSERT INTO user_outbox'));
    expect(outboxIdx).toBeGreaterThan(1);
    expect(texts.indexOf('COMMIT')).toBeGreaterThan(outboxIdx);
    expect(texts[0]).toBe('BEGIN');

    const outboxCall = fake.calls[outboxIdx];
    expect(outboxCall.values).toEqual([
      'e-1',
      'user.enrolled',
      'user-service',
      1,
      '2025-03-01T12:00:00.000Z',
      'user',
      'u1',
      'u1',
      JSON.stringify({ user_id: 'u1' }),
    ]);
  });

  it('writes the outbox row inside updateProfile and upsertPregnancy transactions', async () => {
    const store = createPostgresUsersStore('postgres://test');
    fake.responses.push({ rows: [] }); // BEGIN
    fake.responses.push({ rows: [{ ...PROFILE_ROW, first_name: 'Updated' }] }); // UPDATE profiles ... RETURNING
    const updated = await store.updateProfile('u1', { firstName: 'Updated' }, [
      {
        ...ENTRY,
        eventType: 'user.profile.updated',
        payload: { user_id: 'u1', changed: ['firstName'] },
      },
    ]);
    expect(updated.firstName).toBe('Updated');
    let texts = fake.calls.map((c) => c.text);
    let outboxIdx = texts.findIndex((t) => t.includes('INSERT INTO user_outbox'));
    expect(outboxIdx).toBeGreaterThan(0);
    expect(texts.indexOf('COMMIT')).toBeGreaterThan(outboxIdx);
    expect(fake.calls[outboxIdx].values?.[1]).toBe('user.profile.updated');

    fake.responses.push({ rows: [] }); // BEGIN
    fake.responses.push({ rows: [{ id: 'p1' }] }); // SELECT id FROM pregnancies
    fake.responses.push({ rows: [PREGNANCY_ROW] }); // UPDATE pregnancies ... RETURNING
    await store.upsertPregnancy(
      'u1',
      { edd: '2025-10-01', lmp: null, pregnancyWeek: 9, trimester: 1 },
      [{ ...ENTRY, eventType: 'pregnancy.week.changed', payload: { user_id: 'u1', week: 9 } }],
    );
    texts = fake.calls.map((c) => c.text);
    const selectIdx = texts.findIndex((t) => t.includes('SELECT id FROM pregnancies'));
    outboxIdx = texts.findIndex((t, i) => i > selectIdx && t.includes('INSERT INTO user_outbox'));
    expect(outboxIdx).toBeGreaterThan(1);
    const commitIdx = texts.findIndex((t, i) => i > outboxIdx && t === 'COMMIT');
    expect(commitIdx).toBeGreaterThan(outboxIdx);
    expect(fake.calls[outboxIdx].values?.[1]).toBe('pregnancy.week.changed');
  });

  it('rolls back the outbox write when the domain write fails', async () => {
    const store = createPostgresUsersStore('postgres://test');
    fake.throwAfter = 1; // BEGIN ok; INSERT users throws; ROLLBACK runs.
    await expect(store.createUser(userInput(), [ENTRY])).rejects.toThrow('duplicate key');
    const texts = fake.calls.map((c) => c.text);
    expect(texts).toContain('ROLLBACK');
    expect(texts.filter((t) => t.includes('INSERT INTO user_outbox'))).toHaveLength(0);
  });
});
