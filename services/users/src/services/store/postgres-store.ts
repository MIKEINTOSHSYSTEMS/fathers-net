import { randomUUID } from 'node:crypto';
import { Pool, type PoolClient, type QueryResult } from 'pg';
import { ConflictError } from '@fathersnet/errors';
import type {
  ConsentRecord,
  CreateConsentInput,
  CreateUserInput,
  OutboxEntry,
  PreferencesRecord,
  PreferencesUpsertInput,
  PregnancyRecord,
  PregnancyUpsertInput,
  ProfilePatch,
  ProfileRecord,
  UserRecord,
  UsersStore,
} from './types';

/** pg error raised by `RAISE EXCEPTION` in the `004` consent triggers (AR-012). */
const PG_RAISE_EXCEPTION = 'P0001';

/** Per-service outbox table (021-outbox, WP-024c); relay reads the same name. */
const OUTBOX_TABLE = 'user_outbox';

/**
 * Append the given outbox rows inside the caller's transaction (D-03: domain
 * write + outbox INSERT in one DB transaction). Uses the canonical column set
 * from the `021-outbox` migration; `id`, `status`, `attempts`, `available_at`,
 * `created_at`, `published_at`, `last_error` use their DB defaults.
 */
async function insertOutbox(client: PoolClient, entries: readonly OutboxEntry[]): Promise<void> {
  for (const entry of entries) {
    await client.query(
      `INSERT INTO ${OUTBOX_TABLE}
         (event_id, event_type, producer, schema_version, occurred_at,
          aggregate_type, aggregate_id, idempotency_key, payload)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        entry.eventId,
        entry.eventType,
        entry.producer,
        entry.schemaVersion,
        entry.occurredAt,
        entry.aggregateType,
        entry.aggregateId,
        entry.idempotencyKey,
        JSON.stringify(entry.payload),
      ],
    );
  }
}

/**
 * Postgres users store (WP-017/WP-018). Reads/writes the baseline schema ONLY
 * (migrations 002–004) — no DDL, no new tables, no schema changes (WP-017/018
 * DB boundary). All queries are parameterized; the phone is stored as the
 * ciphertext the service passes in (never plaintext, FR-009/FR-123). JSONB
 * preference columns are serialized/parsed here. `consents` is append-only:
 * inserts go through the `004` trigger's state guard, which enforces the
 * single-active-grant rule under concurrency (AR-012).
 */
export function createPostgresUsersStore(connectionString: string): UsersStore {
  const pool = new Pool({
    connectionString,
    max: 10,
    connectionTimeoutMillis: 2000,
  });

  function parseUser(row: Record<string, unknown>): UserRecord {
    return {
      id: String(row.id),
      phoneE164: String(row.phone_e164),
      phoneE164Digest: String(row.phone_e164_digest),
      role: row.role as UserRecord['role'],
      status: row.status as UserRecord['status'],
      createdAt: (row.created_at as Date).toISOString(),
      updatedAt: (row.updated_at as Date).toISOString(),
      deletedAt: row.deleted_at ? (row.deleted_at as Date).toISOString() : null,
    };
  }

  function parseProfile(row: Record<string, unknown>): ProfileRecord {
    return {
      userId: String(row.user_id),
      firstName: row.first_name ? String(row.first_name) : null,
      lastName: row.last_name ? String(row.last_name) : null,
      country: row.country ? String(row.country) : null,
      region: row.region ? String(row.region) : null,
      ageGroup: row.age_group ? String(row.age_group) : null,
      language: row.language ? String(row.language) : null,
      cohort: row.cohort ? String(row.cohort) : null,
    };
  }

  function parsePregnancy(row: Record<string, unknown>): PregnancyRecord {
    return {
      id: String(row.id),
      userId: String(row.user_id),
      edd: row.edd ? (row.edd as Date).toISOString().slice(0, 10) : null,
      lmp: row.lmp ? (row.lmp as Date).toISOString().slice(0, 10) : null,
      pregnancyWeek: row.pregnancy_week == null ? null : Number(row.pregnancy_week),
      trimester: row.trimester == null ? null : Number(row.trimester),
      partnerUserId: row.partner_user_id ? String(row.partner_user_id) : null,
    };
  }

  function parsePreferences(row: Record<string, unknown>): PreferencesRecord {
    return {
      userId: String(row.user_id),
      language: row.language ? String(row.language) : null,
      quietHours:
        row.quiet_hours && typeof row.quiet_hours === 'object'
          ? (row.quiet_hours as PreferencesRecord['quietHours'])
          : null,
      notificationChannels:
        row.notification_channels && typeof row.notification_channels === 'object'
          ? (row.notification_channels as string[])
          : null,
      contentCategories:
        row.content_categories && typeof row.content_categories === 'object'
          ? (row.content_categories as string[])
          : null,
    };
  }

  function parseConsent(row: Record<string, unknown>): ConsentRecord {
    return {
      id: String(row.id),
      userId: String(row.user_id),
      consentType: row.consent_type as ConsentRecord['consentType'],
      version: String(row.version),
      state: row.state as ConsentRecord['state'],
      grantedAt: (row.granted_at as Date).toISOString(),
      withdrawnAt: row.withdrawn_at ? (row.withdrawn_at as Date).toISOString() : null,
    };
  }

  function json(value: unknown): string | null {
    return value === null || value === undefined ? null : JSON.stringify(value);
  }

  return {
    async findByPhoneDigest(digest: string): Promise<UserRecord | null> {
      const result = await pool.query(
        'SELECT id, phone_e164, phone_e164_digest, role, status, created_at, updated_at, deleted_at FROM users WHERE phone_e164_digest = $1 AND deleted_at IS NULL LIMIT 1',
        [digest],
      );
      return result.rows.length > 0 ? parseUser(result.rows[0]) : null;
    },

    async findById(id: string): Promise<UserRecord | null> {
      const result = await pool.query(
        'SELECT id, phone_e164, phone_e164_digest, role, status, created_at, updated_at, deleted_at FROM users WHERE id = $1 AND deleted_at IS NULL LIMIT 1',
        [id],
      );
      return result.rows.length > 0 ? parseUser(result.rows[0]) : null;
    },

    async getProfile(userId: string): Promise<ProfileRecord | null> {
      const result = await pool.query(
        `SELECT user_id, first_name, last_name, country, region, age_group, language, cohort
         FROM profiles WHERE user_id = $1 LIMIT 1`,
        [userId],
      );
      return result.rows.length > 0 ? parseProfile(result.rows[0]) : null;
    },

    async getPregnancy(userId: string): Promise<PregnancyRecord | null> {
      const result = await pool.query(
        `SELECT id, user_id, edd, lmp, pregnancy_week, trimester, partner_user_id
         FROM pregnancies WHERE user_id = $1 ORDER BY id DESC LIMIT 1`,
        [userId],
      );
      return result.rows.length > 0 ? parsePregnancy(result.rows[0]) : null;
    },

    async getPreferences(userId: string): Promise<PreferencesRecord | null> {
      const result = await pool.query(
        `SELECT user_id, language, quiet_hours, notification_channels, content_categories
         FROM user_preferences WHERE user_id = $1 LIMIT 1`,
        [userId],
      );
      return result.rows.length > 0 ? parsePreferences(result.rows[0]) : null;
    },

    async createUser(input: CreateUserInput, outbox: OutboxEntry[] = []): Promise<UserRecord> {
      const client: PoolClient = await pool.connect();
      try {
        await client.query('BEGIN');
        const created: QueryResult = await client.query(
          `INSERT INTO users (id, phone_e164, phone_e164_digest, role)
           VALUES ($1, $2, $3, $4)
           RETURNING id, phone_e164, phone_e164_digest, role, status, created_at, updated_at, deleted_at`,
          [input.id ?? randomUUID(), input.phoneE164, input.phoneE164Digest, input.role],
        );
        const user = parseUser(created.rows[0]);

        await client.query(
          `INSERT INTO profiles
             (user_id, first_name, last_name, country, region, age_group, language, cohort)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [
            user.id,
            input.profile.firstName,
            input.profile.lastName,
            input.profile.country,
            input.profile.region,
            input.profile.ageGroup,
            input.profile.language,
            input.profile.cohort,
          ],
        );

        if (input.pregnancy) {
          await client.query(
            `INSERT INTO pregnancies (user_id, edd, lmp, pregnancy_week, trimester)
             VALUES ($1, $2, $3, $4, $5)`,
            [
              user.id,
              input.pregnancy.edd,
              input.pregnancy.lmp,
              input.pregnancy.pregnancyWeek,
              input.pregnancy.trimester,
            ],
          );
        }

        if (input.preferences) {
          await client.query(
            `INSERT INTO user_preferences (user_id, language, quiet_hours, notification_channels, content_categories)
             VALUES ($1, $2, $3, $4, $5)`,
            [
              user.id,
              input.preferences.language,
              json(input.preferences.quietHours),
              json(input.preferences.notificationChannels),
              json(input.preferences.contentCategories),
            ],
          );
        }

        await insertOutbox(client, outbox);
        await client.query('COMMIT');
        return user;
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      } finally {
        client.release();
      }
    },

    async updateProfile(
      userId: string,
      patch: ProfilePatch,
      outbox: OutboxEntry[] = [],
    ): Promise<ProfileRecord> {
      // Map domain field names (camelCase) to the baseline `profiles` columns.
      const COLUMN_BY_FIELD: Record<keyof ProfilePatch, string> = {
        firstName: 'first_name',
        lastName: 'last_name',
        country: 'country',
        region: 'region',
        ageGroup: 'age_group',
        language: 'language',
        cohort: 'cohort',
      };
      const sets: string[] = [];
      const values: unknown[] = [];
      let index = 1;
      // eslint-disable-next-line security/detect-object-injection -- `patch` keys come from the closed ProfilePatch field set (service-validated), never raw user input.
      for (const field of Object.keys(patch) as (keyof ProfilePatch)[]) {
        // eslint-disable-next-line security/detect-object-injection -- `field` is a member of the closed ProfilePatch union above.
        sets.push(`${COLUMN_BY_FIELD[field]} = $${index}`);
        // eslint-disable-next-line security/detect-object-injection -- `field` is a member of the closed ProfilePatch union above.
        values.push(patch[field] ?? null);
        index += 1;
      }
      if (sets.length === 0) {
        throw new Error('No profile fields to update');
      }
      values.push(userId);

      const client: PoolClient = await pool.connect();
      try {
        await client.query('BEGIN');
        const result = await client.query(
          `UPDATE profiles SET ${sets.join(', ')}
           WHERE user_id = $${index}
           RETURNING user_id, first_name, last_name, country, region, age_group, language, cohort`,
          values,
        );
        if (result.rows.length === 0) {
          throw new Error(`No profile for user ${userId}`);
        }
        await client.query('UPDATE users SET updated_at = now() WHERE id = $1', [userId]);
        await insertOutbox(client, outbox);
        await client.query('COMMIT');
        return parseProfile(result.rows[0]);
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      } finally {
        client.release();
      }
    },

    async upsertPregnancy(
      userId: string,
      input: PregnancyUpsertInput,
      outbox: OutboxEntry[] = [],
    ): Promise<PregnancyRecord> {
      // `pregnancies.user_id` is indexed but not unique (partner journeys may
      // hold one active row each; WP-019 owns recompute semantics). Resolve
      // the current row explicitly rather than guessing a conflict target. The
      // baseline `pregnancies` table has no timestamp column, so the PK `id`
      // provides a deterministic ordering instead.
      const client: PoolClient = await pool.connect();
      try {
        await client.query('BEGIN');
        const existing = await client.query(
          'SELECT id FROM pregnancies WHERE user_id = $1 ORDER BY id DESC LIMIT 1',
          [userId],
        );
        const result =
          existing.rows.length > 0
            ? await client.query(
                `UPDATE pregnancies SET edd = $2, lmp = $3, pregnancy_week = $4, trimester = $5
                 WHERE user_id = $1
                 RETURNING id, user_id, edd, lmp, pregnancy_week, trimester, partner_user_id`,
                [userId, input.edd, input.lmp, input.pregnancyWeek, input.trimester],
              )
            : await client.query(
                `INSERT INTO pregnancies (user_id, edd, lmp, pregnancy_week, trimester)
                 VALUES ($1, $2, $3, $4, $5)
                 RETURNING id, user_id, edd, lmp, pregnancy_week, trimester, partner_user_id`,
                [userId, input.edd, input.lmp, input.pregnancyWeek, input.trimester],
              );
        await client.query('UPDATE users SET updated_at = now() WHERE id = $1', [userId]);
        await insertOutbox(client, outbox);
        await client.query('COMMIT');
        return parsePregnancy(result.rows[0]);
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      } finally {
        client.release();
      }
    },

    async upsertPreferences(
      userId: string,
      input: PreferencesUpsertInput,
    ): Promise<PreferencesRecord> {
      const result = await pool.query(
        `INSERT INTO user_preferences (user_id, language, quiet_hours, notification_channels, content_categories)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (user_id) DO UPDATE SET
           language = COALESCE(EXCLUDED.language, user_preferences.language),
           quiet_hours = COALESCE(EXCLUDED.quiet_hours, user_preferences.quiet_hours),
           notification_channels = COALESCE(EXCLUDED.notification_channels, user_preferences.notification_channels),
           content_categories = COALESCE(EXCLUDED.content_categories, user_preferences.content_categories)
         RETURNING user_id, language, quiet_hours, notification_channels, content_categories`,
        [
          userId,
          input.language,
          json(input.quietHours),
          json(input.notificationChannels),
          json(input.contentCategories),
        ],
      );
      await pool.query('UPDATE users SET updated_at = now() WHERE id = $1', [userId]);
      return parsePreferences(result.rows[0]);
    },

    async getConsents(userId: string): Promise<ConsentRecord[]> {
      const result = await pool.query(
        `SELECT id, user_id, consent_type, version, state, granted_at, withdrawn_at
         FROM consents
         WHERE user_id = $1
         ORDER BY granted_at ASC, id ASC`,
        [userId],
      );
      return result.rows.map((row) => parseConsent(row));
    },

    async findConsentById(userId: string, id: string): Promise<ConsentRecord | null> {
      const result = await pool.query(
        `SELECT id, user_id, consent_type, version, state, granted_at, withdrawn_at
         FROM consents
         WHERE user_id = $1 AND id = $2
         LIMIT 1`,
        [userId, id],
      );
      return result.rows.length > 0 ? parseConsent(result.rows[0]) : null;
    },

    async insertConsent(
      input: CreateConsentInput,
      outbox: OutboxEntry[] = [],
    ): Promise<ConsentRecord> {
      const client: PoolClient = await pool.connect();
      try {
        await client.query('BEGIN');
        let result: QueryResult;
        try {
          result = await client.query(
            `INSERT INTO consents (user_id, consent_type, version, state, granted_at, withdrawn_at)
             VALUES ($1, $2, $3, $4, $5, $6)
             RETURNING id, user_id, consent_type, version, state, granted_at, withdrawn_at`,
            [
              input.userId,
              input.consentType,
              input.version,
              input.state,
              input.grantedAt,
              input.withdrawnAt,
            ],
          );
          await insertOutbox(client, outbox);
        } catch (err) {
          await client.query('ROLLBACK');
          // The `004` state guard is the authoritative concurrency control: a
          // trigger rejection under a race maps to the same domain conflict the
          // service pre-checks (AR-012 single active grant).
          if (isPgRaise(err)) {
            throw new ConflictError('Consent state transition rejected');
          }
          throw err;
        }
        await client.query('COMMIT');
        return parseConsent(result.rows[0]);
      } finally {
        client.release();
      }
    },

    async dispose(): Promise<void> {
      await pool.end();
    },
  };
}

function isPgRaise(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    'code' in err &&
    (err as { code?: string }).code === PG_RAISE_EXCEPTION
  );
}
