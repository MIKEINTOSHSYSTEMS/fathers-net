# Milestone 2 Implementation Plan — APPROVED

**Document:** Milestone 2 execution plan (not part of the numbered `00`–`23` plan set; versioned via PR `docs/milestone-2-planning-review`).
**Date:** 2026-08-05
**Status:** **APPROVED 2026-08-05 by Project Owner** — Milestone 2 (Phase 2 backend core) sanctioned for execution. Implementation proceeds one work package at a time through the governed PR path (§9) per AGD-002.
**Prepared by:** Implementation agent, per governed Phase 2 process (planning/verification only).
**Controlling references:** `17-final-execution-roadmap.md` §3 (Phase 2, WP-015…WP-024) and §5 (M2); `14-development-phase-roadmap.md` §5 (Phase 2); `06-backend-development-plan.md` (backend build sequence); `05-database-implementation-plan.md` §4 (migration order); `18-implementation-verification-plan.md` §2.1 (evidence: Produced → Passed → Signed); `21-quality-gate-checklist.md` §4 (G2).

---

## 1. Purpose and Scope

This document is the **execution plan for Milestone 2 (Phase 2 — Backend Core)**. It is produced **before any code is written** so that the sequence, tasks, evidence, and boundaries can be reviewed and approved as a package.

**Scope (approved work packages):** WP-015…WP-024 per `17` §3 Phase 2, plus the **Migration 001 baseline** (authorized by Project Owner 2026-08-05 for future Milestone 2 implementation).

**In scope activities:** schema migrations 001–004 (see §6), the API platform foundation (WP-015), event bus platform packages + scheduler (WP-024, split 24a/24b per §4), and the backend services behind the `/v1/` platform (WP-016…WP-023). All work lands on a `develop` branch via PRs; no production deployment.

**Explicitly OUT of scope (not started by this plan):** WhatsApp platform (Phase 4, WP-033…044), AI/RAG (Phase 5), mobile app (Phase 6), admin dashboard (Phase 7), research pipeline (Phase 8), full Phase 3 security completion (WP-025…032 — only baseline security patterns apply during Phase 2), Qdrant population, production deployment, and procurement (WP-006).

---

## 2. Authorization Status and Boundaries

| Item | State |
| --- | --- |
| Gate G1 | **Accepted/Granted** 2026-08-05 (ruleset `20422621`, Quality CI green) |
| Phase 2 authorization | **FULL AUTHORIZATION GRANTED** 2026-08-05 (Project Owner) for WP-015…WP-024 with approved work packages; **WP-015 in progress**, WP-016…WP-024 not started |
| Migration 001 | **AUTHORIZED for future Milestone 2 implementation only** (Project Owner) — no schema exists yet |
| M-01 (cloud provider) | **Approved/Closed** — GCP, cloud-agnostic |
| M-02…M-06 | **Open** — Phase 2 relevance handled by decision **M-08** (`decision-log.md` §1.2/§1.3 — Approved/Closed 2026-08-08); see §10 item 1 |
| M-07 (budget cap) | **Approved/Closed (2026-08-08, Option B)** — `FN_BUDGET_CAP = 0` (unset; no per-user reference amount); `decision-log.md` §1.4; see §10 item 2 |
| G1-05 STRIDE / G1-06 DPIA | **Approved by Project Owner** (draft evidence preserved) |
| `develop` branch | **Created + pushed 2026-08-05** from `main` (`7cb9a06`) per §9 — closes the unmet `repository-bootstrap-order.md` completion criterion |
| M2 exit verification (criterion 1 — UC-001/QR-004 Journey-1 E2E) | **BLOCKED 2026-08-08** — M2 exit verification (Step 13) performed: criteria 2–6 PASS, criterion 1 BLOCKED (no Journey-1 E2E evidence). Governance conflict resolved by decision **M-09 (OPTION A)** (`decision-log.md` §1.5): a minimal Phase-2 Journey-1 verification is authorized as the M2 acceptance artifact only. **Exit criteria unchanged.** WP-091/WP-097 retain the broader QR-004/§17.4 E2E program; WP-025 / Phase 3 **NOT authorized**; a **separate implementation authorization is required** before creating the E2E test/harness; M2 remains BLOCKED until the Journey-1 evidence is produced and verified |

