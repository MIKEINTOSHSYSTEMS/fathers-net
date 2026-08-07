# WP-021 Implementation Plan — Reminder Engine (Foundation)

**Document:** WP-021 execution plan (planning only — no code, no migrations, no schema changes).
**Date:** 2026-08-07
**Status:** **DRAFT — awaiting Project Owner authorization to implement.** Per the governed process (AGD-002, `milestone-2-implementation-plan.md` §2 boundary rule), this plan is delivered before any code is written; implementation proceeds only on a separate authorization.
**Controlling references:** `milestone-2-implementation-plan.md` §5.11 (WP-021) and §4 Step 12; `17-final-execution-roadmap.md` line 94 (WP-021 dependencies: WP-019, WP-024); SRS FR-029/FR-041/FR-043/FR-044/FR-046/FR-047/FR-048/FR-163/FR-161; `18-implementation-verification-plan.md` §2.1 (Produced → Passed → Signed).

---

## 1. Repository impact

| Area | Impact |
| --- | --- |
| New workspace | `services/reminders` (Fastify service, port 3500, package `@fathersnet/reminders`) — reminder domain engine, store adapters, scheduler job factory, internal API. **Does not exist today.** |
| Modified | `services/scheduler` — registers the reminder dispatch job at boot (the WP-024 runtime comment at `scheduler/runtime.ts:17` reserves this hook: *"WP-021 registers its jobs here"*). One scheduler remains the single background-job host (FR-163). |
| Modified | `packages/api-spec/openapi/` — new `reminders-internal.yaml` internal contract (AR-003: spec before code). |
| Modified | `packages/db/migrations/` — new migration `018-reminders.ts`. |
| Modified | `docker-compose.yml` (reminders service block), `.env.example` (`FN_REMINDERS_*` block), `package-lock.json` (new workspace). |
| Unchanged | Gateway (`/v1/`), auth, users, content services. The reminder API is service-internal (no public `/v1/` exposure). |

## 2. Files expected to change

**New — `services/reminders/`** (mirrors the `services/content` and `services/scheduler` structure: package/tsconfig/jest/eslint/Dockerfile scaffolding + src + test):

- `package.json`, `tsconfig.json`, `tsconfig.build.json`, `jest.config.js`, `eslint.config.*`, `Dockerfile`
- `src/config.ts` — `FN_REMINDERS_*` env schema (store driver `memory\|postgres`, daily cap default 5 [range 3–5, `06` §4.14], quiet-hours defaults, tz offset, template defaults, Redis/DB URLs).
- `src/types.ts` — domain types (`ReminderTemplate`, `ReminderInstance`, `ReminderDispatch`, `Channel`, `Priority`, `ReminderStatus`).
- `src/index.ts` — boot Fastify app; `src/app.ts` — `buildApp({ config, logger, store? })`.
- `src/routes/health.ts`, `src/routes/internal.ts` — internal contract endpoints (§4).
- `src/engine/template-engine.ts` — EN/AM template rendering (FR-047), no evaluation of user input.
- `src/engine/quiet-hours.ts` — quiet-hour math (FR-029, FR-043); per-user `user_preferences.quiet_hours` + per-template config.
- `src/engine/priority.ts` — critical-priority bypass of quiet hours (FR-046).
- `src/engine/cap.ts` — per-user daily outbound cap.
- `src/engine/lead-time.ts` — lead-time scheduling (FR-043).
- `src/engine/recurrence.ts` — one-time and recurring template expansion (FR-044).
- `src/engine/reminder-service.ts` — orchestration: due selection → render → quiet hours → cap → dispatch → ack → publish.
- `src/store/types.ts` (`ReminderStore` interface, M-08), `src/store/postgres-store.ts`, `src/store/memory-store.ts`, `src/store/index.ts` (factory).
- `src/services/dispatcher.ts` — `ChannelDispatcher` interface + **stub dispatcher** (records simulated ack; real providers are Phase 4 / M-02, deferred).
- `src/services/events.ts` — best-effort `reminder.due` publisher (producer `reminder-engine`, mirrors `services/content/src/services/events.ts`).
- `src/jobs/reminders-dispatch-job.ts` — `createRemindersJobs({ logger })` → `JobDefinition[]`; self-configures from env so the scheduler host needs no new scheduler-config keys.
- Tests: `test/engine/*.test.ts`, `test/store/*.integration.test.ts` (Postgres), `test/jobs/*.integration.test.ts`, `test/routes/*.test.ts`.

**Modified — `services/scheduler/`:**

- `src/index.ts` — build `const jobs = createRemindersJobs({ logger })` and pass `jobs` into `createSchedulerRuntime`.
- `package.json` — add workspace dependency `@fathersnet/reminders`.
- `src/config.ts` — no change required (reminder job factory reads its own `FN_REMINDERS_*` env).

