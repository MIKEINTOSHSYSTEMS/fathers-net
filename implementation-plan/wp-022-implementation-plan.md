# WP-022 Implementation Plan — Journal Service

**Document:** WP-022 execution plan (planning only — no code, no migrations, no schema changes).
**Date:** 2026-08-07
**Status:** **DRAFT — awaiting Project Owner authorization to implement.** Per the governed process (AGD-002, `milestone-2-implementation-plan.md` §2 boundary rule), this plan is delivered before any code is written; implementation proceeds only on a separate authorization.
**Controlling references:** `milestone-2-implementation-plan.md` §5.9 (WP-022) and §4 Step 9; `17-final-execution-roadmap.md` line 94 (WP-022 dependency: WP-017 — DONE); SRS §12.9 (journal API group), §13.3.6/§13.3.7 (`journal_entries`/`journal_media`); SRS FR-051…FR-058, FR-126, FR-128, FR-039, FR-161; `05-database-implementation-plan.md` §2.6/§2.7/§4.2 row 006; `06-backend-development-plan.md` Phase G; `18-implementation-verification-plan.md` §2.1 (Produced → Passed → Signed).

---

## 1. Scope definition

**In scope (Phase 2, WP-022):**

- Text journal entries with chronological timeline, private by default (FR-051, FR-052).
- Explicit per-entry opt-in sharing with the linked partner (FR-039, `shared_with_partner`).
- User-initiated portable export (FR-057, FR-128) — synchronous **JSON** artifact; PDF rendering deferred to Phase 4 (WP-060).
- Schema readiness for prompt-linked entries: `entry_type` supports `text | voice | photo | prompt_response | legacy` (FR-053, FR-054) at the **DB layer only**; the Phase 2 API creates `text` entries only.
- Best-effort `journal.entry.created` publication (research/AI ingestion readiness, FR-056/FR-113).
- Ownership-scoped access on every endpoint (FR-126): owner-only reads/writes; shared-partner read only after explicit opt-in.

**Out of scope (explicitly deferred — Phase 4 WP-060 / other phases):**

- Voice/photo media pipeline: `POST /v1/journal/media`, signed uploads, object storage (§7.4.2), transcription (FR-055) — Phase 4 (WP-060).
- AI tagging (FR-056), admin review queue `journal_flags` (FR-058) — Phase 4.
- Prompt-response auto-linking and legacy letters (`prompt_responses`, migration 007) — Phase 3 (WP-037); FR-161 dedup enforced there.
- Offline sync / encrypted local store (FR-133, FR-136) — mobile Phase 4.
- Consuming `user.deletion.requested` — erasure is delivered by FK `ON DELETE CASCADE` (`05` §5.1); no consumer in this phase.

**Phase 2 stores metadata + text only** (`milestone-2` §5.9). `journal_media` is created per the `05` §4.2 catalog row 006 but is written by no Phase 2 code path (zero rows until WP-060).

## 2. Database migration plan

One new migration **`packages/db/migrations/019-journal.ts`** (node-pg-migrate, `pgm.sql` style mirroring `018-reminders.ts`).

**Numbering rationale:** `05` §4.2 catalog rows 001–017 are reserved for other phases; row **006 is `journal`** (`journal_entries`, `journal_media`, depends on 002 `users`). WP-021 already used 018; WP-022 **appends row 019** following the same append precedent (decision-log D-10). File sorts deterministically after all existing migrations (001–004, 011, 018).

| Table | Purpose | Key columns / constraints |
| --- | --- | --- |
| `journal_entries` | Father diary entries (`05` §2.6; FR-051…FR-055) | `id` UUID PK `gen_random_uuid()`; `user_id` UUID NOT NULL REFERENCES `users(id)` ON DELETE **CASCADE** (FR-007/FR-128 erasure); `entry_type` CHECK (`text`\|`voice`\|`photo`\|`prompt_response`\|`legacy`); `content` TEXT (text body/transcription); `pregnancy_week` CHECK 1–45 (nullable); `shared_with_partner` BOOLEAN NOT NULL DEFAULT **false** (private by default, FR-052); `created_at`/`updated_at` TIMESTAMPTZ |
| `journal_media` | Media attachments (`05` §2.7; FR-018/019/055, AR-023) | `id` UUID PK; `journal_entry_id` UUID NOT NULL REFERENCES `journal_entries(id)` ON DELETE CASCADE; `media_type` CHECK (`voice`\|`photo`\|`document`); `storage_path` TEXT (**anonymized**, never phone-based — FR-022, §7.4.2); `size_bytes` BIGINT; `transcript` TEXT nullable; `transcript_status` CHECK (`pending`\|`done`\|`failed`) default `pending` |