**Boundary rule:** execution lands through the governed PR path (§9). WP-015…WP-024 proceed one work package at a time; each WP ends with an implementation report and waits for a separate authorization before the next begins.

---

## 3. Execution Principles (non-negotiable)

1. **Evidence model:** a work package closes only when its artifacts are **Produced → Passed → Signed** (`18` §2.1). No narrative closure.
2. **Follow the authoritative plans:** `05` governs schema/migrations; `06` governs backend service sequencing; `14` §5 governs Phase 2 acceptance; SRS §12.1 governs API conventions. Where documents conflict, this plan flags the conflict (§10) rather than silently choosing.
3. **Cross-cutting controls from day one (`02` §5):** idempotency, observability, EN/AM-ready field design, no-PII logs, ownership checks on every endpoint.
4. **Contract-first:** OpenAPI 3.x specs in `packages/api-spec/` are the source of truth; endpoints are added to the spec before code (AR-003).
5. **No production data in lower environments (AR-009);** secrets only via env/secret manager (NFR-022).
6. **Quality gates per merge:** lint, typecheck, tests + coverage floors (QR-002), build, SAST, contract lint, secret scan — the existing CI `Quality` job gates every PR.

---

## 4. Execution Sequence

The roadmap's WP registry order (WP-015…WP-024) is **not** the execution order. Execution follows hard prerequisites (`17` §3). WP-024 is split into **24a (platform packages — bus client, outbox relay, idempotency)** which is a hard prerequisite of WP-016 (its exit evidence requires auth events visible on the bus, `06` Phase B), and **24b (scheduler service)** which is a soft dependency consumed by WP-021 only.

| Step | Work | Hard prerequisites | WPs covered |
| --- | --- | --- | --- |
| 1 | **Migration baseline** — migrations 001…004 (`05` §4.2) | WP-013 tooling (exists), authorization | WP-013 continuation |
| 2 | **API platform foundation** — `/v1/` routing, bearer auth middleware, rate limiting, idempotency keys, common OpenAPI + per-service specs | G1 (accepted), Step 1 | **WP-015** |
| 3 | **Event bus platform packages (24a)** — `packages/events` (bus client + outbox relay), `packages/idempotency` (consumer dedup store) | Step 2, Step 1 | **WP-024 (24a)** |
| 4 | **Auth service (initial)** — OTP request/verify + access/refresh tokens | Steps 2, 3, 1 | **WP-016** |
| 5 | **User & profile service** | Step 4 | **WP-017** |
| 6 | **Consent lifecycle service** | Step 4 | **WP-018** |
| 7 | **Pregnancy engine** | Step 5 | **WP-019** |
| 8 | **Content service / CMS foundation** | Steps 5, 6 | **WP-020** |
| 9 | **Journal service** | Step 5 | **WP-022** |
| 10 | **Checklist & budget service** | Step 5 | **WP-023** |
| 11 | **Scheduler service (24b)** — leader election, job registry, retry/DLQ, run-id binding; parallelizable off critical path | Step 3, Step 1 | **WP-024 (24b)** |
| 12 | **Reminder engine (foundation)** — template engine + scheduler integration | Steps 7, 11 | **WP-021** |
| 13 | **M2 exit verification** — UC-001 E2E, idempotency replay, coverage floors, OpenAPI validation, evidence registry | Steps 1–12 | Milestone 2 exit |

Steps 5–11 may overlap after Step 4 lands (off critical path), consistent with `14` §14; Step 11 (24b scheduler) must land before Step 12 (WP-021).

