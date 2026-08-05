import type { MigrationBuilder } from 'node-pg-migrate';

/**
 * Migration 003 — pregnancies and babies (05 §4.2, FR-031…FR-037, FR-033).
 *
 * - `pregnancies` holds journey context. Invariants per SRS §13.4 / 05 §7.1:
 *   at least one of `edd`/`lmp` present; `pregnancy_week` 1–45. The shared
 *   journey self-FK uses SET NULL (05 §5.2, FR-039/FR-146).
 * - `babies` holds postnatal records activated after the birth event.
 */
export const up = (pgm: MigrationBuilder): void => {
  pgm.sql(`
    CREATE TABLE pregnancies (
      id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id         UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
      edd             DATE,
      lmp             DATE,
      pregnancy_week  INTEGER,
      trimester       INTEGER,
      partner_user_id UUID REFERENCES users (id) ON DELETE SET NULL,
      CONSTRAINT chk_pregnancies_edd_or_lmp CHECK (edd IS NOT NULL OR lmp IS NOT NULL),
      CONSTRAINT chk_pregnancies_week_range CHECK (pregnancy_week BETWEEN 1 AND 45)
    );
  `);
  pgm.sql(`CREATE INDEX idx_pregnancies_user ON pregnancies (user_id);`);
  pgm.sql(`CREATE INDEX idx_pregnancies_edd ON pregnancies (edd);`);
  pgm.sql(`CREATE INDEX idx_pregnancies_partner_user ON pregnancies (partner_user_id);`);

  pgm.sql(
    `COMMENT ON TABLE pregnancies IS 'Pregnancy journey context — SRS §13.3.3, FR-031…037.';`,
  );

  pgm.sql(`
    CREATE TABLE babies (
      id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id     UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
      birth_date  DATE NOT NULL,
      name        TEXT,
      birth_place TEXT,
      notes       TEXT
    );
  `);
  pgm.sql(`CREATE INDEX idx_babies_user ON babies (user_id);`);
  pgm.sql(`CREATE INDEX idx_babies_birth_date ON babies (birth_date);`);

  pgm.sql(`COMMENT ON TABLE babies IS 'Postnatal records — SRS §13.3.5, FR-033.';`);
};

export const down = (pgm: MigrationBuilder): void => {
  pgm.sql(`DROP TABLE babies;`);
  pgm.sql(`DROP TABLE pregnancies;`);
};
