import { Pool, type PoolClient } from 'pg';
import { ConflictError } from '@fathersnet/errors';
import { parseQuietHours } from '../engine/quiet-hours';
import { parseRecurrence } from '../engine/recurrence';
import type {
  Channel,
  CreateReminderDispatchInput,
  CreateReminderInstanceInput,
  CreateReminderTemplateInput,
  Priority,
  QuietHoursConfig,
  ReminderDispatch,
  ReminderInstance,
  ReminderStatus,
  ReminderTemplate,
} from '../types';
import type {
  DispatchInstanceInput,
  DispatchListQuery,
  DispatchOutcome,
  ReminderStore,
} from './types';

const UNIQUE_VIOLATION = '23505';

const TEMPLATE_COLUMNS =
  'id, code, channel, priority, title_en, title_am, body_en, body_am, lead_time_minutes, quiet_hours, recurrence, pregnancy_week, active, created_at, updated_at';

const INSTANCE_COLUMNS =
  'id, template_id, user_id, due_at, status, priority, channel, dedupe_key, dispatched_at, acknowledged_at, last_error, created_at';

const DISPATCH_COLUMNS =
  'id, instance_id, user_id, run_id, channel, priority, status, dispatched_at, ack_received_at, ack_payload, last_error, created_at';

function parseTemplate(row: Record<string, unknown>): ReminderTemplate {
  return {
    id: String(row.id),
    code: String(row.code),
    channel: row.channel as Channel,
    priority: row.priority as Priority,
    titleEn: String(row.title_en),
    titleAm: String(row.title_am),
    bodyEn: String(row.body_en),
    bodyAm: String(row.body_am),
    leadTimeMinutes: row.lead_time_minutes == null ? null : Number(row.lead_time_minutes),
    quietHours: parseQuietHours(row.quiet_hours),
    recurrence: parseRecurrence(row.recurrence),
    pregnancyWeek: row.pregnancy_week == null ? null : Number(row.pregnancy_week),
    active: Boolean(row.active),
    createdAt: (row.created_at as Date).toISOString(),
    updatedAt: (row.updated_at as Date).toISOString(),
  };
}

function parseInstance(row: Record<string, unknown>): ReminderInstance {
  return {
    id: String(row.id),
    templateId: String(row.template_id),
    userId: String(row.user_id),
    dueAt: (row.due_at as Date).toISOString(),
    status: row.status as ReminderStatus,
    priority: row.priority as Priority,
    channel: row.channel as Channel,
    dedupeKey: row.dedupe_key == null ? null : String(row.dedupe_key),
    dispatchedAt: row.dispatched_at == null ? null : (row.dispatched_at as Date).toISOString(),
    acknowledgedAt:
      row.acknowledged_at == null ? null : (row.acknowledged_at as Date).toISOString(),
    lastError: row.last_error == null ? null : String(row.last_error),
    createdAt: (row.created_at as Date).toISOString(),
  };
}

function parseDispatch(row: Record<string, unknown>): ReminderDispatch {
  return {
    id: String(row.id),
    instanceId: String(row.instance_id),
    userId: String(row.user_id),
    runId: String(row.run_id),
    channel: row.channel as Channel,
    priority: row.priority as Priority,
    status: row.status as ReminderDispatch['status'],
    dispatchedAt: (row.dispatched_at as Date).toISOString(),
    ackReceivedAt: row.ack_received_at == null ? null : (row.ack_received_at as Date).toISOString(),
    ackPayload:
      row.ack_payload && typeof row.ack_payload === 'object'
        ? (row.ack_payload as Record<string, unknown>)
        : null,
    lastError: row.last_error == null ? null : String(row.last_error),
    createdAt: (row.created_at as Date).toISOString(),
  };
}

