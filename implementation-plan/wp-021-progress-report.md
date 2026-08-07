# WP-021 Implementation Progress Report — Reminder Engine (Foundation)

**Document:** WP-021 implementation progress report (evidence per `18` §2.1 Produced → Passed → Signed).
**Date:** 2026-08-07
**Status:** **Implemented locally — In Verification.** All local gates green (tests, lint, typecheck, build, contract lint, coverage). **Working tree uncommitted — awaiting separate commit authorization** (AGD-002 / `milestone-2-implementation-plan.md` §2, §11). Nothing pushed; no PR opened.
**Controlling references:** `wp-021-implementation-plan.md`; `milestone-2-implementation-plan.md` §5.11; SRS FR-029/FR-041/FR-043/FR-044/FR-046/FR-047/FR-048/FR-161/FR-163; migration `018-reminders.ts` (already committed + pushed as `639c469`).

---

## 1. Scope delivered

The reminder engine foundation exactly as planned (`wp-021-implementation-plan.md` §2/§3/§4/§5):

- **New workspace `services/reminders`** (package `@fathersnet/reminders`, Fastify, port 3500): config, domain types, template engine, quiet-hours/cap/lead-time/priority/recurrence engines, reminder-service orchestration, memory + Postgres store adapters (M-08), stub dispatcher, best-effort `reminder.due` publisher, internal API, scheduler job factory.
- **Scheduler integration** (`services/scheduler`): registers `createRemindersJobs({ logger })` in `createSchedulerRuntime` (the WP-024 runtime hook reserved at `runtime.ts`). One scheduler remains the single background-job host (FR-163).
- **Internal API contract** `packages/api-spec/openapi/reminders-internal.yaml`, added before code (AR-003) and gated in `contract:lint`.
- **Migration `018-reminders.ts`** already committed (`639c469`, `feat(db): add WP-021 reminder schema migration`) — tables `reminder_templates`, `reminder_instances`, `reminder_dispatches` with CHECK-based enums, `UNIQUE(instance_id, run_id)` (FR-163), partial unique `dedupe_key` (FR-048 readiness), `(status, due_at)` due-selection index, `(user_id, dispatched_at)` cap index.

## 2. Files changed (uncommitted working tree)

**New — `services/reminders/`** (scaffold + src + test):

- `package.json`, `tsconfig.json`, `tsconfig.build.json`, `jest.config.js`, `Dockerfile` — **`package.json` `main`/`types` point to `dist/library.js`/`dist/library.d.ts`** so the scheduler imports the compiled surface (R1 mitigation).
- `src/config.ts` — `FN_REMINDERS_*` schema: store driver `memory|postgres`, daily cap default 5 (range 3–5, `06` §4.14), quiet-hours defaults, `FN_REMINDERS_TZ_OFFSET_MINUTES` (fixed UTC+3, no DST), template defaults, Redis/DB URLs.
- `src/types.ts` — `ReminderTemplate`, `ReminderInstance`, `ReminderDispatch`, `Channel`, `Priority`, `ReminderStatus`, `DispatchStatus`.
- `src/app.ts` (buildApp), `src/index.ts` (boot), `src/library.ts` (scheduler-facing surface).
- `src/routes/health.ts`, `src/routes/internal.ts` — internal contract endpoints.
- `src/middleware/auth.ts` (HS256 JWT verify + ownership control, `02` §5), `src/middleware/errors.ts`, `src/middleware/request-id.ts`.
- `src/services/tokens.ts`, `src/services/redis.ts`, `src/services/dispatcher.ts` (stub ack, Phase-4 handoff — R8), `src/services/events.ts` (best-effort `reminder.due`, producer `reminder-engine`).
- `src/engine/template-engine.ts` (FR-047 EN/AM render, no evaluation, escape), `quiet-hours.ts` (FR-029/FR-043), `priority.ts` (FR-046 bypass), `cap.ts` (per-user daily cap), `lead-time.ts` (FR-043), `recurrence.ts` (FR-044), `reminder-service.ts` (due select → render → quiet hours → cap → dispatch → ack → publish).
- `src/store/types.ts` (`ReminderStore` interface), `memory-store.ts`, `postgres-store.ts`, `index.ts` (factory).
- `src/jobs/reminders-dispatch-job.ts` — `createRemindersJobs({ logger }) → JobDefinition[]`, self-configures from `FN_REMINDERS_*` env (R3: no scheduler-config schema change).
- `test/` — `engine.test.ts`, `memory-store.test.ts`, `reminder-service.test.ts`, `postgres-store.test.ts` (hermetic FakePg), `postgres-store.integration.test.ts` (env-gated `REMINDERS_TEST_DATABASE_URL`), `routes.test.ts`, `jobs.test.ts`.

