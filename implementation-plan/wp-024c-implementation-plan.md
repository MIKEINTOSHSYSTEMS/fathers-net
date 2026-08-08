# WP-024c Implementation Plan — Per-Service Transactional Outbox (Infrastructure)

**Document:** WP-024c execution plan (planning only — no code, no migrations, no schema changes, no catalog/D-log changes).
**Date:** 2026-08-08
**Status:** **PLANNING AUTHORIZATION: GRANTED — PLAN CREATION ONLY.** Planning artifact only. **MIGRATION 021 AUTHORIZATION: NOT GRANTED.** **WP-024c IMPLEMENTATION AUTHORIZATION: NOT GRANTED.** Migration 021 creation requires separate authorization. WP-024c implementation requires separate authorization after plan approval and migration/governance gates are satisfied.
**Controlling references:** `milestone-2-implementation-plan.md` §5.3 (WP-024) and §2 boundary rule; §10 item 8 (beyond-catalog requires `05` §4.2 row + schema approval + decision-log entry); §11 (one WP at a time, separate authorization per step); `06-backend-development-plan.md` §2.2 (per-service outbox + event table); `03-system-architecture-plan.md` §4.6 (D-03 — domain rows + outbox rows in one DB transaction); `packages/events/src/outbox.ts` (canonical `OUTBOX_TABLE_DDL`, `PostgresOutboxReader`, `OutboxRelay`); `implementation-status.md` line 163 (WP-024 remainder = "service adoption, outbox migration per approved schema"); `17-final-execution-roadmap.md` line 124 (prompt/pulse/legacy jobs = WP-037); `18-implementation-verification-plan.md` §2.1 (Produced → Passed → Signed).

---

## 1. WP-024c objective

Adopt the canonical transactional-outbox pattern (06 §2.2, D-03) across the four in-scope services by introducing per-service outbox tables and publishing events through them (outbox INSERT joined to the domain write in the same DB transaction; relay publishes on commit). This is **infrastructure/outbox-adoption work** — it changes *how* existing events are published, not *what* events exist or *when* domain behavior occurs. It delivers the event-trust leg of the WP-024 milestone remainder: "service adoption, outbox migration per approved schema."

The pattern's guarantees (from `outbox.ts`): at-least-once delivery (03 §4.6 line 421); retries with exponential backoff + jitter (1 → 2 → 4 min default, 03 §5.4); dead-letter after `maxAttempts` via `onDead` hook + `status = 'dead'` (OR-008); the stable event `id` is the consumer idempotency key (replays are consumer no-ops). WP-024a already delivered the relay/reader/DDL contract in `packages/events`; WP-024c is the per-service adoption.

## 2. Approved physical table names

**APPROVED (Project Owner + DB Architect, 2026-08-08 planning gate).** Four physical outbox tables, one per in-scope service, matching the canonical DDL contract with a service-specific table name:

| Physical table | Service | Producer value (per vocabulary.ts) |
| --- | --- | --- |
| `user_outbox` | users | `user-enrollment` |
| `content_outbox` | content | `content-service` |
| `reminder_outbox` | reminders | `reminder-engine` |
| `journal_outbox` | journal | `journal-service` |

Names follow the established singular domain-prefix-first convention (`user_preferences`, `reminder_templates`, `reminder_instances`, `reminder_dispatches`, `journal_entries`, `journal_media`, `checklists`, `checklist_items`, `budget_entries`, `content_versions`) and satisfy the `PostgresOutboxReader` table-name regex `/^[a-z_][a-z0-9_]*$/`.

## 3. Approved `021-outbox` migration structure

**APPROVED (Project Owner + DB Architect, 2026-08-08 planning gate).** One migration file, `packages/db/migrations/021-outbox.ts`, containing **all four** approved outbox tables (`user_outbox`, `content_outbox`, `reminder_outbox`, `journal_outbox`), each an adaptation of `OUTBOX_TABLE_DDL` (the contract uses `CREATE TABLE IF NOT EXISTS`; repo migrations 018–020 use plain `CREATE TABLE` — the migration will use plain `CREATE TABLE`/`CREATE INDEX` per repo convention, no `IF NOT EXISTS`).

Structure rationale (validated in the Governance Validation Report): one-WP/one-migration is observed **precedent**, not an explicit rule; one-migration-per-table is not required; multi-table migrations are established precedent (`018-reminders` three tables, `020-checklist-budget` two tables); one `021-outbox` preserves append-only/atomic rollback (pure drops, no FKs) and the `MIGRATION_NAMES` test flow. Migration `021` is the next free number — the stale D-09 `019` auth reservation was consumed by `019-journal`.