---

## 5. Work Package Breakdown

Each WP below records: objective, tasks, files, tests, and the **verification evidence** that closes it. Requirement anchors are from `17` §3 / `14` §5 / `06`.

### 5.1 Migration baseline (WP-013 continuation)

- **Tasks:** create migrations under `packages/db/migrations/` per `05` §4.2 numbering:
  - `001` `extensions-and-schemas` — `pgcrypto`, `pg_trgm`, `fn_research` schema, research roles (AR-013 scaffolding).
  - `002` `users-and-profiles` — `users`, `profiles` (FR-001…010; phone encryption columns + HMAC digest).
  - `003` `pregnancies-and-babies` — `pregnancies`, `babies` (FR-031…037; `edd`/`lmp` constraint, week 1–45 check).
  - `004` `consents-and-preferences` — `consents` (append-only, AR-012), `user_preferences` (FR-038).
- **Files:** `packages/db/migrations/001-*.ts` … `004-*.ts`; `packages/db/test/migration*.test.ts`.
- **Tests:** `migrate:up` → schema objects exist + FK/check constraints; `migrate:down` rolls back cleanly; consent immutability (no UPDATE allowed) at DB layer; CI `db-baseline` job still green.
- **Evidence:** migration run/rollback logs (compose postgres + CI ephemeral), schema-constraint test report, `pgmigrations` row set.
- **Requirements:** FR-001…010, FR-031…038, FR-164, AR-011, AR-012, AR-013.

### 5.2 WP-015 — API platform foundation

- **Tasks:**
  - Gateway: register `/v1/` prefix; add bearer/JWT pass-through middleware (validation in WP-016; middleware contract first); CORS allow-list (`§12.1`); gateway rate limiting via Redis token bucket (default 120 req/min/user, AI 30, admin export 10 — configurable) returning `429` + `Retry-After` (FR-169).
  - Idempotency: `Idempotency-Key` required on state-changing writes; Redis-backed key → response store (TTL 24 h default) (FR-161).
  - OpenAPI: extend `packages/api-spec/openapi/` with `common.yaml` (error envelope, pagination, security schemes) and per-service specs `auth.yaml`, `users.yaml`, `content.yaml`, `checklists.yaml`, `budget.yaml`, `journal.yaml` skeletons; contract lint in CI (AR-003).
  - Standard error envelope everywhere via existing `packages/errors` (`06` §3.2; already partially live in gateway).
  - Pagination convention: `limit`/`offset` + `cursor` response shape (`06` §3.3).
- **Files:** `services/gateway/src/` (routes/middleware/plugins), `packages/api-spec/openapi/*`, `packages/idempotency/` (or gateway-local first, promoted in WP-024).
- **Tests:** gateway rate-limit test (429 + Retry-After), idempotent replay returns stored response, CORS allow-list, contract lint green, `/healthz` `/readyz` unchanged.
- **Evidence:** rate-limit/idempotency test reports; OpenAPI spec validated; `/v1/` smoke.
- **Requirements:** AR-003, FR-153, FR-159, FR-161, FR-169, NFR-020.

### 5.3 WP-024 — Event bus + outbox + scheduler

**Split (R4 from the planning review):** **24a — platform packages** (`packages/events`, `packages/idempotency`) is a hard prerequisite of WP-016: `06` Phase B evidence requires auth events (`user.authenticated`, `token.revoked`) visible on the bus. **24b — scheduler service** is a soft dependency consumed by WP-021 only; it may run parallel to Steps 5–10 and must land before Step 12. Roadmap `17` §3 hard prereqs: WP-024 = WP-015+WP-013; WP-016 = WP-013+WP-015 (WP-024 is **not** a hard prereq of WP-016).