**Indexes:** `CREATE INDEX idx_journal_entries_user_created ON journal_entries (user_id, created_at DESC)` — journal timeline (SRS §13.4, NFR-007). No further indexes in Phase 2.

**Down:** pure table drops in dependency order (`journal_media`, then `journal_entries`); no triggers/functions.

**Authoring gate:** NONE required — both tables are inside the `05` §4.2 catalog (row 006); no beyond-catalog tables (`journal_flags`, `transcription_jobs`, `data_export_jobs` are avoided by the Phase 2 scope, so milestone §10 item 8 does not gate this migration). No changes to `002`–`004`, `011`, `018`.

## 3. Files expected to change

**New — `services/journal/`** (mirrors `services/content` structure: package/tsconfig/jest/eslint/Dockerfile scaffolding + src + test):

- `package.json`, `tsconfig.json`, `tsconfig.build.json`, `jest.config.js`, `eslint.config.*`, `Dockerfile`
- `src/config.ts` — `FN_JOURNAL_*` env schema (store driver `memory\|postgres`, port, Redis/DB URLs, pagination defaults — cursor token secrecy).
- `src/types.ts` — domain types (`JournalEntry`, `EntryType`, `EntryCreateInput`, `EntryUpdateInput`, `EntryListQuery`).
- `src/index.ts` — boot Fastify app; `src/app.ts` — `buildApp({ config, logger, store? })`.
- `src/routes/health.ts`, `src/routes/entries.ts` — health + entry endpoints (§5).
- `src/middleware/auth.ts`, `src/middleware/errors.ts`, `src/middleware/request-id.ts` — peer pattern from `services/content`.
- `src/services/journal-service.ts` — orchestration: create/list/get/update/delete/share/export + privacy enforcement + publish.
- `src/services/events.ts` — best-effort `journal.entry.created` publisher (producer `journal-service`, mirrors `services/content/src/services/events.ts`; **no PII in payload**).
- `src/services/export.ts` — portable JSON artifact builder (FR-057/FR-128): owner entries only, chronological, schema-versioned envelope.
- `src/store/types.ts` (`JournalStore` interface, M-08 test-double pattern), `src/store/postgres-store.ts`, `src/store/memory-store.ts`, `src/store/index.ts` (factory).
- Tests: `test/journal-service.test.ts`, `test/store/memory-store.test.ts`, `test/store/postgres-store.test.ts` + `.integration.test.ts` (Postgres, env-gated), `test/routes/entries.test.ts`, `test/services/export.test.ts`.

**New — elsewhere:** `packages/api-spec/openapi/journal.yaml` (replace the AR-003 skeleton — paths land with this WP per milestone §5.9); `packages/db/migrations/019-journal.ts`; `docker-compose.yml` block (mirrors `reminders`); `.env.example` block (`FN_JOURNAL_*`).

**Modified:** `packages/api-spec/openapi/gateway.yaml` (aggregate journal spec; matches content aggregation pattern); `packages/api-spec/dist` (turbo build); `package-lock.json` (new workspace); `implementation-status.md` (WP-022 row → In Progress when implementation starts).

**Unchanged:** `services/scheduler` (no jobs — §7), `services/gateway` (business `/v1/*` proxying follows the existing Phase 2 pattern), `packages/events` (vocabulary already contains `journal.entry.created`).

## 4. Service architecture

- Fastify 5 service, package `@fathersnet/journal`, `FN_PORT` env-driven, monorepo workspace wired into turbo (`package.json` `main`/`types` → `dist`).
- **Store adapter pattern (M-08):** `JournalStore` interface with `memory-store` (hermetic dev/CI) and `postgres-store` (production), factory selected by `FN_JOURNAL_STORE_DRIVER`.
- **Domain service** owns all rules (privacy matrix, share opt-in, export scoping, timeline order) and emits events — routes stay thin (content/reminders precedent).
- **Privacy enforcement core (`journal-service`, FR-126/FR-052):**
  - `findByIdForUser(entryId, userId)` returns the entry iff `entry.user_id === userId` OR (`entry.shared_with_partner === true` AND `userId` is the linked partner of `entry.user_id` resolved via `pregnancies.partner_user_id`).
  - All other cases → **404** (invisibility, not 403 — non-owned entries must not reveal existence).
  - Every write (PATCH/DELETE/share) is **owner-only**; `user_id` comes from the token `sub` claim, never the body.
