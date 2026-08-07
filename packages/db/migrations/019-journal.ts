import type { MigrationBuilder } from 'node-pg-migrate';

/**
 * Migration 019 — journal (05 §4.2, FR-051…FR-058, WP-022).
 *
 * Catalog row 006 (`journal`), appended after 018 per the established append
 * precedent (decision-log D-10; 05 §4.3). Both tables are INSIDE the 05 §4.2
 * catalog, so no beyond-catalog approval gate applies (milestone §10.8).
 *
 * - `journal_entries` is the father diary (FR-051 text/voice/photo entries,
 *   FR-052 private by default, FR-053/FR-054 prompt-linked + legacy schema
 *   readiness). `entry_type` is a CHECK enum covering the full SRS value set;
 *   the Phase 2 (WP-022) API creates `text` entries only. `shared_with_partner`
 *   defaults to false — privacy-by-default (FR-052). `user_id` references
 *   `users(id)` ON DELETE CASCADE so right-to-erasure removes a user's journal
 *   with the user (FR-007/FR-128, 05 §5.1). The `(user_id, created_at DESC)`
 *   index serves the chronological timeline (SRS §13.4, NFR-007). The FR-161
 *   prompt-response dedup is enforced on the `prompt_responses` side
 *   (migration 007, Phase 3 WP-037) — `journal_entries` carries no prompt FK.
 * - `journal_media` holds media metadata (FR-018/019/055, AR-023). Created now
 *   for catalog fidelity (row 006 defines both tables); no WP-022 code path
 *   writes it — the media pipeline lands with WP-060 (Phase 4). `storage_path`
 *   is anonymized (never phone-based, FR-022/§7.4.2); transcription state is
 *   tracked per attachment.
 *
 * Down is a pure table drop in dependency order — no triggers/functions.
 */
export const up = (pgm: MigrationBuilder): void => {
  pgm.sql(`
    CREATE TABLE journal_entries (
      id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id              UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
      entry_type           TEXT NOT NULL DEFAULT 'text'
                           CHECK (entry_type IN ('text', 'voice', 'photo',
                                                 'prompt_response', 'legacy')),
      content              TEXT NOT NULL,
      pregnancy_week       INTEGER
                           CHECK (pregnancy_week IS NULL OR pregnancy_week BETWEEN 1 AND 45),
      shared_with_partner  BOOLEAN NOT NULL DEFAULT false,
      created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at           TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
  pgm.sql(`
    CREATE INDEX idx_journal_entries_user_created
      ON journal_entries (user_id, created_at DESC);
  `);

  pgm.sql(
    `COMMENT ON TABLE journal_entries IS 'Father diary — FR-051…FR-055, WP-022. Private by default (FR-052).';`,
  );
  pgm.sql(
    `COMMENT ON COLUMN journal_entries.entry_type IS 'text|voice|photo|prompt_response|legacy (05 §2.6); WP-022 API creates text only.';`,
  );
  pgm.sql(
    `COMMENT ON COLUMN journal_entries.shared_with_partner IS 'Opt-in sharing with the linked partner (FR-039); default false = private by default (FR-052).';`,
  );

  pgm.sql(`
    CREATE TABLE journal_media (
      id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      journal_entry_id  UUID NOT NULL REFERENCES journal_entries (id) ON DELETE CASCADE,
      media_type        TEXT NOT NULL CHECK (media_type IN ('voice', 'photo', 'document')),
      storage_path      TEXT NOT NULL,
      size_bytes        BIGINT,
      transcript        TEXT,
      transcript_status TEXT NOT NULL DEFAULT 'pending'
                        CHECK (transcript_status IN ('pending', 'done', 'failed')),
      created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
  pgm.sql(`
    CREATE INDEX idx_journal_media_entry ON journal_media (journal_entry_id);
  `);

  pgm.sql(
    `COMMENT ON TABLE journal_media IS 'Journal media metadata — FR-018/019/055, AR-023, WP-060. Zero rows until the media pipeline lands (WP-022 stores metadata + text only).';`,
  );
  pgm.sql(
    `COMMENT ON COLUMN journal_media.storage_path IS 'Anonymized object-storage path — never phone-based (FR-022, 05 §7.4.2).';`,
  );
};

export const down = (pgm: MigrationBuilder): void => {
  pgm.sql(`DROP TABLE journal_media;`);
  pgm.sql(`DROP TABLE journal_entries;`);
};
