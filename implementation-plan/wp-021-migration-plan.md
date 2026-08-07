# WP-021 Migration Plan — Reminder Engine (Foundation)

**Document:** WP-021 database migration plan (planning only — no migration files, no schema changes).
**Date:** 2026-08-07
**Status:** **DRAFT — awaiting Project Owner authorization to create the migration file.** Governance gate (milestone §10.8 / `05` §4.2 / `06` §4): the reminder tables are engineering additions beyond the `05` §4.2 catalog and require a catalog row + schema approval + decision-log entry before the migration lands.
**Controlling references:** `milestone-2-implementation-plan.md` §5.11 + §10.8; `05-database-implementation-plan.md` §4.2/§4.3; `06-backend-development-plan.md` §4 (numbering note) + Phase C DB changes; `wp-021-implementation-plan.md` (implementation plan, corrected to `018`); SRS §13.3, FR-041…FR-048, FR-161/FR-163/FR-164, FR-007/FR-128, AR-012/AR-015 style conventions.

---

## 1. Migration number

**`018-reminders.ts`** — a single, atomic, reversible migration appended to `packages/db/migrations/`.

Numbering rationale:
- The `05` §4.2 catalog **reserves rows 001–017** for other phases; row **012 is already `campaigns`** (FR-107…112). A reminders migration must not take `012`.
- Per the documented §4.3 precedent, beyond-catalog tables are **appended** (never renumbered 003–017). The next free slot is **`018`**.
- The §4.3 note reserves `018` as the possible future append for auth Option B — since **Option A (Redis-only) was DECIDED** (no auth tables in Phase 2), the reminders migration takes `018` and the §4.3 note is updated so any future auth Option B becomes `019` (see §9).
- node-pg-migrate sorts by numeric prefix; `018` runs deterministically after all existing migrations (applied: 001–004, 011), tracked in `pgmigrations`.

## 2. Tables to create

Three tables in the default `public` schema (matching SRS §13.4 "SQL verbatim" convention — no new schema):

| Table | Purpose | Requirements |
| --- | --- | --- |
| `reminder_templates` | Template library: localized content, priority, lead time, quiet hours, recurrence, week binding | FR-041, FR-043, FR-044, FR-046, FR-047 |
| `reminder_instances` | Materialized, per-user scheduled instances (due-selection target of the dispatch job) | FR-043, FR-045, FR-048 readiness |
| `reminder_dispatches` | Append-only dispatch/ack log; per-user daily-cap counting; run-id idempotency; FR-048 cross-channel dedup readiness | FR-045, FR-163/FR-161, FR-048 |

## 3. Columns

DDL sketch (final file uses `pgm.sql` style consistent with `001`–`004`, `011`):

