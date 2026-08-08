# WP-023 Implementation Plan — Checklist & Budget Service

**Document:** WP-023 execution plan (planning only — no code, no migrations, no schema changes).
**Date:** 2026-08-08
**Status:** **IMPLEMENTATION COMPLETED 2026-08-08** (committed `14205ec`, pushed to `origin/develop`). Scope, M-07 budget-cap default (Option B — `decision-log.md` §1.4), M-08 closure, and R5 all resolved; implementation review + technical verification PASSED (typecheck/lint/build/tests/coverage/contract + migration integration 17/17). **Commit `14205ec` + push COMPLETED 2026-08-08** (separate commit + push authorizations; precommit hook green). **PR structurally not applicable** — the commit is already on `develop` (WP-021/WP-022 direct-to-develop precedent; a same-commit branch has zero diff and cannot represent it — `implementation-status.md` §9). No merge performed. WP-024c not started.
**Controlling references:** `milestone-2-implementation-plan.md` §5.10 (WP-023) and §4 Step 10; `17-final-execution-roadmap.md` line 96 (WP-023 dependency: WP-017 — DONE); SRS §12.6/§12.7 (checklist/budget API groups), §13.3.12/§13.3.13/§13.3.14 (tables); SRS FR-086…FR-093, FR-146, FR-126; `05-database-implementation-plan.md` §2.12/§2.13/§2.14/§4.2 rows 009/010; `06-backend-development-plan.md` Phase F; `18-implementation-verification-plan.md` §2.1 (Produced → Passed → Signed); M-07 (configurable budget cap).

---

## 1. Scope definition

**In scope (Phase 2, WP-023):**

- Per-user checklist instances: hospital bag + birth prep (`hospital_bag`/`birth_prep`), one instance per type per user (FR-086).
- Custom items added by the user within a checklist (FR-086, §8.2) with category grouping (`Documents`|`Mother`|`Baby`|`Hygiene`|`Extras`).
- Completion toggling with `completed_at` capture and **progress %** maintained on write (FR-088, NFR-007 — no N+1 progress recompute on reads).
- Budget tracker entries with planned/actual amounts, category validation, notes (FR-087); **summary** with total planned / total actual / variance / remaining vs the configurable M-07 cap.
- Per-field merge on PATCH (offline-sync-ready API design, FR-089 at the contract level; the client sync engine itself is mobile Phase 4).
- Ownership-scoped access on every endpoint (FR-126): owner-only; non-owned rows → **404** (invisibility, never 403 — journal precedent).
- OpenAPI contracts `checklists.yaml` + `budget.yaml` (AR-003, contract-first; skeletons exist in `packages/api-spec/openapi/`).

**Out of scope (explicitly deferred):**

- **Appointments — EXCLUDED from WP-023.** Catalog row 010 bundles `budget_entries` + `appointments`, but `appointments` belong to the reminder/scheduling domain (FR-041, WP-021 scheduler integration). WP-023 delivers `budget_entries` only; `appointments` land with a future appointment/reminder WP under separate authorization.
- **FR-146 partner-shared checklists — DEFERRED.** Requires `shared_journey_links` (a beyond-catalog table, milestone §10 item 8) + partner access control design. Any partner-sharing change requires **separate authorization**; WP-023 endpoints are owner-only.
- **FR-091 gap data → reminders — DEFERRED.** Exposing checklist gaps to the Reminder Engine requires reminder-engine changes and a cross-service contract; no reminder integration in WP-023.
- **FR-090 document media (Could-Have)** — `receipt_image` column exists for catalog fidelity but no upload pipeline (WP-060 media precedent).
- **FR-093 birth-plan summary (Could-Have)** — deferred.
- **Offline client sync engine (FR-136)** — mobile Phase 4; WP-023 provides the merge-friendly API shape only.
- **Seed data** (hospital-bag defaults, budget categories — `05` §4.2 row 017) — not created in WP-023; seed migration 017 is a separate future migration.
- **Events — NONE emitted.** No checklist/budget event exists in the canonical vocabulary; `06` Phase F's "completion events visible on the bus" would require a vocabulary addition + approval, so it is **deferred** (see §5).

## 2. Database migration plan

One new migration **`packages/db/migrations/020-checklist-budget.ts`** (node-pg-migrate, `pgm.sql` style mirroring `019-journal.ts`).

**Numbering rationale:** file numbering follows the append precedent (D-10): 001–004, 011, 018, 019 are the existing files, so WP-023 **appends 020**. This is independent of the `05` §4.2 catalog row IDs (009 `checklists`, 010 `budget-and-appointments`) — the catalog rows are the schema authority; the migration files are append-numbered. A `05` §4.2 note records that row 009 is delivered by file 020 and row 010 is **partially** delivered (budget_entries only; appointments deferred).

