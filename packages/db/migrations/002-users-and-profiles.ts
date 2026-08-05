import type { MigrationBuilder } from 'node-pg-migrate';

/**
 * Migration 002 — users and profiles (05 §4.2, FR-001…FR-010).
 *
 * - `users` is the canonical identity table. `phone_e164` stores AES-256-GCM
 *   ciphertext produced by the identity service (05 §8.1) — it is never a PK
 *   and never unique on ciphertext (non-deterministic encryption). Unique
 *   lookup/dedup is served by `phone_e164_digest` (keyed HMAC-SHA256) with a
 *   unique index, per 05 §8.1 / §6 (FR-005, FR-009, FR-123).
 * - `profiles` holds non-identifying attributes; 1:1 with `users`, CASCADE.
 */
export const up = (pgm: MigrationBuilder): void => {
  pgm.sql(`
    CREATE TABLE users (
      id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      phone_e164        TEXT NOT NULL,
      phone_e164_digest TEXT NOT NULL,
      role              TEXT NOT NULL DEFAULT 'father'
                        CHECK (role IN ('father', 'partner', 'staff')),
      status            TEXT NOT NULL DEFAULT 'active'
                        CHECK (status IN ('active', 'suspended', 'deleted')),
      created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
      deleted_at        TIMESTAMPTZ
    );
  `);
  pgm.sql(`CREATE UNIQUE INDEX uq_users_phone_e164_digest ON users (phone_e164_digest);`);
  pgm.sql(`CREATE INDEX idx_users_status ON users (status);`);

  pgm.sql(`COMMENT ON TABLE users IS 'Canonical identity — SRS §13.3.1, FR-001…010, UC-001.';`);
  pgm.sql(
    `COMMENT ON COLUMN users.phone_e164 IS 'AES-256-GCM ciphertext (app layer, KMS envelope) — never plaintext, never a PK (05 §8.1, FR-009/FR-123).';`,
  );
  pgm.sql(
    `COMMENT ON COLUMN users.phone_e164_digest IS 'Keyed HMAC-SHA256 digest for unique lookup/dedup without decrypting (05 §8.1).';`,
  );

  pgm.sql(`
    CREATE TABLE profiles (
      user_id    UUID PRIMARY KEY REFERENCES users (id) ON DELETE CASCADE,
      first_name TEXT,
      last_name  TEXT,
      country    TEXT,
      region     TEXT,
      age_group  TEXT,
      language   TEXT CHECK (language IN ('en', 'am')),
      cohort     TEXT
    );
  `);
  pgm.sql(`CREATE INDEX idx_profiles_cohort ON profiles (cohort);`);
  pgm.sql(`CREATE INDEX idx_profiles_language ON profiles (language);`);
  pgm.sql(`CREATE INDEX idx_profiles_region ON profiles (region);`);
  pgm.sql(
    `CREATE INDEX idx_profiles_language_region_cohort ON profiles (language, region, cohort);`,
  );

  pgm.sql(
    `COMMENT ON TABLE profiles IS 'Non-identifying profile attributes — SRS §13.3.2, FR-002/FR-010.';`,
  );
};

export const down = (pgm: MigrationBuilder): void => {
  pgm.sql(`DROP TABLE profiles;`);
  pgm.sql(`DROP TABLE users;`);
};