- **Tasks:**
  - `packages/events` (24a): bus client + **outbox relay** — domain writes + event publication in one local transaction; relay publishes to the bus (`06` §2.2).
  - `packages/idempotency` (24a): consumer dedup store (event `id` as idempotency key); scheduler run-id binding (FR-163).
  - Scheduler service skeleton (24b): leader election, job registry, retry/DLQ, run-id binding (FR-163).
  - Canonical event vocabulary from `03` §4.6 (e.g., `user.enrolled`, `user.consent.changed`, `pregnancy.week.changed`, `message.inbound` reserved for Phase 4).
- **Files:** `packages/events/src/*`, `packages/idempotency/src/*`, `services/scheduler/` skeleton, `docker-compose.yml` (scheduler service), tests.
- **Tests:** outbox relay publishes exactly once per committed row; consumer dedup test replays events → no duplicates; scheduler duplicate-run idempotency test; DLQ handling (`12` §16 I-13, G2-10 prep).
- **Evidence:** **event-bus idempotency replay test showing no duplicates** (M2 exit item), outbox integrity integration test, scheduler run-id test.
- **Requirements:** FR-014…016, FR-160, FR-161, FR-163, AR-007, G2-10.

### 5.4 WP-016 — Auth service (initial)

- **Tasks:** OTP request/verify with constant-time compare, 5 attempts / 15 min lockout, expiry (FR-005, §12.2); short-lived JWT access tokens (default 15 min) + refresh tokens (default 30 days) with rotation reserved for Phase 3 (`06` Phase B). OTP/token state storage follows the **closed** auth-state storage decision (**Option A, Redis-only**, `05` §4.3; `decision-log.md` D-09); **no OTP/token values in plaintext**.
- **Migrations:** **none in WP-016** — auth-state storage decision closed 2026-08-06 (**Option A, Redis-only**, `05` §4.3; `decision-log.md` D-09). OTP state + revoked-token/refresh state live in Redis via a provider-agnostic adapter + test-double (M-08); hashed values only; migration baseline unchanged (no `018`). Full rotation + reuse-detection enhancements deferred to Phase 3 (WP-025); see §10 items 3.
- **Files:** `services/auth/` (routes/services/repositories/providers), `packages/api-spec/openapi/auth.yaml`, gateway auth middleware wiring, tests.
- **Tests:** OTP expiry/lockout; constant-time compare; token claims; refresh rotation + reuse ⇒ revoke family; no OTP/PII in logs (asserted in tests).
- **Evidence:** §12.2 flow green in integration suite; lockout test demonstrates 5-attempt cap; coverage ≥80% core on `services/auth`; `auth.yaml` contract green.
- **Requirements:** FR-005, FR-009, FR-127, NFR-018, §14.6.

### 5.5 WP-017 — User & profile service

- **Tasks:** profile CRUD; EDD/LMP capture routed to pregnancy engine contract (stubbed until WP-019); UUID identity (FR-009); cohort/referral tagging (FR-010); preferences (FR-038); emits `user.enrolled`, `user.profile.updated` via outbox. Ownership checks on every endpoint (self-scoped).
- **Files:** `services/users/`, `packages/api-spec/openapi/users.yaml`, tests (unit/integration/contract).
- **Tests:** field validation; consent versioning hook; preference enums; masked phone in any listing (QR-009 prep); no-PII logs.
- **Evidence:** `/v1/users/me` CRUD green; enrollment event visible on bus consumed by stub consumer; coverage ≥80% core.
- **Requirements:** FR-001, FR-002, FR-006, FR-008, FR-009, FR-010, FR-038, FR-126.

### 5.6 WP-018 — Consent lifecycle service

- **Tasks:** versioned immutable consent capture; withdrawal (409 if already withdrawn); re-consent; participation/research/media/WhatsApp-opt-in types (FR-117); `user.consent.changed` events; DB-level append-only enforcement (AR-012).
- **Files:** extend `services/users/` consent module (or separate `services/consent`), `users.yaml` consents paths, tests.
- **Tests:** full lifecycle grant → withdraw → proof; consent immutability test (no UPDATE on `consents`); withdrawal idempotency; privacy no-over-collection (FR-124).
- **Evidence:** consent immutability test passes; `user.consent.changed` consumed by stub consumer; coverage ≥80% core.
- **Requirements:** FR-003, FR-004, FR-117, FR-125, FR-128, AR-012.