```sql
-- reminder_templates
CREATE TABLE reminder_templates (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code              TEXT NOT NULL,
  channel           TEXT NOT NULL CHECK (channel IN ('whatsapp')),
  priority          TEXT NOT NULL DEFAULT 'normal' CHECK (priority IN ('normal', 'critical')),
  title_en          TEXT NOT NULL,
  title_am          TEXT NOT NULL,
  body_en           TEXT NOT NULL,
  body_am           TEXT NOT NULL,
  lead_time_minutes INTEGER,
  quiet_hours       JSONB,
  recurrence        JSONB,
  pregnancy_week    INTEGER CHECK (pregnancy_week IS NULL OR pregnancy_week BETWEEN 1 AND 45),
  active            BOOLEAN NOT NULL DEFAULT true,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- reminder_instances
CREATE TABLE reminder_instances (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id    UUID NOT NULL,
  user_id        UUID NOT NULL,
  due_at         TIMESTAMPTZ NOT NULL,
  status         TEXT NOT NULL DEFAULT 'scheduled'
                 CHECK (status IN ('scheduled', 'dispatched', 'skipped_quiet_hours',
                                   'rate_limited', 'failed', 'expired')),
  priority       TEXT NOT NULL CHECK (priority IN ('normal', 'critical')),
  channel        TEXT NOT NULL CHECK (channel IN ('whatsapp')),
  dedupe_key     TEXT,
  dispatched_at  TIMESTAMPTZ,
  acknowledged_at TIMESTAMPTZ,
  last_error     TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- reminder_dispatches
CREATE TABLE reminder_dispatches (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  instance_id     UUID NOT NULL,
  user_id         UUID NOT NULL,
  run_id          TEXT NOT NULL,
  channel         TEXT NOT NULL CHECK (channel IN ('whatsapp')),
  priority        TEXT NOT NULL CHECK (priority IN ('normal', 'critical')),
  status          TEXT NOT NULL DEFAULT 'dispatched' CHECK (status IN ('dispatched', 'acked', 'failed')),
  dispatched_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  ack_received_at TIMESTAMPTZ,
  ack_payload     JSONB,
  last_error      TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

Field notes:
- `priority` is **denormalized** onto instances/dispatches at schedule time so later template edits never affect in-flight reminders.
- `reminder_templates.quiet_hours` / `.recurrence` and `reminder_dispatches.ack_payload` are free-form JSONB, shape-validated at the application layer — consistent with the existing `user_preferences.quiet_hours` JSONB (004) which also has no DB shape check.
- EN/AM title/body are `NOT NULL` on templates (FR-047 requires both languages for every template).
- No `version` column on templates: template versioning + admin review workflow is FR-049 (Should Have, admin phase) — deferred; `updated_at` retained for change tracking.

## 4. Primary keys

All three tables: `id UUID PRIMARY KEY DEFAULT gen_random_uuid()` — `pgcrypto` installed by migration 001, matching every existing table.

## 5. Foreign keys

| Table | FK | References | ON DELETE | Rationale |
| --- | --- | --- | --- | --- |
| `reminder_instances` | `template_id` | `reminder_templates(id)` | **RESTRICT** | A template with instances cannot be hard-deleted; template lifecycle uses `active=false` (FR-049 deferred) |
| `reminder_instances` | `user_id` | `users(id)` | **CASCADE** | Right-to-erasure (FR-007/FR-128), consistent with `profiles`/`user_preferences` |
| `reminder_dispatches` | `instance_id` | `reminder_instances(id)` | **CASCADE** | Erasure cascade; dispatch log is per-instance history |
| `reminder_dispatches` | `user_id` | `users(id)` | **CASCADE** | Erasure cascade; duplicates `user_id` for cap counting without a join |

## 6. Indexes

| Table | Index | Type | Purpose |
| --- | --- | --- | --- |
| `reminder_templates` | `(code)` | UNIQUE | Stable template identity for scheduling/templates |
| `reminder_instances` | `(status, due_at)` | B-tree | Due-selection scan for the dispatch job (`status='scheduled' AND due_at <= now`) |
| `reminder_instances` | `(user_id, status)` | B-tree | Per-user instance lookup |
| `reminder_instances` | `(dedupe_key) WHERE dedupe_key IS NOT NULL` | UNIQUE partial | FR-048 readiness + idempotent instance creation |
| `reminder_dispatches` | `(instance_id, run_id)` | UNIQUE | Run-id binding — duplicate-run no-duplicates at DB level (FR-163) |
| `reminder_dispatches` | `(user_id, dispatched_at)` | B-tree | Per-user daily-cap counting + future retention purge (FR-105) |

## 7. Constraints

- **CHECK enums** (inline, matching existing style): `channel IN ('whatsapp')`; `priority IN ('normal','critical')`; instance `status` (5 states); dispatch `status` (3 states). Channel enum is intentionally single-valued today (only WhatsApp provider; Phase 4 / M-02 deferred) and extensible by migration.
- **CHECK range:** `pregnancy_week BETWEEN 1 AND 45` (mirrors `pregnancies`/`content`).
- **UNIQUE:** `reminder_templates.code`; `reminder_instances (dedupe_key)` partial; `reminder_dispatches (instance_id, run_id)`.
- **NOT NULL:** identity/FK/due/status/priority/channel/run_id/dispatched_at; EN/AM content on templates.
- **No triggers or functions** are introduced — the rollback (`down`) is a pure table drop, unlike `004` (which drops trigger/function objects). Idempotency is enforced by the unique constraints + application status guard, not DB triggers (consistent with content `011`).
- **`COMMENT ON TABLE`/column** annotations recorded per repo convention (reference FR/SRS IDs).

## 8. Rollback strategy

- `down` drops in dependency order: `reminder_dispatches` → `reminder_instances` → `reminder_templates`. No other objects (triggers/functions/types) to remove.
- The three tables are **leaf tables** — no existing table references them, so rollback cannot orphan FKs anywhere else in the schema. Reminder data is lost on rollback (expected — these are WP-021's own tables).
- Wrapped in a transaction by node-pg-migrate (atomic); validated by CI `db-baseline` (`migrate:up` then `migrate:down`) on ephemeral Postgres, and by the `packages/db` integration suite (reversible-migration test per `05` §13.4).

## 9. Governance catalog updates required

| # | Document / section | Required change |
| --- | --- | --- |
| 1 | `05-database-implementation-plan.md` §4.2 | **Add catalog row `018`**: `reminders` — tables `reminder_templates`, `reminder_instances`, `reminder_dispatches`; depends `002`; purpose "Reminder engine (FR-041…050, WP-021)". |
| 2 | `05-database-implementation-plan.md` §4.3 | Update the auth Option B reservation ("proposed append as `018`") → `019`, since `018` is now the reminders migration. Option A DECIDED text unchanged. |
| 3 | `06-backend-development-plan.md` §4 numbering note + Phase C DB changes | Remove/annotate `reminder_templates` in the beyond-catalog example lists (now cataloged as `018`); `reminder_events`, `milestones`, `support_actions` remain beyond-catalog. |
| 4 | `decision-log.md` | **New entry (D-10)** recording the schema approval for migration `018` per milestone §10.8 / `05` §4.2 — the required decision-log entry before the phase lands. |
| 5 | `milestone-2-implementation-plan.md` §10.8 | Annotate item 8: reminder tables added to `05` §4.2 (resolved for WP-021). Optional but recommended for audit trail. |
| 6 | `wp-021-implementation-plan.md` | Migration number corrected `012` → `018` (already applied — catalog row 012 is `campaigns`). |
| 7 | SRS §13.3 (recommended) | Reminder tables are **not** in the SRS catalog (only `notifications` §13.3.25, `appointments` §13.3.15 exist). Recommend adding §13.3.28–30 entries. **Minimum required is items 1–4** (`05` §4.2 + decision-log per §10.8); SRS extension is a product-spec change and can be deferred to the WP-021 implementation report. |
| 8 | `packages/db` test suite | No existing migration history touched (001–004, 011 remain byte-identical). `018` validated by `migrate:check`/`migrate:up`/`migrate:down`; `pgmigrations` row set appended. |

## 10. Risks

| # | Risk | Mitigation |
| --- | --- | --- |
| R1 | Migration-number collision (a naive `012-reminders` would clash with cataloged `campaigns`) | Resolved: append `018`; catalog row added first (§9 item 1). |
| R2 | §4.3 documented `018` reservation (auth Option B) | §4.3 note updated → auth Option B append becomes `019` (§9 item 2). Option A stands (no auth tables). |
| R3 | Beyond-catalog governance gate (milestone §10.8) | Migration authored only after `05` §4.2 row + decision-log D-10 + Project Owner approval (§9 items 1, 4). |
| R4 | Free-form JSONB (`quiet_hours`, `recurrence`, `ack_payload`) without DB shape checks | App-layer validation in the reminders service; matches existing `user_preferences.quiet_hours` precedent (004). |
| R5 | EN/AM `NOT NULL` on templates forces bilingual content at creation | Deliberate per FR-047; template creation must supply both locales (operator burden flagged, no schema risk). |
| R6 | `reminder_dispatches` growth / retention (FR-105) | Append-only by design; `(user_id, dispatched_at)` index supports future purge job; retention policy deferred to the audit phase. |
| R7 | Template hard-delete vs instances (RESTRICT) | Admin template lifecycle is FR-049 (later phase) and must use `active=false` deactivation, not DELETE — documented. |
| R8 | No RLS on reminder tables | Consistent with the existing 001–004/011 schema (no RLS anywhere); ownership/authorization enforced at the application layer per `02` §5 cross-cutting controls. |
| R9 | Erasure compliance | `user_id` CASCADE on both user-referencing tables covers right-to-erasure (FR-007/FR-128) — verified in migration tests. |
| R10 | Rollback of `018` after dispatch data accrues | `down` is lossy for reminder data by design (own tables only, no external refs); rollback exercised in CI before any production-relevant data exists. |

---

## Approval Record

- [ ] `05` §4.2 catalog row `018` + decision-log entry (D-10) recorded/approved.
- [ ] Project Owner authorization granted to create migration `018-reminders.ts`.

Awaiting authorization; the migration file is **not** created in this planning step.