- Auth: bearer/JWT pass-through + validation consistent with peer services (`middleware/auth.ts`).
- **Export:** synchronous; builds a JSON artifact of the owner's entries (id, type, week, content, timestamps — no partner-shared entries of others, no media). No job table, no background worker (avoids the `data_export_jobs` beyond-catalog gate, §10).

## 5. API boundaries

Public contract `packages/api-spec/openapi/journal.yaml` (spec **before** code, AR-003), defined under `/v1/journal` (SRS §12.9). `contract:lint` gated in CI. Responses camelCase (matching the WP-017 naming drift the OpenAPI contract documents in snake_case), errors via the common envelope, `4XX`/`healthz`/`readyz` per the api-spec platform pattern.

| Endpoint | Method | Authz | Purpose |
| --- | --- | --- | --- |
| `/v1/journal/entries` | GET | self | List owner entries, **private by default** (FR-052); chronological `created_at DESC`; **cursor pagination** (high-volume stream per `06` §3.3 — `?cursor=`, response `{ items, next_cursor, total }`) |
| `/v1/journal/entries` | POST | self | Create **text** entry (body: `content` required, `pregnancy_week?` 1–45, `shared_with_partner?` default false); sets `entry_type='text'`; 201 |
| `/v1/journal/entries/:id` | GET | self/partner | Get entry — owner or explicitly shared partner; else 404 |
| `/v1/journal/entries/:id` | PATCH | self | Update `content`, `pregnancy_week`, `shared_with_partner` (owner only) |
| `/v1/journal/entries/:id` | DELETE | self | Delete entry (owner only; CASCADE covers media) |
| `/v1/journal/entries/:id/share` | POST | self | Explicit opt-in share with linked partner (FR-039) → `shared_with_partner = true` |
| `/v1/journal/export` | GET | self | Portable JSON artifact of owner entries (FR-057/FR-128) |
| `/v1/journal/media` | POST | — | **NOT in Phase 2** (signed upload needs object storage, §7.4.2; WP-060). Spec reserves the path; route returns 501 until Phase 4. |

**Interpretation decisions to record in `decision-log.md` at implementation start:**
- Phase 2 export is a synchronous JSON artifact (FR-057/FR-128); PDF rendering and async job/`data_export_jobs` deferred (avoids §10.8 gate).
- Non-owned reads return 404 (privacy invisibility), not 403.
- `POST /:id/share` and `PATCH shared_with_partner` are both supported; `share` is the explicit opt-in shortcut.

## 6. Event boundaries

- **Publish `journal.entry.created`** on successful create, producer **`journal-service`** — already defined in `packages/events/src/vocabulary.ts` with `phase2` availability, consumers `ai-orchestration`, `research-service`.
- **Payload (no PII — FR-022, FR-123):** `{ entry_id, type, week, consent flags }` per vocabulary line — the journal **body/content is never published**.
- **Idempotency key:** entry id (canonical per vocabulary).
- **Best-effort publish, no outbox** (mirrors `services/content` and `services/reminders`); a per-service outbox would require a `05` §4.2 catalog row + approval — WP-024a outbox relay remains the upgrade path.
- **No new vocabulary entries** and **no new consumers** in Phase 2. `media.processed` (transcription) and `prompt.response.captured` remain `reserved` for Phase 4 / Phase 3.

## 7. Scheduler impact

**None.** WP-022 registers no scheduler jobs:
- Prompt-linked auto-entries (FR-053) are Phase 3 (WP-037) and are created by the conversation/prompt pipeline, not by a scheduler job.
- Export is synchronous (§5) — no background export job.
- `services/scheduler` and `scheduler/runtime.ts` are **unchanged**; the single background-job host stays WP-021-only for now.

## 8. Testing strategy

