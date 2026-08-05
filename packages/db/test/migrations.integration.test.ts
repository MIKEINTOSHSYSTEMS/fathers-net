import { Client } from 'pg';

import { checkMigrations, runMigrations } from '../src';

/**
 * Migration baseline integration tests (milestone-2 plan §5.1, QR-003).
 *
 * Requires a real Postgres; skipped when DATABASE_URL is absent (the CI
 * `quality` job has none, the `db-baseline` job provides it). Flow:
 *   up (idempotent) -> schema/constraint/behavior assertions -> down all
 *   -> assert clean -> up again (leaves the target DB migrated for CI).
 */

const DATABASE_URL = process.env.DATABASE_URL;

const describeMigrate = DATABASE_URL ? describe : describe.skip;

const MIGRATION_NAMES = [
  '001-extensions-and-schemas',
  '002-users-and-profiles',
  '003-pregnancies-and-babies',
  '004-consents-and-preferences',
];

async function withClient<T>(fn: (client: Client) => Promise<T>): Promise<T> {
  const client = new Client({ connectionString: DATABASE_URL as string });
  await client.connect();
  try {
    return await fn(client);
  } finally {
    await client.end();
  }
}

async function rows(client: Client, sql: string, params: unknown[] = []) {
  const result = await client.query(sql, params);
  return result.rows;
}