`05` §4.2 is **not** modified by this plan or by the migration; catalog row 019 (see §4) is documented here and appended to `05` §4.2 only at the governance/schema approval step (milestone §10 item 8), under separate authorization.

## 4. Approved catalog mapping

**APPROVED for documentation in this plan (Project Owner + DB Architect, 2026-08-08).** The planned `05` §4.2 catalog row (next available, 001–018 exist):

```
019 | outbox | user_outbox, content_outbox, reminder_outbox, journal_outbox | 001 | Per-service outbox (06 §2.2, D-03, WP-024c)
```

- Migration identifier `outbox` fits the slug pattern; one row per migration (precedent 006/009/018).
- `Depends on 001` — pgcrypto → `gen_random_uuid()`; no FKs, so no `002 users` dependency.
- **Catalog modification is NOT part of this planning step.** `05-database-implementation-plan.md` is appended only at the governance/schema approval gate, under separate authorization (milestone §10 item 8).

## 5. Approved D-11 governance relationship

**APPROVED for documentation in this plan (Project Owner + DB Architect, 2026-08-08).** A decision-log entry **D-11 — Per-service transactional outbox tables (WP-024c)** will be recorded at the governance/schema approval gate (D-10 record format, `decision-log.md` lines 138–149). It will cover: the four physical tables; migration `021-outbox`; catalog row `019`; WP-024c service scope; relationship to D-03 (domain rows + outbox rows in one DB transaction); relationship to 06 §2.2 (per-service outbox table); **migration-creation-only boundary**; exclusion of auth; exclusion of checklists; exclusion of new scheduler jobs; exclusion of new event vocabulary; exclusion of new domain features; implementation remaining separately unauthorized.

- **`decision-log.md` is NOT modified by this planning step.** The D-11 entry is written only at the governance/schema approval gate, under separate authorization.

## 6. Approved service scope

**APPROVED (Project Owner, 2026-08-08).**

| Direction | Service | Existing events (publish sites) |
| --- | --- | --- |
| IN | users | `user.enrolled` (users-service.ts:161), `user.profile.updated` (:211, :257), `user.consent.changed` (consents-service.ts:136, :183); `user.deletion.requested` registered in vocabulary.ts:84 — **no emission site exists** (flagged, non-blocking) |
| IN | content | `content.published` (content-service.ts:164), `content.retired` (:204) |
| IN | reminders | `reminder.due` (reminder-service.ts:292) |
| IN | journal | `journal.entry.created` (journal-service.ts:72) |
| OUT | auth | D-09 Redis-only; no Postgres TX |
| OUT | checklists | no events in vocabulary |

## 7. Scheduler exclusion

**No new scheduler jobs under WP-024c.** Prompt/pulse/legacy scheduler work remains **WP-037** (17 line 124 FR-014/015/016/053/054). The `OutboxRelay` polling loop (`start(intervalMs)`) is a process-level loop within each service, not a scheduler job; wiring/instantiation is part of service adoption, not scheduler work. `services/scheduler` unchanged.

## 8. Event vocabulary exclusion

**No new event vocabulary.** All 8 in-scope events are already registered in `packages/events/src/vocabulary.ts` (incl. `user.deletion.requested` at line 84). `packages/events` contract is unchanged except where already shipped by WP-024a (`outbox.ts`). No new events, no new consumers, no new domain features. Producer values used are the existing registered producers.

## 9. Canonical 16-field outbox contract

`OUTBOX_TABLE_DDL` (`packages/events/src/outbox.ts` lines 56–80), identical for all four tables (adapted per §3):

| # | Column | Type / constraint |
| --- | --- | --- |
| 1 | `id` | uuid PRIMARY KEY DEFAULT `gen_random_uuid()` |
| 2 | `event_id` | uuid NOT NULL |
| 3 | `event_type` | text NOT NULL |
| 4 | `producer` | text NOT NULL |
| 5 | `schema_version` | integer NOT NULL DEFAULT 1 |
| 6 | `occurred_at` | timestamptz NOT NULL DEFAULT now() |
| 7 | `aggregate_type` | text NULL |
| 8 | `aggregate_id` | text NULL |
| 9 | `idempotency_key` | text NOT NULL |
| 10 | `payload` | jsonb NOT NULL |
| 11 | `status` | text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','published','failed','dead')) |
| 12 | `attempts` | integer NOT NULL DEFAULT 0 |
| 13 | `available_at` | timestamptz NOT NULL DEFAULT now() |
| 14 | `created_at` | timestamptz NOT NULL DEFAULT now() |
| 15 | `published_at` | timestamptz NULL |
| 16 | `last_error` | text NULL |