**New — elsewhere:** `packages/api-spec/openapi/reminders-internal.yaml`; `packages/db/migrations/018-reminders.ts`; `docker-compose.yml` block; `.env.example` block.

## 3. Database impact

New migration `018-reminders.ts` (numbering rationale: `05` §4.2 catalog rows 001–017 are reserved for other phases — row **012 is already `campaigns`** — so WP-021 **appends row 018**, following the §4.3 beyond-catalog append precedent; the file sorts deterministically after all existing migrations 001–004, 011). Tables, all CHECK-based enums per existing style (`001`–`004`, `011`):

| Table | Purpose | Key columns / constraints |
| --- | --- | --- |
| `reminder_templates` | Template library (FR-044, FR-047) | `id` (uuid PK `gen_random_uuid()`), `code` (unique, e.g. `anc_visit_t1`, `vaccination`, `postnatal`, `birth_prep`), `channel` (CHECK `whatsapp`), `priority` (CHECK `normal\|critical`), `title_en/am`, `body_en/am`, `lead_time_minutes`, `quiet_hours` (JSONB, FR-043), `recurrence` (JSONB, one-time/recurring, FR-044), `pregnancy_week` (CHECK 1–45, FR-041), `active`, `created_at`, `updated_at` |
| `reminder_instances` | Materialized scheduled instances | `id`, `template_id` FK, `user_id` FK `users(id)` ON DELETE CASCADE (FR-007/FR-128 erasure), `due_at` (TIMESTAMPTZ), `status` (CHECK `scheduled\|dispatched\|skipped_quiet_hours\|rate_limited\|failed\|expired`), `priority`, `channel`, `dedupe_key` (partial unique index; FR-048 readiness), `dispatched_at`, `acknowledged_at`, `last_error`; index `(status, due_at)` for due selection |
| `reminder_dispatches` | Append-only dispatch/ack log; per-user cap counting; run-id idempotency (FR-163) | `id`, `instance_id` FK, `user_id` FK (CASCADE), `run_id` (TEXT, scheduler run-id binding), `channel`, `priority`, `dispatched_at`, `ack_received_at`, `ack_payload` (JSONB), `status`; **`UNIQUE(instance_id, run_id)`** → DB-level duplicate-run guard; index `(user_id, dispatched_at)` for daily cap counting |

**No changes** to `004`: `user_preferences.quiet_hours` (JSONB) already exists for per-user quiet hours (FR-038/FR-043).

**Governance prerequisite (milestone §10.8):** `reminder_templates` etc. are engineering tables **beyond the `05` §4.2 catalog**. Per §10.8 these require a `05` §4.2 catalog update + schema approval + decision-log entry before their phase lands. This is a **gate**: the migration is authored during implementation only after that catalog update (or explicit Project Owner sign-off) is granted.

## 4. API impact

Service-internal contract only (not via gateway `/v1/`). New `packages/api-spec/openapi/reminders-internal.yaml`, added **before** code (AR-003), contract-lint gated in CI:

- `GET /healthz`, `GET /readyz` — standard.
- `POST /internal/reminders/instances` — schedule a reminder instance (body: `templateCode`, `userId`, `dueAt`; optional `priority` override). This is the "schedule" leg of the WP-021 evidence flow.
- `GET /internal/reminders/instances/:id` — instance status.
- `GET /internal/reminders/dispatches?userId=&limit=&offset=` — dispatch/ack log (pagination per `06` §3.3).

Auth: bearer/JWT pass-through consistent with peer services; ownership checks (cross-cutting control `02` §5) enforced on every endpoint.

## 5. Event impact

- **Publish `reminder.due`** after a successful dispatch+ack, using producer **`reminder-engine`** — already defined in `packages/events/src/vocabulary.ts` with `phase2` availability. Best-effort publish, no outbox in this phase (mirrors `services/content`); a per-service outbox would require a `05` §4.2 catalog row + approval (`services/content/src/services/events.ts` caveat).
- **Deferred:** `reminder-engine`'s consumer roles (`user.enrolled`, `pregnancy.week.changed`, `milestone.reached` auto-scheduling) are NOT part of this foundation phase — they require event-schema approval and are a WP-021 follow-on. WP-021 generates content + schedules instances (via §4) + tracks dispatch; it does not yet auto-materialize from pregnancy events.

## 6. Dependencies