| Table | Purpose | Key columns / constraints |
| --- | --- | --- |
| `checklists` | Per-user checklist instances (`05` §2.12; FR-086/088, UC-004) | `id` UUID PK `gen_random_uuid()`; `user_id` UUID NOT NULL REFERENCES `users(id)` ON DELETE **CASCADE** (FR-007/FR-128 erasure); `checklist_type` CHECK (`hospital_bag`\|`birth_prep`); `title` TEXT; `progress` NUMERIC; `created_at`/`updated_at` TIMESTAMPTZ |
| `checklist_items` | Items within checklists incl. custom (`05` §2.13; FR-086/087) | `id` UUID PK; `checklist_id` UUID NOT NULL REFERENCES `checklists(id)` ON DELETE CASCADE; `category` CHECK (`Documents`\|`Mother`\|`Baby`\|`Hygiene`\|`Extras`); `item_name` TEXT; `completed` BOOLEAN NOT NULL DEFAULT false; `completed_at` TIMESTAMPTZ NULL; `custom` BOOLEAN NOT NULL DEFAULT false; `sort_order` INT; `created_at`/`updated_at` |
| `budget_entries` | Budget tracker records (`05` §2.14; FR-087, §8.3) | `id` UUID PK; `user_id` UUID NOT NULL REFERENCES `users(id)` ON DELETE CASCADE; `category` CHECK (`Transport`\|`Medical`\|`Baby Items`\|`Food`\|`Clothing`\|`Equipment`\|`Emergency Fund`\|`Other`); `item_name` TEXT; `planned_amount` NUMERIC; `actual_amount` NUMERIC NULL; `entry_date` DATE; `notes` TEXT; `receipt_image` TEXT NULL (anonymized object ref — **unused in Phase 2**, FR-022/§7.4.2); `created_at`/`updated_at` |

**Indexes** (per `05` §4.2 index table):
- `checklists`: **partial unique** `(user_id, checklist_type)` — one instance per type; plus `(checklist_type)` index.
- `checklist_items`: `(checklist_id, sort_order)`.
- `budget_entries`: `(user_id)`; `(user_id, entry_date DESC)`; `(category)`.

**Progress:** maintained on write — toggling an item updates the parent `checklists.progress` (completed/total) in the same operation (NFR-007; no recompute on every read).

**Down:** pure table drops in dependency order (`checklist_items`, `budget_entries`, `checklists`); no triggers/functions.

**Authoring gate:** NONE required — all three tables are inside the `05` §4.2 catalog (rows 009/010). `appointments` (row 010 remainder) and `shared_journey_links` (FR-146) are deliberately **not** created — the partial-delivery of row 010 and the deferral of beyond-catalog tables are recorded so milestone §10 item 8 does not gate this migration. No changes to `002`–`004`, `011`, `018`, `019`.

## 3. Files expected to change

