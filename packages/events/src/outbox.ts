/**
 * Outbox pattern relay (06 §2.2, 03 §4.6 D-03, FR-161).
 *
 * Producers persist domain writes and event publications in one local
 * transaction (per-service `outbox` table). `OutboxRelay` reads committed
 * rows and publishes them to the bus via the injected `EventBus`, then marks
 * the row published — publish-on-commit without dual-write hazards.
 *
 * Guarantees: at-least-once (03 §4.6 line 421); retries with exponential
 * backoff + jitter (1 -> 2 -> 4 min default, 03 §5.4); dead-letter after
 * `maxAttempts` via the `onDead` hook + `status = 'dead'` (12 §16 I-13,
 * OR-008); the stable event `id` is the consumer idempotency key, so
 * replays are no-ops for consumers.
 *
 * NOTE (WP-024a scope): the outbox table is per-service and requires a
 * `05` §4.2 row + schema approval before any service ships it. This package
 * only ships the canonical DDL contract (`OUTBOX_TABLE_DDL`) and the relay;
 * integration tests exercise it against a test-local table.
 */

import type { Logger } from '@fathersnet/logger';
import type { Client } from 'pg';

import type { EventBus } from './bus';
import { createEvent } from './event';
import type { EventName } from './vocabulary';

export type OutboxStatus = 'pending' | 'published' | 'failed' | 'dead';

export interface OutboxRow {
  id: string;
  event_id: string;
  event_type: EventName;
  producer: string;
  schema_version: number;
  /** ISO 8601. */
  occurred_at: string;
  aggregate_type: string | null;
  aggregate_id: string | null;
  idempotency_key: string;
  payload: unknown;
  status: OutboxStatus;
  attempts: number;
  /** ISO 8601; row is not eligible for publishing before this. */
  available_at: string;
  created_at: string;
  published_at: string | null;
  last_error: string | null;
}

/**
 * Canonical per-service outbox table DDL (06 §2.2). Not a committed migration
 * (WP-024a is packages-only); each adopting service copies this contract into
 * its own approved migration with a service-specific table name.
 */
export const OUTBOX_TABLE_DDL = `
CREATE TABLE IF NOT EXISTS outbox (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id         uuid NOT NULL,
  event_type       text NOT NULL,
  producer         text NOT NULL,
  schema_version   integer NOT NULL DEFAULT 1,
  occurred_at      timestamptz NOT NULL DEFAULT now(),
  aggregate_type   text,
  aggregate_id     text,
  idempotency_key  text NOT NULL,
  payload          jsonb NOT NULL,
  status           text NOT NULL DEFAULT 'pending'
                   CHECK (status IN ('pending', 'published', 'failed', 'dead')),
  attempts         integer NOT NULL DEFAULT 0,
  available_at     timestamptz NOT NULL DEFAULT now(),
  created_at       timestamptz NOT NULL DEFAULT now(),
  published_at     timestamptz,
  last_error       text
);

CREATE INDEX IF NOT EXISTS outbox_pending_idx
  ON outbox (status, available_at)
  WHERE status IN ('pending', 'failed');
`;

/**
 * Row-source abstraction for the outbox table. A service wires its own table
 * to the relay through this interface (the relay is DB-agnostic).
 */
export interface OutboxReader {
  /** Fetch up to `limit` rows eligible for publishing (oldest first). */
  fetchPending(limit: number): Promise<OutboxRow[]>;
  markPublished(rowId: string, publishedAt: Date): Promise<void>;
  markFailed(rowId: string, error: string, nextAttemptAt: Date): Promise<void>;
  /** Move a row to the dead-letter state after max attempts (12 §16 I-13). */
  markDead(rowId: string, error: string): Promise<void>;
}

interface OutboxDbRow {
  id: string;
  event_id: string;
  event_type: string;
  producer: string;
  schema_version: number;
  occurred_at: Date | string;
  aggregate_type: string | null;
  aggregate_id: string | null;
  idempotency_key: string;
  payload: unknown;
  status: string;
  attempts: number;
  available_at: Date | string;
  created_at: Date | string;
  published_at: Date | string | null;
  last_error: string | null;
}