describeMigrate('database migration baseline (001-004)', () => {
  beforeAll(async () => {
    await runMigrations({ databaseUrl: DATABASE_URL as string });
  });

  it('records exactly the four baseline migrations in pgmigrations', async () => {
    const result = await checkMigrations(DATABASE_URL as string);
    expect(result.tableExists).toBe(true);
    expect(result.applied).toEqual(MIGRATION_NAMES);
  });

  it('installs extensions, the fn_research schema and research roles (AR-013)', async () => {
    await withClient(async (client) => {
      const extensions = await rows(
        client,
        `SELECT extname FROM pg_extension WHERE extname IN ('pgcrypto', 'pg_trgm') ORDER BY extname`,
      );
      expect(extensions.map((r) => r.extname)).toEqual(
        expect.arrayContaining(['pgcrypto', 'pg_trgm']),
      );
      expect(extensions).toHaveLength(2);

      const schema = await rows(
        client,
        `SELECT schema_name FROM information_schema.schemata WHERE schema_name = 'fn_research'`,
      );
      expect(schema).toHaveLength(1);

      const roles = await rows(
        client,
        `SELECT rolname FROM pg_roles WHERE rolname IN ('research_writer', 'research_reader') ORDER BY rolname`,
      );
      expect(roles.map((r) => r.rolname)).toEqual(['research_reader', 'research_writer']);

      const usage = await rows(
        client,
        `SELECT r.rolname
         FROM pg_namespace n
         CROSS JOIN LATERAL aclexplode(n.nspacl) acl
         JOIN pg_roles r ON r.oid = acl.grantee
         WHERE n.nspname = 'fn_research' AND acl.privilege_type = 'USAGE'
           AND r.rolname IN ('research_reader', 'research_writer')
         ORDER BY r.rolname`,
      );
      expect(usage.map((r) => r.rolname)).toEqual(['research_reader', 'research_writer']);
    });
  });

  it('creates users and profiles with columns, checks and indexes', async () => {
    await withClient(async (client) => {
      const usersColumns = await rows(
        client,
        `SELECT column_name FROM information_schema.columns WHERE table_name = 'users' ORDER BY ordinal_position`,
      );
      expect(usersColumns.map((r) => r.column_name)).toEqual([
        'id',
        'phone_e164',
        'phone_e164_digest',
        'role',
        'status',
        'created_at',
        'updated_at',
        'deleted_at',
      ]);

      const usersChecks = await rows(
        client,
        `SELECT conname FROM pg_constraint
         WHERE conrelid = 'users'::regclass AND contype = 'c' ORDER BY conname`,
      );
      const checkNames = usersChecks.map((r) => r.conname).sort();
      expect(checkNames.some((n) => n.includes('role'))).toBe(true);
      expect(checkNames.some((n) => n.includes('status'))).toBe(true);

      const usersIndexes = await rows(
        client,
        `SELECT indexname, indexdef FROM pg_indexes WHERE tablename = 'users'`,
      );
      const names = usersIndexes
        .map((r) => r.indexname)
        .filter((n) => !n.endsWith('_pkey'))
        .sort();
      expect(names).toEqual(['idx_users_status', 'uq_users_phone_e164_digest']);
      expect(
        usersIndexes.find((r) => r.indexname === 'uq_users_phone_e164_digest').indexdef,
      ).toContain('UNIQUE');

      const profilesColumns = await rows(
        client,
        `SELECT column_name FROM information_schema.columns WHERE table_name = 'profiles' ORDER BY ordinal_position`,
      );
      expect(profilesColumns.map((r) => r.column_name)).toEqual([
        'user_id',
        'first_name',
        'last_name',
        'country',
        'region',
        'age_group',
        'language',
        'cohort',
      ]);
    });
  });

  it('creates pregnancies and babies with domain checks and cascade policy', async () => {
    await withClient(async (client) => {
      const checks = await rows(
        client,
        `SELECT conname FROM pg_constraint
         WHERE conrelid = 'pregnancies'::regclass AND contype = 'c' ORDER BY conname`,
      );
      const names = checks.map((r) => r.conname);
      expect(names).toContain('chk_pregnancies_edd_or_lmp');
      expect(names).toContain('chk_pregnancies_week_range');

      const pregnanciesIndexes = await rows(
        client,
        `SELECT indexname FROM pg_indexes WHERE tablename = 'pregnancies' ORDER BY indexname`,
      );
      expect(
        pregnanciesIndexes.map((r) => r.indexname).filter((n) => !n.endsWith('_pkey')),
      ).toEqual(['idx_pregnancies_edd', 'idx_pregnancies_partner_user', 'idx_pregnancies_user']);

      const babiesColumns = await rows(
        client,
        `SELECT column_name FROM information_schema.columns WHERE table_name = 'babies' ORDER BY ordinal_position`,
      );
      expect(babiesColumns.map((r) => r.column_name)).toEqual([
        'id',
        'user_id',
        'birth_date',
        'name',
        'birth_place',
        'notes',
      ]);
    });
  });

  it('creates consents (append-only) and user_preferences', async () => {
    await withClient(async (client) => {
      const consentColumns = await rows(
        client,
        `SELECT column_name FROM information_schema.columns WHERE table_name = 'consents' ORDER BY ordinal_position`,
      );
      expect(consentColumns.map((r) => r.column_name)).toEqual([
        'id',
        'user_id',
        'consent_type',
        'version',
        'state',
        'granted_at',
        'withdrawn_at',
      ]);

      const trigger = await rows(
        client,
        `SELECT tgname FROM pg_trigger WHERE tgrelid = 'consents'::regclass AND NOT tgisinternal ORDER BY tgname`,
      );
      expect(trigger.map((r) => r.tgname)).toEqual([
        'trg_consents_append_only',
        'trg_consents_state_guard',
      ]);

      const consentIndexes = await rows(
        client,
        `SELECT indexname FROM pg_indexes WHERE tablename = 'consents' ORDER BY indexname`,
      );
      expect(consentIndexes.map((r) => r.indexname).filter((n) => !n.endsWith('_pkey'))).toEqual([
        'idx_consents_state',
        'idx_consents_user_type',
      ]);
    });
  });

  it('enforces role/status checks, digest uniqueness and pregnancy week invariants', async () => {
    await withClient(async (client) => {
      const userId = await client.query(
        `INSERT INTO users (phone_e164, phone_e164_digest) VALUES ($1, $2) RETURNING id`,
        ['cipher-1', 'digest-1'],
      );
      const id = (userId.rows[0] as { id: string }).id;

      await expect(
        client.query(
          `INSERT INTO users (phone_e164, phone_e164_digest, role) VALUES ('cipher-2', 'digest-2', 'stranger')`,
        ),
      ).rejects.toThrow(/check/i);

      await expect(
        client.query(
          `INSERT INTO users (phone_e164, phone_e164_digest) VALUES ('cipher-3', 'digest-1')`,
        ),
      ).rejects.toThrow(/duplicate key|unique/i);

      const valid = await client.query(
        `INSERT INTO pregnancies (user_id, edd) VALUES ($1, '2027-03-15') RETURNING id`,
        [id],
      );
      expect(valid.rowCount).toBe(1);

      await expect(
        client.query(`INSERT INTO pregnancies (user_id) VALUES ($1)`, [id]),
      ).rejects.toThrow(/chk_pregnancies_edd_or_lmp/);

      await expect(
        client.query(
          `INSERT INTO pregnancies (user_id, lmp, pregnancy_week) VALUES ($1, '2026-06-01', 0)`,
          [id],
        ),
      ).rejects.toThrow(/chk_pregnancies_week_range/);

      await client.query(`DELETE FROM users WHERE id = $1`, [id]);
    });
  });

  it('enforces consent immutability and one active grant per type (grant -> withdraw -> re-grant)', async () => {
    await withClient(async (client) => {
      const user = await client.query(
        `INSERT INTO users (phone_e164, phone_e164_digest) VALUES ('cipher-c', 'digest-c') RETURNING id`,
      );
      const id = (user.rows[0] as { id: string }).id;

      await expect(
        client.query(
          `INSERT INTO consents (user_id, consent_type, version, state) VALUES ($1, 'participation', 'v1', 'withdrawn')`,
          [id],
        ),
      ).rejects.toThrow(/first consent record/);

      const granted = await client.query(
        `INSERT INTO consents (user_id, consent_type, version, state)
         VALUES ($1, 'participation', 'v1', 'granted') RETURNING id`,
        [id],
      );
      const consentId = (granted.rows[0] as { id: string }).id;

      await expect(
        client.query(`UPDATE consents SET state = 'withdrawn' WHERE id = $1`, [consentId]),
      ).rejects.toThrow(/append-only/);

      await expect(client.query(`DELETE FROM consents WHERE id = $1`, [consentId])).rejects.toThrow(
        /append-only/,
      );

      await expect(
        client.query(
          `INSERT INTO consents (user_id, consent_type, version, state) VALUES ($1, 'participation', 'v2', 'granted')`,
          [id],
        ),
      ).rejects.toThrow(/single active grant/);

      await expect(
        client.query(
          `INSERT INTO consents (user_id, consent_type, version, state) VALUES ($1, 'participation', 'v1', 'withdrawn')`,
          [id],
        ),
      ).rejects.toThrow(/withdrawn_at/);

      await client.query(
        `INSERT INTO consents (user_id, consent_type, version, state, withdrawn_at)
         VALUES ($1, 'participation', 'v1', 'withdrawn', now())`,
        [id],
      );

      await client.query(
        `INSERT INTO consents (user_id, consent_type, version, state)
         VALUES ($1, 'participation', 'v3', 'granted')`,
        [id],
      );

      const lifecycle = await client.query(
        `SELECT state FROM consents WHERE user_id = $1 AND consent_type = 'participation'
         ORDER BY granted_at, id`,
        [id],
      );
      expect(lifecycle.rows.map((r) => r.state)).toEqual(['granted', 'withdrawn', 'granted']);

      await client.query(`SET SESSION app.consent_erasure = 'on'`);
      await client.query(`DELETE FROM users WHERE id = $1`, [id]);
      await client.query(`RESET app.consent_erasure`);
    });
  });

  it('applies the cascade and SET NULL delete policy', async () => {
    await withClient(async (client) => {
      const owner = await client.query(
        `INSERT INTO users (phone_e164, phone_e164_digest) VALUES ('cipher-o', 'digest-o') RETURNING id`,
      );
      const ownerId = (owner.rows[0] as { id: string }).id;
      const partner = await client.query(
        `INSERT INTO users (phone_e164, phone_e164_digest) VALUES ('cipher-p', 'digest-p') RETURNING id`,
      );
      const partnerId = (partner.rows[0] as { id: string }).id;

      await client.query(`INSERT INTO profiles (user_id, cohort) VALUES ($1, 'c1')`, [ownerId]);
      await client.query(
        `INSERT INTO pregnancies (user_id, edd, partner_user_id) VALUES ($1, '2027-03-15', $2)`,
        [ownerId, partnerId],
      );
      await client.query(`INSERT INTO babies (user_id, birth_date) VALUES ($1, '2027-03-15')`, [
        ownerId,
      ]);
      await client.query(
        `INSERT INTO consents (user_id, consent_type, version, state) VALUES ($1, 'research', 'v1', 'granted')`,
        [ownerId],
      );
      await client.query(`INSERT INTO user_preferences (user_id, language) VALUES ($1, 'en')`, [
        ownerId,
      ]);

      await client.query(`DELETE FROM users WHERE id = $1`, [partnerId]);

      const partnerRef = await client.query(
        `SELECT partner_user_id FROM pregnancies WHERE user_id = $1`,
        [ownerId],
      );
      expect(partnerRef.rows[0].partner_user_id).toBeNull();

      await expect(client.query(`DELETE FROM users WHERE id = $1`, [ownerId])).rejects.toThrow(
        /append-only/,
      );

      await client.query(`BEGIN`);
      await client.query(`SET LOCAL app.consent_erasure = 'on'`);
      await client.query(`DELETE FROM users WHERE id = $1`, [ownerId]);
      await client.query(`COMMIT`);

      const orphans = await client.query(
        `SELECT (SELECT count(*) FROM profiles WHERE user_id = $1) +
                (SELECT count(*) FROM pregnancies WHERE user_id = $1) +
                (SELECT count(*) FROM babies WHERE user_id = $1) +
                (SELECT count(*) FROM consents WHERE user_id = $1) +
                (SELECT count(*) FROM user_preferences WHERE user_id = $1) AS total`,
        [ownerId],
      );
      expect(Number(orphans.rows[0].total)).toBe(0);
    });
  });

  it('rolls back all migrations cleanly and re-applies them', async () => {
    await runMigrations({
      databaseUrl: DATABASE_URL as string,
      direction: 'down',
      count: Infinity,
    });

    await withClient(async (client) => {
      const tables = await rows(
        client,
        `SELECT table_name FROM information_schema.tables
         WHERE table_schema = 'public' AND table_name IN ('users','profiles','pregnancies','babies','consents','user_preferences')`,
      );
      expect(tables).toHaveLength(0);
    });

    const afterDown = await checkMigrations(DATABASE_URL as string);
    expect(afterDown.applied).toEqual([]);

    await runMigrations({ databaseUrl: DATABASE_URL as string });
    const afterUp = await checkMigrations(DATABASE_URL as string);
    expect(afterUp.applied).toEqual(MIGRATION_NAMES);
  });
});
