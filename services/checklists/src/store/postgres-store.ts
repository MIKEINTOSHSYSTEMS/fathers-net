import { Pool } from 'pg';
import { NotFoundError } from '@fathersnet/errors';
import type {
  AddItemInput,
  BudgetEntry,
  Checklist,
  ChecklistItem,
  CreateBudgetEntryInput,
  CreateChecklistInput,
  UpdateBudgetEntryInput,
  UpdateItemInput,
} from '../types';
import { formatDate, isoFrom } from '../services/domain';
import type { ChecklistBudgetStore } from './types';
/**
 * Postgres checklist & budget store (WP-023). Reads/writes the migration-020
 * tables ONLY (`checklists`, `checklist_items`, `budget_entries`) — no DDL, no
 * schema changes (WP-023 DB boundary). All queries are parameterized.
 *
 * Ownership gate (FR-126): every checklist read/mutation is scoped by the
 * caller's identity; a missing or non-owned row yields null / NotFoundError →
 * 404 (invisibility, never 403). Budget entry mutations are guarded by
 * `user_id = owner` in the WHERE clause.
 *
 * Progress (NFR-007): item add and item update recompute the parent
 * `checklists.progress` in the same operation — the item update runs inside a
 * transaction so the toggle + progress write are atomic.
 */