const OUTBOX_COLUMNS = [
  'id',
  'event_id',
  'event_type',
  'producer',
  'schema_version',
  'occurred_at',
  'aggregate_type',
  'aggregate_id',
  'idempotency_key',
  'payload',
  'status',
  'attempts',
  'available_at',
  'created_at',
  'published_at',
  'last_error',
].join(', ');

function toIso(value: Date | string | null): string | null {
  if (value == null) {
    return null;
  }
  return value instanceof Date ? value.toISOString() : String(value);
}

/** Default Postgres outbox reader. Table name is validated against SQL injection. */
export class PostgresOutboxReader implements OutboxReader {
  private readonly table: string;

  constructor(
    private readonly client: Client,
    table = 'outbox',
  ) {
    if (!/^[a-z_][a-z0-9_]*$/.test(table)) {
      throw new Error(`Invalid outbox table name '${table}'.`);
    }
    this.table = table;
  }

  async fetchPending(limit: number): Promise<OutboxRow[]> {
    const result = await this.client.query<OutboxDbRow>(
      `SELECT ${OUTBOX_COLUMNS} FROM ${this.table}
       WHERE status IN ('pending', 'failed') AND available_at <= now()
       ORDER BY available_at, created_at
       LIMIT $1`,
      [limit],
    );
    return result.rows.map((row) => ({
      id: row.id,
      event_id: row.event_id,
      event_type: row.event_type as EventName,
      producer: row.producer,
      schema_version: row.schema_version,
      occurred_at: toIso(row.occurred_at) as string,
      aggregate_type: row.aggregate_type,
      aggregate_id: row.aggregate_id,
      idempotency_key: row.idempotency_key,
      payload: row.payload,
      status: row.status as OutboxStatus,
      attempts: row.attempts,
      available_at: toIso(row.available_at) as string,
      created_at: toIso(row.created_at) as string,
      published_at: toIso(row.published_at),
      last_error: row.last_error,
    }));
  }

  async markPublished(rowId: string, publishedAt: Date): Promise<void> {
    await this.client.query(
      `UPDATE ${this.table} SET status = 'published', published_at = $2, last_error = NULL
       WHERE id = $1`,
      [rowId, publishedAt],
    );
  }

  async markFailed(rowId: string, error: string, nextAttemptAt: Date): Promise<void> {
    await this.client.query(
      `UPDATE ${this.table} SET status = 'failed', attempts = attempts + 1, available_at = $3, last_error = $2
       WHERE id = $1`,
      [rowId, error, nextAttemptAt],
    );
  }

  async markDead(rowId: string, error: string): Promise<void> {
    await this.client.query(
      `UPDATE ${this.table} SET status = 'dead', attempts = attempts + 1, last_error = $2
       WHERE id = $1`,
      [rowId, error],
    );
  }
}

export interface OutboxRelayOptions {
  bus: EventBus;
  reader: OutboxReader;
  logger?: Logger;
  /** Maximum publish attempts before the row is dead-lettered. Default 5. */
  maxAttempts?: number;
  /** Exponential backoff base in ms. Default 60_000 (1 min, 03 §5.4). */
  retryBaseMs?: number;
  /** Backoff ceiling in ms. Default 240_000 (4 min, 03 §5.4). */
  retryMaxMs?: number;
  /** Jitter as a fraction of the backoff. Default 0.2. */
  jitterFactor?: number;
  /** Rows fetched per relay run. Default 100. */
  batchSize?: number;
  /** Called when a row is moved to the dead-letter state (OR-008 alerting). */
  onDead?: (row: OutboxRow, error: Error) => void | Promise<void>;
}

export interface RelayRunSummary {
  scanned: number;
  published: number;
  failed: number;
  dead: number;
}

