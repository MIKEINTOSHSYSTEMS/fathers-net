# WP-022 Implementation Progress Report — Journal Service

**Document:** WP-022 implementation progress report (evidence per `18` §2.1 Produced → Passed → Signed).
**Date:** 2026-08-08
**Status:** **Implemented locally — In Verification.** All local gates green (tests, lint, typecheck, build, contract lint, coverage, Docker build + boot smoke test). **Working tree uncommitted — awaiting separate commit authorization** (AGD-002 / `milestone-2-implementation-plan.md` §2, §11). Nothing pushed; no PR opened.
**Controlling references:** `wp-022-implementation-plan.md`; `wp-022-scope-confirmation.md`; `milestone-2-implementation-plan.md` §5.9; SRS §12.9, §13.3.6/§13.3.7, §13.4; SRS FR-039/FR-051…FR-058/FR-126/FR-128/FR-161; `05-database-implementation-plan.md` §2.6/§2.7/§4.2 row 006; `06-backend-development-plan.md` §3.3; migration `019-journal.ts` (already on disk, untracked).

---

## 1. Scope delivered

The journal service foundation exactly as planned (`wp-022-implementation-plan.md` §1/§2/§3/§4/§5/§6):

- **New workspace `services/journal`** (package `@fathersnet/journal`, Fastify, port 3700): config, domain/store types, cursor-paginated timeline, memory + Postgres store adapters (M-08), journal-service orchestration (privacy matrix, share opt-in, export scoping), best-effort `journal.entry.created` publisher, health/entries routes, bearer middleware, export artifact builder.
- **Privacy-by-default (FR-052/FR-126):** ownership filter enforced at the **store layer** (`findByIdForUser`), 404-invisibility for non-owned/unshared entries (never 403), partner read gated on `shared_with_partner = true` **AND** a real `pregnancies.partner_user_id` link (resolved via migration-003), owner-only writes, caller identity from the token `sub` claim only.
- **Timeline (SRS §13.4):** `(user_id, created_at DESC)` keyset pagination with opaque cursor tokens derived from `(user_id, created_at, id)` (plan R7) — stable windows across concurrent writes; malformed cursor degrades to first page; response `{ items, next_cursor, total: null }`.
- **Share (FR-039):** `POST /:id/share` explicit opt-in shortcut + `PATCH shared_with_partner` toggle.
- **Export (FR-057/FR-128):** synchronous JSON artifact (schema-versioned, `schema_url`, chronological ASC, owner entries only, no media, no others' shared entries, deterministic given a fixed clock — injectable `now`).
- **Event (FR-056/FR-113/FR-022):** best-effort `journal.entry.created` (producer `journal-service`, idempotency key = entry id, aggregate `journal_entry`) with **no-PII** payload `{ entry_id, type, week, consent_flags: { shared_with_partner } }` — content is never published (asserted in tests).
- **Media (AR-023):** `POST /v1/journal/media` deliberately returns **501** (`NOT_IMPLEMENTED`) until WP-060; `journal_media` created by the migration but written by zero Phase-2 code paths (plan R5 accepted).
- **Migration baseline:** `019-journal.ts` (already on disk) now covered by `migrations.integration.test.ts` — schema/checks/indexes/cascade/erasure assertions + rollback.

## 2. Files changed (uncommitted working tree)

**New — `services/journal/`** (scaffold + src + test):

- `package.json`, `tsconfig.json`, `tsconfig.build.json`, `jest.config.js`, `Dockerfile` (node:20-alpine multi-stage, non-root UID/GID 1001, `/healthz` HEALTHCHECK).
- `src/config.ts` — `FN_JOURNAL_*` schema: required `FN_JOURNAL_JWT_SECRET` (shared WP-016 HS256), issuer/audience, port 3700, `FN_STORE_DRIVER` `memory|postgres` (shared registry var — see §4), Redis/DB URLs, `FN_JOURNAL_PAGE_SIZE` 20 (1–100), `FN_JOURNAL_MAX_CONTENT_LENGTH` 10000 (1–100000).
- `src/store/types.ts` (`JournalStore`, `JournalEntry`, …), `src/store/cursor.ts` (base64url keyset), `src/store/memory-store.ts` (hermetic test-double + `setPartner`), `src/store/postgres-store.ts` (parameterized, privacy EXISTS subquery, closed `COLUMN_BY_FIELD` for PATCH), `src/store/index.ts` (factory).
- `src/services/tokens.ts` (HS256 verify), `src/services/redis.ts` (lazy client), `src/services/events.ts` (best-effort publisher), `src/services/export.ts` (artifact builder), `src/services/journal-service.ts` (orchestration).
- `src/middleware/auth.ts`, `src/middleware/errors.ts`, `src/middleware/request-id.ts` — peer pattern from content/reminders.
- `src/routes/health.ts`, `src/routes/entries.ts`; `src/app.ts` (`buildJournalApp` factory — test seam injection of store/bus/verifier), `src/index.ts` (boot).
- `test/` — `journal-service.test.ts` (privacy matrix, export, bus-failure survival), `memory-store.test.ts` (cursor windows + concurrency), `export.test.ts`, `routes.test.ts` (full §5 surface via inject), `postgres-store.test.ts` (hermetic FakePg), `postgres-store.integration.test.ts` (env-gated `JOURNAL_TEST_DATABASE_URL`).

**Modified:**

- `packages/db/test/migrations.integration.test.ts` — added `019-journal` to `MIGRATION_NAMES`, two new journal schema/behavior tests (checks, indexes, privacy default, erasure cascade), rollback table list, describe title `001-019`.
- `packages/api-spec/package.json` — `openapi/journal.yaml` added to `contract:lint`/`lint`/`sast`.
- `packages/api-spec/openapi/journal.yaml` — replaced the AR-003 skeleton (`paths: {}`) with the real WP-022 contract (see §4).
- `.env.example` — `FN_JOURNAL_*` block (secret must equal `FN_AUTH_JWT_SECRET`).
- `docker-compose.yml` — `journal:` service (port 3700, postgres driver, redis bus, healthcheck) mirroring reminders.
- `package-lock.json` — new workspace registered (needed for the Dockerfile `npm ci`).

## 3. Verification results (local, all green)

| Gate | Result |
| --- | --- |
| `services/journal` tests | **45 passed / 6 skipped (Postgres integration, env-gated `JOURNAL_TEST_DATABASE_URL`)** — 5 suites passed, 1 skipped; 51 total |
| `services/journal` coverage | **Lines 93.60% · Statements 93.71% · Branches 75.27% · Functions 94.50%** (`journal-service.ts` 100% across all metrics; requirement ≥ 80% lines) |
| `services/journal` lint / typecheck / build | clean / clean / clean |
| `packages/db` tests | 12 passed / 15 skipped (migration baseline env-gated `DATABASE_URL`); typecheck + lint clean |
| Repo-wide `npm run typecheck` | 21/21 tasks successful |
| `npm run contract:lint` (api-spec) | 6/6 specs valid, **1 warning** — the deliberate `operation-2xx-response` on the 501-only `POST /v1/journal/media` (reserved until WP-060; no success path exists by design, documented in the spec) |
| `docker compose config` | valid |
| Docker build + boot | `services/journal/Dockerfile` builds; container boots and serves `/healthz` + `/readyz` (`memory` driver smoke test) |

### Test coverage highlights

- **Privacy matrix (FR-052/FR-126):** owner read OK; **stranger 404** (invisible — existence never disclosed); partner read OK only after `shared_with_partner=true` + linked via `setPartner`/`pregnancies.partner_user_id`; non-owner PATCH/DELETE/share → 404; `user_id` from token `sub`, never the body.
- **Timeline/pagination (R7):** newest-first pages; a concurrent write after page 1 does not shift the window (stable keyset cursor); malformed cursor → first page; per-user isolation.
- **Export (FR-057/FR-128):** schema-versioned envelope; chronological ASC; excludes others' shared entries and the userId; deterministic — identical bytes for a fixed injected `now`; no `content` field in the event payload.
- **Events:** exactly one `journal.entry.created` per create with `{ entry_id, type, week, consent_flags }`; best-effort — bus publish failure does not fail the request.
- **Postgres adapter (hermetic FakePg):** `INSERT … RETURNING`, privacy `EXISTS (… pregnancies.partner_user_id = $2)`, `(je.created_at, je.id) < ($2, $3)` keyset + `ORDER BY created_at DESC, id DESC` + `LIMIT pageSize+1`, owner-guarded `UPDATE`/`DELETE` with NotFoundError, closed column whitelist, `SELECT 1` ping.
- **Routes (memory driver):** healthz/readyz unauth; 401 on every `/v1/journal` route (missing + invalid token); 201 create (defaults `shared_with_partner=false`, `entry_type=text`); GET/PATCH/DELETE/share ownership 404s; validation 422 (required `content`, week bounds 1–45); export; media **501**; unknown-body-prop stripping documented; `x-request-id` echo.

### Fixes applied during verification (initial run 39 pass / 6 fail → all green)

1. **Memory-store timestamp collisions** — `new Date().toISOString()` has millisecond resolution, so tight create loops produced identical `created_at` and the `(created_at, id)` DESC order became non-deterministic. Added a monotonic clock (`nextIso()`, strictly increasing) so the test-double guarantees the same sequential ordering the Postgres `now()` adapter provides.
2. **`listAllForUser` ordering** — the memory adapter sorted DESC but the Postgres adapter sorts ASC (chronological, the export source). Unified both to ASC.
3. **Pg hermetic cursor** — the fixture cursor decoded to invalid JSON (→ null → first-page fallback), so the keyset clause never rendered. Replaced with a real `encodeCursor`-shaped token; the SQL assertions now pass.

## 4. Contract, interpretation and boundary decisions (recorded)

- **Contract before code (AR-003):** `journal.yaml` filled from the AR-003 skeleton; every §5 endpoint documented (healthz/readyz `4XX` per platform pattern; entry routes under `/v1/journal`; responses camelCase, journal write fields snake_case `pregnancy_week`/`shared_with_partner` per the approved WP-022 contract).
- **Gateway aggregation** follows the actual content/reminders precedent: `gateway.yaml` was **not** modified — aggregation in this repo means adding the spec file to the api-spec `contract:lint`/`lint`/`sast` list (the plan §3 mentions gateway aggregation, but the established pattern — content commit `7766938`, reminders — does not touch `gateway.yaml`; proxying/aggregation is a separate WP).
- **Store driver config:** the plan §4 references `FN_JOURNAL_STORE_DRIVER`; implementation uses the shared **`FN_STORE_DRIVER`** registry variable exactly as content/reminders do (R6 cross-service consistency) — `.env.example` + compose document `memory` (hermetic dev/CI, M-08) vs `postgres` (production, enables the Redis event bus).
- **Export is synchronous JSON** (FR-057/FR-128); PDF rendering + async `data_export_jobs` deferred to WP-060 (avoids the `05` §4.2 beyond-catalog gate §10.8). Artifact: `schema_version: 1`, `schema_url: https://fathersnet.app/schema/journal-export/v1.json`.
- **Media 501:** `POST /v1/journal/media` intentionally has no success path (signed upload needs object storage, WP-060). The contract documents the lone `operation-2xx-response` warning as the deliberate signal of a reserved resource.
- **Unknown body properties** are silently stripped, not rejected (Fastify default Ajv `removeAdditional: true`) — identical to content/reminders; documented in `routes.test.ts`.
- **Non-owned reads return 404** (privacy invisibility), never 403 (plan §5 interpretation).
- **`journal_media` exists but is never written** in Phase 2 (catalog row 006 fidelity, plan R5); covered by the migration baseline tests.
- **No new npm dependencies** (plan §9): `pg`, `ioredis` (hoisted via `@fathersnet/events`), `fastify`, `jsonwebtoken` — all already in the lockfile.
- **Erasure (FR-007/FR-128):** FK `ON DELETE CASCADE` on `users → journal_entries → journal_media`; covered by migration test + gated integration test (`SET LOCAL app.consent_erasure = 'on'`).

### Boundaries honored

- **No WP-023, no WP-024c** (partner-authz expansion, reminders/scheduler) — untouched.
- **No media pipeline / transcription / tagging / review queue** — 501 route, no `journal_flags`/`transcription_jobs`/`data_export_jobs` tables.
- **No new vocabulary entries, no new consumers** — only the pre-reserved `journal.entry.created`; no outbox (content/reminders precedent; WP-024a outbox relay is the upgrade path).
- **No scheduler change** — WP-022 registers no jobs; `services/scheduler` untouched.
- **No DB changes beyond migration 019** — `002`–`004`, `011`, `018` untouched; `journal_media` read-only in code.
- **Integration suites env-gated** (`JOURNAL_TEST_DATABASE_URL`, `DATABASE_URL`) — CI/unit runs stay hermetic (R6).

## 5. Risks status (from plan §10)

| # | Risk | Status |
| --- | --- | --- |
| R1 | Privacy regression on high-sensitivity PII | **Closed** — store-level ownership filter, 404-invisibility, partner read gated on link, no-PII event payload, stranger-404 + no-content tests |
| R2 | Partner-scope ambiguity (`partner_user_id` null/multiple) | **Closed** — partner read resolves through `pregnancies.partner_user_id` only; null/absent → owner-only |
| R3 | Scope creep into deferred FRs | **Closed** — media 501, no out-of-catalog tables, out-of-scope list honored |
| R4 | Export size/perf | **Closed** — synchronous JSON, list path keyset-paginated; async full export deferred to WP-060 |
| R5 | `journal_media` created but unused | **Accepted** — catalog fidelity; zero writes until WP-060; baseline-tested |
| R6 | Cross-service config/env drift | **Closed** — `FN_JOURNAL_*` block + compose service + shared `FN_STORE_DRIVER` |
| R7 | Cursor misuse | **Closed** — opaque keyset tokens `(user_id, created_at, id)`, stable-window tests |

## 6. Awaiting authorization

- Working tree changes (above) **uncommitted** — awaiting separate commit authorization per AGD-002 / `milestone-2-implementation-plan.md` §2, §11.
- After commit: push → PR → review → merge → post-merge CI (Quality + `db-baseline` with `DATABASE_URL`/`JOURNAL_TEST_DATABASE_URL` provisioned) per the established flow; then WP-022 → Closed with this report as the evidence artifact.