export function createPostgresChecklistBudgetStore(connectionString: string): ChecklistBudgetStore {
  const pool = new Pool({
    connectionString,
    max: 10,
    connectionTimeoutMillis: 2000,
  });

  const CHECKLIST_COLUMNS = 'id, user_id, checklist_type, title, progress, created_at, updated_at';
  const ITEM_COLUMNS =
    'id, checklist_id, category, item_name, completed, completed_at, custom, sort_order, created_at, updated_at';
  const BUDGET_COLUMNS =
    'id, user_id, category, item_name, planned_amount, actual_amount, entry_date, notes, receipt_image, created_at, updated_at';

  function parseChecklist(row: Record<string, unknown>): Omit<Checklist, 'items'> {
    return {
      id: String(row.id),
      userId: String(row.user_id),
      checklistType: row.checklist_type as Checklist['checklistType'],
      title: String(row.title),
      progress: Number(row.progress),
      createdAt: (row.created_at as Date).toISOString(),
      updatedAt: (row.updated_at as Date).toISOString(),
    };
  }

  function parseItem(row: Record<string, unknown>): ChecklistItem {
    return {
      id: String(row.id),
      checklistId: String(row.checklist_id),
      category: row.category as ChecklistItem['category'],
      itemName: String(row.item_name),
      completed: Boolean(row.completed),
      completedAt: isoFrom(row.completed_at as Date | null),
      custom: Boolean(row.custom),
      sortOrder: Number(row.sort_order),
      createdAt: (row.created_at as Date).toISOString(),
      updatedAt: (row.updated_at as Date).toISOString(),
    };
  }

  function parseBudget(row: Record<string, unknown>): BudgetEntry {
    return {
      id: String(row.id),
      userId: String(row.user_id),
      category: row.category as BudgetEntry['category'],
      itemName: String(row.item_name),
      plannedAmount: Number(row.planned_amount),
      actualAmount: row.actual_amount == null ? null : Number(row.actual_amount),
      entryDate: formatDate(row.entry_date as Date),
      notes: row.notes == null ? null : String(row.notes),
      receiptImage: row.receipt_image == null ? null : String(row.receipt_image),
      createdAt: (row.created_at as Date).toISOString(),
      updatedAt: (row.updated_at as Date).toISOString(),
    };
  }

  function isUniqueViolation(err: unknown): boolean {
    return typeof err === 'object' && err !== null && (err as { code?: string }).code === '23505';
  }

  async function withItems(checklist: Omit<Checklist, 'items'>): Promise<Checklist> {
    const result = await pool.query(
      `SELECT ${ITEM_COLUMNS} FROM checklist_items
       WHERE checklist_id = $1
       ORDER BY sort_order ASC, created_at ASC`,
      [checklist.id],
    );
    return { ...checklist, items: result.rows.map((row) => parseItem(row)) };
  }

  async function itemsByChecklistIds(ids: string[]): Promise<Map<string, ChecklistItem[]>> {
    if (ids.length === 0) {
      return new Map();
    }
    const result = await pool.query(
      `SELECT ${ITEM_COLUMNS} FROM checklist_items
       WHERE checklist_id = ANY($1)
       ORDER BY sort_order ASC, created_at ASC`,
      [ids],
    );
    const map = new Map<string, ChecklistItem[]>();
    for (const row of result.rows) {
      const item = parseItem(row);
      const list = map.get(item.checklistId) ?? [];
      list.push(item);
      map.set(item.checklistId, list);
    }
    return map;
  }

  const PROGRESS_UPDATE = `
    UPDATE checklists c
    SET progress = COALESCE(
          (SELECT round((count(*) FILTER (WHERE ci.completed))::numeric
                        / NULLIF(count(*), 0) * 100, 2)
           FROM checklist_items ci WHERE ci.checklist_id = c.id),
          0),
        updated_at = now()
    WHERE c.id = $1`;

  return {
    async ensureChecklist(input: CreateChecklistInput): Promise<Checklist> {
      const existing = await pool.query(
        `SELECT ${CHECKLIST_COLUMNS} FROM checklists
         WHERE user_id = $1 AND checklist_type = $2 LIMIT 1`,
        [input.userId, input.checklistType],
      );
      if (existing.rows.length > 0) {
        return withItems(parseChecklist(existing.rows[0]));
      }
      try {
        const created = await pool.query(
          `INSERT INTO checklists (user_id, checklist_type, title)
           VALUES ($1, $2, $3) RETURNING ${CHECKLIST_COLUMNS}`,
          [input.userId, input.checklistType, input.title],
        );
        return withItems(parseChecklist(created.rows[0]));
      } catch (err) {
        if (!isUniqueViolation(err)) {
          throw err;
        }
        const raced = await pool.query(
          `SELECT ${CHECKLIST_COLUMNS} FROM checklists
           WHERE user_id = $1 AND checklist_type = $2 LIMIT 1`,
          [input.userId, input.checklistType],
        );
        return withItems(parseChecklist(raced.rows[0]));
      }
    },

    async listChecklistsForUser(userId: string): Promise<Checklist[]> {
      const result = await pool.query(
        `SELECT ${CHECKLIST_COLUMNS} FROM checklists
         WHERE user_id = $1 ORDER BY created_at ASC`,
        [userId],
      );
      const rows = result.rows.map((row) => parseChecklist(row));
      const items = await itemsByChecklistIds(rows.map((c) => c.id));
      return rows.map((checklist) => ({ ...checklist, items: items.get(checklist.id) ?? [] }));
    },

    async findChecklistForUser(id: string, userId: string): Promise<Checklist | null> {
      const result = await pool.query(
        `SELECT ${CHECKLIST_COLUMNS} FROM checklists
         WHERE id = $1 AND user_id = $2 LIMIT 1`,
        [id, userId],
      );
      if (result.rows.length === 0) {
        return null;
      }
      return withItems(parseChecklist(result.rows[0]));
    },

    async addItem(
      checklistId: string,
      ownerId: string,
      input: AddItemInput,
    ): Promise<ChecklistItem> {
      const result = await pool.query(
        `INSERT INTO checklist_items (checklist_id, category, item_name, custom, sort_order)
         SELECT $1, $2, $3, true,
                (SELECT coalesce(max(sort_order) + 1, 0)
                 FROM checklist_items WHERE checklist_id = $1)
         WHERE EXISTS (SELECT 1 FROM checklists c
                       WHERE c.id = $1 AND c.user_id = $4)
         RETURNING ${ITEM_COLUMNS}`,
        [checklistId, input.category, input.itemName.trim(), ownerId],
      );
      if (result.rows.length === 0) {
        throw new NotFoundError('Checklist not found');
      }
      await pool.query(PROGRESS_UPDATE, [checklistId]);
      return parseItem(result.rows[0]);
    },

    async updateItem(
      checklistId: string,
      itemId: string,
      ownerId: string,
      patch: UpdateItemInput,
    ): Promise<ChecklistItem> {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const sets: string[] = [];
        const values: unknown[] = [];
        let index = 1;
        if (patch.completed !== undefined) {
          sets.push(`completed = $${index}`);
          values.push(patch.completed);
          index += 1;
          sets.push(`completed_at = CASE WHEN $${index} THEN now() ELSE NULL END`);
          values.push(patch.completed);
          index += 1;
        }
        if (sets.length === 0) {
          throw new Error('No item fields to update');
        }
        sets.push('updated_at = now()');
        values.push(itemId, checklistId, ownerId);
        const result = await client.query(
          `UPDATE checklist_items ci SET ${sets.join(', ')}
           FROM checklists c
           WHERE ci.id = $${index}
             AND ci.checklist_id = $${index + 1}
             AND c.id = ci.checklist_id
             AND c.user_id = $${index + 2}
           RETURNING ${ITEM_COLUMNS}`,
          values,
        );
        if (result.rows.length === 0) {
          await client.query('ROLLBACK');
          throw new NotFoundError('Item not found');
        }
        await client.query(PROGRESS_UPDATE, [checklistId]);
        await client.query('COMMIT');
        return parseItem(result.rows[0]);
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      } finally {
        client.release();
      }
    },

    async createBudgetEntry(input: CreateBudgetEntryInput): Promise<BudgetEntry> {
      const result = await pool.query(
        `INSERT INTO budget_entries
           (user_id, category, item_name, planned_amount, actual_amount, entry_date, notes)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING ${BUDGET_COLUMNS}`,
        [
          input.userId,
          input.category,
          input.itemName.trim(),
          input.plannedAmount,
          input.actualAmount,
          input.entryDate,
          input.notes,
        ],
      );
      return parseBudget(result.rows[0]);
    },

    async listBudgetEntriesForUser(userId: string): Promise<BudgetEntry[]> {
      const result = await pool.query(
        `SELECT ${BUDGET_COLUMNS} FROM budget_entries
         WHERE user_id = $1
         ORDER BY entry_date DESC, created_at DESC`,
        [userId],
      );
      return result.rows.map((row) => parseBudget(row));
    },

    async updateBudgetEntry(
      id: string,
      ownerId: string,
      patch: UpdateBudgetEntryInput,
    ): Promise<BudgetEntry> {
      const sets: string[] = [];
      const values: unknown[] = [];
      let index = 1;
      const COLUMN_BY_FIELD: Record<keyof UpdateBudgetEntryInput, string> = {
        category: 'category',
        itemName: 'item_name',
        plannedAmount: 'planned_amount',
        actualAmount: 'actual_amount',
        entryDate: 'entry_date',
        notes: 'notes',
        receiptImage: 'receipt_image',
      };
      // eslint-disable-next-line security/detect-object-injection -- `field` comes from the closed UpdateBudgetEntryInput field set (service-validated), never raw user input.
      for (const field of Object.keys(patch) as (keyof UpdateBudgetEntryInput)[]) {
        // eslint-disable-next-line security/detect-object-injection -- `field` is a member of the closed union above.
        sets.push(`${COLUMN_BY_FIELD[field]} = $${index}`);
        // eslint-disable-next-line security/detect-object-injection -- `field` is a member of the closed union above.
        values.push(patch[field] ?? null);
        index += 1;
      }
      if (sets.length === 0) {
        throw new Error('No budget fields to update');
      }
      sets.push('updated_at = now()');
      values.push(id, ownerId);
      const result = await pool.query(
        `UPDATE budget_entries SET ${sets.join(', ')}
         WHERE id = $${index} AND user_id = $${index + 1}
         RETURNING ${BUDGET_COLUMNS}`,
        values,
      );
      if (result.rows.length === 0) {
        throw new NotFoundError('Entry not found');
      }
      return parseBudget(result.rows[0]);
    },

    async deleteBudgetEntry(id: string, ownerId: string): Promise<void> {
      const result = await pool.query(`DELETE FROM budget_entries WHERE id = $1 AND user_id = $2`, [
        id,
        ownerId,
      ]);
      if (result.rowCount === 0) {
        throw new NotFoundError('Entry not found');
      }
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