**Modified:**

- `services/scheduler/src/index.ts` — injects `createRemindersJobs({ logger })` into `createSchedulerRuntime`.
- `services/scheduler/package.json` — workspace dep `@fathersnet/reminders: "*"`.
- `services/scheduler/Dockerfile` — copies `services/reminders` (build) + `reminders/dist` + `packages/events` (runtime).
- `packages/api-spec/package.json` — `reminders-internal.yaml` added to `contract:lint`/`lint`/`sast`.
- `packages/api-spec/openapi/reminders-internal.yaml` (new file; see §4).
- `docker-compose.yml`, `.env.example` — reminders service block + `FN_REMINDERS_*` env block.
- `package-lock.json` — new workspace.

## 3. Verification results (local, all green)

| Gate | Result |
| --- | --- |
| `services/reminders` tests | **91 passed / 8 skipped (Postgres integration, env-gated)** — 6 suites passed, 1 skipped; 99 total |
| `services/reminders` coverage | **Lines 92.57% · Statements 92.62% · Branches 79.51% · Functions 93.02%** (requirement ≥ 80% lines) |
| `services/reminders` lint / typecheck / build | clean / clean / clean |
| `services/scheduler` tests | 33 passed / 4 skipped (integration, env-gated); typecheck + lint clean |
| Repo-wide `npm run typecheck` | 20/20 tasks successful |
| Repo-wide `npm run lint` | 14/14 tasks successful |
| Repo-wide `npm test` | 20/20 tasks successful (reminders 91+8, scheduler 33+4) |
| `npm run contract:lint` (api-spec) | 5/5 specs valid, **0 warnings** (reminders spec health endpoints declare a generic `4XX` per the gateway pattern) |

### Test coverage highlights

- **Engine (pure):** EN/AM rendering + trimming + escaping, missing-variable → `ValidationError` with `fields`; quiet-hours parse + precedence (user > template > defaults), overnight + same-day windows with start-inclusive/end-exclusive boundaries, disabled/all-day; daily cap + `dayWindow` (fixed tz, no DST); lead-time subtract + dispatch-window-open + expiry at exactly 60 min; critical bypass + priority resolve; one-time + weekly recurrence expansion (1–45 weeks, cap + clamp).
- **Service orchestration:** full cycle render→dispatch→ack→publish with `idempotency_key = dispatch.id` and aggregate asserted; run-id idempotency across re-runs (FR-163); quiet-hours skip + critical bypass; per-user preference override + per-template override; cap rate-limit (4th instance `rate_limited`); failed render → instance `failed`, no event, no dispatch row; orphaned template → `failed`; expiry; best-effort publish failure tolerated; Amharic rendering via `getUserLanguage` override (FR-047).
- **Memory store:** dedupe `ConflictError` (FR-048); due-selection ordered oldest-first + limit; atomic dispatch claim with conflict on re-run; per-day cap isolation; ack/fail transitions; pagination; ping/dispose.
- **Postgres store (hermetic FakePg):** SQL assertions — `INSERT … RETURNING`, `WHERE status='scheduled' AND due_at <= $1 … ORDER BY due_at ASC LIMIT $2`, claim `WHERE id=$1 AND status='scheduled'`, BEGIN/COMMIT/ROLLBACK on all transactions, `23505` → `ConflictError` + ROLLBACK, ack tx, `($1::uuid IS NULL OR user_id = $1)` scoping, `SELECT 1` ping.
- **API contract (memory driver):** healthz/readyz unauth; 401 on every internal route + bad token; father owns → 201 vs cross-user → 403; staff cross-user → 201; instance-read ownership (200/403/404); dispatch listing scoping; full 422 matrix; 404 unknown; `x-request-id` echo.
- **Job factory:** registration name/interval; delegates to injected `service.runDispatchCycle`; self-configured memory job runs + logs `reminders.dispatch_cycle`.

### Fixes applied during verification (initial run 85 pass / 6 fail → all green)