- **Unit — service/privacy matrix (core, milestone §5.9 evidence):** owner-read OK; **stranger 404** (invisible without ownership — privacy-by-default); shared-partner read OK only after `shared_with_partner=true`; write by non-owner rejected; timeline ordering `created_at DESC`; create sets `entry_type='text'` and `shared_with_partner=false` by default; share opt-in sets flag; share/unshare toggle via PATCH; `user_id` from token, never body.
- **Export:** artifact is valid schema-versioned JSON; contains owner entries in chronological order; excludes media and others' shared entries; deterministic/reproducible (FR-057/FR-128 portability).
- **Store unit (memory):** CRUD, `findByIdForUser` privacy filter, partner resolution, cursor pagination boundary behavior.
- **Store integration (Postgres, env-gated `JOURNAL_TEST_DATABASE_URL` — reminders precedent):** insert/read/update/delete, `(user_id, created_at DESC)` timeline query, partner-join query via `pregnancies.partner_user_id`, CASCADE on user delete (FR-128).
- **Routes (memory driver, hermetic):** all §5 endpoints via Fastify inject; 401 without token; 404 non-owned; 201 on create; schema validation (required `content`, week bounds); **unknown-body-prop behavior documented** (Fastify default Ajv `removeAdditional: true` strips rather than 422 — content/reminders precedent); `healthz`/`readyz`.
- **Event:** stub bus records exactly one `journal.entry.created` per create with payload `{ entry_id, type, week, consent flags }` — assert no `content` field.
- **Contract:** `contract:lint` green for the filled `journal.yaml`; gateway aggregate valid.
- **Evidence (§5.9):** journal ownership-scope test report (stranger 404 + partner matrix); export artifact audited; coverage ≥ 80% lines; Quality CI (typecheck/lint/build/test/coverage) + `contract:lint` green.

## 9. Dependencies

- **WP-017 (users identity) — DONE** — the only hard prerequisite (roadmap `17` line 94). `users` FK and token `sub` claims are available.
- **Schema:** `002 users`, `003 pregnancies` (partner linkage `pregnancies.partner_user_id` for shared reads), `005`+ — `05` §4.2 row 006, depends on 002 only.
- **Platform packages:** `config`, `errors`, `logger`, `test-utils`, `events` (vocabulary already has `journal.entry.created`), `db`.
- **Gateway/api-spec:** `packages/api-spec` aggregation pattern; no new OpenAPI service files beyond `journal.yaml`.
- **No new npm dependencies** expected (no media/transcription/PDF libs in Phase 2 — deliberate scope cut).
- **Deferred:** media pipeline + object storage (WP-060), PDF export, prompt auto-link (WP-037), admin review queue (FR-058), deletion-event consumer.

## 10. Risks

| # | Risk | Mitigation |
| --- | --- | --- |
| R1 | **Privacy regression** — journal entries are high-sensitivity PII (FR-123); a single leak path breaks privacy-by-default (FR-052) | Ownership filter implemented at the store level (`findByIdForUser`), never in routes; 404-invisibility; partner read gated on `shared_with_partner` AND a real `pregnancies.partner_user_id` link; event payload carries no content; stranger-404 test in CI. |
| R2 | **Partner-scope ambiguity** — `pregnancies.partner_user_id` may be null/multiple (journey not yet linked) | Partner read resolves through the active pregnancy record only; null/absent → owner-only access. If the linkage proves ambiguous during implementation, fall back to owner-only reads and defer shared reads — recorded as a decision-log note. |
| R3 | **Scope creep into deferred FRs** (media/transcription/tagging/review) | Out-of-scope list in §1 is explicit; routes for deferred features return 501; no `journal_flags`/`transcription_jobs`/`data_export_jobs` tables (avoids §10.8 gate). |
| R4 | **Export size/perf** (NFR-007) on large timelines | Synchronous JSON with bounded artifact; full export documented for Phase 4 async path; pagination prevents unbounded reads in the list path. |
| R5 | **`journal_media` created but unused** in Phase 2 | Accepted per catalog row 006 fidelity; reversible `down`; zero writes until WP-060; covered by a store-contract existence test. |
| R6 | **Cross-service config/env drift** | `FN_JOURNAL_*` block in `.env.example` + compose block; store driver default `memory` keeps dev/CI hermetic (M-08). |
| R7 | **Pagination cursor misuse** (prediction vs offset) | Cursor = opaque token derived from `(user_id, created_at, id)`; no offset; unit + integration tests assert stable windows across concurrent writes. |

---

## Approval Record

- [ ] Plan reviewed by Project Owner.
- [ ] Separate authorization granted to implement WP-022 (this plan covers planning only).

Awaiting authorization; implementation will proceed one governed step at a time (migration → service → commit → push → PR → review → merge → post-merge CI) per the established flow.