### 5.7 WP-019 — Pregnancy engine

- **Tasks:** week/trimester auto-computation from EDD/LMP (edge cases: leap years, LMP vs EDD, week 40+); milestone derivation; countdown; recompute-on-edit (FR-006); emits `pregnancy.week.changed`. Pure domain logic, no public §12 endpoints — internal contract consumed by users service + later by WhatsApp/AI.
- **Files:** `services/pregnancy/` (or in-process package), `packages/api-spec/openapi/` internal contract, tests.
- **Tests:** week/trimester math across edge dates; milestone derivation; recompute idempotency; contract tests against users service.
- **Evidence:** pregnancy-engine test report (edge-date matrix); recompute event observed.
- **Requirements:** FR-031, FR-032, FR-033, FR-037, FR-006.

### 5.8 WP-020 — Content service / CMS foundation

- **Tasks:** content CRUD with `content_versions` snapshots; draft → medical review → approved → publish → archive state machine; EN/AM localization fields with parity check (FR-079); medical-review tagging (FR-081); segregation of duties — author ≠ medical approver (FR-106); content search (FR-083). Clinical approval (QR-019 / D-04) is a **program dependency for publish, not for build** (`06` Phase D).
- **Files:** `services/content/`, `packages/api-spec/openapi/content.yaml`, `packages/i18n/` (EN/AM scaffolding), tests.
- **Tests:** SoD test green; workflow E2E; archive removes from search + emits retirement event; localization parity check fails on missing Amharic body; contract green.
- **Evidence:** CMS workflow E2E test report; SoD test; EN/AM parity test; coverage ≥80% core.
- **Requirements:** FR-076…085, FR-106, AR-015.
- **Interpretation decision (2026-08-07):** §12.5 lists approve and publish as separate actions but provides no separate `/publish` endpoint. WP-020 implements the §12.5 surface exactly: `POST /v1/content/:id/approve` performs the approve→publish transition in one step (`pending_medical_review → approved → published`), sets `medical_reviewed=true`, records the reviewer on the latest version snapshot, and emits `content.published` once per language. No `/publish` route exists in WP-020 — added only if a later requirement authorizes it. **Deviation:** `packages/i18n/` (EN/AM scaffolding) is not created — the migration-011 EN/AM fields (`title_en`/`body_en`/`title_am`/`body_am`) serve as the localization store and parity source (FR-079); i18n scaffolding is deferred until a UI consumer needs it.

### 5.9 WP-022 — Journal service

- **Tasks:** text/voice/photo entries, private-by-default (FR-052), prompt-linked auto-entries (FR-053), sharing flag (FR-039), export (FR-057). Voice/photo media pipeline deferred to Phase 4 (WP-039); this phase stores metadata + text only.
- **Files:** `services/journal/`, `packages/api-spec/openapi/journal.yaml`, tests.
- **Tests:** privacy-by-default (entry invisible without ownership); export job produces portable artifact per FR-057/FR-128; prompt-linked dedup (FR-161).
- **Evidence:** journal E2E test report; export artifact audited; ownership-scope test.
- **Requirements:** FR-051…058, FR-126.

### 5.10 WP-023 — Checklist & budget service

- **Tasks:** hospital-bag/birth-prep checklists + custom items + progress (FR-086, FR-088); budget tracker planned/actual/variance with configurable cap (M-07 — see §10 item 2); progress maintained on write (avoid N+1, NFR-007).
- **Files:** `services/checklists/`, `packages/api-spec/openapi/checklists.yaml` + `budget.yaml`, tests.
- **Tests:** checklist progress math; budget variance + cap enforcement; ownership scope.
- **Evidence:** checklist/budget test reports; coverage ≥80% core.
- **Requirements:** FR-086, FR-087, FR-088, M-07.