/**
 * Postgres reminder store (WP-021). Reads/writes the migration-018 tables ONLY
 * (`reminder_templates`, `reminder_instances`, `reminder_dispatches`) plus the
 * migration-004 `user_preferences.quiet_hours` column — no DDL, no new tables,
 * no schema changes (WP-021 DB boundary). All queries are parameterized.
 *
 * `dispatchInstance` is the concurrency guard: inside one transaction it counts
 * the user's dispatch log for the current Addis day (cap, 06 §4.14), claims the
 * instance with `UPDATE ... WHERE status='scheduled'`, and inserts the dispatch
 * row whose `UNIQUE(instance_id, run_id)` rejects a duplicate run (FR-163).
 */
export function createPostgresReminderStore(connectionString: string): ReminderStore {
  const pool = new Pool({
    connectionString,
    max: 10,
    connectionTimeoutMillis: 2000,
  });

  return {
    async createTemplate(input: CreateReminderTemplateInput): Promise<ReminderTemplate> {
      const result = await pool.query(
        `INSERT INTO reminder_templates
           (code, channel, priority, title_en, title_am, body_en, body_am, lead_time_minutes, quiet_hours, recurrence, pregnancy_week, active)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10::jsonb, $11, $12)
         RETURNING ${TEMPLATE_COLUMNS}`,
        [
          input.code,
          input.channel,
          input.priority,
          input.titleEn,
          input.titleAm,
          input.bodyEn,
          input.bodyAm,
          input.leadTimeMinutes ?? null,
          input.quietHours == null ? null : JSON.stringify(input.quietHours),
          input.recurrence == null ? null : JSON.stringify(input.recurrence),
          input.pregnancyWeek ?? null,
          input.active ?? true,
        ],
      );
      return parseTemplate(result.rows[0]);
    },

    async findTemplateByCode(code: string): Promise<ReminderTemplate | null> {
      const result = await pool.query(
        `SELECT ${TEMPLATE_COLUMNS} FROM reminder_templates WHERE code = $1 LIMIT 1`,
        [code],
      );
      return result.rows.length > 0 ? parseTemplate(result.rows[0]) : null;
    },

    async findTemplateById(id: string): Promise<ReminderTemplate | null> {
      const result = await pool.query(
        `SELECT ${TEMPLATE_COLUMNS} FROM reminder_templates WHERE id = $1 LIMIT 1`,
        [id],
      );
      return result.rows.length > 0 ? parseTemplate(result.rows[0]) : null;
    },

    async listActiveTemplates(): Promise<ReminderTemplate[]> {
      const result = await pool.query(
        `SELECT ${TEMPLATE_COLUMNS} FROM reminder_templates WHERE active = true ORDER BY code`,
      );
      return result.rows.map(parseTemplate);
    },

    async getUserQuietHours(userId: string): Promise<QuietHoursConfig | null> {
      const result = await pool.query(
        `SELECT quiet_hours FROM user_preferences WHERE user_id = $1 LIMIT 1`,
        [userId],
      );
      if (result.rows.length === 0) {
        return null;
      }
      return parseQuietHours(result.rows[0].quiet_hours);
    },

    async getUserLanguage(userId: string): Promise<'en' | 'am'> {
      const result = await pool.query(
        `SELECT language FROM user_preferences WHERE user_id = $1 LIMIT 1`,
        [userId],
      );
      const language = result.rows.length > 0 ? result.rows[0].language : null;
      return language === 'am' ? 'am' : 'en';
    },

    async createInstance(input: CreateReminderInstanceInput): Promise<ReminderInstance> {
      try {
        const result = await pool.query(
          `INSERT INTO reminder_instances (template_id, user_id, due_at, status, priority, channel, dedupe_key)
           VALUES ($1, $2, $3, 'scheduled', $4, $5, $6)
           RETURNING ${INSTANCE_COLUMNS}`,
          [
            input.templateId,
            input.userId,
            input.dueAt,
            input.priority,
            input.channel,
            input.dedupeKey,
          ],
        );
        return parseInstance(result.rows[0]);
      } catch (err) {
        if (isUniqueViolation(err)) {
          throw new ConflictError(
            `Reminder instance with dedupe key '${String(input.dedupeKey)}' already exists`,
          );
        }
        throw err;
      }
    },

    async findInstanceById(id: string): Promise<ReminderInstance | null> {
      const result = await pool.query(
        `SELECT ${INSTANCE_COLUMNS} FROM reminder_instances WHERE id = $1 LIMIT 1`,
        [id],
      );
      return result.rows.length > 0 ? parseInstance(result.rows[0]) : null;
    },

    async findInstanceByDedupeKey(dedupeKey: string): Promise<ReminderInstance | null> {
      const result = await pool.query(
        `SELECT ${INSTANCE_COLUMNS} FROM reminder_instances WHERE dedupe_key = $1 LIMIT 1`,
        [dedupeKey],
      );
      return result.rows.length > 0 ? parseInstance(result.rows[0]) : null;
    },

    async selectDueInstances(nowIso: string, limit: number): Promise<ReminderInstance[]> {
      const result = await pool.query(
        `SELECT ${INSTANCE_COLUMNS} FROM reminder_instances
         WHERE status = 'scheduled' AND due_at <= $1
         ORDER BY due_at ASC
         LIMIT $2`,
        [nowIso, limit],
      );
      return result.rows.map(parseInstance);
    },

    async expireStaleInstances(cutoffIso: string): Promise<number> {
      const result = await pool.query(
        `UPDATE reminder_instances SET status = 'expired'
         WHERE status = 'scheduled' AND due_at < $1`,
        [cutoffIso],
      );
      return result.rowCount ?? 0;
    },

    async setInstanceStatus(
      instanceId: string,
      status: ReminderStatus,
      fields?: { dispatchedAt?: string | null; lastError?: string | null },
    ): Promise<ReminderInstance | null> {
      const result = await pool.query(
        `UPDATE reminder_instances
         SET status = $2,
             dispatched_at = COALESCE($3, dispatched_at),
             last_error = COALESCE($4, last_error)
         WHERE id = $1
         RETURNING ${INSTANCE_COLUMNS}`,
        [
          instanceId,
          status,
          fields?.dispatchedAt === undefined ? null : fields.dispatchedAt,
          fields?.lastError === undefined ? null : fields.lastError,
        ],
      );
      return result.rows.length > 0 ? parseInstance(result.rows[0]) : null;
    },

    async dispatchInstance(input: DispatchInstanceInput): Promise<DispatchOutcome> {
      const client: PoolClient = await pool.connect();
      try {
        await client.query('BEGIN');
        const dayCount = await client.query(
          `SELECT count(*)::int AS count FROM reminder_dispatches
           WHERE user_id = $1 AND dispatched_at >= $2 AND dispatched_at < $3`,
          [input.userId, input.dayStart, input.dayEnd],
        );
        if ((dayCount.rows[0].count as number) >= input.dailyCap) {
          const marked = await client.query(
            `UPDATE reminder_instances SET status = 'rate_limited'
             WHERE id = $1 AND status = 'scheduled'`,
            [input.instanceId],
          );
          await client.query('COMMIT');
          return (marked.rowCount ?? 0) > 0 ? 'rate_limited' : 'conflict';
        }

        const claimed = await client.query(
          `UPDATE reminder_instances SET status = 'dispatched', dispatched_at = $2
           WHERE id = $1 AND status = 'scheduled'
           RETURNING ${INSTANCE_COLUMNS}`,
          [input.instanceId, input.dispatchedAt],
        );
        if (claimed.rowCount === 0) {
          await client.query('ROLLBACK');
          return 'conflict';
        }

        try {
          await client.query(
            `INSERT INTO reminder_dispatches (instance_id, user_id, run_id, channel, priority, status, dispatched_at)
             VALUES ($1, $2, $3, $4, $5, 'dispatched', $6)`,
            [
              input.instanceId,
              input.userId,
              input.runId,
              input.channel,
              input.priority,
              input.dispatchedAt,
            ],
          );
        } catch (err) {
          if (isUniqueViolation(err)) {
            await client.query('ROLLBACK');
            return 'conflict';
          }
          throw err;
        }

        await client.query('COMMIT');
        return 'dispatched';
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      } finally {
        client.release();
      }
    },

    async findDispatchById(id: string): Promise<ReminderDispatch | null> {
      const result = await pool.query(
        `SELECT ${DISPATCH_COLUMNS} FROM reminder_dispatches WHERE id = $1 LIMIT 1`,
        [id],
      );
      return result.rows.length > 0 ? parseDispatch(result.rows[0]) : null;
    },

    async findDispatchForInstanceRun(
      instanceId: string,
      runId: string,
    ): Promise<ReminderDispatch | null> {
      const result = await pool.query(
        `SELECT ${DISPATCH_COLUMNS} FROM reminder_dispatches WHERE instance_id = $1 AND run_id = $2 LIMIT 1`,
        [instanceId, runId],
      );
      return result.rows.length > 0 ? parseDispatch(result.rows[0]) : null;
    },

    async ackDispatch(
      dispatchId: string,
      ackPayload: Record<string, unknown>,
      ackedAt: string,
    ): Promise<ReminderDispatch | null> {
      const client: PoolClient = await pool.connect();
      try {
        await client.query('BEGIN');
        const result = await client.query(
          `UPDATE reminder_dispatches
           SET status = 'acked', ack_received_at = $2, ack_payload = $3::jsonb
           WHERE id = $1 AND status = 'dispatched'
           RETURNING ${DISPATCH_COLUMNS}`,
          [dispatchId, ackedAt, JSON.stringify(ackPayload)],
        );
        if (result.rows.length === 0) {
          await client.query('ROLLBACK');
          return null;
        }
        const dispatch = parseDispatch(result.rows[0]);
        await client.query(`UPDATE reminder_instances SET acknowledged_at = $2 WHERE id = $1`, [
          dispatch.instanceId,
          ackedAt,
        ]);
        await client.query('COMMIT');
        return dispatch;
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      } finally {
        client.release();
      }
    },

    async failDispatch(
      dispatchId: string,
      error: string,
      _failedAt: string,
    ): Promise<ReminderDispatch | null> {
      const client: PoolClient = await pool.connect();
      try {
        await client.query('BEGIN');
        const result = await client.query(
          `UPDATE reminder_dispatches
           SET status = 'failed', last_error = $2
           WHERE id = $1 AND status = 'dispatched'
           RETURNING ${DISPATCH_COLUMNS}`,
          [dispatchId, error],
        );
        if (result.rows.length === 0) {
          await client.query('ROLLBACK');
          return null;
        }
        const dispatch = parseDispatch(result.rows[0]);
        await client.query(
          `UPDATE reminder_instances SET status = 'failed', last_error = $2 WHERE id = $1`,
          [dispatch.instanceId, error],
        );
        await client.query('COMMIT');
        return dispatch;
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      } finally {
        client.release();
      }
    },

    async listDispatches(query: DispatchListQuery): Promise<ReminderDispatch[]> {
      const result = await pool.query(
        `SELECT ${DISPATCH_COLUMNS} FROM reminder_dispatches
         WHERE ($1::uuid IS NULL OR user_id = $1)
         ORDER BY dispatched_at DESC
         LIMIT $2 OFFSET $3`,
        [query.userId ?? null, query.limit, query.offset],
      );
      return result.rows.map(parseDispatch);
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

function isUniqueViolation(err: unknown): boolean {
  return (
    typeof err === 'object' && err !== null && (err as { code?: string }).code === UNIQUE_VIOLATION
  );
}

export type { CreateReminderDispatchInput };
