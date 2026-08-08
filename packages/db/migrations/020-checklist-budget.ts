import type { MigrationBuilder } from 'node-pg-migrate';

/**
 * Migration 020 — checklists + budget (05 §2.12/§2.13/§2.14, FR-086…FR-088,
 * WP-023).
 *
 * Catalog rows 009 (`checklists`) and 010 (`budget-and-appointments`, partial):
 * `05` §4.2 row 009 defines `checklists` + `checklist_items` and row 010 defines
 * `budget_entries` + `appointments`. WP-023 delivers the three tables below —
 * `appointments` (row 010 remainder) belongs to the reminder/scheduling domain
 * (FR-041, WP-021) and lands with a future WP under separate authorization.
 * Appended after 019 per the append precedent (decision-log D-10; 05 §4.3).
 * All three tables are INSIDE the 05 §4.2 catalog, so no beyond-catalog
 * approval gate applies (milestone §10.8).
 *
 * - `checklists` is the per-user checklist instance (FR-086, UC-004). One
 *   instance per `checklist_type` per user is enforced by the unique index
 *   `uq_checklists_user_type`. `progress` (SRS §13.3.12 NUMERIC(5,2)) is
 *   maintained ON WRITE by the WP-023 service — never recomputed per read
 *   (NFR-007). `user_id` references `users(id)` ON DELETE CASCADE so
 *   right-to-erasure removes a user's checklists with the user
 *   (FR-007/FR-128, 05 §5.1). The `(checklist_type)` index serves the
 *   dashboard/type queries (05 §4.2 index table).
 * - `checklist_items` holds items within a checklist, incl. user-added custom
 *   items (FR-086, §8.2). `category` is a CHECK enum covering the §8.2 set;
 *   `completed_at` captures the completion timestamp (FR-088); `custom` marks
 *   user-added items; `sort_order` drives the §8.2 ordered list (index
 *   `(checklist_id, sort_order)`). The §8.2 hospital-bag DEFAULT items are
 *   seed data (05 §4.2 row 017) — deferred, not created by this migration.
 * - `budget_entries` is the budget tracker record (FR-087, §8.3). `category`
 *   is a CHECK enum covering the §12.7 category set; `planned_amount`/
 *   `actual_amount` are NUMERIC(12,2); `entry_date` defaults to CURRENT_DATE.
 *   `receipt_image` is an anonymized object-storage ref (FR-022/§7.4.2) —
 *   metadata-only in Phase 2, no upload pipeline (FR-090 deferred, WP-060
 *   media precedent). Indexes `(user_id)`, `(user_id, entry_date DESC)` and
 *   `(category)` serve the §12.7 summary/variance queries (05 §4.2).
 *
 * Down is a pure table drop in dependency order — no triggers/functions.
 */
export const up = (pgm: MigrationBuilder): void => {
  pgm.sql(`
    CREATE TABLE checklists (
      id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id        UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
      checklist_type TEXT NOT NULL
                     CHECK (checklist_type IN ('hospital_bag', 'birth_prep')),
      title          TEXT NOT NULL,
      progress       NUMERIC(5,2) NOT NULL DEFAULT 0
                     CHECK (progress BETWEEN 0 AND 100),
      created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
  pgm.sql(`
    CREATE UNIQUE INDEX uq_checklists_user_type
      ON checklists (user_id, checklist_type);
  `);
  pgm.sql(`
    CREATE INDEX idx_checklists_type ON checklists (checklist_type);
  `);

  pgm.sql(
    `COMMENT ON TABLE checklists IS 'Per-user checklist instances (hospital_bag|birth_prep) — FR-086/088, WP-023. One per type per user.';`,
  );
  pgm.sql(
    `COMMENT ON COLUMN checklists.progress IS '0-100 maintained on write (NFR-007) — never recomputed per read.';`,
  );

  pgm.sql(`
    CREATE TABLE checklist_items (
      id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      checklist_id  UUID NOT NULL REFERENCES checklists (id) ON DELETE CASCADE,
      category      TEXT NOT NULL
                    CHECK (category IN ('Documents', 'Mother', 'Baby', 'Hygiene', 'Extras')),
      item_name     TEXT NOT NULL,
      completed     BOOLEAN NOT NULL DEFAULT false,
      completed_at  TIMESTAMPTZ,
      custom        BOOLEAN NOT NULL DEFAULT false,
      sort_order    INTEGER NOT NULL DEFAULT 0,
      created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
  pgm.sql(`
    CREATE INDEX idx_checklist_items_order
      ON checklist_items (checklist_id, sort_order);
  `);

  pgm.sql(
    `COMMENT ON TABLE checklist_items IS 'Checklist items incl. user-added custom items — FR-086/087, §8.2. Default items are seed data (migration 017, deferred).';`,
  );
  pgm.sql(
    `COMMENT ON COLUMN checklist_items.category IS '§8.2 category enum (Documents|Mother|Baby|Hygiene|Extras).';`,
  );

  pgm.sql(`
    CREATE TABLE budget_entries (
      id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id        UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
      category       TEXT NOT NULL
                     CHECK (category IN ('Transport', 'Medical', 'Baby Items',
                                         'Food', 'Clothing', 'Equipment',
                                         'Emergency Fund', 'Other')),
      item_name      TEXT NOT NULL,
      planned_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
      actual_amount  NUMERIC(12,2),
      entry_date     DATE NOT NULL DEFAULT CURRENT_DATE,
      notes          TEXT,
      receipt_image  TEXT,
      created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
  pgm.sql(`
    CREATE INDEX idx_budget_user ON budget_entries (user_id);
  `);
  pgm.sql(`
    CREATE INDEX idx_budget_user_date ON budget_entries (user_id, entry_date DESC);
  `);
  pgm.sql(`
    CREATE INDEX idx_budget_category ON budget_entries (category);
  `);

  pgm.sql(
    `COMMENT ON TABLE budget_entries IS 'Budget tracker records — FR-087, §8.3, WP-023 (catalog row 010, budget_entries part; appointments deferred).';`,
  );
  pgm.sql(
    `COMMENT ON COLUMN budget_entries.category IS '§12.7 category enum (Transport|Medical|Baby Items|Food|Clothing|Equipment|Emergency Fund|Other).';`,
  );
  pgm.sql(
    `COMMENT ON COLUMN budget_entries.receipt_image IS 'Anonymized object-storage ref (FR-022, 05 §7.4.2) — metadata-only in Phase 2; no upload pipeline (FR-090 deferred).';`,
  );
};

export const down = (pgm: MigrationBuilder): void => {
  pgm.sql(`DROP TABLE checklist_items;`);
  pgm.sql(`DROP TABLE budget_entries;`);
  pgm.sql(`DROP TABLE checklists;`);
};
