# WP-022 Final Scope Confirmation

**Document:** WP-022 scope clarification (planning/verification only — no code, no migrations, no commits, no pushes, no implementation).
**Date:** 2026-08-07
**Status:** CONFIRMED — boundaries verified against the approved vocabulary, SRS §12.9, `05` §4.2 catalog, and the WP-022 implementation plan (`implementation-plan/wp-022-implementation-plan.md`). Awaiting separate implementation authorization.
**Controlling references:** `milestone-2-implementation-plan.md` §5.9 (WP-022); `17-final-execution-roadmap.md` line 94 (WP-022 dependency: WP-017 — DONE); SRS §12.9, §13.3.6/§13.3.7, FR-051…058/FR-126/FR-128/FR-039/FR-161; `05-database-implementation-plan.md` §2.6/§2.7/§4.2 row 006; `packages/events/src/vocabulary.ts`.

---

## Boundary verifications

### 1. Event boundary — CONFIRMED
- ✅ `journal.entry.created` **already exists** in the approved event vocabulary (`packages/events/src/vocabulary.ts:172`): producer `journal-service`, availability `phase2`, consumers `ai-orchestration`, `research-service`, payload `entry_id, type, week, consent flags`, idempotency `entry id`.
- ✅ **Existing event schema is reused as-is** — the WP-022 service publishes the registered event with the registered payload; **no PII** in payload (FR-022/FR-123).
- ✅ **No event vocabulary changes** — `vocabulary.ts` untouched.
- ✅ **No new events created** — no sharing/export/delete events; `media.processed` and `prompt.response.captured` remain `reserved` for later phases.

### 2. API boundary — CONFIRMED
- ✅ **All journal endpoints approved** — they are SRS §12.9 (`/v1/journal/entries` GET/POST, `/:id` GET/PATCH/DELETE, `/:id/share`) plus `/v1/journal/export` for FR-057/FR-128.
- ✅ **`/v1/journal/export` exposure is authorized** — user-initiated portable export is FR-057 (Must Have) and the milestone §5.9 evidence item ("export job produces portable artifact per FR-057/FR-128"); synchronous JSON artifact interpretation to be recorded in `decision-log.md` at implementation start (no `data_export_jobs` table → no §10.8 gate).
- ✅ **No unauthorized gateway routes added** — the plan aggregates `journal.yaml` into the api-spec (spec artifact) only; no runtime gateway/nginx `/v1/journal/*` proxy wiring is introduced beyond the existing Phase 2 pattern (`services/gateway/src/routes/v1.ts` carries no business-service proxying today). `POST /v1/journal/media` is spec-reserved and returns 501 until WP-060.

### 3. Media boundary — CONFIRMED
- ✅ **`journal_media` schema purpose** — catalog row 006 (SRS §13.3.7, `05` §2.7): media attachments (voice/photo/document) with anonymized `storage_path`, `size_bytes`, `transcript`, `transcript_status`; created in migration 019 **per catalog fidelity**.
- ✅ **No media implementation** — no upload route behavior, no object storage, no signed URLs, no media service code; `journal_media` receives **zero writes** in Phase 2.
- ✅ **No voice/photo/transcription features** — FR-055 transcription, FR-018/019 intake, ASR integration all deferred; the Phase 2 API creates `entry_type='text'` entries only.
- ✅ **WP-060 remains responsible** — media pipeline, transcription, and PDF export land with WP-060 (Phase 4).

### 4. Sharing boundary — CONFIRMED
- ✅ **FR-039 scope limited to approved sharing behavior** — the `shared_with_partner` boolean (default `false`, private by default FR-052) + explicit opt-in `POST /:id/share`; partner read only when `shared_with_partner = true` AND a real `pregnancies.partner_user_id` link exists (resolved via migration 003).
- ✅ **No partner authorization system changes** — no new tables, no new roles, no token/claims changes; partner access reuses the existing `pregnancies.partner_user_id` data.
- ✅ **No access-control expansion** — reads for non-owners remain **404-invisible**; all writes owner-only; if partner linkage is ambiguous at implementation time, scope falls back to owner-only reads (plan risk R2).