### 5.11 WP-021 — Reminder engine (foundation)

- **Tasks:** template engine + scheduler integration on WP-024 scheduler; quiet hours (FR-029, FR-043); critical-priority bypass (FR-046); per-user outbound cap (3–5 non-interactive messages/day configurable); dedup across channels reserved (FR-048). Channel dispatch providers deferred (needs M-02 / Phase 4 message gateway) — this phase generates + schedules + tracks, dispatch is a stub with test-double.
- **Files:** `services/reminders/`, `packages/api-spec/openapi/` internal contract, scheduler job definitions, tests.
- **Tests:** lead-time scheduling; quiet-hour math; critical bypass; duplicate-run idempotency (FR-163/161); per-user cap.
- **Evidence:** schedule → dispatch(ack via test-double) → ack flow green against Postgres; duplicate-run no-duplicates test.
- **Requirements:** FR-041, FR-044, FR-047, FR-029, FR-043, FR-046, FR-163.

---

## 6. Database Migration Schedule

| Migration | Creates | When (step) | Authorization |
| --- | --- | --- | --- |
| 001 `extensions-and-schemas` | `pgcrypto`, `pg_trgm`, `fn_research` schema, research roles | Step 1 | **Granted** 2026-08-05 |
| 002 `users-and-profiles` | `users`, `profiles` | Step 1 | Covered by Phase 2 authorization |
| 003 `pregnancies-and-babies` | `pregnancies`, `babies` | Step 1 | Covered |
| 004 `consents-and-preferences` | `consents`, `user_preferences` | Step 1 | Covered |
| auth tables (proposed) | `otp_codes`, `refresh_tokens`, `staff_users`, `staff_mfa` | Not created in Phase 2 | **Closed 2026-08-06 — Option A, Redis-only (D-09, `05` §4.3): no auth tables in Phase 2; state in Redis. `staff_users`/`staff_mfa` deferred (Phase L); Option B upgrade path appends migration `018`** |
| Later-phase migrations (005…) | prompts, journal, content, campaigns, ai, notifications, audit_logs, research, seed | Phase 2 steps 5–11 / later phases | Out of this plan's migration-001 baseline |

Note: `audit_logs` (migration 015 per `05` §4.2) is deferred to Phase 3 (WP-027); Phase 2 applies access logging (FR-127) at the application layer.

---

## 7. Platform Packages to Create

| Package | Purpose | Step |
| --- | --- | --- |
| `packages/events` | bus client + outbox relay | 3 (24a) |
| `packages/idempotency` | Redis idempotency store + consumer dedup | 2–3 (24a) |
| `packages/i18n` | EN/AM localization scaffolding | 8 |
| `services/scheduler` | scheduler service skeleton (leader election, registry, retry/DLQ) | 11 (24b) |

Existing packages reused: `config`, `errors`, `logger`, `test-utils`, `db`, `api-spec`. Redis and Postgres are already in the compose stack.

---

## 8. Verification and Milestone 2 Exit Criteria

**M2 exit criteria (`17` §5, `14` §5):**

| Criterion | How proven | Evidence artifact |
| --- | --- | --- |
| UC-001 E2E green (registration → OTP → versioned consent → UUID → pregnancy-week computation) | E2E/integration run of the critical journey | UC-001 E2E report (QR-004 journey 1) |
| QR-002 coverage floors (≥80% core, ≥70% overall) | CI coverage gate | Coverage report per service |
| OpenAPI contracts committed + validated | Contract lint + spec validation | `packages/api-spec/` committed, `contract:lint` green |
| Event-bus idempotency replay shows no duplicates (FR-161) | Replay test on outbox + consumers | Idempotency replay test report |
| Phase 2 migrations applied + reversible | migrate up/down logs (compose + CI) | Migration logs |

