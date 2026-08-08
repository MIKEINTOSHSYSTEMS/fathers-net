# WP-024c Implementation Progress Report — Per-Service Transactional Outbox

**Document:** WP-024c implementation progress report (evidence per `18` §2.1 Produced → Passed → Signed).
**Date:** 2026-08-08
**Status:** **IMPLEMENTATION COMPLETE 2026-08-08.** Implementation committed (`d640a576e20d64821481786e7240ad10c7332da1` `feat(wp-024c): implement transactional outbox`) and pushed to `origin/develop` (separate commit + push authorizations; precommit hook green). **PR structurally not applicable** — direct-to-develop precedent (WP-021/WP-022/WP-023; a same-commit branch has zero diff). No merge performed. WP-024c closure documentation is the final remaining closure step.
**Controlling references:** `wp-024c-implementation-plan.md` (approved plan); `milestone-2-implementation-plan.md` §5.3 (WP-024) and §4 Step 13 (M2 exit); `03-system-architecture-plan.md` §4.6 (D-03); `06-backend-development-plan.md` §2.2; `05-database-implementation-plan.md` §4.2 row 019; `decision-log.md` D-11; `packages/events/src/outbox.ts` (canonical `OUTBOX_TABLE_DDL`, `PostgresOutboxReader`, `OutboxRelay`); `18-implementation-verification-plan.md` §2.1.

---

## 1. Scope delivered

Per-service adoption of the canonical transactional-outbox pattern (D-03, `06` §2.2) across the four in-scope services — domain mutation + outbox INSERT in the **same DB transaction**; the `OutboxRelay` publishes only committed rows. This is infrastructure/outbox-adoption work: it changes *how* the eight in-scope events are published, not *what* events exist or *when* domain behavior occurs.

- **users** — `user_outbox`; TX-wrapped published-write paths (`createUser`, `updateProfile`, `upsertPregnancy`, `upsertPreferences`, `insertConsent`); events `user.enrolled`, `user.profile.updated`, `user.consent.changed`; pregnancy events `pregnancy.week.changed`, `milestone.reached` (producer `pregnancy-engine`).
- **content** — `content_outbox`; `ContentStore.transition` TX; `content.published` (approve, 2 rows — one per language, idempotency key `${id}:${version}`), `content.retired` (archive, only when previously published).
- **reminders** — `reminder_outbox`; outbox joined to `ackDispatch` (payload `providerRef`/`simulated` exist only after the channel send; first ack wins, stale-terminal ack appends nothing); `reminder.due` (producer `reminder-engine`).
- **journal** — `journal_outbox`; **journal's first explicit client TX** — `JournalStore.create` (`BEGIN → INSERT entry → insertOutbox → COMMIT`); durable entry id generated via `randomUUID()` in `JournalService.createEntry` so the `journal.entry.created` outbox row references it in the same TX (D-03; `CreateJournalEntryInput.id?` fallback `randomUUID()` in Postgres, `input.id ?? randomUUID()` in memory).

## 2. Files changed (committed `d640a57`, 54 files, 2349 insertions / 753 deletions)

**Users (14):** `src/app.ts`, `src/routes/index.ts`, `src/services/{users-service,pregnancy-service,consents-service}.ts`, `src/services/events.ts`, `src/services/store/{types,postgres-store,memory-store}.ts`, `test/{users-service,pregnancy-service,consents-service,postgres-store,routes}.test.ts`.

**Content (10):** `src/app.ts`, `src/routes/index.ts`, `src/services/content-service.ts`, `src/services/events.ts`, `src/services/store/{types,postgres-store,memory-store}.ts`, `test/{content-service,postgres-store,routes}.test.ts`.

**Reminders (13):** `src/app.ts`, `src/engine/reminder-service.ts`, `src/jobs/reminders-dispatch-job.ts`, `src/services/events.ts`, `src/services/relay.ts` (new), `src/store/{types,postgres-store,memory-store,index}.ts`, `test/{reminder-service,postgres-store,memory-store,routes}.test.ts`.