Plus one index per table: `outbox_pending_idx` on `(status, available_at) WHERE status IN ('pending','failed')`. **No FKs, no triggers, no unique constraints, no extra indexes, no schema qualification** — the contract is copied exactly (only the table name differs). Table name must satisfy the `PostgresOutboxReader` regex `/^[a-z_][a-z0-9_]*$/` (all four approved names do).

## 10. Four-service transactional-outbox adoption analysis

Pattern (D-03, 03 §4.6 line 923): the domain write and the outbox INSERT execute in **one DB transaction**; the relay reads committed `pending`/`failed` rows, publishes via the injected `EventBus`, and marks `published` — publish-on-commit without dual-write hazard. Consumer-side idempotency is already handled by `packages/idempotency` (Redis `SET NX PX`, stable event `id`), so outbox replays are consumer no-ops.

Per service, adoption means: (a) an explicit client transaction wraps each published-write operation; (b) the outbox INSERT for the produced event joins that transaction; (c) the service's best-effort `publishEvent` wrapper is replaced by (or routed through) an outbox write; (d) the relay is wired to the service's `PostgresOutboxReader` on its own table. Publishing *after* commit today is the current behavior; the outbox moves the publish into the committed TX's visible record.

## 11. Existing transaction boundaries

Verified against the four stores (grep-verified):

| Service | Store | Current explicit TX | Publish sites in-scope |
| --- | --- | --- | --- |
| users | `services/users/src/services/store/postgres-store.ts` | **Only `createUser`** has an explicit client TX (lines 154–212); `updateProfile`/`upsertPregnancy`/`upsertPreferences`/`insertConsent` are single statements | users-service.ts:161/:211/:257 (via `publishUsersEvent`, post-commit); consents-service.ts:136/:183 |
| content | `services/content/src/services/store/postgres-store.ts` | **Only `create`** has an explicit client TX (lines 80–106); `updateContent`/`transition`/`insertVersion` single statements | content-service.ts:164 (`content.published`), :204 (`content.retired`) |
| reminders | `services/reminders/src/store/postgres-store.ts` | **Explicit PoolClient TXs:** `dispatchInstance` (263–323), `ackDispatch` (343–375), `failDispatch` (377–409) | reminder-service.ts:292 (`reminder.due`, after dispatch+ack) |
| journal | `services/journal/src/store/postgres-store.ts` | **Zero explicit TX** — no BEGIN/COMMIT/ROLLBACK/`pool.connect` anywhere; `create` is a single statement | journal-service.ts:72 (`journal.entry.created`, fire-and-forget `void`) |

## 12. Required transaction changes

Implementation-time (NOT performed now; requires separate implementation authorization):

- **users** — introduce explicit client TXs at the remaining published-write paths so the outbox INSERT joins the domain write (updateProfile, upsertPregnancy, upsertPreferences, insertConsent). `createUser` already has a TX; its publish moves into it. All 4 in-scope publish sites route through the outbox (`user_outbox`).
- **content** — introduce explicit client TXs at the publish/retire paths (`updateContent`/`transition`/`insertVersion` for `content.published` at :164 and `content.retired` at :204); `create` TX already exists. Outbox writes → `content_outbox`.
- **reminders** — extend the existing dispatch TX (`dispatchInstance`) to include the outbox INSERT for `reminder.due` (reminder-service.ts:292); `ackDispatch`/`failDispatch` TXs stay as-is (no event published there). Outbox writes → `reminder_outbox`.
- **journal** — **WP-024c introduces journal's first explicit client TX**: wrap the `create` path and join the outbox INSERT for `journal.entry.created` (journal-service.ts:72, today `void publishEvent` fire-and-forget). Outbox writes → `journal_outbox`.
- **Relay wiring** — instantiate `PostgresOutboxReader` (own table name) + `OutboxRelay` (defaults: `maxAttempts=5`, retry 1→2→4 min, jitter 0.2, batch 100, `onDead` → OR-008) in each adopting service; publish reads/publish path replaced accordingly. All compatible with D-03 (domain + outbox in one TX).

## 13. Migration-test requirements

At implementation time (NOT now), when migration `021-outbox` is separately authorized:

- Append `'021-outbox'` to `MIGRATION_NAMES` in `packages/db/test/migrations.integration.test.ts` (lines 18–27).
- Schema assertions: all 16 columns per §9 with correct types/constraints; `status` CHECK accepts the 4 states and rejects others; `outbox_pending_idx` partial index present; **no FKs/triggers/unique constraints/extra indexes**.
- Behavior assertions: insert a row via each table; partial-index row eligibility (`pending`/`failed` with `available_at <= now()`); `id` default via `gen_random_uuid()`.
- Baseline flow per `18` §2.1: `up` (idempotent) → assertions → `down` all → assert clean → `up` again; CI `db-baseline` green.

