# Implementation Status (FathersNet / Ayay)

**Document:** Live implementation status tracker (Program Manager + QA Lead)
**Source of truth:** `docs/FathersNet-Complete-SRS.md` (FN-SRS-001 v2.0) and the implementation-plan document set. This file is the **live counterpart** to `22-feature-implementation-matrix.md` (QR-015 traceability), `21-quality-gate-checklist.md` (gates), `decision-log.md` (M-decisions), and `16-risk-management-plan.md` (risk register). It records per-WP status, gate state, decision status, and open risks in one place.
**Status ladder (WP/evidence):** **Not Started** → **In Progress** → **In Verification** (evidence produced, not yet passed/signed) → **Closed** (Produced → Passed → Signed per `18` §2.1).
**Status ladder (gates):** **Not Started** → **In Progress** → **In Verification** → **Accepted/Granted** → **In Review** (post-pilot).
**Update rule:** every WP closure and every gate/decision/risk change is recorded here at the moment it happens — not retroactively. No WP closes without its evidence artifact ID and requirement links (`18` §9).

---

## 1. Program Snapshot (as of 2026-08-05)

| Item | Status | Notes |
| --- | --- | --- |
| Planning phase | **Complete** | All 23 plan documents authored (see §2); readiness score in `version.md` |
| Plan documents authored | 23/23 | `00`–`23` + `version.md` present in `implementation-plan/` |
| SRS baseline | **Approved for Development Baseline** (FN-SRS-001 v2.0) | Frozen for Phase 0 (WP-001) |
| Gate G1 | **Accepted/Granted** | Accepted 2026-08-05 — M1 foundation evidence reviewed and accepted (see §3, §9) |
| Phase 2 authorization | **FULL AUTHORIZATION GRANTED** | Granted 2026-08-05 by **Project Owner** — Milestone 2 business implementation (WP-015…WP-024) authorized to begin with approved work packages. Governance-recorded only in this task; implementation **not started** (see §9) |
| Gate G2 | **Not Started** | Requires Phase 3 (WP-025…WP-032) evidence |
| Gate G3 | **Not Started** | Requires Phase 9–10 evidence (WP-095…WP-120) |
| Decisions M-01…M-09 | **M-01 + M-07 + M-08 + M-09 Approved/Closed; M-02…M-06 Open** | M-01 approved 2026-08-05 (Project Owner): initial production cloud provider **Google Cloud Platform (GCP)**, cloud-agnostic architecture; `decision-log.md` §1/§1.1. M-07 approved 2026-08-08 (Project Owner, Option B): budget cap default **unset (`FN_BUDGET_CAP = 0`)** — no per-user reference amount approved; program-level scenarios in `20` §4 are program ceilings, not per-user caps; `decision-log.md` §1/§1.4. M-08 approved/closed 2026-08-08 (Project Owner): Phase 2 open-decision handling + provider-agnostic test-doubles — **governance only**, no production provider selected; `decision-log.md` §1.2/§1.3. M-09 approved/closed 2026-08-08 (Project Owner): M2 E2E ownership/sequencing conflict resolution — **OPTION A: minimal Phase-2 Journey-1 verification**, chartered solely to satisfy the existing M2 exit criterion 1 (registration → OTP → versioned consent → UUID → pregnancy-week computation); **governance only — no implementation authorization**; M2 remains **BLOCKED** until the Journey-1 evidence is produced and verified; WP-091/WP-097 retain the broader QR-004/§17.4 E2E program; WP-025 / Phase 3 **NOT authorized**; `decision-log.md` §1.5 |
| Risks open | 64 planned (PM-01…PM-64) | `16` §3; critical rows: PM-21, PM-26 |
| Work packages | 0/120 closed | Registry in §7 |

---

## 2. Plan Document Status

| File | Status | Owner |
| --- | --- | --- |
| `00-requirement-inventory.md` | Authored (349 requirements, gap-free) | QA Lead |
| `01-current-system-analysis.md` | Authored (greenfield) | Architect |
| `02-srs-requirement-analysis.md` | Authored (dependency map) | Architect |
| `03-system-architecture-plan.md` | Authored (topology, ADRs) | Architect |
| `04-technology-stack-analysis.md` | Authored (stack lockdown) | Architect |
| `05-database-implementation-plan.md` | Authored (schema, migrations) | DB Architect |
| `06-backend-development-plan.md` | Authored (build phases A–L) | Backend Lead |
| `07-whatsapp-platform-implementation-plan.md` | Authored | Integration Lead |
| `08-ai-rag-implementation-plan.md` | Authored | AI Architect |
| `09-mobile-application-development-plan.md` | Authored | Mobile Lead |
| `10-admin-dashboard-development-plan.md` | Authored | Frontend Lead |
| `11-security-and-privacy-plan.md` | Authored | Security |
| `12-devops-and-infrastructure-plan.md` | Authored | DevOps |
| `13-testing-and-quality-plan.md` | Authored | QA Lead |
| `14-development-phase-roadmap.md` | Authored (phases 0–10, gates) | Program |
| `15-team-and-resource-plan.md` | Authored | Program |
| `16-risk-management-plan.md` | Authored (PM-01…PM-64) | Program |
| `17-final-execution-roadmap.md` | Authored (WP-001…WP-120) | Program |
| `18-implementation-verification-plan.md` | Authored (evidence model) | QA Lead |
| `19-engineering-handoff-package.md` | Authored | Engineering |
| `20-resource-and-delivery-analysis.md` | Authored (cost/delivery) | Program |
| `21-quality-gate-checklist.md` | Authored (G1/G2/G3) | QA Lead |
| `22-feature-implementation-matrix.md` | Authored (traceability) | QA Lead |
| `23-healthcare-compliance-and-safety-plan.md` | Authored (safety) | Healthcare & Content |
| `decision-log.md` | Authored; M-01 + M-07 + M-08 + M-09 **Approved/Closed**; M-02…M-06 **Open** | Program |
| `missing-requirements-analysis.md` | Authored | QA Lead |

---

## 3. Gate Status

| Gate | Definition (`14` §1) | State | Open Items | Evidence Due |
| --- | --- | --- | --- | --- |
| **G1** Planning & Architecture | End of Phase 1; package from Phase 0 | **Accepted/Granted** | 15 items (`21` §3) — acceptance record 2026-08-05; G1-05 STRIDE + G1-06 DPIA **Approved by Project Owner** 2026-08-05; M-01 + M-08 closed 2026-08-05 (M-02…M-07 open); full Phase 2 authorization granted 2026-08-05 | WP-001…WP-014 |
| **G2** Core Platform & Security | End of Phase 3 | **Not Started** | 13 items (`21` §4) | WP-025…WP-032 + Phase 2 |
| **G3** Release & Pilot Launch | Phase 10 go/no-go | **Not Started** | 17 items (`21` §5) | WP-095…WP-120 |

---

## 4. Milestone Status (M0–M9)