**Journal (12):** `src/app.ts`, `src/services/{journal-service,events}.ts`, `src/services/relay.ts` (new), `src/store/{types,postgres-store,memory-store,index}.ts`, `test/{journal-service,postgres-store,memory-store,routes}.test.ts`.

**Migration/governance/tests (5):** `packages/db/migrations/021-outbox.ts` (created under its own prior gate — unchanged this step), `packages/db/test/migrations.integration.test.ts` (WP-024c bookkeeping/tests), `implementation-plan/05-database-implementation-plan.md` + `decision-log.md` (previously authorized catalog row 019 + D-11 — committed exactly as authorized), `implementation-plan/wp-024c-implementation-plan.md` (previously authorized plan).

## 3. Transactional boundaries and outbox writes

`insertOutbox(client, entries)` — explicit 9-column INSERT (`event_id, event_type, producer, schema_version, occurred_at, aggregate_type, aggregate_id, idempotency_key, payload`), `JSON.stringify(payload)`, DB defaults for `id/status/attempts/available_at/created_at/published_at/last_error` — executes **inside** the domain TX:

- users: `createUser`, `updateProfile`, `upsertPregnancy`, `insertConsent` (consents-service `withdraw` joins `user.consent.changed` state `withdrawn`).
- content: `transition` (approve → 2 outbox rows; archive → 1 row when previously published).
- reminders: `ackDispatch` → `reminder_outbox` in the ack TX; memory appends `outboxLog` only on successful ack.
- journal: `create` → `journal_outbox` in the create TX (`BEGIN → INSERT → insertOutbox → COMMIT`, `ROLLBACK` on failure).

Commit failure rolls back both the domain write and the outbox row (verified by hermetic test for each store). No independent TX can produce a domain mutation without its outbox record.

## 4. Relay wiring / start / stop

Per service, in `app.ts` under `usePostgres && !options.store` (never with an injected test store): build + connect a `Client` on `FN_DATABASE_URL`; `OutboxRelay({ bus: eventBus, reader: new PostgresOutboxReader(client, '<service>_outbox'), logger, onDead: async (row, error) => logger.error('outbox.dead_alert', 'Outbox row dead-lettered (OR-008)', {…}) })`; `relay.start()`. `onClose` stops the relay + client before store/eventBus/redis cleanup. Reminders additionally: the job factory's `buildOwnedService` starts a fire-and-forget relay when `FN_STORE_DRIVER === 'postgres'` (scheduler host terminates the process, releasing resources). Journal/reminders expose lifecycle handles (`createJournalRelay`/`createRemindersRelay` returning `{ relay, client, start, stop }`) stopped in `onClose`. **No new relay architecture, no scheduler jobs** (prompt/pulse/legacy remain WP-037), `services/scheduler` unchanged.

## 5. Approved event vocabulary

Only the pre-registered types (all in `packages/events/src/vocabulary.ts`): `user.enrolled`, `user.profile.updated`, `user.consent.changed`, `pregnancy.week.changed`, `milestone.reached` (users); `content.published`, `content.retired` (content); `reminder.due` (reminders); `journal.entry.created` (journal). **No new event types.** Canonical outbox rows carry no `request_id` (plan §9); producers per `vocabulary.ts` (`user-service`, `content-service`, `reminder-engine`, `journal-service`, `pregnancy-engine`). `user.deletion.requested` remains registered with no emission site (informational, unchanged). Direct best-effort bus publishes at the in-scope sites were **replaced** by the transactional outbox write; services no longer hold an `eventBus` seam.

## 6. Verification results (local, all green)

