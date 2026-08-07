import { Pool, type PoolClient, type QueryResult } from 'pg';
import { ConflictError, NotFoundError } from '@fathersnet/errors';
import type {
  ContentLanguage,
  ContentListQuery,
  ContentRecord,
  ContentStore,
  ContentTransition,
  ContentUpdateInput,
  ContentVersionRecord,
  CreateContentInput,
  CreateContentVersionInput,
} from './types';

/**
 * Postgres content store (WP-020). Reads/writes the migration-011 tables ONLY
 * (`content`, `content_versions`) — no DDL, no new tables, no schema changes
 * (WP-020 DB boundary). All queries are parameterized. `content` is staff-owned
 * reference data, so no user PII flows through here. `create` wraps the content
 * row + version-1 snapshot in one transaction; `transition` is guarded by the
 * current status (concurrency control on top of the service-level workflow
 * check). FTS search uses the `idx_content_body_en_fts` GIN index over EN text
 * only (`05` §8.5.2); Amharic returns no matches.
 */
export function createPostgresContentStore(connectionString: string): ContentStore {
  const pool = new Pool({
    connectionString,
    max: 10,
    connectionTimeoutMillis: 2000,
  });

  function parseContent(row: Record<string, unknown>): ContentRecord {
    return {
      id: String(row.id),
      contentType: row.content_type as ContentRecord['contentType'],
      titleEn: row.title_en == null ? null : String(row.title_en),
      titleAm: row.title_am == null ? null : String(row.title_am),
      bodyEn: row.body_en == null ? null : String(row.body_en),
      bodyAm: row.body_am == null ? null : String(row.body_am),
      pregnancyWeek: row.pregnancy_week == null ? null : Number(row.pregnancy_week),
      status: row.status as ContentRecord['status'],
      medicalReviewed: Boolean(row.medical_reviewed),
      createdBy: row.created_by == null ? null : String(row.created_by),
      createdAt: (row.created_at as Date).toISOString(),
      updatedAt: (row.updated_at as Date).toISOString(),
    };
  }

  function parseVersion(row: Record<string, unknown>): ContentVersionRecord {
    return {
      id: String(row.id),
      contentId: String(row.content_id),
      version: Number(row.version),
      changeNote: row.change_note == null ? null : String(row.change_note),
      bodySnapshot:
        row.body_snapshot && typeof row.body_snapshot === 'object'
          ? (row.body_snapshot as Record<string, unknown>)
          : {},
      reviewedBy: row.reviewed_by == null ? null : String(row.reviewed_by),
      createdAt: (row.created_at as Date).toISOString(),
    };
  }

  const CONTENT_COLUMNS =
    'id, content_type, title_en, title_am, body_en, body_am, pregnancy_week, status, medical_reviewed, created_by, created_at, updated_at';

  function snapshotJson(record: ContentRecord): string {
    return JSON.stringify({
      contentType: record.contentType,
      titleEn: record.titleEn,
      titleAm: record.titleAm,
      bodyEn: record.bodyEn,
      bodyAm: record.bodyAm,
      pregnancyWeek: record.pregnancyWeek,
    });
  }

  return {
    async create(input: CreateContentInput): Promise<ContentRecord> {
      const client: PoolClient = await pool.connect();
      try {
        await client.query('BEGIN');
        const created: QueryResult = await client.query(
          `INSERT INTO content (content_type, title_en, title_am, body_en, body_am, pregnancy_week, created_by)
           VALUES ($1, $2, $3, $4, $5, $6, $7)
           RETURNING ${CONTENT_COLUMNS}`,
          [
            input.contentType,
            input.titleEn,
            input.titleAm,
            input.bodyEn,
            input.bodyAm,
            input.pregnancyWeek,
            input.createdBy,
          ],
        );
        const record = parseContent(created.rows[0]);
        await client.query(
          `INSERT INTO content_versions (content_id, version, change_note, body_snapshot, reviewed_by)
           VALUES ($1, 1, NULL, $2::jsonb, NULL)`,
          [record.id, snapshotJson(record)],
        );
        await client.query('COMMIT');
        return record;
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      } finally {
        client.release();
      }
    },

    async findById(id: string): Promise<ContentRecord | null> {
      const result = await pool.query(
        `SELECT ${CONTENT_COLUMNS} FROM content WHERE id = $1 LIMIT 1`,
        [id],
      );
      return result.rows.length > 0 ? parseContent(result.rows[0]) : null;
    },

    async updateContent(id: string, patch: ContentUpdateInput): Promise<ContentRecord> {
      const sets: string[] = [];
      const values: unknown[] = [];
      let index = 1;
      const COLUMN_BY_FIELD: Record<keyof ContentUpdateInput, string> = {
        titleEn: 'title_en',
        titleAm: 'title_am',
        bodyEn: 'body_en',
        bodyAm: 'body_am',
        pregnancyWeek: 'pregnancy_week',
      };
      // eslint-disable-next-line security/detect-object-injection -- `field` comes from the closed ContentUpdateInput field set (service-validated), never raw user input.
      for (const field of Object.keys(patch) as (keyof ContentUpdateInput)[]) {
        // eslint-disable-next-line security/detect-object-injection -- `field` is a member of the closed union above.
        sets.push(`${COLUMN_BY_FIELD[field]} = $${index}`);
        // eslint-disable-next-line security/detect-object-injection -- `field` is a member of the closed union above.
        values.push(patch[field] ?? null);
        index += 1;
      }
      if (sets.length === 0) {
        throw new Error('No content fields to update');
      }
      sets.push(`updated_at = now()`);
      values.push(id);
      const result = await pool.query(
        `UPDATE content SET ${sets.join(', ')}
         WHERE id = $${index}
         RETURNING ${CONTENT_COLUMNS}`,
        values,
      );
      if (result.rows.length === 0) {
        throw new NotFoundError('Content not found');
      }
      return parseContent(result.rows[0]);
    },

    async transition(id: string, change: ContentTransition): Promise<ContentRecord> {
      const result = await pool.query(
        `UPDATE content
         SET status = $2,
             medical_reviewed = $3,
             updated_at = now()
         WHERE id = $1 AND status = ANY($4::text[])
         RETURNING ${CONTENT_COLUMNS}`,
        [id, change.to, change.medicalReviewed ?? false, change.from],
      );
      if (result.rows.length === 0) {
        throw new ConflictError(
          `Invalid transition to '${change.to}' — content is not in the expected state`,
        );
      }
      return parseContent(result.rows[0]);
    },

    async listPublished(query: ContentListQuery): Promise<ContentRecord[]> {
      const clauses = ["status = 'published'"];
      const values: unknown[] = [];
      let index = 1;
      if (query.type) {
        clauses.push(`content_type = $${index}`);
        values.push(query.type);
        index += 1;
      }
      if (query.week) {
        clauses.push(`pregnancy_week = $${index}`);
        values.push(query.week);
        index += 1;
      }
      if (query.language === 'en') {
        clauses.push(`title_en IS NOT NULL AND body_en IS NOT NULL`);
      }
      if (query.language === 'am') {
        clauses.push(`title_am IS NOT NULL AND body_am IS NOT NULL`);
      }
      const result = await pool.query(
        `SELECT ${CONTENT_COLUMNS} FROM content
         WHERE ${clauses.join(' AND ')}
         ORDER BY updated_at DESC, id DESC`,
        values,
      );
      return result.rows.map((row) => parseContent(row));
    },

    async search(query: string, language: ContentLanguage): Promise<ContentRecord[]> {
      if (language !== 'en' || query.trim() === '') {
        return [];
      }
      const result = await pool.query(
        `SELECT ${CONTENT_COLUMNS},
                ts_rank(
                  to_tsvector('english', coalesce(title_en, '') || ' ' || coalesce(body_en, '')),
                  plainto_tsquery('english', $1)
                ) AS rank
         FROM content
         WHERE status = 'published'
           AND to_tsvector('english', coalesce(title_en, '') || ' ' || coalesce(body_en, ''))
               @@ plainto_tsquery('english', $1)
         ORDER BY rank DESC, id DESC`,
        [query],
      );
      return result.rows.map((row) => parseContent(row));
    },

    async insertVersion(input: CreateContentVersionInput): Promise<ContentVersionRecord> {
      const result = await pool.query(
        `INSERT INTO content_versions (content_id, version, change_note, body_snapshot, reviewed_by)
         VALUES ($1, $2, $3, $4::jsonb, $5)
         RETURNING id, content_id, version, change_note, body_snapshot, reviewed_by, created_at`,
        [
          input.contentId,
          input.version,
          input.changeNote,
          JSON.stringify(input.bodySnapshot),
          input.reviewedBy,
        ],
      );
      return parseVersion(result.rows[0]);
    },

    async getVersions(contentId: string): Promise<ContentVersionRecord[]> {
      const result = await pool.query(
        `SELECT id, content_id, version, change_note, body_snapshot, reviewed_by, created_at
         FROM content_versions
         WHERE content_id = $1
         ORDER BY version ASC`,
        [contentId],
      );
      return result.rows.map((row) => parseVersion(row));
    },

    async markVersionReviewed(
      contentId: string,
      reviewedBy: string,
    ): Promise<ContentVersionRecord> {
      const result = await pool.query(
        `UPDATE content_versions
         SET reviewed_by = $2
         WHERE content_id = $1
           AND version = (SELECT MAX(version) FROM content_versions WHERE content_id = $1)
         RETURNING id, content_id, version, change_note, body_snapshot, reviewed_by, created_at`,
        [contentId, reviewedBy],
      );
      if (result.rows.length === 0) {
        throw new NotFoundError('Content version not found');
      }
      return parseVersion(result.rows[0]);
    },

    async dispose(): Promise<void> {
      await pool.end();
    },
  };
}