---

## Final Scope Confirmation

### 1. Approved implementation scope
- Text journal entries with chronological timeline, **private by default** (FR-051, FR-052).
- Per-entry opt-in sharing with the linked partner (FR-039, `shared_with_partner`).
- Synchronous portable **JSON** export by the user (FR-057, FR-128).
- Schema readiness for prompt-linked/legacy entries (`entry_type` CHECK values) — DB layer only; API creates `text` only (FR-053, FR-054).
- Best-effort `journal.entry.created` publication (research/AI ingestion readiness).
- Ownership-scoped access on every endpoint (FR-126).

### 2. Database scope
- One new migration **`packages/db/migrations/019-journal.ts`** (node-pg-migrate, `pgm.sql` style): tables `journal_entries` (with `(user_id, created_at DESC)` index) and `journal_media`; CHECK-based enums; `user_id` FK `ON DELETE CASCADE` (FR-128); `shared_with_partner` default `false`.
- Catalog row **006**, depends on `002 users`; **no beyond-catalog tables** → milestone §10.8 gate **does not apply**.
- Reversible `down` (drop `journal_media`, then `journal_entries`). No changes to 001–004, 011, 018.

### 3. API scope
- `GET/POST /v1/journal/entries`, `GET/PATCH/DELETE /v1/journal/entries/:id`, `POST /v1/journal/entries/:id/share`, `GET /v1/journal/export` — all Bearer, `self` (owner) except partner read on explicitly shared entries; cursor pagination on list.
- `POST /v1/journal/media` — **spec-reserved, 501** until WP-060.
- Spec-first: `packages/api-spec/openapi/journal.yaml` (replace AR-003 skeleton) → `contract:lint` gated.

### 4. Event scope
- Publish **`journal.entry.created`** (existing registered event) on create; payload `{ entry_id, type, week, consent flags }`; idempotency key = entry id; producer `journal-service`; best-effort (no outbox — WP-024a upgrade path).
- **No vocabulary changes, no new events.**

### 5. Deferred features (not Phase 2)
- Media pipeline / signed uploads / object storage / transcription (FR-055) → **WP-060**.
- AI tagging (FR-056), admin review queue `journal_flags` (FR-058) → Phase 4.
- Prompt-response auto-linking + legacy letters + FR-161 dedup → **WP-037** (Phase 3, on `prompt_responses`).
- PDF export → Phase 4; async export job / `data_export_jobs` → Phase 4.
- Offline sync / encrypted local store (FR-133/136) → mobile Phase 4.
- `user.deletion.requested` consumer → later; erasure via FK CASCADE now.

### 6. Files expected to change
- **New `services/journal/`** — package/tsconfig/jest/eslint/Dockerfile; `src/config.ts`, `src/index.ts`, `src/app.ts`, `src/types.ts`; `src/routes/{health,entries}.ts`; `src/middleware/{auth,errors,request-id}.ts`; `src/services/{journal-service,events,export}.ts`; `src/store/{types,postgres-store,memory-store,index}.ts`; tests (`journal-service`, store unit + Postgres integration env-gated, routes, export).
- **New elsewhere:** `packages/db/migrations/019-journal.ts`; `packages/api-spec/openapi/journal.yaml` (filled); `docker-compose.yml` block; `.env.example` (`FN_JOURNAL_*`).
- **Modified:** `packages/api-spec/openapi/gateway.yaml` (spec aggregation) + `packages/api-spec/dist`; `package-lock.json` (workspace); `implementation-status.md` (WP-022 → In Progress at implementation start).
- **Unchanged:** `services/scheduler`, `services/gateway`, `packages/events` (vocabulary), migrations 001–004/011/018.

---

## Approval Record

- [ ] Scope confirmation reviewed by Project Owner.
- [ ] Separate authorization granted to implement WP-022 (this document confirms boundaries only; no implementation).

**Status: no code changes, no migrations created, no commits, no pushes, no implementation started.** Awaiting separate implementation authorization.