| Gate | Result |
| --- | --- |
| `services/users` typecheck + lint + jest | clean / clean / **7 suites passed · 85 passed · 9 skipped · 1 suite skipped** |
| `services/content` typecheck + lint + jest | clean / clean / **4 suites · 55 passed · 7 skipped · 1 suite skipped** |
| `services/reminders` typecheck + lint + jest | clean / clean / **6 suites · 94 passed · 8 skipped · 1 suite skipped** |
| `services/journal` typecheck + lint + jest | clean / clean / **5 suites · 47 passed · 6 skipped · 1 suite skipped** |
| `packages/db` lint + typecheck | clean / clean |
| `packages/db` `npm run test:migrations` (live Postgres; up-all → down-all → clean → up-all cycle) | **19 passed** |
| `packages/events` jest | **28 passed** |
| `packages/events` `outbox.integration.test.ts` (live Postgres + Redis) | **4 passed** — publish-on-commit, no-duplicates-on-restart, retry→dead-letter+`onDead` (OR-008), recovered-row-exactly-once |
| Journal + content Postgres store integration suites (live DB, env-gated) | **journal 6/6 · content 7/7 passed** |

Hermetic FakePg store tests per service assert TX ordering (BEGIN → … → insertOutbox → COMMIT; ROLLBACK on failure) and outbox INSERT value arrays; memory stores surface `outboxLog` asserted in unit tests.

### Known pre-existing gated integration failures (outside WP-024c scope, not fixed)

- **users (2)** — `postgres-store.integration.test.ts` expects `edd: '2025-10-01'`; `parsePregnancy` (`postgres-store.ts:99`) returns `'2025-09-30'` because a `DATE` column roundtrips through `toISOString().slice(0,10)` (UTC+3 host). Pre-existing store behavior; code path untouched by WP-024c.
- **reminders (1)** — `postgres-store.integration.test.ts` expects a 2024 `scheduled` row excluded from a 2025 due-cutoff `selectDueInstances`; the store selects all `scheduled` rows due at/before the cutoff (cleanup is `expireStaleInstances`). Pre-existing test-vs-store semantics; `selectDueInstances` untouched.

Both suites are env-gated (`<SERVICE>_TEST_DATABASE_URL`, never set in CI) and were skipped in every green baseline run.

## 7. Migration 021 and database status

- **`packages/db/migrations/021-outbox.ts`** — created under the separate migration-021 authorization gate (2026-08-08) and **unchanged** by WP-024c implementation (committed blob hash `6aaedd29…29ed2` equals the audited pre-implementation version). Four tables (`user_outbox`, `content_outbox`, `reminder_outbox`, `journal_outbox`), 16 canonical columns each, partial pending index `idx_<table>_pending`, `status` CHECK (pending/published/failed/dead), no FKs/triggers/unique constraints/extra indexes.
- **Catalog row 019 + D-11** — appended/written at the prior governance/schema gate; committed exactly as previously authorized (no WP-024c modifications).
- **Database** — migration 021 applied on the local dev Postgres (`pgmigrations` 001–004, 011, 018, 019, 020, 021); all four outbox tables verified with the canonical 16 columns. No database operation performed during WP-024c commit/push.

## 8. Boundary confirmations

- No auth, scheduler-architecture, prompt/pulse/legacy, unrelated-service, unrelated-schema, vocabulary, or domain-feature changes.
- `packages/events`, `packages/idempotency`, `services/scheduler` untouched by this WP (WP-024a/24b shipped their pieces).
- No migration/schema changes beyond the pre-approved `021-outbox`.

## 9. Commit + push status

- **Commit:** `d640a576e20d64821481786e7240ad10c7332da1` — `feat(wp-024c): implement transactional outbox` — 54 files, 2349 insertions / 753 deletions; parent `486f1cd6bda1bcd161e3d6c06a3a7cea68bb7072`.
- **Push:** pushed to `origin/develop`; `develop == origin/develop == d640a57`. Working tree clean. No branch created; no PR (direct-to-develop precedent); no merge.

## 10. Final implementation status

**WP-024c IMPLEMENTATION: COMPLETED** — committed `d640a57`, pushed to `origin/develop`. WP-024 (24a + 24b + 24c) and therefore **Phase 2 (WP-015…WP-024) implementation work is complete**. Milestone 2 exit verification (milestone-2 §4 Step 13) has not yet been performed. WP-025 / Phase 3 not started.
