import type { MigrationBuilder } from 'node-pg-migrate';

/**
 * Migration 021 — per-service transactional outbox tables (06 §2.2, D-03, WP-024c).
 *
 * Catalog row 019 (`outbox`): `05` §4.2 — appended with decision-log D-11 under
 * milestone-2 §10 item 8. Adopts the canonical outbox DDL contract
 * `OUTBOX_TABLE_DDL` (packages/events/src/outbox.ts) across the four WP-024c
 * in-scope services: users, content, reminders, journal. Each service gets its
 * own physical table (`<service>_outbox`) so domain writes and outbox INSERTs
 * commit in one local transaction (D-03, 03 §4.6 line 923) and the
 * `OutboxRelay` publishes on commit without dual-write hazards.
 *
 * Contract (per table, exactly 16 columns): `id` uuid PK default
 * `gen_random_uuid()` (depends on 001 pgcrypto); `event_id`; `event_type`;
 * `producer`; `schema_version`; `occurred_at`; `aggregate_type`/`aggregate_id`;
 * `idempotency_key`; `payload` jsonb; `status` CHECK
 * ('pending','published','failed','dead'); `attempts`; `available_at`;
 * `created_at`; `published_at`; `last_error`. No FKs, no triggers, no unique
 * constraints, no extra indexes, no schema qualification. Index per table: one
 * partial pending index `(status, available_at) WHERE status IN
 * ('pending','failed')` — named `idx_<table>_pending` (DB Architect decision,
 * 2026-08-08) because index names are schema-unique and four tables cannot all
 * carry the canonical single-table name `outbox_pending_idx`.
 *
 * Scope: users, content, reminders, journal only. Auth (Redis-only, D-09) and
 * checklists (no events) excluded. No new scheduler jobs (prompt/pulse/legacy
 * = WP-037). No new event vocabulary. Migration creation only — no service
 * implementation, no transaction changes, no event-emission changes.
 *
 * Down is a pure table drop — no FKs/triggers/functions.
 */
export const up = (pgm: MigrationBuilder): void => {
  pgm.sql(`
    CREATE TABLE user_outbox (
      id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      event_id        UUID NOT NULL,
      event_type      TEXT NOT NULL,
      producer        TEXT NOT NULL,
      schema_version  INTEGER NOT NULL DEFAULT 1,
      occurred_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
      aggregate_type  TEXT,
      aggregate_id    TEXT,
      idempotency_key TEXT NOT NULL,
      payload         JSONB NOT NULL,
      status          TEXT NOT NULL DEFAULT 'pending'
                      CHECK (status IN ('pending', 'published', 'failed', 'dead')),
      attempts        INTEGER NOT NULL DEFAULT 0,
      available_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
      created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
      published_at    TIMESTAMPTZ,
      last_error      TEXT
    );
  `);
  pgm.sql(`
    CREATE INDEX idx_user_outbox_pending
      ON user_outbox (status, available_at)
      WHERE status IN ('pending', 'failed');
  `);
  pgm.sql(
    `COMMENT ON TABLE user_outbox IS 'Users service transactional outbox (06 §2.2, D-03, WP-024c; catalog row 019).';`,
  );
  pgm.sql(
    `COMMENT ON COLUMN user_outbox.idempotency_key IS 'Stable event id is the consumer idempotency key (03 §4.6).';`,
  );

  pgm.sql(`
    CREATE TABLE content_outbox (
      id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      event_id        UUID NOT NULL,
      event_type      TEXT NOT NULL,
      producer        TEXT NOT NULL,
      schema_version  INTEGER NOT NULL DEFAULT 1,
      occurred_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
      aggregate_type  TEXT,
      aggregate_id    TEXT,
      idempotency_key TEXT NOT NULL,
      payload         JSONB NOT NULL,
      status          TEXT NOT NULL DEFAULT 'pending'
                      CHECK (status IN ('pending', 'published', 'failed', 'dead')),
      attempts        INTEGER NOT NULL DEFAULT 0,
      available_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
      created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
      published_at    TIMESTAMPTZ,
      last_error      TEXT
    );
  `);
  pgm.sql(`
    CREATE INDEX idx_content_outbox_pending
      ON content_outbox (status, available_at)
      WHERE status IN ('pending', 'failed');
  `);
  pgm.sql(
    `COMMENT ON TABLE content_outbox IS 'Content service transactional outbox (06 §2.2, D-03, WP-024c; catalog row 019).';`,
  );
  pgm.sql(
    `COMMENT ON COLUMN content_outbox.idempotency_key IS 'Stable event id is the consumer idempotency key (03 §4.6).';`,
  );

  pgm.sql(`
    CREATE TABLE reminder_outbox (
      id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      event_id        UUID NOT NULL,
      event_type      TEXT NOT NULL,
      producer        TEXT NOT NULL,
      schema_version  INTEGER NOT NULL DEFAULT 1,
      occurred_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
      aggregate_type  TEXT,
      aggregate_id    TEXT,
      idempotency_key TEXT NOT NULL,
      payload         JSONB NOT NULL,
      status          TEXT NOT NULL DEFAULT 'pending'
                      CHECK (status IN ('pending', 'published', 'failed', 'dead')),
      attempts        INTEGER NOT NULL DEFAULT 0,
      available_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
      created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
      published_at    TIMESTAMPTZ,
      last_error      TEXT
    );
  `);
  pgm.sql(`
    CREATE INDEX idx_reminder_outbox_pending
      ON reminder_outbox (status, available_at)
      WHERE status IN ('pending', 'failed');
  `);
  pgm.sql(
    `COMMENT ON TABLE reminder_outbox IS 'Reminders service transactional outbox (06 §2.2, D-03, WP-024c; catalog row 019).';`,
  );
  pgm.sql(
    `COMMENT ON COLUMN reminder_outbox.idempotency_key IS 'Stable event id is the consumer idempotency key (03 §4.6).';`,
  );

  pgm.sql(`
    CREATE TABLE journal_outbox (
      id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      event_id        UUID NOT NULL,
      event_type      TEXT NOT NULL,
      producer        TEXT NOT NULL,
      schema_version  INTEGER NOT NULL DEFAULT 1,
      occurred_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
      aggregate_type  TEXT,
      aggregate_id    TEXT,
      idempotency_key TEXT NOT NULL,
      payload         JSONB NOT NULL,
      status          TEXT NOT NULL DEFAULT 'pending'
                      CHECK (status IN ('pending', 'published', 'failed', 'dead')),
      attempts        INTEGER NOT NULL DEFAULT 0,
      available_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
      created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
      published_at    TIMESTAMPTZ,
      last_error      TEXT
    );
  `);
  pgm.sql(`
    CREATE INDEX idx_journal_outbox_pending
      ON journal_outbox (status, available_at)
      WHERE status IN ('pending', 'failed');
  `);
  pgm.sql(
    `COMMENT ON TABLE journal_outbox IS 'Journal service transactional outbox (06 §2.2, D-03, WP-024c; catalog row 019).';`,
  );
  pgm.sql(
    `COMMENT ON COLUMN journal_outbox.idempotency_key IS 'Stable event id is the consumer idempotency key (03 §4.6).';`,
  );
};

export const down = (pgm: MigrationBuilder): void => {
  pgm.sql(`DROP TABLE user_outbox;`);
  pgm.sql(`DROP TABLE content_outbox;`);
  pgm.sql(`DROP TABLE reminder_outbox;`);
  pgm.sql(`DROP TABLE journal_outbox;`);
};
