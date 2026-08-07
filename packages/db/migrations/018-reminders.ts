import type { MigrationBuilder } from 'node-pg-migrate';

/**
 * Migration 018 — reminders (05 §4.2, FR-041…FR-048, WP-021).
 *
 * Beyond-catalog engineering addition (05 §2.16 / §4.2 numbering note, 06 §4):
 * authorized 2026-08-07 (decision-log D-10) as catalog row 018 — row 012 is
 * reserved for `campaigns`, so reminders append after 001–017 per the 05 §4.3
 * append precedent. Applied after migration 011 (content); earlier migrations
 * are untouched.
 *
 * - `reminder_templates` is the reminder template library (FR-044 one-time +
 *   recurring; FR-047 EN/AM content; FR-043 lead time + quiet hours per type;
 *   FR-041 week binding for ANC/vaccination/postnatal/birth-prep reminders;
 *   FR-046 `critical` priority). `quiet_hours`/`recurrence` are free-form JSONB,
 *   shape-validated at the application layer (same convention as
 *   `user_preferences.quiet_hours`, migration 004). Template versioning +
 *   admin review/approval is FR-049 (deferred — `updated_at` retained).
 * - `reminder_instances` holds materialized, per-user scheduled instances; the
 *   dispatch job selects `status='scheduled' AND due_at <= now()` (FR-043
 *   lead time). `priority`/`channel` are denormalized at schedule time so
 *   template edits never affect in-flight instances. `dedupe_key` partial
 *   unique is the FR-048 cross-channel dedup + idempotent-creation readiness.
 * - `reminder_dispatches` is the append-only dispatch/ack log (FR-045
 *   delivery + acknowledgement tracking). `UNIQUE(instance_id, run_id)` is the
 *   run-id binding — duplicate scheduler runs cannot double-dispatch (FR-163).
 *   `(user_id, dispatched_at)` serves the per-user daily outbound cap and the
 *   future retention purge (FR-105). `user_id` is duplicated for cap counting
 *   without a join; CASCADE matches right-to-erasure (FR-007/FR-128).
 *
 * Down is a pure table drop in dependency order — no triggers/functions.
 */
export const up = (pgm: MigrationBuilder): void => {
  pgm.sql(`
    CREATE TABLE reminder_templates (
      id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      code              TEXT NOT NULL,
      channel           TEXT NOT NULL CHECK (channel IN ('whatsapp')),
      priority          TEXT NOT NULL DEFAULT 'normal'
                        CHECK (priority IN ('normal', 'critical')),
      title_en          TEXT NOT NULL,
      title_am          TEXT NOT NULL,
      body_en           TEXT NOT NULL,
      body_am           TEXT NOT NULL,
      lead_time_minutes INTEGER,
      quiet_hours       JSONB,
      recurrence        JSONB,
      pregnancy_week    INTEGER
                        CHECK (pregnancy_week IS NULL OR pregnancy_week BETWEEN 1 AND 45),
      active            BOOLEAN NOT NULL DEFAULT true,
      created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
  pgm.sql(`CREATE UNIQUE INDEX uq_reminder_templates_code ON reminder_templates (code);`);

  pgm.sql(
    `COMMENT ON TABLE reminder_templates IS 'Reminder template library — FR-041…FR-048, WP-021.';`,
  );
  pgm.sql(
    `COMMENT ON COLUMN reminder_templates.title_am IS 'Amharic content required alongside English (FR-047).';`,
  );
  pgm.sql(
    `COMMENT ON COLUMN reminder_templates.quiet_hours IS 'Per-template quiet-hours config (FR-043); free-form JSONB, validated at app layer.';`,
  );
  pgm.sql(
    `COMMENT ON COLUMN reminder_templates.recurrence IS 'One-time vs recurring rule (FR-044); free-form JSONB, validated at app layer.';`,
  );

  pgm.sql(`
    CREATE TABLE reminder_instances (
      id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      template_id     UUID NOT NULL REFERENCES reminder_templates (id) ON DELETE RESTRICT,
      user_id         UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
      due_at          TIMESTAMPTZ NOT NULL,
      status          TEXT NOT NULL DEFAULT 'scheduled'
                      CHECK (status IN ('scheduled', 'dispatched', 'skipped_quiet_hours',
                                        'rate_limited', 'failed', 'expired')),
      priority        TEXT NOT NULL CHECK (priority IN ('normal', 'critical')),
      channel         TEXT NOT NULL CHECK (channel IN ('whatsapp')),
      dedupe_key      TEXT,
      dispatched_at   TIMESTAMPTZ,
      acknowledged_at TIMESTAMPTZ,
      last_error      TEXT,
      created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
  pgm.sql(`CREATE INDEX idx_reminder_instances_due ON reminder_instances (status, due_at);`);
  pgm.sql(`CREATE INDEX idx_reminder_instances_user ON reminder_instances (user_id, status);`);
  pgm.sql(`
    CREATE UNIQUE INDEX uq_reminder_instances_dedupe ON reminder_instances (dedupe_key)
      WHERE dedupe_key IS NOT NULL;
  `);

  pgm.sql(
    `COMMENT ON TABLE reminder_instances IS 'Materialized per-user scheduled reminders — FR-041…FR-045, WP-021.';`,
  );
  pgm.sql(
    `COMMENT ON COLUMN reminder_instances.dedupe_key IS 'FR-048 readiness + idempotent instance creation (partial unique).';`,
  );

  pgm.sql(`
    CREATE TABLE reminder_dispatches (
      id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      instance_id     UUID NOT NULL REFERENCES reminder_instances (id) ON DELETE CASCADE,
      user_id         UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
      run_id          TEXT NOT NULL,
      channel         TEXT NOT NULL CHECK (channel IN ('whatsapp')),
      priority        TEXT NOT NULL CHECK (priority IN ('normal', 'critical')),
      status          TEXT NOT NULL DEFAULT 'dispatched'
                      CHECK (status IN ('dispatched', 'acked', 'failed')),
      dispatched_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
      ack_received_at TIMESTAMPTZ,
      ack_payload     JSONB,
      last_error      TEXT,
      created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
  pgm.sql(`
    CREATE UNIQUE INDEX uq_reminder_dispatches_instance_run
      ON reminder_dispatches (instance_id, run_id);
  `);
  pgm.sql(`
    CREATE INDEX idx_reminder_dispatches_user_day
      ON reminder_dispatches (user_id, dispatched_at);
  `);

  pgm.sql(
    `COMMENT ON TABLE reminder_dispatches IS 'Append-only dispatch/ack log — FR-045, FR-163 run-id binding, per-user cap, WP-021.';`,
  );
  pgm.sql(
    `COMMENT ON COLUMN reminder_dispatches.run_id IS 'Scheduler run-id binding; UNIQUE(instance_id, run_id) prevents duplicate dispatch on re-run (FR-163).';`,
  );
};

export const down = (pgm: MigrationBuilder): void => {
  pgm.sql(`DROP TABLE reminder_dispatches;`);
  pgm.sql(`DROP TABLE reminder_instances;`);
  pgm.sql(`DROP TABLE reminder_templates;`);
};