**New — `services/checklists/`** (single workspace hosting both the checklist and budget route groups — mirrors `services/content`/`services/journal` scaffolding; deliberate divergence from `06` Phase F's two-service split, recorded as an interpretation decision):

- `package.json` (`@fathersnet/checklists`), `tsconfig.json`, `tsconfig.build.json`, `jest.config.js`, `Dockerfile`
- `src/config.ts` — `FN_CHECKLISTS_*` env schema: store driver `memory|postgres`, port, DB/Redis URLs, `FN_BUDGET_CAP` (M-07 configurable default), pagination defaults.
- `src/types.ts` — domain types (`Checklist`, `ChecklistItem`, `BudgetEntry`, `BudgetSummary`, inputs).
- `src/index.ts` — boot Fastify app; `src/app.ts` — `buildApp({ config, logger, store? })`.
- `src/routes/health.ts`, `src/routes/checklists.ts`, `src/routes/budget.ts` — health + the two API groups (§4).
- `src/middleware/auth.ts`, `src/middleware/errors.ts`, `src/middleware/request-id.ts` — peer pattern.
- `src/services/checklist-service.ts` — orchestration: list/get, custom-item add, completion toggle + progress update, ownership enforcement.
- `src/services/budget-service.ts` — entries CRUD, category validation, per-field merge, summary computation (§8.3 formulas + M-07 cap).
- `src/store/types.ts` (`ChecklistBudgetStore` interface, M-08 test-double pattern), `src/store/postgres-store.ts`, `src/store/memory-store.ts`, `src/store/index.ts` (factory).
- Tests: service unit tests (progress math, summary/variance/remaining), store unit (memory), store integration (Postgres, env-gated), route tests (hermetic), contract tests.

**New — elsewhere:** `packages/api-spec/openapi/checklists.yaml` + `budget.yaml` (replace the AR-003 skeletons — paths land with this WP); `packages/db/migrations/020-checklist-budget.ts`; `docker-compose.yml` block (port **3600**, free; mirrors journal); `.env.example` block (`FN_CHECKLISTS_*`).

**Modified:** `packages/api-spec/package.json` (add `checklists.yaml` + `budget.yaml` to `contract:lint`/`lint`/`sast` lists — journal precedent); `packages/db/test/migrations.integration.test.ts` (add `020-checklist-budget`, schema/behavior tests, rollback list, title 001–020); `package-lock.json` (new workspace); `05-database-implementation-plan.md` (§4.2 note: row 009 → file 020, row 010 partial); `implementation-status.md` (WP-023 row → In Progress at implementation start).

**Unchanged:** `services/scheduler` (no jobs — §6), `services/gateway`, `packages/events` (no vocabulary changes — §5), `services/journal`, `services/content`, `services/reminders`.

## 4. API boundaries

Public contracts `checklists.yaml` + `budget.yaml` (spec **before** code, AR-003), defined under `/v1/checklists` and `/v1/budget` (SRS §12.6/§12.7). `contract:lint` gated in CI. Responses camelCase, errors via the common envelope, `4XX`/`healthz`/`readyz` per the api-spec platform pattern. **Authz: owner-only in WP-023** (token `sub` claim, never body) — the SRS `self/partner` rows are reduced to `self` because FR-146 partner sharing is deferred (§1).

| Endpoint | Method | Purpose |
| --- | --- | --- |
| `/v1/checklists` | GET | List the user's checklists (hospital bag, birth prep) with categories + items |
| `/v1/checklists/:id` | GET | Get checklist + items + progress % (owner; else 404) |
| `/v1/checklists/:id/items` | POST | Add a custom item (owner) |
| `/v1/checklists/:id/items/:itemId` | PATCH | Toggle completion (owner; per-field merge, `completed`/`completed_at`) |
| `/v1/budget/entries` | GET | List entries with totals computed |
| `/v1/budget/entries` | POST | Create entry (category validation; owner) |
| `/v1/budget/entries/:id` | PATCH | Update entry (owner; per-field merge) |
| `/v1/budget/entries/:id` | DELETE | Delete entry (owner) |
| `/v1/budget/summary` | GET | Total planned / total actual / variance / remaining vs M-07 cap |

**Interpretation decisions to record in `decision-log.md` at implementation start:**
- One workspace (`services/checklists`) hosts both API groups rather than the two-service split in `06` Phase F — one WP, one deployment, consistent with the WP-per-service precedent.
- Partner authz (`self/partner` in §12.6/§12.7) deferred to FR-146; WP-023 is owner-only with 404 invisibility.
- `budget_entries` only from catalog row 010 (appointments deferred).
- No completion/engagement events emitted (vocabulary gap, see §5).

## 5. Event boundaries

- **No events published in WP-023.** The canonical vocabulary (`packages/events/src/vocabulary.ts`) contains **no** checklist/budget event. `06` Phase F's "completion events visible on the bus for journey/reminders" (FR-088/PD-007) would require a **new vocabulary entry + approval** — deferred and recorded.
- **No new vocabulary entries and no new consumers** in Phase 2. `packages/events` unchanged.
- Existing events (e.g. `journal.entry.created`, `user.enrolled`) are **not** consumed or extended by this service.

## 6. Scheduler impact

**None.** WP-023 registers no scheduler jobs: progress is maintained on write (not by a background job); budget summary is computed on read; FR-091 gap reminders are deferred (§1). `services/scheduler` unchanged.

## 7. Service architecture

- Fastify 5 service, package `@fathersnet/checklists`, port **3600** (free), monorepo workspace wired into turbo.
- **Store adapter pattern (M-08):** `ChecklistBudgetStore` interface with `memory-store` (hermetic dev/CI) and `postgres-store` (production), factory selected by `FN_CHECKLISTS_STORE_DRIVER`.
- **Domain services own all rules** (ownership, progress math, category validation, per-field merge, summary + cap) — routes stay thin (journal precedent).
- **Ownership enforcement core:** every query scoped by `user_id` from the token `sub`; non-owned or missing rows → `NotFoundError` → 404 (invisibility, never 403). Mutations guarded by `user_id = owner` in the WHERE clause.
- **Progress on write:** item toggle updates the parent `checklists.progress` in the same transaction/operation (NFR-007).
- **Budget summary:** totals + variance + remaining-vs-cap computed per `05` §8.3 formulas; `FN_BUDGET_CAP` is the configurable M-07 default.
- Auth: bearer/JWT validation consistent with peer services.

## 8. Testing strategy

- **Unit — service/domain (core, milestone §5.10 evidence):** progress math (0→100, empty checklist, partial); budget totals/variance/remaining per §8.3; category enum validation (reject unknown); per-field merge semantics on PATCH; cap comparison.
- **Ownership/privacy:** owner read OK; **stranger 404** (invisible without ownership); write by non-owner rejected; `user_id` from token, never body.
- **Store unit (memory):** CRUD, partial-unique one-instance-per-type, item ordering by `sort_order`, CASCADE shapes.
- **Store integration (Postgres, env-gated `CHECKLISTS_TEST_DATABASE_URL` — journal precedent):** insert/read/update/delete, partial-unique enforcement, progress update, CASCADE on user delete (FR-128), item ordering.
- **Routes (memory driver, hermetic):** all §4 endpoints via Fastify inject; 401 without token; 404 non-owned; 201 on create; category/week validation; `healthz`/`readyz`.
- **Contract:** `contract:lint` green for filled `checklists.yaml` + `budget.yaml`; api-spec list updated.
- **Evidence (§5.10):** checklist/budget test reports; ownership-scope test (stranger 404); coverage ≥ 80% lines; Quality CI + `contract:lint` green.

## 9. Dependencies

- **WP-017 (users identity) — DONE** — the only hard prerequisite (roadmap `17` line 96). `users` FK and token `sub` claims available.
- **Schema:** `002 users` only (catalog rows 009/010 depend on 002). No dependency on pregnancy week for WP-023 (FR-091 week-gating is deferred).
- **Platform packages:** `config`, `errors`, `logger`, `test-utils`, `db`.
- **Gateway/api-spec:** existing aggregation pattern; fill the two existing AR-003 skeletons.
- **No new npm dependencies** expected (no media/PDF/receipt pipeline in Phase 2).
- **Deferred:** appointments (row 010 remainder), FR-146 partner sharing (`shared_journey_links`), FR-091 gap reminders, FR-090 media, FR-093 birth-plan summary, seed data (migration 017), events (vocabulary addition).

## 10. Risks

| # | Risk | Mitigation |
| --- | --- | --- |
| R1 | **Partner-scope requirement drift** — SRS §12.6/§12.7 say `self/partner`; WP-023 is owner-only | Deferral is explicit (§1, §4) and recorded; partner sharing requires FR-146 authorization + `shared_journey_links`. |
| R2 | **Progress consistency** (NFR-007) — stored `progress` can drift from items | Progress updated transactionally on the same write as the item toggle; integration test asserts consistency. |
| R3 | **Partial catalog row 010** (appointments not created) | Recorded in `05` §4.2 + decision log; appointments land with their owning WP. |
| R4 | **Scope creep into deferred FRs** (media/receipts/birth-plan/reminder gaps) | Explicit out-of-scope list (§1); no receipt upload, no event emission, no reminder integration. |
| R5 | **M-07 budget cap default unconfirmed** | **RESOLVED 2026-08-08 (Option B)** — M-07 closed (`decision-log.md` §1.4): `FN_BUDGET_CAP = 0` (unset) approved; summary `cap`/`remaining` null while unset; no per-user reference amount approved (the `20` §4 scenarios are program ceilings, not per-user caps); a future per-user reference amount requires a separate governance decision. |
| R6 | **Cross-service config/env drift** | `FN_CHECKLISTS_*` block in `.env.example` + compose; store driver default `memory` keeps dev/CI hermetic (M-08). |
| R7 | **Offline merge ambiguity** (FR-089 contract shape) | Per-field PATCH + `updated_at` revision timestamps (LWW contract); client merge engine is mobile Phase 4. |

---

## Approval Record

- [x] Plan reviewed by Project Owner (2026-08-08 — WP-023 governance resolution: M-07 Option B resolved, M-08 closed).
- [x] M-07 budget-cap default resolved (Option B — `FN_BUDGET_CAP = 0`, no per-user reference amount; `decision-log.md` §1.4; milestone-2 §10 item 2).
- [x] Implementation COMPLETED 2026-08-08 (working tree, uncommitted) + reviewed + verification PASSED.
- [ ] Commit/push/PR/merge authorization — the final governed step, pending separate Project Owner authorization.

Implementation is complete and verified (working tree, uncommitted); commit → push → PR → review → merge → post-merge CI will proceed one governed step at a time per the established flow, on separate authorization.