**Partial G2 evidence produced in Phase 2 (full G2 only after Phase 3):** G2-10 (idempotency + event integrity), G2-11 (coverage floors), G2-03 partial (access-logging foundation FR-127). G2-01/02/04/05/06/07/08/09/12 require WP-025…032 (Phase 3) — not claimed here.

**Update rule:** `implementation-status.md` WP-015…WP-024 rows move S → IP → IV → C as evidence passes (`18` §2.1); every closure records artifact path + commit SHA + requirement IDs.

---

## 9. Branch / PR / Deploy Strategy

1. **Create + push `develop`** branch from `main`. This is not a new workflow chosen by this plan — it is an **existing governance requirement**: SRS §16.2 + `04` §20 (staging on `develop`), `12` §5.2 + `architecture-baseline.md` (feature → `develop` → `main`, NFR-039 branch/PR workflow), and `repository-bootstrap-order.md` line 25 whose completion criterion ("`main` + `develop` exist, `main` protected, no code yet") was **not met** — creating `develop` closes that bootstrap gap. **DONE 2026-08-05** (from `main` `7cb9a06`). Required: Quality CI green, linear history — ruleset `20422621` applies. `develop` should also receive branch protection per `12` §5.4. **Merge policy:** AGD-002 (solo-maintainer) permits `MIKEINTOSHSYSTEMS` to merge own PRs via the rule-scoped ruleset `20422621` bypass (`bypass_mode: always`) — a documented exception, NOT an independent review; security-sensitive changes (auth/tokens, PII, encryption, AI prompts, dependencies, IaC/CI) require documented Project Owner sign-off + mandatory CI.
2. **All Phase 2 work lands on `develop`** via small, reviewable PRs (one WP or sub-step each). Never push directly to `main` (ruleset blocks; linear history).
3. **CI:** existing `Quality` job gates every PR (lint/typecheck/tests+coverage/build/SAST/contract lint/audit/secret scan). `db-baseline` validates migrations on ephemeral postgres.
4. **Deployment:** `Deploy to staging (develop)` job becomes active once `develop` exists (currently skipped). **No production deployment** — `main` deploy stays parked at the manual-approval gate with placeholder steps.
5. **Evidence cadence:** every merged PR records its artifacts; M2 exit review is a checkpoint (not a gate) — `G2` remains Not Started until Phase 3.

---

## 10. Open Items Requiring Review/Decision Before Execution