1. `memory-store.test.ts` — due-selection fixture corrected (the "later" instance was created past the selection time and was not actually due); `selectDueInstances` ordering asserted against the Postgres `ORDER BY due_at ASC` contract.
2. `engine.test.ts` — same-day quiet-hours boundary corrected to the documented end-exclusive semantic (end minute is outside the window).
3. `postgres-store.test.ts` — FakePg error slot indexed to the correct statement (second `createInstance`).
4. `reminder-service.test.ts` — cap test uses strictly increasing `dueAt` so due-selection order is deterministic.
5. `routes.test.ts` — (a) 401 preHandler case now posts a schema-valid body; (b) the "extra body field" case documents Fastify's default Ajv `removeAdditional: true`: unknown body properties are **silently stripped, not rejected** — identical behavior to the content service; request still succeeds and the extra field is not echoed.
6. `reminders-internal.yaml` — `healthz`/`readyz` now declare a generic `4XX` response (mirrors `gateway.yaml`), removing the 2 `operation-4xx-response` warnings.

## 4. Contract, interpretation and boundary decisions (recorded)

- **camelCase API body** per the approved WP-021 contract; `additionalProperties: false` on every schema. Runtime caveat (same as content): Fastify's default Ajv removes unknown props rather than 422 — documented in `routes.test.ts`.
- **Renderer fail-closed:** API body has no `variables` → dispatch renders with empty `{}`; a missing token raises `ValidationError` → instance `failed`. No user content ever enters templates (R7); renderer performs no code evaluation.
- **Language (FR-047):** resolved per-user at dispatch from `user_preferences.language` (default `en`); Amharic rendering covered by test.
- **Quiet hours precedence:** user (`user_preferences.quiet_hours`) > template > defaults; windows start-inclusive / end-exclusive; fixed tz offset (UTC+3, no DST).
- **Daily cap (06 §4.14, FR-045):** counted from `reminder_dispatches` in the same store transaction as the insert (R5); default 5, range 3–5.
- **FR-163 run-id:** `UNIQUE(instance_id, run_id)` + instance `status` claim guard + `@fathersnet/idempotency` run store; duplicate scheduler runs produce no second dispatch.
- **`reminder.due`:** best-effort publish, no outbox (mirrors `services/content`); producer `reminder-engine`. Ack is simulated by the stub dispatcher — no delivery claimed (R8).
- **Recurrence (FR-044):** one-time + weekly; the schedule endpoint materializes one instance per call (weekly auto-expansion is a future event-driven flow, documented in the spec description).
- **Dedupe (FR-048):** readiness only — `dedupe_key` column + partial unique index, null in the foundation phase.

### Boundaries honored

- **No gateway `/v1/` exposure** — internal contract only; gateway untouched.
- **No auto-scheduling** from `user.enrolled` / `pregnancy.week.changed` / `milestone.reached` — deferred follow-on (requires event-schema approval); instances FK-free of `pregnancies`.
- **No real WhatsApp delivery** — stub dispatcher; providers are Phase 4 / M-02 (M-08).
- **No auth/schema changes** — `004` untouched; `user_preferences` read-only; JWT verify via the existing HS256 pattern; `staff` is the Phase-2 RBAC boundary.
- **No outbox, no new events** beyond the pre-reserved `reminder.due`.
- **Integration suites env-gated** (`REMINDERS_TEST_DATABASE_URL`) — CI/unit runs stay hermetic on the memory driver (R6).

## 5. Risks status (from plan §7)

| # | Risk | Status |
| --- | --- | --- |
| R1 | scheduler → reminders build order | **Closed** — workspace dep + `dist` entry (`library.js`); repo typecheck 20/20 on fresh-task order |
| R2 | migration outside catalog | **Closed** — migration `018` committed + pushed (`639c469`) |
| R3 | scheduler host env | **Closed** — job factory self-configures; documented in `.env.example` + compose |
| R4 | duplicate dispatch on re-run | **Closed** — `UNIQUE(instance_id, run_id)` + status guard + run-id store; duplicate-run tests |
| R5 | cap race across Addis day boundary | **Closed** — single-leader scheduler + in-transaction cap count + fixed tz |
| R6 | Redis CI isolation | **Closed** — unit tests memory-driver; integration targets Postgres |
| R7 | template rendering safety | **Closed** — no evaluation, escaping, fail-closed on missing vars |
| R8 | ack simulation | **Accepted** — documented Phase-4 handoff; no delivery claimed |
| R9 | quiet-hours/cap config | **Closed** — configurable tz offset |

## 6. Awaiting authorization

- Working tree changes (above) staged, **not committed** — awaiting separate commit authorization per AGD-002 / `milestone-2-implementation-plan.md` §2, §11.
- After commit: push → PR → review → merge → post-merge CI (Quality + `db-baseline`) per the established flow; then WP-021 → Closed with this report as the evidence artifact.