| Milestone | Checkpoint (`14` §15) | State | Gate |
| --- | --- | --- | --- |
| M0 | Phase 0 baseline & decisions approved | **In Progress** — M-01 closed 2026-08-05; M-07 + M-08 closed 2026-08-08 (Project Owner); M-02…M-06 open | G1 package |
| M1 | Phase 1 foundation live | **Accepted/Granted** — Gate G1 accepted 2026-08-05. Committed + pushed `b616224` + `95e4665` + `26acb6e` + `9e4c454` (foundation `b616224`, doc sync `95e4665`, CI dependency remediation `26acb6e`, CI evidence doc sync `9e4c454`); GitHub Actions quality job green (runs 30963968046/30964438595); branch protection active (ruleset 20422621: PR + 1 approval + Quality CI + linear history). Phase 2 / Milestone 2 NOT authorized | Gate 1 |
| M2 | Phase 2 backend core functional | **In Progress** — full Phase 2 authorization granted 2026-08-05 (Project Owner); **WP-015 closed** 2026-08-05 (PR #6 → develop `ab2ada6`); **WP-013 migration baseline closed** (PR #7 → develop `7c755d9`, migrations 001–004); **WP-024a closed** 2026-08-06 (PR #8 → develop `f28bab4`, event bus/outbox/idempotency packages); **WP-024b closed** (PR #17 `42617b6`, scheduler jobs foundation); **WP-016 closed** (PR #11 `ea1a85d`); **WP-017 closed** (PR #12 `275ef7b`); **WP-018 closed** (PR #13 `2946c26`); **WP-019 closed** (PR #14 `62e4c0a`); **WP-020 closed** (PR #15 `f1bb2da`); **WP-021 closed 2026-08-07** (direct-integrated on `develop`: migration `018` `639c469` + implementation `8fbf557`, evidence `wp-021-progress-report.md`); **WP-022 closed 2026-08-08** (commit `25fe335` direct-integrated on `develop`, evidence `wp-022-progress-report.md`); **WP-023 COMPLETED 2026-08-08** (commit `14205ec` + push to `develop` completed; PR not applicable — directly integrated into `develop`, §9 closure record); **WP-024c CLOSED 2026-08-08** (commit `d640a57` + push to `develop` completed; direct-to-develop precedent; evidence `wp-024c-progress-report.md`; §9 closure record); **Phase 2 (WP-015…WP-024) implementation work COMPLETE** — M2 exit verification (milestone-2 §4 Step 13) **performed 2026-08-08 → BLOCKED**: criterion 1 (UC-001/QR-004 Journey-1 E2E evidence) missing; criteria 2–6 PASS. Governance conflict identified (no Phase 2 WP charters the Journey-1 E2E harness; broader QR-004/§17.4 E2E program owned by WP-091/WP-097). **Resolved 2026-08-08 — M-09, OPTION A (minimal Phase-2 Journey-1 verification)** authorized for the M2 acceptance artifact only (`decision-log.md` §1.5). M2 remains **BLOCKED** until the Journey-1 evidence is produced and verified; **implementation not yet authorized** | Internal |
| M3 | Phase 3 security complete | **Not Started** | Gate 2 |
| M4 | Phase 5 channels integrated | **Not Started** | Internal |
| M5 | Phase 7 app + admin feature complete | **Not Started** | Internal |
| M6 | Phase 8 integration complete | **Not Started** | Internal |
| M7 | Phase 9 QA + UAT complete | **Not Started** | Gates 2–3 |
| M8 | Phase 10 pilot go-live | **Not Started** | Gate 3 |
| M9 | Phase 10 pilot evaluated | **Not Started** | QR-018 report |

---

## 5. Decision Status (M-01…M-08)

| Decision | Recommended Default (`decision-log.md` §1) | Approver | Status |
| --- | --- | --- | --- |
| M-01 Cloud provider | **Google Cloud Platform (GCP)** initial production provider; cloud-agnostic (Docker, Terraform IaC, PostgreSQL, env-based config, provider abstractions) | Program + DevOps | **Approved/Closed** (2026-08-05, Project Owner) |
| M-02 WhatsApp provider | Meta Cloud API primary; alternates | Program + Integration | **Open** |
| M-03 LLM/embedding | Gemini Flash primary; fallbacks | Program + AI | **Open** |
| M-04 Mobile framework | React Native recommended | Product Engineering | **Open** |
| M-05 Pilot cohort | **500+ default** | Program + Research | **Open** |
| M-06 Object storage + host | Cloud object storage, SSE | DevOps + Security | **Open** |
| M-07 Budget cap | **Unset (`FN_BUDGET_CAP = 0`)** — no per-user reference amount approved; the `20` §4 scenarios (≈$474k/$606k/$801k) are program-level ceilings, not per-user caps | Program | **Approved/Closed** (2026-08-08, Project Owner — Option B) |
| M-08 Phase 2 open-decision handling | Provider-agnostic adapters + test-doubles; no provider-coupled code in Phase 2; M-07 budget cap adopted as configurable for WP-023 (per `decision-log.md` §1.4); M-02 OTP via adapter + test-double (provider deferred to Phase 4) | Project Owner | **Approved/Closed** (2026-08-08 — governance only) |

---

## 6. Open Risk Snapshot (Top Critical/High from `16`)

| PM ID | Risk | Severity | Owner | Mitigation Status |
| --- | --- | --- | --- | --- |
| PM-21 | Emergency false negatives | **Critical** | AI + Clinical | Planned — suite from Phase 5 |
| PM-26 | Unsafe medical recommendations | **Critical** | AI + Clinical | Planned — safety layer (Phase 5) |
| PM-03 | Offline sync correctness | High | Mobile Lead | Planned — Phase 6 |
| PM-55 | WhatsApp availability Ethiopia | High | Program + Integration | Planned — Phase 0 procurement |
| PM-42 | Clinical reviewer bottleneck | High | Healthcare & Content | Planned — Phase 2 engagement |
| PM-49 | M-decisions late | High | Program | Planned — Phase 0 hard exit |
| PM-27 | Provider outage during pilot | High | DevOps | Planned — fallback tiers |
| PM-43 | Ethics approval delay | High | Research & Community | Planned — pre-P8 protocol |
| PM-10 | OTP interception / SMS fraud | High | Security | Planned — Phase 3 |
| PM-24 | Eval set < 90% | High | QA + AI | Planned — Phase 5 |

Full register: `16-risk-management-plan.md` §3.

---

## 7. Work Package Registry

**Legend:** S = Not Started · IP = In Progress · IV = In Verification · C = Closed. All **S** at authoring. Evidence/owner columns filled at WP start per `18`.

### Phase 0 — Planning & Architecture Validation

| WP | Work Package | Status | Evidence | Owner |
| --- | --- | --- | --- | --- |
| WP-001 | Freeze SRS + traceability framework | S | | QA Lead |
| WP-002 | Decision log; close M-01…M-07 | IP | M-01 closed 2026-08-05 (GCP, Project Owner — `decision-log.md` §1.1); M-07 closed 2026-08-08 (Option B — `FN_BUDGET_CAP = 0`, no per-user reference amount — `decision-log.md` §1.4); M-08 closed 2026-08-08 (Phase 2 open-decision handling + provider-agnostic test-doubles, governance only — `decision-log.md` §1.2/§1.3); M-02…M-06 open. | Program |
| WP-003 | Architecture review/sign-off | S | | Technical Lead |
| WP-004 | Tech-stack sign-off | S | | Architect |
| WP-005 | STRIDE + DPIA + processing register | IP | Draft STRIDE + DPIA produced 2026-08-05 (foundation prep): `verification/audits/threat-model/stride-threat-model-draft.md`, `verification/audits/dpa/dpia-draft.md`. **Approved by Project Owner 2026-08-05 (G1-05/G1-06)** — draft evidence preserved; no independent security/privacy reviewer sign-off claimed. | Security |
| WP-006 | Provider/environment procurement | S | | Program |
| WP-007 | Research ethics groundwork + team/risk baseline | S | | Research + Program |

### Phase 1 — Foundation (→ Gate G1)

| WP | Work Package | Status | Evidence | Owner |
| --- | --- | --- | --- | --- |
| WP-008 | Monorepo scaffold | IV | M1 verification gate 2026-08-05: npm workspaces + turbo, TS strict, ESLint/Prettier/editorconfig, husky pre-commit, co-located docs tracked (AGD-001). Remaining: branch protection + PR workflow active (Step 1 completion, G1). | Engineering |
| WP-009 | CI/CD skeleton | IV | M1 verification gate 2026-08-05: `.github/workflows/ci-cd.yml` (quality → staging [develop] → prod [main] approval gate); YAML validated. Deploy steps are placeholders awaiting M-01 + IaC. | DevOps |
| WP-010 | IaC dev/staging/prod | IP | M-01 closed 2026-08-05 (GCP, Project Owner). Execution still requires WP-006 procurement (Step 7). | DevOps |
| WP-011 | Local dev environment (compose) | IV | M1 verification gate 2026-08-05: compose stack (postgres/redis/qdrant/gateway/nginx) all healthy; /healthz + /readyz 200 direct (3000) and via nginx 8080/8443; `docker compose config --quiet` valid. | DevOps |
| WP-012 | Secret manager wired | IP | M-01 closed 2026-08-05 (GCP, Project Owner). Requires Step 12; local secret-scan + pre-commit scanning in place. | DevOps + Security |
| WP-013 | Migration 001 baseline | IV | Migration baseline implemented 2026-08-05 (branch `feature/wp-013-migration-baseline`): migrations 001–004 per `05` §4.2 — extensions + `fn_research` schema + research roles (AR-013), users + profiles (digest-unique `phone_e164` HMAC, checks, indexes), pregnancies + babies (domain checks, cascade/SET NULL), consents (append-only AR-012: `BEFORE UPDATE OR DELETE` trigger + erasure-gated right-to-erasure cascade FR-007/FR-128; one-active-grant state guard incl. re-consent FR-125 — see `004` header), user_preferences. Integration tests 9/9 (up → asserts → down → re-up) green against ephemeral postgres; CI `db-baseline` now runs `migrate:up` + `test:migrations` + `migrate:check`. Auth storage tables deferred per `05` §4.3. | DB Engineer |
| WP-014 | Observability + DR skeleton | S | Requires Step 11; not in M1 scope. | DevOps |

### Phase 2 — Backend Core

| WP | Work Package | Status | Evidence | Owner |
| --- | --- | --- | --- | --- |
| WP-015 | API platform foundation | C | Merged to `develop` 2026-08-05 (PR #6, squash commit `ab2ada6`): gateway `/v1` platform middleware — CORS allow-list (06 §12.1), Bearer pass-through (token validation deferred to WP-016), Redis token-bucket rate limiting (FR-169; in-memory fallback for dev/CI), per-request idempotency via `Idempotency-Key` (FR-161 / 06 §2.3; 24h TTL), smoke routes `/v1/ping` + `/v1/platform/echo`; config `FN_*` additions (redis, store driver, limits, TTL); OpenAPI `/v1/` contract + `common.yaml` + per-service skeletons (AR-003); compose + `.env.example`; CI `redis` service for integration tests. Gateway tests 40/40 green incl. Redis integration (REDIS_TEST_URL); Quality + db-baseline CI green on merge. | Backend |
| WP-016 | Auth service (initial) | C | Closed 2026-08-06 (PR #11, commit `ea1a85d` → `develop`): OTP request/verify with constant-time compare, 5-attempt/15-min lockout, expiry (FR-005, §12.2); short-lived JWT access (15 min default) + revocable refresh tokens (30 d default) with rotation reserved for Phase 3; auth-state storage **closed decision Option A — Redis-only** (`05` §4.3, `decision-log.md` D-09): OTP + revoked/refresh state in Redis via provider-agnostic adapter + test-double (M-08), hashed values only, no auth tables/migrations; full rotation + reuse-detection deferred to Phase 3 (WP-025). CI green on merge. | Backend |
| WP-017 | User & profile service | C | Closed 2026-08-06 (PR #12, squash `275ef7b` to `develop`): registration (FR-001/002), profile CRUD (FR-002), EDD/LMP via pregnancy-engine stub (FR-006/FR-031), cohort tagging (FR-010), preferences (FR-038); AES-256-GCM phone at rest + keyed digest lookup + masked responses (FR-009/FR-123, QR-009); `user.enrolled`/`user.profile.updated` emitted; `pregnancies` ordered by `id` (baseline 003 has no timestamp). Local CI-equivalent gate green; 48 tests. | Backend |
| WP-018 | Consent lifecycle service | C | Closed 2026-08-07 (PR #13, commit `2946c26` → `develop`): versioned append-only consent lifecycle on baseline migration 004 (no schema changes) — grant/re-consent, withdrawal (409 if already withdrawn), immutable history view (FR-003/FR-004/FR-125/FR-117, AR-012); self-scoped `/v1/users/me/consents` (+ `/consents/{id}/withdraw`) per SRS §12.3; `user.consent.changed` emitted (payload `user_id, consent_type, version, state`, no PII); store guard mirrors the `004` triggers (single active grant, first record must be a grant); Postgres trigger immutability verified (UPDATE/DELETE rejected). Local gate green: lint/typecheck/build clean, coverage 90.25% lines, 62 unit tests green (9 gated integration tests green against local Postgres 001–004 baseline; 2 pre-existing WP-017 pregnancy date tests fail only on non-UTC hosts — `date` column + `toISOString()` TZ shift). CI green on merge. | Backend |
| WP-019 | Pregnancy engine | C | Closed 2026-08-07 (PR #14, commit `62e4c0a` → `develop`): full engine (`pregnancy.ts` — week/trimester from LMP/EDD with leap-year-safe UTC math, clamp 1–45 matching the `pregnancies` CHECK, trimester 13/27, milestone schedule first_anc_visit/day-84 · first_trimester_end/day-91 · viability/day-161 · birth/day-280, EDD countdown FR-037, `active`/`overdue` status FR-034, `compute` reproduces the WP-017 stub contract exactly); `PregnancyService` (recompute-on-edit FR-006 + lazy week-rollover FR-031, idempotent `pregnancy.week.changed` / `milestone.reached` via the pre-reserved vocabulary with `(user,week)` / `(user,milestone)` idempotency keys, producer `pregnancy-engine`, no PII); internal contract `GET /v1/users/internal/pregnancy/:userId` (06 §373); DI wiring in `app.ts`; OpenAPI snapshot/milestone schemas; **no migrations/schema changes** (events pre-reserved; `pregnancies` table suffices). Local gate green: lint/typecheck/build clean, redocly valid, 82 unit tests green (9 Postgres integration tests gated by `USERS_TEST_DATABASE_URL`). CI green on merge. | Backend |
| WP-020 | Content service / CMS foundation | C | Closed 2026-08-07 (PR #15, commit `7766938` → `develop`, merge `f1bb2da`): `services/content` on migration-011 tables only (`content`, `content_versions`; no DDL) — draft→update(new immutable version + `change_note` snapshot)→submit (EN/AM parity FR-079)→**approve = approve→publish one step** (`pending_medical_review→approved→published`, `medical_reviewed=true`, reviewer recorded on latest version snapshot, `content.published` ×2 per language `en`/`am`, idempotency key `${content_id}:${version}`)→archive (emits `content.retired` only when it had been published); published-only GET/list/search (EN FTS; `language:am`→`[]`), SoD FR-106 (author cannot approve own content → 403), staff gate on all writes (Phase-2 RBAC boundary — no `content_manager`/`reviewer` roles yet), actor from token `sub` never body; §12.5 surface exactly — no `/publish` endpoint (documented interpretation decision). HS256 JWT verification via `requireBearerPlugin`; `ContentConfig` (`FN_CONTENT_*`, port 3300, `FN_STORE_DRIVER` memory|postgres, default local `FN_DATABASE_URL`); events best-effort/no-outbox (mirrors users `publishEvent`). Local gate green: lint/typecheck/build/sast clean, redocly contract valid, 60 tests green — 53 unit (line coverage 94.5% — hermetic fake-Pool PG-store tests cover the SQL layer like WP-017) + 7 Postgres integration tests green against an ephemeral 001–011 baseline via `CONTENT_TEST_DATABASE_URL` (each test TRUNCATEs `content`/`content_versions` and seeds a staff reviewer in `users` — required by the `content_versions.reviewed_by → users(id)` FK). Approve/publish interpretation + `packages/i18n` deviation recorded in WP-020 implementation notes. CI green on merge. | Backend |
| WP-021 | Reminder engine | C | **Closed 2026-08-07** (direct-integrated on `develop`, evidence: `wp-021-progress-report.md`): implementation commit `8fbf557` `feat(reminders): implement WP-021 reminder engine foundation` + migration `018` `639c469` `feat(db): add WP-021 reminder schema migration`. `services/reminders` engine (template render FR-047, quiet-hours precedence user>template>defaults FR-029/FR-043, critical bypass FR-046, per-user daily cap 06 §4.14/FR-045, lead-time FR-043, recurrence FR-044) + memory/Postgres store adapters (M-08) + internal API (`reminders-internal.yaml`, AR-003, contract-lint gated) + job factory (scheduler registers `createRemindersJobs`, WP-024b hook); `reminder.due` best-effort (producer `reminder-engine`); stub dispatcher (Phase-4 handoff). Final integration review PASS (2026-08-07): no migrations/schema changes beyond `018`, no WP-022/023/024c, no gateway exposure. Quality green — reminders 91 tests + 92.57% lines (8 Postgres integration tests env-gated `REMINDERS_TEST_DATABASE_URL`), repo typecheck 20/20 / lint 14/14 / build 14/14 / test 20/20, contract:lint 5/5 (0 warnings). PR not created (commit directly integrated on `develop`); review conducted on the integrated commit. | Backend |
| WP-022 | Journal service | C | **Closed 2026-08-08** (direct-integrated on `develop`, evidence: `wp-022-progress-report.md`): implementation commit `25fe335` `feat(journal): implement WP-022 journal service foundation`. `services/journal` (SRS §12.9) — text entries only (entry_type CHECK covers the full SRS set; WP-022 API creates `text`), **private-by-default** (FR-052/FR-126): reads/updates/deletes owner-only, non-owned rows → 404 invisibility (never 403); partner read requires `shared_with_partner=true` AND a real `pregnancies.partner_user_id` journey link; opt-in share `POST /entries/:id/share` (FR-039); synchronous JSON export (FR-056); `journal.entry.created` best-effort (producer `journal-service`, no-PII payload `{entry_id,type,week,consent_flags}`, idempotency key = entry id); memory + Postgres store adapters (M-08, `FN_STORE_DRIVER`); `POST /media` → **501** `NOT_IMPLEMENTED` until WP-060 (no media implementation). Migration `019` only: `journal_entries` + `journal_media` (catalog row 006, append precedent D-10; up + down rollback verified); migration `018` unchanged; **no event-vocabulary changes**; no gateway routes; no partner-authz expansion. Final integration review PASS (2026-08-08). Quality green — journal 45 tests + 93.6% lines (6 Postgres integration tests env-gated `JOURNAL_TEST_DATABASE_URL`, verified live 6/6), repo typecheck 21/21, lint/build clean, contract:lint 6/6 valid (1 intentional warning — 501-only media endpoint). PR not created (direct-integrated on `develop`); review conducted on the integrated commit. | Backend |
| WP-023 | Checklist & budget service | IV | Implementation **COMPLETED** (committed `14205ec`, pushed to `origin/develop` 2026-08-08): migration `020-checklist-budget.ts` + `services/checklists` (checklist/budget API groups, progress-on-write, budget summary with M-07 cap, memory + Postgres store adapters, ownership 404-invisibility) + filled `checklists.yaml`/`budget.yaml` contracts; implementation review + governance resolution (M-07 Option B, M-08 closure) complete; verification PASSED (typecheck/lint/build/tests/coverage/contract + migration integration 17/17). **Commit + push COMPLETED 2026-08-08** (commit `14205ec`; PR structurally not applicable — direct-to-develop, see §9 PR Closure entry); no merge performed; WP-024c not started. | Backend |
| WP-024 | Event bus + outbox + scheduler | C | **WP-024a (packages-only, no committed migrations)** 2026-08-06: `packages/events` + `packages/idempotency` — canonical event vocabulary (36 events, `06` §2.2 names + `03` §4.6 aliases, FR-160), provider-agnostic `EventBus` (Redis Streams adapter + in-memory test-double, M-08/D-02), stream consumer (consumer groups, at-least-once, per-topic DLQ `12` §16 I-13), outbox relay (test-local DDL contract `OUTBOX_TABLE_DDL` — production schema deferred to separate DB approval; retries exp backoff + jitter; `onDead` OR-008), consumer dedup + scheduler run-id stores (FR-161/FR-163). Tests 51/51 green (unit + Redis/PG integration via `REDIS_TEST_URL`/`DATABASE_URL`, test-local outbox table); lint/typecheck/build clean; line coverage ≥ 92%. **WP-024b closed** 2026-08-06 (PR #17 `42617b6`, scheduler jobs foundation). **WP-024c CLOSED 2026-08-08** — per-service transactional outbox adopted across users/content/reminders/journal (same-TX domain write + outbox INSERT per D-03; `OutboxRelay` publishes only committed rows; approved vocabulary only; direct best-effort publishes replaced). Implementation commit `d640a57` (`feat(wp-024c): implement transactional outbox`, 54 files) pushed to `develop` (direct-to-develop precedent; no PR); migration `021-outbox` applied unchanged (committed hash `6aaedd29…29ed2`); governance D-11 + catalog row 019 committed exactly as authorized. Evidence: `wp-024c-progress-report.md`, §9 closure record. **WP-024 COMPLETE → Phase 2 (WP-015…WP-024) implementation work COMPLETE.** | Backend |

### Phase 3 — Authentication & Security (→ Gate G2)

| WP | Work Package | Status | Evidence | Owner |
| --- | --- | --- | --- | --- |
| WP-025 | OTP/MFA/token lifecycle | S | | Security |
| WP-026 | RBAC enforcement | S | | Security |
| WP-027 | Audit logging | S | | Security |
| WP-028 | Encryption (TLS/KMS/app-level) | S | | Security |
| WP-029 | Secrets management + rotation | S | | DevOps + Security |
| WP-030 | Webhook security pattern | S | | Security |
| WP-031 | Rate limiting & abuse controls | S | | Security |
| WP-032 | Incident-response runbooks | S | | Security + Ops |

### Phase 4 — WhatsApp Platform

| WP | Work Package | Status | Evidence | Owner |
| --- | --- | --- | --- | --- |
| WP-033 | Provider abstraction layer | S | | Integration |
| WP-034 | Webhook (handshake/HMAC/dedup) | S | | Integration |
| WP-035 | Conversation state machine | S | | Integration |
| WP-036 | Welcome & enrollment flows | S | | Integration |
| WP-037 | Prompts & pulses | S | | Integration |
| WP-038 | Template governance | S | | Integration + Content |
| WP-039 | Media pipeline | S | | Integration |
| WP-040 | Emergency workflow | S | | Integration + Clinical |
| WP-041 | Intent routing + multilingual | S | | Integration |
| WP-042 | Conversation logging & analytics feed | S | | Integration |
| WP-043 | Campaign service | S | | Integration |
| WP-044 | Messaging controls | S | | Integration |

### Phase 5 — AI/RAG Platform

| WP | Work Package | Status | Evidence | Owner |
| --- | --- | --- | --- | --- |
| WP-045 | Ingestion pipeline | S | | AI |
| WP-046 | Vector store (Qdrant) | S | | AI |
| WP-047 | Retrieval pipeline | S | | AI |
| WP-048 | Intent & language detection | S | | AI |
| WP-049 | Medical safety layer | S | | AI + Clinical |
| WP-050 | Model routing & fallback | S | | AI |
| WP-051 | AI orchestration service | S | | AI |
| WP-052 | AI ops dashboard (foundation) | S | | AI + Admin |
| WP-053 | Prompt management | S | | AI |
| WP-054 | AI audit trail + knowledge-gap capture | S | | AI |
| WP-055 | Pseudonymization to providers | S | | AI + Security |
| WP-056 | Eval set + safety regression | S | | AI + QA |
| WP-057 | AI ops monitoring | S | | AI + DevOps |

### Phase 6 — Mobile Application

| WP | Work Package | Status | Evidence | Owner |
| --- | --- | --- | --- | --- |
| WP-058 | App scaffold + auth | S | | Mobile |
| WP-059 | Journey experience | S | | Mobile |
| WP-060 | Journal (text/voice/photo) | S | | Mobile |
| WP-061 | Checklists | S | | Mobile |
| WP-062 | Budget tracker | S | | Mobile |
| WP-063 | Offline mode | S | | Mobile |
| WP-064 | Sync engine | S | | Mobile |
| WP-065 | Notifications | S | | Mobile |
| WP-066 | AI chat integration | S | | Mobile |
| WP-067 | Partner sync | S | | Mobile |
| WP-068 | Accessibility & voice-first | S | | Mobile |
| WP-069 | Localization EN/AM | S | | Mobile |
| WP-070 | Distribution readiness | S | | Mobile |
| WP-071 | Design-system conformance | S | | Mobile |

### Phase 7 — Admin Dashboard

| WP | Work Package | Status | Evidence | Owner |
| --- | --- | --- | --- | --- |
| WP-072 | Portal foundation (RBAC, MFA) | S | | Frontend |
| WP-073 | User management | S | | Frontend |
| WP-074 | CMS UI | S | | Frontend |
| WP-075 | Campaign management UI | S | | Frontend |
| WP-076 | Executive & analytics dashboards | S | | Frontend |
| WP-077 | AI operations dashboard | S | | Frontend |
| WP-078 | Research dashboards | S | | Frontend |
| WP-079 | Consent management views | S | | Frontend |
| WP-080 | Audit-log view | S | | Frontend |
| WP-081 | Operational report export | S | | Frontend |
| WP-082 | Support-agent interface | S | | Frontend |
| WP-083 | Retention configuration | S | | Frontend + DB |
| WP-084 | Admin notifications | S | | Frontend |
| WP-085 | Accessibility compliance | S | | Frontend |

### Phase 8 — Integration

| WP | Work Package | Status | Evidence | Owner |
| --- | --- | --- | --- | --- |
| WP-086 | Research/analytics pipeline | S | | Data |
| WP-087 | Research governance workflow | S | | Research |
| WP-088 | Pre/post assessment support | S | | Research |
| WP-089 | Partner sync end-to-end | S | | Mobile + Backend |
| WP-090 | Notification provider failover | S | | DevOps + Backend |
| WP-091 | End-to-end data flows (UC-001…005) | S | | Backend + QA |
| WP-092 | Feature-flag rollout platform | S | | DevOps |
| WP-093 | API/webhook integration surface | S | | Backend |
| WP-094 | Operational readiness artifacts | S | | Ops |

### Phase 9 — Testing (→ Gates 2–3 verified)

| WP | Work Package | Status | Evidence | Owner |
| --- | --- | --- | --- | --- |
| WP-095 | Unit testing sweep (QR-002) | S | | QA |
| WP-096 | Integration testing sweep (QR-003) | S | | QA |
| WP-097 | E2E testing (QR-004) | S | | QA |
| WP-098 | Contract testing (QR-005) | S | | QA |
| WP-099 | Performance/load testing (QR-006) | S | | QA + DevOps |
| WP-100 | Security testing (QR-007) | S | | Security |
| WP-101 | Accessibility testing (QR-008) | S | | QA |
| WP-102 | Privacy testing (QR-009) | S | | QA + Security |
| WP-103 | WhatsApp conversational testing (QR-010) | S | | QA + Integration |
| WP-104 | AI quality evaluation (QR-011/014) | S | | AI + QA |
| WP-105 | Test data management (QR-012) | S | | QA |
| WP-106 | Traceability refresh (QR-015) | S | | QA Lead |
| WP-107 | UAT (QR-017) | S | | Program |
| WP-108 | Clinical/content validation (QR-019) | S | | Healthcare & Content |
| WP-109 | Release review (QR-016) | S | | DevOps |
| WP-110 | Final Gates 2–3 verification | S | | QA Lead |

### Phase 10 — Pilot Deployment (→ Gate G3)

| WP | Work Package | Status | Evidence | Owner |
| --- | --- | --- | --- | --- |
| WP-111 | Gate 3 decision package | S | | Program |
| WP-112 | Cohort onboarding operations | S | | Research + Ops |
| WP-113 | Production monitoring & alerting live | S | | DevOps |
| WP-114 | Support operations (L1–4) | S | | Ops |
| WP-115 | Incident management | S | | Ops |
| WP-116 | DR & business continuity | S | | DevOps |
| WP-117 | Rollback readiness | S | | DevOps |
| WP-118 | Stakeholder communication | S | | Program |
| WP-119 | Pilot evaluation (QR-018) | S | | Research + M&E |
| WP-120 | Phase-0 backlog clean-up | S | | Program |

---

## 8. Evidence Registry Reference

- Every closed WP references evidence artifacts per `18` §9 naming/location scheme.
- Gate checklists G1/G2/G3: `21` §3/§4/§5.
- Traceability status per requirement: `22` + this tracker; refresh at every milestone (QR-015).

---

## 9. Update Log

| Date | Updated By | Change |
| --- | --- | --- |
| 2026-08-05 | Implementation Planning Phase | Initial tracker created; planning complete; all WPs Not Started; all gates Not Started; M-01…M-07 Open |
| 2026-08-05 | Repository Governance Resolution | AGD-001 recorded in decision-log §7; permanent docs (SRS + implementation-plan set + README + LICENSE) staged for tracking; working/runtime artifacts ignored |
| 2026-08-05 | Milestone 1 Verification Gate | M1 (Phase 1 foundation) verified: WP-008/WP-009/WP-011 → In Verification; evidence below. No commit created — staged for human review |
| 2026-08-05 | Milestone 1 Remediation | Verification findings closed: Fastify FSTDEP023 fixed; devcontainer Docker feature pinned; CI actions SHA-pinned. Evidence below |
| 2026-08-05 | Milestone 1 Commit + Doc Sync | M1 committed locally as `b616224` (`chore(repo): Milestone 1 repository foundation`, 103 files); this tracker updated to reflect committed state. **Awaiting remote push authorization and final human sign-off.** |
| 2026-08-05 | Milestone 1 CI Remediation | Post-push CI failure (Typecheck TS7006) resolved: `26acb6e` declares missing workspace dependency edges (test-utils → logger; gateway → test-utils dev). Clean `npm ci` validation green; GitHub Actions run 30963968046 quality job passed (13/13 steps incl. typecheck). Evidence below |
| 2026-08-05 | Milestone 1 CI Evidence Doc Sync | `9e4c454` docs(status): record Milestone 1 CI remediation evidence (run 30963968046, 13/13; run 30964438595 on `9e4c454` Quality success). |
| 2026-08-05 | **Gate G1 Human Acceptance** | **Gate G1 ACCEPTED** by human decision. Evidence reviewed and accepted: repository foundation, workspace config, shared package foundation, gateway skeleton, health endpoints, Docker foundation, CI foundation, documentation baseline, CI dependency remediation, GitHub Actions Quality passing, documentation synchronized, main branch governance configured. Ruleset `20422621` verified (PR required, 1 approval, stale-dismissal on, Quality status check required, force-push/deletion blocked, no bypass, admins enforced, conversation resolution on, linear history). **Phase 2 / Milestone 2 remains NOT AUTHORIZED.** |
| 2026-08-05 | **Phase 2 Conditional Foundation Authorization** | Human granted **CONDITIONAL FOUNDATION AUTHORIZATION ONLY** for Phase 2 — preparation activities allowed: STRIDE review completion, DPIA completion, migration baseline preparation (WP-013), secret management foundation (WP-012), IaC preparation (WP-010), develop branch workflow setup, environment readiness activities. **NOT AUTHORIZED / blocked:** business functionality, user/profile services, pregnancy engine, consent service implementation, content service, reminder engine, journal service, business APIs, mobile app, admin dashboard, production deployment. WP-015…WP-024 business deliverables remain blocked pending M-01…M-07 closure / further authorization. WP-010/WP-012/WP-013 → In Progress (preparation). |
| 2026-08-05 | **Phase 2 Foundation Preparation Executed** | WP-013 tooling foundation + security/privacy drafts completed (human-approved scope). Changes (working tree, **not committed — awaiting separate authorization**): `packages/db` created (node-pg-migrate 7.9.1 runner, pg 8.13.1, migrate up/down/check, empty `migrations/`, jest unit tests); root `package.json` override `node-pg-migrate→glob 11.1.0` (resolves GHSA-5j98-mcp5-4vw2; `npm audit` clean 0 vulns); `.github/workflows/ci-cd.yml` added `db-baseline` job (ephemeral postgres:16-alpine, validates `pgmigrations` tracking table; quality gate/deploy jobs untouched); STRIDE + DPIA drafts at `verification/audits/threat-model/` and `verification/audits/dpa/` (**DRAFT, not signed — G1-05/G1-06 pending**); WP-005/WP-013 rows updated. Validation: `migrate:up`/`migrate:check` green against compose postgres; checks pending: build/typecheck/lint/format/test:coverage/sast/secret:scan. |
| 2026-08-05 | **Project Owner Full Phase 2 Authorization (governance record)** | Documentation-only; no implementation, no commit, no push. Recorded: **M-01 APPROVED** — initial production cloud provider **Google Cloud Platform (GCP)**; **cloud-agnostic architecture** confirmed (Docker containers, Terraform IaC, PostgreSQL, environment-based configuration, provider abstractions; AWS/DigitalOcean/Azure/Kubernetes remain supported). **G1-05 STRIDE APPROVED by Project Owner** and **G1-06 DPIA APPROVED by Project Owner** (draft evidence preserved at `verification/audits/`; no independent security/privacy reviewer sign-off claimed). **Migration 001 AUTHORIZED for future Milestone 2 implementation only — not created.** **FULL PHASE 2 AUTHORIZATION GRANTED** — WP-015…WP-024 authorized to begin with approved work packages; **not started**. M-02…M-07 remain Open. Updated: `implementation-status.md`, `decision-log.md` (§1 M-01 + §1.1 closure record), `21-quality-gate-checklist.md` (§3.4 governance approvals record). |
| 2026-08-05 | **AGD-002 Governance Update (Project Owner)** | AGD-002 Solo Maintainer Merge Policy **approved 2026-08-05**: sole maintainer may merge own PRs via a rule-scoped ruleset `20422621` bypass (`MIKEINTOSHSYSTEMS` id `37907891`, `always`) — documented exception, NOT an independent review; security-sensitive changes (auth/tokens, PII, encryption, AI prompts, dependencies, IaC/CI) require documented Project Owner sign-off + mandatory CI; independent review resumes when a second account exists. Recorded in `decision-log.md` §7; referenced in `12` §5.3/§5.6, `architecture-baseline.md` §17, `repository-bootstrap-order.md` Step 1, `21-quality-gate-checklist.md` §3.4/§6. `milestone-2-implementation-plan.md` cross-reference pending PR #4 merge (file not on `main`). |
| 2026-08-05 | **Milestone 2 Implementation Plan Approved (Project Owner)** | Milestone 2 Implementation Plan **APPROVED 2026-08-05** — header finalized to Approved; Phase 2 project plan (`milestone-2-implementation-plan.md`) sanctioned for execution. `develop` branch created + pushed from `main` (`7cb9a06`) per plan §9 before any WP-015 work. |
| 2026-08-05 | **WP-015 Implementation (API platform foundation)** | WP-015 implemented 2026-08-05: `/v1` platform middleware in gateway (CORS allow-list, Bearer pass-through, Redis token-bucket rate limiting with memory fallback, `Idempotency-Key` idempotency with 24h TTL), smoke routes `/v1/ping` + `/v1/platform/echo`, config registry additions (`FN_REDIS_URL`, `FN_STORE_DRIVER`, `FN_RATE_LIMIT_*`, `FN_IDEMPOTENCY_TTL_SECONDS`), OpenAPI contract additions (`common.yaml`, `gateway.yaml` `/v1/`, 6 per-service skeletons), compose + `.env.example` updates, CI `redis` service in quality job. Dependencies added: `@fastify/cors@10.0.0`, `ioredis@5.4.1` (gateway) — dependency change recorded per AGD-002 security-sensitive list; Project Owner sign-off covered by the WP-015 implementation authorization. Gateway tests 40/40 green (incl. Redis integration against live Redis). Branch `feature/wp-015-api-platform-foundation` → PR to `develop`; WP-016…WP-024 remain Not Started. |
| 2026-08-05 | **WP-013 Migration Baseline Implementation (migrations 001–004)** | Database Migration Baseline implemented 2026-08-05 (branch `feature/wp-013-migration-baseline`, commit `9c8a6c4`): migrations 001–004 per `05` §4.2 — extensions + `fn_research`/research roles (AR-013), `users`+`profiles` (encrypted `phone_e164` + HMAC digest unique index, 05 §8.1), `pregnancies`+`babies` (domain checks, CASCADE/SET NULL), `consents`+`user_preferences`. **Design resolution (pre-first-application, recorded for AGD-002 sign-off):** `05` §8.5.2's "partial unique index on `granted`" is logically incompatible with append-only re-consent (FR-125) — replaced by a `BEFORE INSERT` state guard (grant → withdraw → re-grant, one active grant per type); the append-only `BEFORE UPDATE OR DELETE` trigger permits only the right-to-erasure cascade path via `SET LOCAL app.consent_erasure = on` (SRS §13.4, FR-007/FR-128), matching SRS §13.3.4 (no partial index in SRS; CASCADE explicit). Auth storage tables deferred per `05` §4.3. Validation: `migrate:up`/`migrate:check` green; migration integration tests 9/9 (up → schema/constraint/immutability asserts → down → re-up); package lint/SAST/typecheck/build/coverage green; CI `db-baseline` extended with `test:migrations`. |
| 2026-08-05 | **M-08 Decision Approval (Project Owner)** | **M-08** "Phase 2 open-decision handling + provider-agnostic test-doubles" **APPROVED/CLOSED 2026-08-05** (Project Owner; M-08 Decision Review Report + M-08 Approval Authorization). Decision: Phase 2 (WP-015…WP-024) executes behind provider-agnostic adapters + test-doubles (AR-004/FR-149, M-01 cloud-agnostic precedent) — no provider-coupled code lands in Phase 2; M-07 adopted at the `20` reference default as a configurable budget cap for WP-023; M-02 OTP delivery via adapter + test-double, final provider deferred to Phase 4 (D-01); M-03/M-04/M-05/M-06 remain Open, consumed only at their documented phases; Phase 2 authorization recorded as the governing override of "all seven closed before code" **for Phase 2 only** (`21` G1-02 relaxation noted). **Governance decision only** — no production provider selected; no implementation started (no WP-024a, WP-016, schema, migrations, APIs, UI); auth-state storage remains deferred to DB architect (`05` §4.3); AGD-002 unchanged. Updated: `decision-log.md` §1.2 (status Approved/Closed) + §1.3 (closure record); this tracker. Next work (WP-024a) gated on M-08 closure + separate one-WP-at-a-time authorization (`milestone-2-implementation-plan.md` §2, §11). |
| 2026-08-06 | **WP-024a Implementation + Merge (event bus + outbox + idempotency packages)** | WP-024a implemented 2026-08-06 (branch `feature/wp-013-migration-baseline`). **Scope per authorization:** packages-only; no committed DB migration, no schema changes, no migration-numbering updates (`05` §4.2/decision-log untouched); outbox verified against a **test-local table** only — production outbox schema requires a separate DB architecture approval + migration authorization. Created **`packages/events`** (FR-160/FR-161/AR-007): canonical event vocabulary (`EVENT_REGISTRY`, 36 events — `06` §2.2 names + `03` §4.6 aliases/idempotency keys, `availability` phase2/reserved), provider-agnostic `EventBus` (M-08, D-02) with Redis Streams adapter (one stream per event type: `events:<name>`) + hermetic in-memory test-double; stream consumer (consumer groups, at-least-once delivery, ack-based, per-topic DLQ `<stream>.dlq` per `12` §16 I-13 with OR-008 `dlqLen`/`pendingCount` surfaces); outbox relay (publish-on-commit, exactly-once per row, exponential backoff + jitter per `03` §5.4 with `backoffMs` export, `onDead` hook + `status='dead'` DLQ, `OUTBOX_TABLE_DDL` canonical per-service contract, `PostgresOutboxReader` with SQL-injection-safe table validation); event envelope factory with `EventValidationError` and No-PII rule (FR-022) documented. Created **`packages/idempotency`** (FR-161/FR-163): consumer dedup store (`claim`/`isProcessed`, memory + Redis `SET NX PX` under `consumer-dedup:<name>:<id>`, per-consumer isolation) + scheduler job-run store (`claimRun` — run-id binding prevents duplicate scheduler runs across relay restarts). Tests **51/51 green** (events 39, idempotency 12) incl. Redis integration (`REDIS_TEST_URL`) and Postgres+Redis outbox integration against a test-local `outbox` table (`DATABASE_URL`); suites run serially (`maxWorkers: 1`, shared infra); line coverage events 92.34% / idempotency 95.23% (QR-002 global ≥70%); lint + SAST clean (0 errors/0 warnings), typecheck + build green (logger/idempotency/events). Deps added: `ioredis@5.4.1`, `pg@8.13.1`, `@types/pg@8.11.10` + workspace edges (`events`→`logger`, `events`→`idempotency` dev) — recorded per AGD-002 security-sensitive list. **Merged to `develop` 2026-08-06 (PR #8, squash `f28bab47`)** after CI fix (turbo `globalPassThroughEnv` for `REDIS_TEST_URL`/`DATABASE_URL`, commit `023a55a`); CI run #31064067360 green incl. staging image build. **Remaining for WP-024b/c:** background scheduler jobs (prompt/pulse/reminder), service adoption of outbox relay + consumer dedup, and the production outbox migration (blocked on separate DB schema approval). |
| 2026-08-06 | **Auth State Storage Decision Approval (Project Owner)** | **Option A — Redis-only auth state for WP-016** approved 2026-08-06. Applies only to OTP verification state + initial refresh-token state handling; exercised through a **provider-agnostic adapter + test-double** (M-08); only hashed OTP/token values stored (`code_hash`/`token_hash`); Redis retention discipline documented; revoked-refresh-set retention ≥ refresh-token lifetime (default 30 d); **Phase 3 (WP-025) owns full refresh-token rotation + reuse-detection** (Option B / migration `018` remains the documented upgrade path). No auth tables, no migration `018`, migration baseline unchanged; M-08 unchanged; M-02 (OTP delivery provider) remains deferred (Phase 4); `staff_users`/`staff_mfa` deferred to Phase L. Recorded: `decision-log.md` D-09 + closure §3.1; `05` §4.3; `06` Phase B; `milestone-2-implementation-plan.md` §5.4/§10.3. **WP-016 not started — awaits separate authorization.** |

| 2026-08-07 | **Governance tracker close-out (WP-016…WP-020)** | Documentation-only update (no code/schema/migrations): WP-016 → Closed (PR #11, `ea1a85d`, 2026-08-06); WP-018 → Closed (PR #13, `2946c26`, 2026-08-07); WP-019 → Closed (PR #14, `62e4c0a`, 2026-08-07); WP-020 → Closed (PR #15, `7766938`/merge `f1bb2da`, 2026-08-07); M2 milestone row refreshed to reflect all closed WPs + remaining WP-021…WP-024b/c. Historical detail (merge commits, dates, verification status, dependencies, deferred items, limitations) preserved in each row. **No implementation changes; no next WP started — awaits separate authorization.** |
| 2026-08-07 | **WP-021 Implementation (reminder engine foundation)** | Implemented locally 2026-08-07 (evidence `wp-021-progress-report.md`; working tree **uncommitted — awaits separate commit authorization**). Migration `018-reminders.ts` committed + pushed (`639c469` `feat(db): add WP-021 reminder schema migration`) — `reminder_templates`/`reminder_instances`/`reminder_dispatches` (CHECK enums, `UNIQUE(instance_id, run_id)` FR-163, partial unique `dedupe_key` FR-048, `(status,due_at)` + `(user_id,dispatched_at)` indexes). New `services/reminders` (@fathersnet/reminders): template engine EN/AM fail-closed (FR-047), quiet-hours precedence user>template>defaults (FR-029/FR-043), critical bypass (FR-046), per-user daily cap in-transaction (06 §4.14/FR-045), lead-time (FR-043), recurrence (FR-044), `reminder.due` best-effort (producer `reminder-engine`), stub dispatcher (no delivery claimed, R8), memory + Postgres adapters (M-08), internal contract + ownership control (02 §5), job factory self-configuring from `FN_REMINDERS_*` (R3). Scheduler injects `createRemindersJobs` (WP-024b hook). Contract `reminders-internal.yaml` before code (AR-003), gated in `contract:lint`/`sast`. **Local gates green:** reminders 91 tests / 92.57% lines (8 Postgres integration tests env-gated `REMINDERS_TEST_DATABASE_URL`), scheduler 33 tests; repo typecheck 20/20, lint 14/14, test 20/20; contract:lint 5/5 specs valid 0 warnings (healthz/readyz `4XX` per gateway pattern). Interpretations recorded in progress report: unknown body props silently stripped (Fastify `removeAdditional`, same as content); renderer missing-variable → `failed`; language per-user at dispatch default `en`; quiet-hours end-exclusive; recurrence one-instance-per-call; dedupe readiness-only. Boundaries honored: no gateway `/v1/`, no auto-scheduling from events, no real delivery, no outbox, `004` untouched. |
| 2026-08-07 | **WP-021 Closure (reminder engine foundation)** | Documentation-only closure (no code/schema changes): implementation commit `8fbf557` committed + pushed directly to `develop` (post-commit gates green — reminders 91 tests, typecheck/lint clean; repo typecheck 20/20, lint 14/14, build 14/14, test 20/20; contract:lint 5/5 valid 0 warnings). **PR not created** — commit already integrated on `develop` (empty-diff constraint; `gh`/token unavailable); final integration review PASS conducted on the integrated commit (scope/implementation/quality/governance verified; migration `018` unchanged; no WP-022/023/024c; no gateway exposure). WP-021 → **Closed**; tracker rows updated (§7 registry, M2). Next work package (WP-022/023/024c) **not started — awaits separate authorization.** |
| 2026-08-08 | **WP-022 Closure (journal service)** | Documentation-only closure (no code/schema changes): implementation commit `25fe335` committed + pushed directly to `develop` (post-commit gates green — journal 45 tests + 93.6% lines, 6 Postgres integration tests verified live; repo typecheck 21/21, lint/build clean; contract:lint 6/6 valid, 1 intentional warning on the 501-only media endpoint). **PR not created** — commit already integrated on `develop`; final integration review PASS conducted on the integrated commit (scope/implementation/quality/governance verified; migration `019` only, `018` unchanged; no event-vocabulary changes; no gateway routes; no media implementation; no partner-authz expansion; no WP-023/024c). WP-022 → **Closed**; tracker rows updated (§7 registry, M2). Next work package (WP-023/024c) **not started — awaits separate authorization.** |
| 2026-08-08 | **WP-023 Governance Resolution — M-07 + M-08 closure (Project Owner decision)** | Documentation-only governance update (no code/schema/migrations — documentation-only; WP-023 implementation **completed** earlier, working tree uncommitted). **M-07 APPROVED (Option B):** `FN_BUDGET_CAP = 0` (unset); budget cap disabled by default; summary `cap`/`remaining` null while unset; **no per-user reference amount approved**; the `20` §4 program-level scenarios (≈$474k/$606k/$801k) are program ceilings, not per-user caps; a future per-user reference amount requires a **separate governance decision**; existing checklist & budget behavior unchanged. **M-08 CLOSURE RECORD WRITTEN:** `decision-log.md` §1.2 → Approved/Closed + new §1.3 closure record (closure-record date **2026-08-08** — the 2026-08-05 §9 M-08 entry's claimed `decision-log.md` §1.2/§1.3 update is now materialized; its "M-07 adopted at the `20` reference default" statement is **superseded** by the M-07 Option B decision, `decision-log.md` §1.4). Updated: `decision-log.md` (§1 M-07 row, §1.2 M-08 status + decision item 2, §1.3 M-08 closure record, §1.4 M-07 closure record, §1.1 note, END note), this tracker (§1 snapshot, §2 doc status, §4 M0, §5 rows, §7 WP-002), `milestone-2-implementation-plan.md` (§2 table + §10 items 1–2), `wp-023-implementation-plan.md` (status, R5, approval record). **Test-only correction:** `packages/db/test/migrations.integration.test.ts` line 1014 `toBeTruthy()` → `toBeNull()` (migration 020 has no DB default for `completed_at`; store stamps it — the raw-INSERT assertion previously failed on real Postgres). No implementation changes, no migration changes, no commit. WP-023 implementation is **COMPLETED** (working tree, uncommitted) — commit/push/PR await separate authorization (current-status clause corrected by the Final Governance Consistency Audit — see next entry). |
| 2026-08-08 | **WP-023 Final Governance Consistency Audit** | Documentation-only correction (no code/schema/API/test changes): WP-023 status corrected from "Not Started" to **Implementation COMPLETED (working tree, uncommitted)** — §7 registry row `S` → `IV` with evidence; M2 milestone row updated ("remaining: WP-023, WP-024c not started" → WP-023 implementation completed 2026-08-08, awaiting commit authorization; WP-024c still not started); the prior §9 governance-resolution entry's "Not Started" current-status clause corrected (governance substance unchanged); `wp-023-implementation-plan.md` status + approval record aligned (implementation completed; commit/push/PR/merge still pending); `decision-log.md` §1.4 dependent-phase note aligned. Historical entries (WP-021/022 closure rows, 2026-08-05 planning rows) left intact. Commit/push/PR/merge remain **not authorized**; no WP-024c; nothing staged. |
| 2026-08-08 | **WP-023 Plan-Gap Findings — Project Owner Decision (accepted/deferred)** | Documentation-only governance record (no code/schema/API/test/migration changes; no compose/env creation). **Project Owner decision (Option B)** on the final pre-commit audit findings: (1) `docker-compose.yml` checklists-service block — **accepted/deferred, non-blocking for WP-023 completion** (plan-listed deployment convenience; not listed in the milestone §5.10 acceptance/file criteria, the implementation verification plan, or any SRS/architecture/milestone requirement; repo precedent does not universally require a compose block); (2) `.env.example` `FN_CHECKLISTS_*` block — **accepted/deferred, non-blocking for WP-023 completion** (documentation/developer-environment convenience; service operates on documented config once the required `FN_CHECKLISTS_JWT_SECRET` is supplied). **Neither omission prevents WP-023 implementation completion; neither omission is an acceptance failure; no implementation correction is required.** Any future deployment/documentation completion (compose block, `.env.example` block) may be handled separately without expanding this WP-023 commit. Decision evidence: Project Owner authorization 2026-08-08 (this decision); no fabricated evidence/signatures/approvals; no historical records rewritten. Commit/push/PR/merge remain **not authorized**; WP-024c not started; nothing staged. |
| 2026-08-08 | **WP-023 PR Closure — Structurally Not Applicable (Project Owner decision)** | Documentation-only governance record (no code/schema/API/test/migration changes; no implementation correction). **WP-023 commit** **`14205ec323376ab938241b782f3d9209b046f204`** (**feat(checklists): implement WP-023 checklist and budget services**) was committed directly to **develop** and pushed to `origin/develop`. PR creation was evaluated per the governed flow; **a PR is structurally not applicable** because the WP-023 commit is already an ancestor of the target branch, and the temporary `feature/wp-023-checklists` branch at the same commit has zero commits and an empty diff against `develop`. This follows the **WP-021/WP-022 direct-to-develop precedent**. **No PR was created; no merge was required; no PR number, URL, review, approval, or merge is claimed.** This is **not an implementation defect**; no code correction is required; **WP-023 remains COMPLETED** on `develop` (`14205ec`). WP-024c not started; working tree clean; nothing staged. |
| 2026-08-08 | **WP-024c Closure — Per-Service Transactional Outbox (Project Owner decision)** | Documentation-only closure (no code/schema/API/test/migration changes; no implementation correction). **WP-024c commit** **`d640a576e20d64821481786e7240ad10c7332da1`** (**feat(wp-024c): implement transactional outbox**) was committed directly to **develop** and pushed to `origin/develop` (54 files, 2349 insertions / 753 deletions). WP-024c implemented per-service transactional outbox across users/content/reminders/journal: domain write + outbox INSERT in the same DB transaction (`user_outbox`, `content_outbox`, `reminder_outbox`, `journal_outbox` on migration `021-outbox`, unchanged since its prior authorization — committed hash `6aaedd29…29ed2`); `OutboxRelay` publishes only committed rows; approved vocabulary only (`user.enrolled`, `user.profile.updated`, `user.consent.changed`, `pregnancy.week.changed`, `milestone.reached`, `content.published`, `content.retired`, `reminder.due`, `journal.entry.created`); direct best-effort publishes replaced; journal gained its first explicit client TX. **PR structurally not applicable** (direct-to-develop precedent — same-commit branch has empty diff); no PR/merge claimed. Post-commit validation green: users 85 / content 55 / reminders 94 / journal 47 tests, typecheck/lint clean; migrations 19 passed; events 28 + outbox integration 4 passed live; journal+content PG integration 6/6 + 7/7 live; only pre-existing gated failures in users (2, `parsePregnancy` DATE→UTC roundtrip) and reminders (1, due-cutoff semantics), both untouched, never run in CI. **WP-024c → Closed**; tracker rows updated (§7 registry WP-024 → **C**, M2 milestone row — **Phase 2 (WP-015…WP-024) implementation work COMPLETE**); evidence `wp-024c-progress-report.md`. M2 exit verification (milestone-2 §4 Step 13) **not yet performed**; WP-025 / Phase 3 **not started — awaits separate authorization.** |
| 2026-08-08 | **M2 E2E Governance Conflict — M-09 Resolution (Project Owner decision)** | Documentation-only governance record (no code/schema/API/test/migration changes; no E2E harness, no test files, no package/CI/Turbo changes, no commit/push/PR/merge). M2 exit verification performed (milestone-2 §4 Step 13): **criteria 2–6 PASS; criterion 1 BLOCKED** (no UC-001/QR-004 Journey-1 E2E evidence exists). Conflict identified: the M2 exit criterion requires a "UC-001 E2E report (QR-004 journey 1)" artifact but **no Phase 2 WP (WP-015…WP-024) charters a Journey-1 E2E harness**, and the broader QR-004/§17.4 E2E program is owned by **WP-091** (Phase 8) and **WP-097** (Phase 9); no prior governance decision resolved this. **Project Owner decision 2026-08-08 — M-09, OPTION A: minimal Phase-2 Journey-1 verification**, limited to the M2 criterion chain (registration → OTP → versioned consent → UUID → pregnancy-week computation) for the M2 acceptance artifact only (`decision-log.md` §1.5). **The M2 acceptance criterion is unchanged** — not weakened, deferred, removed, or rewritten. **WP-091/WP-097 retain ownership of the broader E2E program** (UC-001…UC-005 / QR-004 / §17.4 journeys, device matrix, dashboard role testing, later-phase E2E scope). **WP-025 NOT authorized** — no OTP/MFA/token-lifecycle implementation may be pulled forward. **Phase 3 NOT authorized.** **The broader QR-004/§17.4 E2E program NOT authorized.** **M2 remains BLOCKED** until the Journey-1 evidence is actually produced and verified; a **separate implementation authorization is required** before creating the E2E test/harness. Updated: `decision-log.md` §1.5; this tracker (§1 snapshot, §2 doc status, §4 M2 milestone row, §9); `milestone-2-implementation-plan.md` §2 (authorization row). |

### Milestone 1 Verification Evidence (2026-08-05 gate)

Environment: local Windows dev (git 2.51.2, Node v20.20.2, npm 10.8.2, Docker 28.5.2, PowerShell 7). **Commit:** `b616224` `chore(repo): Milestone 1 repository foundation` — committed + pushed; GitHub Actions quality job green (run 30963968046); **Gate G1 ACCEPTED by human 2026-08-05** (Phase 2 not authorized).

- **Tooling:** npm workspaces + turbo 2.10.8; TS strict (8/8 typecheck); ESLint 8.57.1 + prettier 3.9.6 format:check green; jest 30.4.2 coverage green (gateway 88.09% lines, all 8 tasks pass); husky pre-commit active.
- **Build/CI:** `npm run build` 6/6; `npm run audit` 0 vulns (prod deps); `npm run sast` 6/6; `npm run contract:lint` valid (Redocly); `npm run secret:scan` clean; CI workflow YAML valid (quality/staging/production jobs).
- **Docker:** `docker compose config --quiet` valid (default + dev profile); full stack up with all 5 containers healthy; `/healthz` + `/readyz` 200 via gateway direct (3000) and nginx 8080/8443; 404 returns standard error envelope with request_id.
- **Remaining issues (non-blocking):** (1) ~~Fastify FSTDEP023 deprecation~~ **RESOLVED 2026-08-05** — `disableRequestLogging` replaced with `logController: new LogController({ disableRequestLogging: true })` (fastify 5.11.2, no major upgrade); no warning in tests or running container. (2) ~~devcontainer `docker-in-docker` `latest`~~ **RESOLVED 2026-08-05** — feature pinned `docker-in-docker:2.17.0` (latest 2.x), Docker engine pinned `28.5.2` (matches host; NFR-036). (3) ~~CI `@v4` tags~~ **RESOLVED 2026-08-05** — actions SHA-pinned: `actions/checkout@11d5960a…`, `actions/setup-node@49933ea5…`, `trstringer/manual-approval@fa642940…`; workflow YAML still valid. (4) **DEFERRED** — deploy steps in CI are placeholders until M-01 + IaC (WP-010; out of M1 scope); (5) **DEFERRED** — GitHub branch protection not yet enabled (requires repo admin outside M1).
- **Boundary check:** no business logic, auth, database, APIs (beyond health), WhatsApp, AI, mobile, or admin code present. OpenAPI spec defines `/healthz` + `/readyz` only.

### Milestone 1 Remediation Evidence (2026-08-05)

- **Build/quality (all green after remediation):** `npm run build` 6/6; `npm run typecheck` 8/8; `npm run lint` 6/6; `npm run format:check` all matched files clean; `npm run test:coverage` 8/8 (gateway 88.09% lines); `npm run audit` 0 vulns; `npm run sast` 6/6; `npm run secret:scan` clean.
- **Docker:** `docker compose config --quiet` valid (default + dev profile); gateway image rebuilt with the Fastify fix; all 5 containers healthy; `/healthz` + `/readyz` 200 direct (3000) and via nginx 8080/8443; gateway container logs free of FSTDEP023/deprecation.
- **Files changed this remediation:** `.devcontainer/devcontainer.json` (feature + engine pins); `.github/workflows/ci-cd.yml` (SHA pins); `services/gateway/src/app.ts` (logController); `implementation-status.md` (this record). Committed 2026-08-05 as `b616224`.

### Milestone 1 CI Dependency Remediation Evidence (2026-08-05)

- **Root cause:** `packages/test-utils` imported `@fathersnet/logger` (`packages/test-utils/src/index.ts:1`) without declaring it — manifest and lock entry had no dependency edge — so turbo ordered `test-utils:typecheck` before `logger:build` on fresh clones; with no `dist/`, the module resolved as untyped → TS7006. Same defect class: `services/gateway/test/health.test.ts:3` imported `@fathersnet/test-utils` undeclared (test-only).
- **Fix (`26acb6e` `fix(workspace): declare missing @fathersnet dependency edges`):** added `@fathersnet/logger: "*"` to `packages/test-utils/package.json` (`dependencies`) and `@fathersnet/test-utils: "*"` to `services/gateway/package.json` (`devDependencies`); `package-lock.json` updated (2 dependency edges only, 7+/1−). No source, CI, or architecture changes.
- **Clean CI reproduction validation:** removed all `dist/`/`coverage`/`.turbo` → `npm ci` → `turbo run typecheck --force` **9/9** (previously failed in this exact state); `npm run build` 6/6; `npm run lint` clean; `npm run format:check` clean; `npm run test:coverage` **9/9** (gateway 88.09% lines; config 93.65%, errors 75.51%, logger 82.75%, test-utils 87.09% — QR-002 global ≥70%); `npm run audit` 0 vulns; `npm run sast` clean; `npm run secret:scan` clean.
- **CI verification (GitHub Actions):** run **`30963968046`** on `26acb6e` — **Quality job passed, 13/13 steps** (Lint, Format check, **Typecheck**, Tests with coverage, Build, SAST, API contract lint, Dependency audit, Secret scan). `Deploy to production (main)` parked at the manual-approval gate (deploy steps are placeholders — not approved); `Deploy to staging (develop)` skipped (no `develop` branch).
- **Gate G1 evidence status:** engineering/tooling evidence package complete; **Gate G1 ACCEPTED 2026-08-05** — branch protection active (ruleset `20422621`: PR required, `required_approving_review_count: 1`, `dismiss_stale_reviews_on_push: true`, `required_review_thread_resolution: true`, required status check `Quality (lint, typecheck, tests, build)`, force-push + deletion blocked, linear history) and human acceptance recorded. **2026-08-05 AGD-002 (solo-maintainer merge policy):** rule-scoped bypass actor added for the sole maintainer only — `MIKEINTOSHSYSTEMS` (id `37907891`), `bypass_mode: always`; `required_approving_review_count: 1` unchanged for contributors; documented exception, NOT an independent review (see `decision-log.md` §7). **Phase 2 / Milestone 2 NOT AUTHORIZED until separately approved.**

---

**END OF DOCUMENT — Implementation Status (FathersNet / Ayay).** Live tracker for WP-001…WP-120, gates G1/G2/G3, milestones M0–M9, decisions M-01…M-09 + AGD-001/AGD-002, and risks PM-01…PM-64. Next update: Gate G1 accepted 2026-08-05; **FULL PHASE 2 AUTHORIZATION GRANTED 2026-08-05 (Project Owner)** — M-01 approved (initial production cloud provider **GCP**, cloud-agnostic), G1-05 STRIDE + G1-06 DPIA **Approved by Project Owner**, **Migration 001 authorized for future Milestone 2 implementation only**, WP-015…WP-024 business implementation authorized to begin with approved work packages (**not started** — governance record only). **AGD-002 solo-maintainer merge policy Approved/Closed 2026-08-05 (Project Owner)** — ruleset `20422621` sole-maintainer bypass verified; see `decision-log.md` §7. **M-07 + M-08 Approved/Closed 2026-08-08 (Project Owner)** — M-07 Option B (`FN_BUDGET_CAP = 0`, unset; no per-user reference amount — `decision-log.md` §1.4); M-08 Phase 2 open-decision handling closure record (`decision-log.md` §1.3); **M-09 Approved/Closed 2026-08-08 (Project Owner — M2 E2E ownership/sequencing conflict resolution, OPTION A: minimal Phase-2 Journey-1 verification — `decision-log.md` §1.5)**. M-02…M-06 remain Open; local `main` ref realignment pending (`origin/main` = `b36dd58`).