1. **M-02…M-06 open vs roadmap §2.1 rule.** `17` §2.1 states no code work begins until all seven M-decisions close. The Project Owner's 2026-08-05 full Phase 2 authorization is the governing override for WP-015…WP-024. **Handling path:** decision **M-08** ("Phase 2 open-decision handling + provider-agnostic test-doubles") **Approved/Closed 2026-08-08** — `decision-log.md` §1.2 (status) + §1.3 (closure record). WP-016 OTP delivery channel and WP-021 channel dispatch use **provider-agnostic test-doubles**; WP-023 budget cap reads the **M-07 decision** (`decision-log.md` §1.4 — Option B: `FN_BUDGET_CAP = 0`, unset; no per-user reference amount) as configurable.
2. **M-07 budget cap default — RESOLVED 2026-08-08 (Option B).** M-07 closed (`decision-log.md` §1.4): budget cap default **unset — `FN_BUDGET_CAP = 0`**; summary `cap`/`remaining` are null while unset; **no per-user reference amount approved** — the `20` §4 program-level scenarios (≈$474k/$606k/$801k) are program ceilings, not per-user caps; a future per-user reference amount requires a separate governance decision.
3. **Auth tables not in `05` §4.2.** `otp_codes`, `refresh_tokens`, `staff_users`, `staff_mfa` (required by WP-016 per `06` Phase B) are absent from the `05` migration table and the SRS §13.3 catalog. **RESOLVED 2026-08-06 — auth-state storage decision closed (Project Owner, **Option A — Redis-only**, `05` §4.3; `decision-log.md` D-09).** WP-016 stores OTP + revoked/refresh state in Redis (provider-agnostic adapter + test-double, M-08), hashed values only; **no auth tables, no migration `018`, migration baseline unchanged**. Option B (Redis + Postgres record, `05` §4.2 append `018`) remains the documented Phase 3 (WP-025) upgrade path if durable rotation/audit is required. `staff_users`/`staff_mfa` deferred to Phase L and may be decided separately.
4. **Migration numbering conflict between `06` §4 ("Migration `000N`") and `05` §4.2 (001–017).** **RESOLVED in this documentation PR:** `06` §4 now references `05` §4.2 IDs and records the rule that engineering tables beyond the `05` catalog require a `05` §4.2 update + approval; `17` §3 WP-013 reworded to match. No `000N` sequence remains.
5. **`audit_logs` deferral.** `05` migration 015 creates the immutable audit table (Phase 3, WP-027). Phase 2 ships FR-127 access logging at the app layer. Confirm this deferral is acceptable (no DB-level append-only audit until Phase 3).
6. **`develop` branch creation.** **RESOLVED 2026-08-05** — `develop` created + pushed from `main` (`7cb9a06`) before WP-015 work (per §9), closing the unmet `repository-bootstrap-order.md` completion criterion. Merge governance per AGD-002 / §9.1.
7. **Content service clinical review (D-04 / QR-019)** is a program dependency for *publishing*, not for *building* WP-020. Confirm the clinical reviewer engagement is scheduled ahead (R-04 mitigation).
8. **Engineering tables beyond the `05` §4.2 catalog.** Several `06` phase table lists include additions not in `05` §4.2 or the SRS §13.3 catalog (e.g., `shared_journey_links`, `data_export_jobs`, `deletion_requests`, `cohort_tags`, `whatsapp_templates`, `support_tickets`, `research_export_jobs`). These must be added to `05` §4.2 with schema approval + decision-log entry before their phase lands (note added in `06` §4). Flag for DB architect review alongside item 3. **RESOLVED for WP-021 2026-08-07:** `reminder_templates` / `reminder_instances` / `reminder_dispatches` added to `05` §4.2 as catalog row **018** (decision-log **D-10**); migration `018-reminders` authorized.

---

## 11. Approval Record

This plan was **approved 2026-08-05 by the Project Owner**, together with authorization to begin **WP-015** (API platform foundation) only. The §11 review checklist is closed:

- [x] Scope (§1) and boundaries (§2) confirmed.
- [x] Execution sequence (§4) and WP breakdown (§5) approved.
- [x] Open items (§10) disposition: item 4 resolved in the planning review PR (R1–R8); item 6 resolved 2026-08-05 (`develop` created + pushed). Items 1–3, 5, 7–8 remain open with agreed handling paths (M-08 draft decision pending Project Owner signature; DB architect sign-off for auth storage; audit-log deferral to Phase 3; clinical review scheduling; `05` §4.2 additions) — none block WP-015 (Step 2).
- [x] Plan approval recorded in `implementation-status.md` §9; AGD-002 cross-references recorded (`decision-log.md` §7, `12` §5.3/§5.6, `architecture-baseline.md` §17, `repository-bootstrap-order.md` Step 1, `21-quality-gate-checklist.md` §3.4/§6).

Implementation proceeds one work package at a time; each WP ends with an implementation report and waits for separate authorization before the next begins.

---

**END OF DOCUMENT — Milestone 2 Implementation Plan (APPROVED).** Execution in progress: `develop` created; **WP-015 (API platform foundation) implemented** — see `implementation-status.md` §9 and the WP-015 implementation report. Remaining execution: migration baseline (001–004, Step 1) and WP-016…WP-024 per §4, with M2 exit evidence per §8.
