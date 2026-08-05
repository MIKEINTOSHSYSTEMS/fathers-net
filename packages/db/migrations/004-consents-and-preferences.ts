import type { MigrationBuilder } from 'node-pg-migrate';

/**
 * Migration 004 — consents and preferences (05 §4.2, AR-012, FR-003/004/038).
 *
 * - `consents` is a versioned, **append-only** consent stream (SRS §13.3.4,
 *   AR-012). Withdrawal is a new row (`state='withdrawn'`), never an UPDATE.
 *   The `BEFORE UPDATE OR DELETE` trigger rejects mutations of existing rows;
 *   the one sanctioned delete path is the right-to-erasure FK cascade
 *   (SRS §13.4, FR-007/FR-128), gated by `SET LOCAL app.consent_erasure = on`.
 * - A `BEFORE INSERT` state guard enforces one active grant per consent type
 *   while allowing re-consent (FR-125): first record must be a grant; state
 *   must alternate granted -> withdrawn -> granted. The plan's partial unique
 *   index on `granted` (05 §8.5.2) was replaced by this guard because it is
 *   incompatible with append-only re-consent (the original granted row is
 *   immutable, so re-grant would be impossible).
 * - `user_preferences` holds per-user settings (FR-038); 1:1 with `users`.
 */
export const up = (pgm: MigrationBuilder): void => {
  pgm.sql(`
    CREATE TABLE consents (
      id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id      UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
      consent_type TEXT NOT NULL
                   CHECK (consent_type IN ('participation', 'research', 'media', 'whatsapp_opt_in')),
      version      TEXT NOT NULL,
      state        TEXT NOT NULL CHECK (state IN ('granted', 'withdrawn')),
      granted_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
      withdrawn_at TIMESTAMPTZ
    );
  `);
  pgm.sql(`CREATE INDEX idx_consents_user_type ON consents (user_id, consent_type);`);
  pgm.sql(`CREATE INDEX idx_consents_state ON consents (state);`);

  pgm.sql(`
    CREATE FUNCTION fn_prevent_consent_mutation() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
    BEGIN
      IF TG_OP = 'UPDATE' THEN
        RAISE EXCEPTION 'consents are append-only (AR-012): row % cannot be updated', OLD.id;
      ELSIF TG_OP = 'DELETE'
        AND COALESCE(current_setting('app.consent_erasure', true), 'off') = 'on' THEN
        RETURN OLD;
      END IF;
      RAISE EXCEPTION 'consents are append-only (AR-012): row % cannot be deleted', OLD.id;
    END
    $$;
  `);
  pgm.sql(`
    CREATE TRIGGER trg_consents_append_only
      BEFORE UPDATE OR DELETE ON consents
      FOR EACH ROW EXECUTE FUNCTION fn_prevent_consent_mutation();
  `);

  pgm.sql(`
    CREATE FUNCTION fn_consent_state_guard() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
    DECLARE
      latest_state TEXT;
    BEGIN
      SELECT c.state INTO latest_state
      FROM consents c
      WHERE c.user_id = NEW.user_id AND c.consent_type = NEW.consent_type
      ORDER BY c.granted_at DESC, c.id DESC
      LIMIT 1;

      IF latest_state IS NULL AND NEW.state <> 'granted' THEN
        RAISE EXCEPTION 'first consent record for a type must be a grant';
      END IF;

      IF latest_state = NEW.state THEN
        RAISE EXCEPTION
          'single active grant per consent type (AR-012): cannot record % after %',
          NEW.state, latest_state;
      END IF;

      IF NEW.state = 'withdrawn' AND NEW.withdrawn_at IS NULL THEN
        RAISE EXCEPTION 'withdrawn consent requires withdrawn_at';
      END IF;

      IF NEW.state = 'granted' AND NEW.withdrawn_at IS NOT NULL THEN
        RAISE EXCEPTION 'granted consent must not set withdrawn_at';
      END IF;

      RETURN NEW;
    END
    $$;
  `);
  pgm.sql(`
    CREATE TRIGGER trg_consents_state_guard
      BEFORE INSERT ON consents
      FOR EACH ROW EXECUTE FUNCTION fn_consent_state_guard();
  `);

  pgm.sql(
    `COMMENT ON TABLE consents IS 'Immutable, versioned consent stream — SRS §13.3.4, AR-012, FR-125.';`,
  );

  pgm.sql(`
    CREATE TABLE user_preferences (
      user_id               UUID PRIMARY KEY REFERENCES users (id) ON DELETE CASCADE,
      language              TEXT CHECK (language IS NULL OR language IN ('en', 'am')),
      quiet_hours           JSONB,
      notification_channels JSONB,
      content_categories    JSONB
    );
  `);

  pgm.sql(
    `COMMENT ON TABLE user_preferences IS 'Per-user settings — SRS §13.3.26, FR-038/FR-043.';`,
  );
};

export const down = (pgm: MigrationBuilder): void => {
  pgm.sql(`DROP TRIGGER IF EXISTS trg_consents_append_only ON consents;`);
  pgm.sql(`DROP FUNCTION IF EXISTS fn_prevent_consent_mutation();`);
  pgm.sql(`DROP TRIGGER IF EXISTS trg_consents_state_guard ON consents;`);
  pgm.sql(`DROP FUNCTION IF EXISTS fn_consent_state_guard();`);
  pgm.sql(`DROP TABLE user_preferences;`);
  pgm.sql(`DROP TABLE consents;`);
};
