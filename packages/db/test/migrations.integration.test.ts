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
  '011-content',
  '018-reminders',
  '019-journal',
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

describeMigrate('database migration baseline (001-019)', () => {
  beforeAll(async () => {
    await runMigrations({ databaseUrl: DATABASE_URL as string });
  });

  it('records exactly the baseline migrations in pgmigrations', async () => {
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

  it('creates content and content_versions with lifecycle checks and search index', async () => {
    await withClient(async (client) => {
      const contentColumns = await rows(
        client,
        `SELECT column_name FROM information_schema.columns WHERE table_name = 'content' ORDER BY ordinal_position`,
      );
      expect(contentColumns.map((r) => r.column_name)).toEqual([
        'id',
        'content_type',
        'title_en',
        'title_am',
        'body_en',
        'body_am',
        'pregnancy_week',
        'status',
        'medical_reviewed',
        'created_by',
        'created_at',
        'updated_at',
      ]);

      const contentChecks = await rows(
        client,
        `SELECT conname FROM pg_constraint
         WHERE conrelid = 'content'::regclass AND contype = 'c' ORDER BY conname`,
      );
      const checkNames = contentChecks.map((r) => r.conname);
      expect(checkNames.some((n) => n.includes('content_type'))).toBe(true);
      expect(checkNames.some((n) => n.includes('pregnancy_week'))).toBe(true);
      expect(checkNames.some((n) => n.includes('status'))).toBe(true);

      const contentIndexes = await rows(
        client,
        `SELECT indexname, indexdef FROM pg_indexes WHERE tablename = 'content' ORDER BY indexname`,
      );
      const names = contentIndexes
        .map((r) => r.indexname)
        .filter((n) => !n.endsWith('_pkey'))
        .sort();
      expect(names).toEqual([
        'idx_content_body_en_fts',
        'idx_content_status_week',
        'idx_content_type_status',
      ]);

      const fts = contentIndexes.find((r) => r.indexname === 'idx_content_body_en_fts');
      expect(fts.indexdef).toMatch(/USING gin/i);
      expect(fts.indexdef).toContain('to_tsvector');

      const versionColumns = await rows(
        client,
        `SELECT column_name FROM information_schema.columns WHERE table_name = 'content_versions' ORDER BY ordinal_position`,
      );
      expect(versionColumns.map((r) => r.column_name)).toEqual([
        'id',
        'content_id',
        'version',
        'change_note',
        'body_snapshot',
        'reviewed_by',
        'created_at',
      ]);
    });
  });

  it('enforces content lifecycle checks, FTS search and cascade/SET NULL policy', async () => {
    await withClient(async (client) => {
      const author = await client.query(
        `INSERT INTO users (phone_e164, phone_e164_digest, role) VALUES ('cipher-a', 'digest-a', 'staff') RETURNING id`,
      );
      const authorId = (author.rows[0] as { id: string }).id;
      const reviewer = await client.query(
        `INSERT INTO users (phone_e164, phone_e164_digest, role) VALUES ('cipher-r', 'digest-r', 'staff') RETURNING id`,
      );
      const reviewerId = (reviewer.rows[0] as { id: string }).id;

      await expect(
        client.query(`INSERT INTO content (content_type, status) VALUES ('blog', 'draft')`),
      ).rejects.toThrow(/check/i);

      await expect(
        client.query(`INSERT INTO content (content_type, status) VALUES ('article', 'bogus')`),
      ).rejects.toThrow(/check/i);

      const created = await client.query(
        `INSERT INTO content (content_type, title_en, body_en, pregnancy_week, created_by)
         VALUES ('article', 'Hospital Bag', 'Pack essentials for delivery.', 40, $1) RETURNING id`,
        [authorId],
      );
      const contentId = (created.rows[0] as { id: string }).id;

      await expect(
        client.query(`INSERT INTO content (content_type, pregnancy_week) VALUES ('article', 46)`),
      ).rejects.toThrow(/check/i);

      await client.query(
        `INSERT INTO content_versions (content_id, version, body_snapshot, reviewed_by)
         VALUES ($1, 1, '{"title_en":"Hospital Bag"}', $2)`,
        [contentId, reviewerId],
      );

      const search = await client.query(
        `SELECT id FROM content
         WHERE to_tsvector('english', coalesce(title_en, '') || ' ' || coalesce(body_en, ''))
           @@ plainto_tsquery('english', 'hospital')`,
      );
      expect(search.rows).toHaveLength(1);

      await client.query(`DELETE FROM users WHERE id = $1`, [reviewerId]);
      const reviewerNull = await client.query(
        `SELECT reviewed_by FROM content_versions WHERE content_id = $1`,
        [contentId],
      );
      expect(reviewerNull.rows[0].reviewed_by).toBeNull();

      await client.query(`DELETE FROM content WHERE id = $1`, [contentId]);
      const orphanVersions = await client.query(
        `SELECT count(*) AS n FROM content_versions WHERE content_id = $1`,
        [contentId],
      );
      expect(Number(orphanVersions.rows[0].n)).toBe(0);

      await client.query(`DELETE FROM users WHERE id = $1`, [authorId]);
      const authorNull = await client.query(
        `SELECT created_by FROM content WHERE created_by = $1`,
        [authorId],
      );
      expect(authorNull.rows).toHaveLength(0);
    });
  });

  it('creates reminder tables with domain checks, uniques and indexes', async () => {
    await withClient(async (client) => {
      const templateColumns = await rows(
        client,
        `SELECT column_name FROM information_schema.columns
         WHERE table_name = 'reminder_templates' ORDER BY ordinal_position`,
      );
      expect(templateColumns.map((r) => r.column_name)).toEqual([
        'id',
        'code',
        'channel',
        'priority',
        'title_en',
        'title_am',
        'body_en',
        'body_am',
        'lead_time_minutes',
        'quiet_hours',
        'recurrence',
        'pregnancy_week',
        'active',
        'created_at',
        'updated_at',
      ]);

      const templateChecks = await rows(
        client,
        `SELECT conname FROM pg_constraint
         WHERE conrelid = 'reminder_templates'::regclass AND contype = 'c' ORDER BY conname`,
      );
      const tChecks = templateChecks.map((r) => r.conname);
      expect(tChecks.some((n) => n.includes('channel'))).toBe(true);
      expect(tChecks.some((n) => n.includes('priority'))).toBe(true);
      expect(tChecks.some((n) => n.includes('pregnancy_week'))).toBe(true);

      const templateIndexes = await rows(
        client,
        `SELECT indexname, indexdef FROM pg_indexes WHERE tablename = 'reminder_templates' ORDER BY indexname`,
      );
      expect(templateIndexes.map((r) => r.indexname).filter((n) => !n.endsWith('_pkey'))).toEqual([
        'uq_reminder_templates_code',
      ]);
      expect(
        templateIndexes.find((r) => r.indexname === 'uq_reminder_templates_code').indexdef,
      ).toContain('UNIQUE');

      const instanceColumns = await rows(
        client,
        `SELECT column_name FROM information_schema.columns
         WHERE table_name = 'reminder_instances' ORDER BY ordinal_position`,
      );
      expect(instanceColumns.map((r) => r.column_name)).toEqual([
        'id',
        'template_id',
        'user_id',
        'due_at',
        'status',
        'priority',
        'channel',
        'dedupe_key',
        'dispatched_at',
        'acknowledged_at',
        'last_error',
        'created_at',
      ]);

      const instanceIndexes = await rows(
        client,
        `SELECT indexname, indexdef FROM pg_indexes WHERE tablename = 'reminder_instances' ORDER BY indexname`,
      );
      expect(
        instanceIndexes
          .map((r) => r.indexname)
          .filter((n) => !n.endsWith('_pkey'))
          .sort(),
      ).toEqual([
        'idx_reminder_instances_due',
        'idx_reminder_instances_user',
        'uq_reminder_instances_dedupe',
      ]);
      expect(
        instanceIndexes.find((r) => r.indexname === 'uq_reminder_instances_dedupe').indexdef,
      ).toMatch(/WHERE .*dedupe_key IS NOT NULL/i);

      const dispatchColumns = await rows(
        client,
        `SELECT column_name FROM information_schema.columns
         WHERE table_name = 'reminder_dispatches' ORDER BY ordinal_position`,
      );
      expect(dispatchColumns.map((r) => r.column_name)).toEqual([
        'id',
        'instance_id',
        'user_id',
        'run_id',
        'channel',
        'priority',
        'status',
        'dispatched_at',
        'ack_received_at',
        'ack_payload',
        'last_error',
        'created_at',
      ]);

      const dispatchIndexes = await rows(
        client,
        `SELECT indexname, indexdef FROM pg_indexes WHERE tablename = 'reminder_dispatches' ORDER BY indexname`,
      );
      expect(
        dispatchIndexes
          .map((r) => r.indexname)
          .filter((n) => !n.endsWith('_pkey'))
          .sort(),
      ).toEqual(['idx_reminder_dispatches_user_day', 'uq_reminder_dispatches_instance_run']);
      expect(
        dispatchIndexes.find((r) => r.indexname === 'uq_reminder_dispatches_instance_run').indexdef,
      ).toContain('UNIQUE');
    });
  });

  it('enforces reminder FK, unique and duplicate-run idempotency rules', async () => {
    await withClient(async (client) => {
      const user = await client.query(
        `INSERT INTO users (phone_e164, phone_e164_digest) VALUES ('cipher-r1', 'digest-r1') RETURNING id`,
      );
      const userId = (user.rows[0] as { id: string }).id;

      const tpl = await client.query(
        `INSERT INTO reminder_templates (code, channel, title_en, title_am, body_en, body_am)
         VALUES ('anc_visit_t1', 'whatsapp', 'ANC visit', 'የኤኤንሲ ጉብኝት', 'Attend your appointment.', 'ቀጠሮዎን ይከታተሉ።') RETURNING id`,
      );
      const tplId = (tpl.rows[0] as { id: string }).id;

      await expect(
        client.query(
          `INSERT INTO reminder_templates (code, channel, title_en, body_en) VALUES ('no-am', 'whatsapp', 'T', 'B')`,
        ),
      ).rejects.toThrow(/null|check/i);

      await expect(
        client.query(
          `INSERT INTO reminder_templates (code, channel, title_en, title_am, body_en, body_am, priority)
           VALUES ('bad-p', 'whatsapp', 'T', 'T', 'B', 'B', 'urgent')`,
        ),
      ).rejects.toThrow(/check/i);

      await expect(
        client.query(
          `INSERT INTO reminder_templates (code, channel, title_en, title_am, body_en, body_am)
           VALUES ('anc_visit_t1', 'whatsapp', 'T', 'T', 'B', 'B')`,
        ),
      ).rejects.toThrow(/duplicate key|unique/i);

      await expect(
        client.query(
          `INSERT INTO reminder_templates (code, channel, title_en, title_am, body_en, body_am, pregnancy_week)
           VALUES ('bad-week', 'whatsapp', 'T', 'T', 'B', 'B', 50)`,
        ),
      ).rejects.toThrow(/check/i);

      const inst = await client.query(
        `INSERT INTO reminder_instances (template_id, user_id, due_at, channel, priority)
         VALUES ($1, $2, now() + interval '1 day', 'whatsapp', 'normal') RETURNING id`,
        [tplId, userId],
      );
      const instanceId = (inst.rows[0] as { id: string }).id;

      await client.query(`UPDATE reminder_instances SET dedupe_key = 'dup-1' WHERE id = $1`, [
        instanceId,
      ]);
      await expect(
        client.query(
          `INSERT INTO reminder_instances (template_id, user_id, due_at, channel, priority, dedupe_key)
           VALUES ($1, $2, now() + interval '2 days', 'whatsapp', 'normal', 'dup-1')`,
          [tplId, userId],
        ),
      ).rejects.toThrow(/duplicate key|unique/i);

      await client.query(
        `INSERT INTO reminder_dispatches (instance_id, user_id, run_id, channel, priority)
         VALUES ($1, $2, 'run-1', 'whatsapp', 'normal')`,
        [instanceId, userId],
      );
      await expect(
        client.query(
          `INSERT INTO reminder_dispatches (instance_id, user_id, run_id, channel, priority)
           VALUES ($1, $2, 'run-1', 'whatsapp', 'normal')`,
          [instanceId, userId],
        ),
      ).rejects.toThrow(/duplicate key|unique/i);

      await expect(
        client.query(`DELETE FROM reminder_templates WHERE id = $1`, [tplId]),
      ).rejects.toThrow(/foreign key/);

      await client.query(`DELETE FROM users WHERE id = $1`, [userId]);
      const orphanCount = await client.query(
        `SELECT (SELECT count(*) FROM reminder_instances WHERE user_id = $1) +
                (SELECT count(*) FROM reminder_dispatches WHERE user_id = $1) AS total`,
        [userId],
      );
      expect(Number(orphanCount.rows[0].total)).toBe(0);
    });
  });

  it('creates journal tables with domain checks, timeline index and cascade FK', async () => {
    await withClient(async (client) => {
      const entryColumns = await rows(
        client,
        `SELECT column_name FROM information_schema.columns
         WHERE table_name = 'journal_entries' ORDER BY ordinal_position`,
      );
      expect(entryColumns.map((r) => r.column_name)).toEqual([
        'id',
        'user_id',
        'entry_type',
        'content',
        'pregnancy_week',
        'shared_with_partner',
        'created_at',
        'updated_at',
      ]);

      const entryChecks = await rows(
        client,
        `SELECT conname FROM pg_constraint
         WHERE conrelid = 'journal_entries'::regclass AND contype = 'c' ORDER BY conname`,
      );
      const eChecks = entryChecks.map((r) => r.conname);
      expect(eChecks.some((n) => n.includes('entry_type'))).toBe(true);
      expect(eChecks.some((n) => n.includes('pregnancy_week'))).toBe(true);

      const entryIndexes = await rows(
        client,
        `SELECT indexname, indexdef FROM pg_indexes WHERE tablename = 'journal_entries' ORDER BY indexname`,
      );
      const eIndexes = entryIndexes.map((r) => r.indexname).filter((n) => !n.endsWith('_pkey'));
      expect(eIndexes).toEqual(['idx_journal_entries_user_created']);
      expect(
        entryIndexes.find((r) => r.indexname === 'idx_journal_entries_user_created').indexdef,
      ).toContain('(user_id, created_at DESC)');

      const mediaColumns = await rows(
        client,
        `SELECT column_name FROM information_schema.columns
         WHERE table_name = 'journal_media' ORDER BY ordinal_position`,
      );
      expect(mediaColumns.map((r) => r.column_name)).toEqual([
        'id',
        'journal_entry_id',
        'media_type',
        'storage_path',
        'size_bytes',
        'transcript',
        'transcript_status',
        'created_at',
      ]);

      const mediaChecks = await rows(
        client,
        `SELECT conname FROM pg_constraint
         WHERE conrelid = 'journal_media'::regclass AND contype = 'c' ORDER BY conname`,
      );
      const mChecks = mediaChecks.map((r) => r.conname);
      expect(mChecks.some((n) => n.includes('media_type'))).toBe(true);
      expect(mChecks.some((n) => n.includes('transcript_status'))).toBe(true);

      const mediaIndexes = await rows(
        client,
        `SELECT indexname FROM pg_indexes WHERE tablename = 'journal_media' ORDER BY indexname`,
      );
      expect(mediaIndexes.map((r) => r.indexname).filter((n) => !n.endsWith('_pkey'))).toEqual([
        'idx_journal_media_entry',
      ]);
    });
  });

  it('enforces journal privacy default, domain checks and erasure cascade', async () => {
    await withClient(async (client) => {
      const user = await client.query(
        `INSERT INTO users (phone_e164, phone_e164_digest) VALUES ('cipher-j', 'digest-j') RETURNING id`,
      );
      const userId = (user.rows[0] as { id: string }).id;

      const created = await client.query(
        `INSERT INTO journal_entries (user_id, content, pregnancy_week)
         VALUES ($1, 'Today the baby kicked.', 24) RETURNING id, shared_with_partner`,
        [userId],
      );
      const entryId = (created.rows[0] as { id: string; shared_with_partner: boolean }).id;
      expect((created.rows[0] as { shared_with_partner: boolean }).shared_with_partner).toBe(false);

      await expect(
        client.query(
          `INSERT INTO journal_entries (user_id, entry_type, content)
           VALUES ($1, 'bogus', 'x')`,
          [userId],
        ),
      ).rejects.toThrow(/check/i);

      await expect(
        client.query(
          `INSERT INTO journal_entries (user_id, content, pregnancy_week)
           VALUES ($1, 'x', 0)`,
          [userId],
        ),
      ).rejects.toThrow(/check/i);

      await expect(
        client.query(
          `INSERT INTO journal_entries (user_id, content, pregnancy_week)
           VALUES ($1, 'x', 46)`,
          [userId],
        ),
      ).rejects.toThrow(/check/i);

      await client.query(
        `INSERT INTO journal_media (journal_entry_id, media_type, storage_path, size_bytes)
         VALUES ($1, 'photo', 'a/b/c', 1000)`,
        [entryId],
      );

      await expect(
        client.query(
          `INSERT INTO journal_media (journal_entry_id, media_type, storage_path)
           VALUES ($1, 'bogus', 'a/b/c')`,
          [entryId],
        ),
      ).rejects.toThrow(/check/i);

      await expect(
        client.query(
          `INSERT INTO journal_media (journal_entry_id, media_type, storage_path, transcript_status)
           VALUES ($1, 'photo', 'a/b/c', 'bogus')`,
          [entryId],
        ),
      ).rejects.toThrow(/check/i);

      await client.query(`DELETE FROM users WHERE id = $1`, [userId]);
      const orphans = await client.query(
        `SELECT (SELECT count(*) FROM journal_entries WHERE user_id = $1) +
                (SELECT count(*) FROM journal_media WHERE journal_entry_id = $2) AS total`,
        [userId, entryId],
      );
      expect(Number(orphans.rows[0].total)).toBe(0);
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
         WHERE table_schema = 'public' AND table_name IN ('users','profiles','pregnancies','babies','consents','user_preferences','content','content_versions','reminder_templates','reminder_instances','reminder_dispatches','journal_entries','journal_media')`,
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
