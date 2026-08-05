import type { MigrationBuilder } from 'node-pg-migrate';

/**
 * Migration 001 — extensions and schemas (05 §4.2, AR-013).
 *
 * Installs the helper objects referenced by later migrations:
 * - `pgcrypto` — `gen_random_uuid()` (UUID PKs) and hashing primitives;
 * - `pg_trgm` — trigram search for the content/search hot paths (05 §6);
 * - `fn_research` schema + least-privilege research roles (AR-013 research
 *   separation scaffolding; table-level grants land with migration 016).
 *
 * Down is order-safe: later migrations are rolled back before this runs.
 */
export const up = (pgm: MigrationBuilder): void => {
  pgm.sql(`CREATE EXTENSION IF NOT EXISTS pgcrypto;`);
  pgm.sql(`CREATE EXTENSION IF NOT EXISTS pg_trgm;`);

  pgm.sql(`CREATE SCHEMA IF NOT EXISTS fn_research;`);
  pgm.sql(
    `COMMENT ON SCHEMA fn_research IS 'Anonymized research data — AR-013 logical separation; no operational FKs (05 §8.3).';`,
  );

  pgm.sql(`
    DO $$
    BEGIN
      IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'research_writer') THEN
        CREATE ROLE research_writer NOLOGIN;
      END IF;
    END
    $$;
  `);
  pgm.sql(`
    DO $$
    BEGIN
      IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'research_reader') THEN
        CREATE ROLE research_reader NOLOGIN;
      END IF;
    END
    $$;
  `);

  pgm.sql(`GRANT USAGE ON SCHEMA fn_research TO research_writer;`);
  pgm.sql(`GRANT USAGE ON SCHEMA fn_research TO research_reader;`);
};

export const down = (pgm: MigrationBuilder): void => {
  pgm.sql(`DROP SCHEMA IF EXISTS fn_research CASCADE;`);
  pgm.sql(`DROP ROLE IF EXISTS research_reader;`);
  pgm.sql(`DROP ROLE IF EXISTS research_writer;`);
  pgm.sql(`DROP EXTENSION IF EXISTS pg_trgm;`);
  pgm.sql(`DROP EXTENSION IF EXISTS pgcrypto;`);
};