## 14. Rollback considerations

- Migration `down` = pure table drops in dependency-independent order (`user_outbox`, `content_outbox`, `reminder_outbox`, `journal_outbox`); **no FKs, no triggers, no functions** → atomic, no cascade risk. Matches repo precedent (018–020).
- Contract-level: `OUTBOX_TABLE_DDL` remains the single canonical source in `packages/events`; `packages/events` is not modified by WP-024c (WP-024a already shipped it).
- `05` §4.2 row 019 and D-11 are appended only at their respective gates; removal is a plain line deletion, reversible.
- No DB change, no migration applied, no schema modification in this planning step.

## 15. Safety constraints

- **READ-ONLY planning artifact.** No file creation beyond this document; no migration `021-outbox`; no `05` §4.2 modification; no `decision-log.md` modification; no `implementation-status.md` modification; no service code; no tests; no `packages/events/src/outbox.ts`; no DB; no migrations applied; no branch; no commit; no push; no PR; no merge.
- No branch is created for the plan; the plan document is committed only under a separate commit authorization following the precedent flow.

## 16. Explicit implementation authorization gate

**WP-024c implementation requires separate authorization after plan approval and migration/governance gates are satisfied.** This plan documents expected work only. Implementation proceeds exclusively on an explicit Project Owner authorization — never inferred from the plan's existence or this gate's text.

## 17. Migration creation requires separate authorization

**Migration 021 creation requires separate authorization.** The `021-outbox` migration file is authored only after: (a) governance/schema approval (catalog row 019 appended to `05` §4.2 + D-11 written to `decision-log.md`, milestone §10 item 8), and (b) an explicit migration authorization from Project Owner + DB Architect (migration-creation-only boundary). This planning step neither creates nor authorizes it.

## 18. Service implementation requires separate authorization

**WP-024c implementation requires separate authorization after plan approval and migration/governance gates are satisfied.** All transaction changes (§12), event-path rewiring, relay wiring, and test changes are implemented only under explicit Project Owner implementation authorization, one governed step at a time (commit → push → PR → review → merge, each separately authorized).

## 19. Verification requirements

At implementation time (NOT now), evidence per `18` §2.1 (Produced → Passed → Signed):
- Typecheck, lint, build, unit + integration tests, coverage ≥ 80% lines per service; contract unchanged (no vocabulary change).
- Store integration tests against Postgres: outbox INSERT joins the domain write in the same TX (rollback of the domain write rolls back the outbox row; commit persists both).
- Outbox relay integration: publish-on-commit; `markPublished`; retry backoff; dead-letter after `maxAttempts` with `onDead` (OR-008); consumer idempotency replay no-op.
- Migration integration: `021-outbox` up/down per §13; CI `db-baseline` + Quality gate green.
- Journal's first explicit TX: create + outbox INSERT atomicity demonstrated by test.

## 20. Expected implementation report/evidence

The WP-024c implementation report (delivered at the end of the WP, per milestone §2/§11, before any further WP) will include:
- Migration `021-outbox` + catalog row 019 + D-11 references (all committed under their own gates).
- Per-service evidence: TX wrapping, outbox wiring, relay behavior, test reports, coverage.
- `user.deletion.requested` note: remains registered with no emission site (informational, unchanged).
- Scheduler non-change statement (no jobs; WP-037 owns prompt/pulse/legacy).
- Verification run summary per §19 and final repository state at each governed step.

---

## Approval Record

- [x] Planning authorization granted (2026-08-08) — plan creation only.
- [x] Architecture approved: four physical table names + one `021-outbox` migration (PO + DB Architect).
- [x] Governance approved for documentation: catalog row 019 + D-11 (PO + DB Architect).
- [x] Scope approved: IN users/content/reminders/journal; OUT auth/checklists; no vocabulary; no scheduler jobs (PO).
- [x] Approval-sequence ratification approved (PO).
- [ ] **Migration 021 authorization — NOT GRANTED (separate future gate: PO + DB Architect).**
- [ ] **WP-024c implementation authorization — NOT GRANTED (separate future gate: PO).**
- [ ] Governance/schema step (append catalog row 019 + write D-11) — separate gate, not performed.

**PLANNING AUTHORIZATION: GRANTED — PLAN CREATION ONLY.**

**MIGRATION 021 AUTHORIZATION: NOT GRANTED.**

**WP-024c IMPLEMENTATION AUTHORIZATION: NOT GRANTED.**