- **WP-024 (24b scheduler)** — **DONE** (merged `42617b6`). Job host: `createSchedulerRuntime({ config, logger, jobs })`; run-id binding via `@fathersnet/idempotency` (FR-163); memory driver keeps dev/CI hermetic (M-08).
- **WP-019 (pregnancy engine)** — **DONE**. `pregnancies`/`babies` tables (week 1–45, `edd`) are the future data source for week-based reminders (FR-041); this phase reads nothing new but keeps instances FK-free of pregnancies to avoid coupling.
- **Platform packages:** `config`, `errors`, `logger`, `test-utils`, `events`, `idempotency`, `db`.
- **Existing schema:** `users` (004 FK), `user_preferences.quiet_hours`.
- **Prerequisite gate:** `05` §4.2 catalog update + approval for the reminder tables (§3, milestone §10.8).
- **Deferred:** real channel dispatch providers (Phase 4 / M-02), cross-channel dedup (FR-048), auto-scheduling from events.

## 7. Risks

| # | Risk | Mitigation |
| --- | --- | --- |
| R1 | Cross-service workspace dependency (scheduler → `@fathersnet/reminders`) breaks build order in turbo | Workspace dep + turbo task graph (`reminders:build` before `scheduler:build`); verify `package.json` `main`/`types` point to `dist`; CI Quality catches. |
| R2 | Reminder tables outside the `05` §4.2 catalog (§10.8) — migration blocked without approval | Plan records the gate; migration authored only after catalog update/sign-off. |
| R3 | Scheduler host process needs reminder env (`FN_REMINDERS_*`, `FN_DATABASE_URL` when postgres) | Job factory self-configures from env; documented in `.env.example` + compose block; no scheduler-config schema change. |
| R4 | Duplicate dispatch on scheduler re-run (FR-163) | `UNIQUE(instance_id, run_id)` + instance `status` guard + `@fathersnet/idempotency`; duplicate-run no-duplicates test. |
| R5 | Per-user cap race/counting across the Addis day boundary | Single-leader scheduler serializes dispatch; cap counted from `reminder_dispatches` in the same store transaction as the insert; fixed tz offset (UTC+3, no DST). |
| R6 | Redis FLUSHALL CI isolation (post-WP-024b fix) | Unit tests use memory driver; reminder integration suites target Postgres (compose), not shared Redis; coverage already serialized (`--concurrency=1`). |
| R7 | Template rendering safety | Templates are internal; renderer performs no code evaluation; escaping applied; no user content in templates. |
| R8 | Ack is simulated (stub dispatcher) | Documented Phase-4 handoff; ack callback endpoint reserved for real providers; no false claim of delivery. |
| R9 | Quiet-hours/cap misconfig across regions | tz offset configurable (`FN_REMINDERS_TZ_OFFSET_MINUTES`); Ethiopia has no DST; revisit if regions expand. |

## 8. Testing strategy

- **Engine unit (pure, no I/O):** template render (EN/AM, missing variables, escaping); quiet-hours math (inside/outside window, boundary minutes, per-user vs per-template config, **critical bypass** FR-046); cap logic (under/at/over limit, next-day reset); lead-time (due in past → dispatch now; future → skip); recurrence expansion (one-time + recurring FR-044, stop-week).
- **Store integration (Postgres):** instance CRUD, due selection `(status, due_at)`, dispatch insert with `UNIQUE(instance_id, run_id)` duplicate rejection, `countDispatches(userId, day)`, status transitions.
- **Job integration:** schedule instances via internal API → run `reminders.dispatch` job → instances `dispatched`, dispatch rows acked via test-double, `reminder.due` observed on the bus; **duplicate-run no-duplicates test** (same run slot, no second dispatch — FR-163/FR-161); per-user cap reached → later instances `rate_limited`.
- **API tests (memory driver, hermetic):** internal contract endpoints + contract-lint green.
- **Evidence (§5.11):** schedule → dispatch (ack via test-double) → ack flow green against Postgres; duplicate-run no-duplicates test report; coverage ≥ 80% lines (scheduler precedent 89.01%); Quality CI + `db-baseline` green.

## 9. Migration requirements

- One new migration `018-reminders.ts` (§3), reversible (`down` drops `reminder_dispatches`, `reminder_instances`, `reminder_templates` in dependency order).
- Validated by CI `db-baseline` on ephemeral Postgres; `migrate:up`/`migrate:down` logged per `18` §2.1.
- **Authoring gate:** `05` §4.2 catalog entry + schema approval + decision-log entry (milestone §10.8) granted before the migration file is created. No `004` changes (quiet hours already JSONB there).
- No new enums/types outside PG-native types; CHECK constraints and `pgm.sql` style consistent with `001`–`004`, `011`.

---

## Approval Record

- [ ] Plan reviewed by Project Owner.
- [ ] Separate authorization granted to implement WP-021 (this plan covers planning only).

Awaiting authorization; implementation will proceed one governed step at a time (commit → push → PR → review → merge → post-merge CI) per the established flow.