/** Exponential backoff with jitter: base * 2^(attempts-1), capped, ±jitter. */
export function backoffMs(
  attempts: number,
  baseMs: number,
  maxMs: number,
  jitterFactor: number,
): number {
  const exponent = Math.max(0, attempts - 1);
  const raw = baseMs * 2 ** exponent;
  const capped = Math.min(raw, maxMs);
  const jitter = jitterFactor * capped * (Math.random() - 0.5);
  return Math.max(0, Math.round(capped + jitter));
}

export class OutboxRelay {
  private readonly bus: EventBus;
  private readonly reader: OutboxReader;
  private readonly logger?: Logger;
  private readonly maxAttempts: number;
  private readonly retryBaseMs: number;
  private readonly retryMaxMs: number;
  private readonly jitterFactor: number;
  private readonly batchSize: number;
  private readonly onDead?: (row: OutboxRow, error: Error) => void | Promise<void>;
  private running = false;
  private timer: NodeJS.Timeout | null = null;

  constructor(options: OutboxRelayOptions) {
    this.bus = options.bus;
    this.reader = options.reader;
    this.logger = options.logger;
    this.maxAttempts = options.maxAttempts ?? 5;
    this.retryBaseMs = options.retryBaseMs ?? 60_000;
    this.retryMaxMs = options.retryMaxMs ?? 240_000;
    this.jitterFactor = options.jitterFactor ?? 0.2;
    this.batchSize = options.batchSize ?? 100;
    this.onDead = options.onDead;
  }

  get isRunning(): boolean {
    return this.running;
  }

  /** One relay pass: publish every eligible row exactly once. */
  async runOnce(): Promise<RelayRunSummary> {
    const summary: RelayRunSummary = { scanned: 0, published: 0, failed: 0, dead: 0 };
    const rows = await this.reader.fetchPending(this.batchSize);
    summary.scanned = rows.length;

    for (const row of rows) {
      const event = createEvent({
        id: row.event_id,
        type: row.event_type,
        producer: row.producer,
        payload: row.payload,
        occurred_at: row.occurred_at,
        schema_version: row.schema_version,
        aggregate: row.aggregate_type
          ? { type: row.aggregate_type, id: row.aggregate_id ?? '' }
          : null,
        idempotency_key: row.idempotency_key,
      });
      try {
        await this.bus.publish(event);
        await this.reader.markPublished(row.id, new Date());
        summary.published += 1;
        this.logger?.info('outbox.published', `Published outbox row ${row.id}`, {
          event_id: row.event_id,
          event_type: row.event_type,
        });
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));
        const attempts = row.attempts + 1;
        if (attempts >= this.maxAttempts) {
          await this.reader.markDead(row.id, error.message);
          summary.dead += 1;
          this.logger?.error('outbox.dead', `Outbox row ${row.id} dead-lettered`, {
            event_id: row.event_id,
            attempts,
            error: error.message,
          });
          await this.onDead?.(row, error);
        } else {
          const nextAttemptAt = new Date(
            Date.now() + backoffMs(attempts, this.retryBaseMs, this.retryMaxMs, this.jitterFactor),
          );
          await this.reader.markFailed(row.id, error.message, nextAttemptAt);
          summary.failed += 1;
          this.logger?.warn(
            'outbox.retry',
            `Outbox row ${row.id} publish failed, scheduled retry`,
            {
              event_id: row.event_id,
              attempts,
              nextAttemptAt: nextAttemptAt.toISOString(),
              error: error.message,
            },
          );
        }
      }
    }
    return summary;
  }

  /** Background polling loop. `runOnce` remains the primary testable path. */
  start(intervalMs = 1_000): void {
    if (this.running) {
      return;
    }
    this.running = true;
    const tick = async (): Promise<void> => {
      if (!this.running) {
        return;
      }
      try {
        await this.runOnce();
      } catch (err) {
        this.logger?.error('outbox.run.failed', 'Outbox relay run failed', {
          error: err instanceof Error ? err.message : String(err),
        });
      }
      this.timer = setTimeout(tick, intervalMs);
      this.timer.unref?.();
    };
    void tick();
  }

  async stop(): Promise<void> {
    this.running = false;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }
}
