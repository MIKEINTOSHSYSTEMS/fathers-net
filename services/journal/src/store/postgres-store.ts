import { Pool } from 'pg';
import { NotFoundError } from '@fathersnet/errors';
import { decodeCursor, encodeCursor } from './cursor';
import type {
  CreateJournalEntryInput,
  EntryListQuery,
  JournalEntry,
  JournalEntryList,
  JournalStore,
  UpdateJournalEntryInput,
} from './types';

/**
 * Postgres journal store (WP-022). Reads/writes the migration-019 tables ONLY
 * (`journal_entries`; `journal_media` is created by the migration but unused in
 * this phase) — no DDL, no schema changes (WP-022 DB boundary). All queries are
 * parameterized.
 *
 * Privacy gate (FR-052/FR-126): `findByIdForUser` returns an entry only for the
 * owner or an explicitly-shared linked partner — the partner link resolves
 * through `pregnancies.partner_user_id` (migration 003), so the shared read
 * requires BOTH `shared_with_partner = true` AND a real journey linkage. Any
 * other caller gets an empty row → null → 404 (invisibility). Mutations are
 * guarded by `user_id = owner` in the WHERE clause; a missing or non-owned row
 * throws NotFoundError so existence is never leaked.
 */
export function createPostgresJournalStore(connectionString: string): JournalStore {
  const pool = new Pool({
    connectionString,
    max: 10,
    connectionTimeoutMillis: 2000,
  });

  function parseEntry(row: Record<string, unknown>): JournalEntry {
    return {
      id: String(row.id),
      userId: String(row.user_id),
      entryType: row.entry_type as JournalEntry['entryType'],
      content: String(row.content),
      pregnancyWeek: row.pregnancy_week == null ? null : Number(row.pregnancy_week),
      sharedWithPartner: Boolean(row.shared_with_partner),
      createdAt: (row.created_at as Date).toISOString(),
      updatedAt: (row.updated_at as Date).toISOString(),
    };
  }

  const ENTRY_COLUMNS =
    'id, user_id, entry_type, content, pregnancy_week, shared_with_partner, created_at, updated_at';

  return {
    async create(input: CreateJournalEntryInput): Promise<JournalEntry> {
      const result = await pool.query(
        `INSERT INTO journal_entries (user_id, entry_type, content, pregnancy_week, shared_with_partner)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING ${ENTRY_COLUMNS}`,
        [
          input.userId,
          input.entryType,
          input.content,
          input.pregnancyWeek,
          input.sharedWithPartner,
        ],
      );
      return parseEntry(result.rows[0]);
    },

    async findByIdForUser(id: string, userId: string): Promise<JournalEntry | null> {
      const result = await pool.query(
        `SELECT ${ENTRY_COLUMNS} FROM journal_entries je
         WHERE je.id = $1
           AND (
             je.user_id = $2
             OR (
               je.shared_with_partner = true
               AND EXISTS (
                 SELECT 1 FROM pregnancies p
                 WHERE p.user_id = je.user_id AND p.partner_user_id = $2
               )
             )
           )
         LIMIT 1`,
        [id, userId],
      );
      return result.rows.length > 0 ? parseEntry(result.rows[0]) : null;
    },

    async listForUser(userId: string, query: EntryListQuery): Promise<JournalEntryList> {
      const cursor = decodeCursor(query.cursor);
      const values: unknown[] = [userId];
      let clause = `je.user_id = $1`;
      let index = 2;
      if (cursor) {
        clause += ` AND (je.created_at, je.id) < ($2, $3)`;
        values.push(cursor.createdAt, cursor.id);
        index = 4;
      }
      // Fetch pageSize + 1 to detect a further page (keyset pagination).
      values.push(query.pageSize + 1);
      const result = await pool.query(
        `SELECT ${ENTRY_COLUMNS} FROM journal_entries je
         WHERE ${clause}
         ORDER BY je.created_at DESC, je.id DESC
         LIMIT $${index}`,
        values,
      );
      const rows = result.rows.map((row) => parseEntry(row));
      const hasMore = rows.length > query.pageSize;
      const items = hasMore ? rows.slice(0, query.pageSize) : rows;
      const last = items[items.length - 1];
      const nextCursor =
        hasMore && last ? encodeCursor({ userId, createdAt: last.createdAt, id: last.id }) : null;
      return { items, nextCursor };
    },

    async updateEntry(
      id: string,
      ownerId: string,
      patch: UpdateJournalEntryInput,
    ): Promise<JournalEntry> {
      const sets: string[] = [];
      const values: unknown[] = [];
      let index = 1;
      const COLUMN_BY_FIELD: Record<keyof UpdateJournalEntryInput, string> = {
        content: 'content',
        pregnancyWeek: 'pregnancy_week',
        sharedWithPartner: 'shared_with_partner',
      };
      // eslint-disable-next-line security/detect-object-injection -- `field` comes from the closed UpdateJournalEntryInput field set (service-validated), never raw user input.
      for (const field of Object.keys(patch) as (keyof UpdateJournalEntryInput)[]) {
        // eslint-disable-next-line security/detect-object-injection -- `field` is a member of the closed union above.
        sets.push(`${COLUMN_BY_FIELD[field]} = $${index}`);
        // eslint-disable-next-line security/detect-object-injection -- `field` is a member of the closed union above.
        values.push(patch[field] ?? null);
        index += 1;
      }
      if (sets.length === 0) {
        throw new Error('No journal fields to update');
      }
      sets.push(`updated_at = now()`);
      values.push(id, ownerId);
      const result = await pool.query(
        `UPDATE journal_entries SET ${sets.join(', ')}
         WHERE id = $${index} AND user_id = $${index + 1}
         RETURNING ${ENTRY_COLUMNS}`,
        values,
      );
      if (result.rows.length === 0) {
        throw new NotFoundError('Entry not found');
      }
      return parseEntry(result.rows[0]);
    },

    async deleteEntry(id: string, ownerId: string): Promise<void> {
      const result = await pool.query(
        `DELETE FROM journal_entries WHERE id = $1 AND user_id = $2`,
        [id, ownerId],
      );
      if (result.rowCount === 0) {
        throw new NotFoundError('Entry not found');
      }
    },

    async setShared(id: string, ownerId: string, shared: boolean): Promise<JournalEntry> {
      return this.updateEntry(id, ownerId, { sharedWithPartner: shared });
    },

    async listAllForUser(userId: string): Promise<JournalEntry[]> {
      const result = await pool.query(
        `SELECT ${ENTRY_COLUMNS} FROM journal_entries je
         WHERE je.user_id = $1
         ORDER BY je.created_at ASC, je.id ASC`,
        [userId],
      );
      return result.rows.map((row) => parseEntry(row));
    },

    async ping(): Promise<boolean> {
      try {
        await pool.query('SELECT 1');
        return true;
      } catch {
        return false;
      }
    },

    async dispose(): Promise<void> {
      await pool.end();
    },
  };
}
