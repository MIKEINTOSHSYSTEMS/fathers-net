import type { MigrationBuilder } from 'node-pg-migrate';

/**
 * Migration 011 — content (05 §4.2, FR-076…FR-083, FR-106, AR-015).
 *
 * - `content` holds the CMS content library. Lifecycle `status` drives
 *   retrieval eligibility (draft → pending_medical_review → approved →
 *   published → archived, AR-015); unapproved medical content is never
 *   published (FR-078, FR-081). EN/AM fields are columns per SRS §13.3.16
 *   (no separate translations table); Amharic FTS is unsupported by PG
 *   default tokenizers, so DB search is EN-only (`05` §8.5.2 caveat, FR-083).
 * - `created_by` is a **beyond-catalog addition** (not in SRS §13.3.16 /
 *   `05` §2.16) required for author ≠ approver segregation of duties
 *   (FR-106); SET NULL so staff erasure never orphans or blocks rows
 *   (`05` §13.4). Content is staff-owned reference data — no user PII.
 * - `content_versions` keeps immutable snapshots + reviewer for audit
 *   (FR-078, SRS §11.4); CASCADE on content delete, reviewer SET NULL.
 */
export const up = (pgm: MigrationBuilder): void => {
  pgm.sql(`
    CREATE TABLE content (
      id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      content_type     TEXT NOT NULL
                       CHECK (content_type IN ('article', 'video', 'audio', 'infographic', 'checklist', 'faq')),
      title_en         TEXT,
      title_am         TEXT,
      body_en          TEXT,
      body_am          TEXT,
      pregnancy_week   INTEGER
                       CHECK (pregnancy_week IS NULL OR pregnancy_week BETWEEN 1 AND 45),
      status           TEXT NOT NULL DEFAULT 'draft'
                       CHECK (status IN ('draft', 'pending_medical_review', 'approved', 'published', 'archived')),
      medical_reviewed BOOLEAN NOT NULL DEFAULT false,
      created_by       UUID REFERENCES users (id) ON DELETE SET NULL,
      created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
  pgm.sql(`CREATE INDEX idx_content_status_week ON content (status, pregnancy_week);`);
  pgm.sql(`CREATE INDEX idx_content_type_status ON content (content_type, status);`);
  pgm.sql(`
    CREATE INDEX idx_content_body_en_fts ON content
      USING GIN (to_tsvector('english', coalesce(title_en, '') || ' ' || coalesce(body_en, '')));
  `);

  pgm.sql(`COMMENT ON TABLE content IS 'CMS content library — SRS §13.3.16, FR-076…083, AR-015.';`);
  pgm.sql(
    `COMMENT ON COLUMN content.created_by IS 'Beyond-catalog addition (05 §2.16, SRS §13.3.16): author for FR-106 segregation of duties; SET NULL on staff erasure (05 §13.4).';`,
  );

  pgm.sql(`
    CREATE TABLE content_versions (
      id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      content_id    UUID NOT NULL REFERENCES content (id) ON DELETE CASCADE,
      version       INTEGER NOT NULL,
      change_note   TEXT,
      body_snapshot JSONB NOT NULL,
      reviewed_by   UUID REFERENCES users (id) ON DELETE SET NULL,
      created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
  pgm.sql(`CREATE INDEX idx_content_versions_content ON content_versions (content_id);`);

  pgm.sql(
    `COMMENT ON TABLE content_versions IS 'Immutable content snapshots + reviewer — SRS §13.3.17, FR-078, SRS §11.4.';`,
  );
};

export const down = (pgm: MigrationBuilder): void => {
  pgm.sql(`DROP TABLE content_versions;`);
  pgm.sql(`DROP TABLE content;`);
};
