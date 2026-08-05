# FathersNet Repository Bootstrap Order

**Status:** FROZEN as part of the Phase 0.5 Architecture Freeze
**Controlling input:** `17-final-execution-roadmap.md` (Phase 1 = WP-008…WP-014), `14-development-phase-roadmap.md` §4, `06-backend-development-plan.md` Phase A, `12-devops-and-infrastructure-plan.md`, `architecture-baseline.md`, `implementation-readiness-gate.md`
**Rule:** Steps run strictly in order. A step's **Completion criteria** must be met before the next step begins. Phase 2 work packages (WP-015+) are **not** part of this order and require Gate G1 acceptance + re-authorization.

---

## Step 0 — Freeze & Authorization Check

- **Objective:** Confirm the Phase 0 gate conditions and the M-01…M-07 decision closures that Phase 1 depends on (at minimum M-01 cloud, M-06 storage host) are recorded in `decision-log.md`.
- **Dependencies:** WP-001 (SRS baseline freeze), WP-002 (M-decisions recorded), WP-003 (architecture review), WP-004 (stack sign-off), WP-005 (STRIDE + DPIA), WP-006 (procurement).
- **Deliverables:** Signed Gate G1 package; `pre-development-checklist.md` complete; written authorization recorded in `implementation-status.md`.
- **Verification evidence:** Decision-log entries with approvers + dates; STRIDE/DPIA signatures.
- **Completion criteria:** `pre-development-checklist.md` Final Commit Authorization block is ticked; authorization recorded.

---

## Step 1 — Repository Initialization

- **Objective:** Create the monorepo on GitHub with the frozen layout (`engineering-standards.md` §1): `packages/`, `services/`, `ai-services/`, `apps/`, `infra/`, `docs/`.
- **Dependencies:** Step 0; GitHub organization/account (WP-006).
- **Deliverables:** Empty monorepo; `README.md`; `.gitignore`; `LICENSE`; root `.editorconfig`; branch protection draft (`12` §5.4).
- **Verification evidence:** Repo URL; branch-protection config; README committed.
- **Completion criteria:** `main` + `develop` exist, `main` protected (ruleset `20422621`; sole-maintainer bypass permitted under AGD-002 — `decision-log.md` §7 — while a second account is unavailable), no code yet.

---

## Step 2 — Development Container

- **Objective:** Reproducible local developer environment (devcontainer + Docker Compose reference per SRS §16.1: nginx, Postgres, Redis, Qdrant, n8n, backup).
- **Dependencies:** Step 1; `12` §2.5 compose reference.
- **Deliverables:** `infra/docker/compose.yml` (pinned images: `postgres:16-alpine`, `redis:7-alpine` with `--appendonly yes`, `qdrant/qdrant:v1.9`, `n8nio/n8n` pinned tag, `postgres:16-alpine` backup, nginx); devcontainer definition; health scripts.
- **Verification evidence:** `docker compose up` brings every container to healthy on a clean machine; `docker compose down -v` is fully clean.
- **Completion criteria:** Fresh-clone → `docker compose up` → all services healthy (FR-170, NFR-036).

---

## Step 3 — Environment Management

- **Objective:** `packages/config` with JSON-schema validation; environment variable registry; `.env.example`; `ENV=dev|staging|prod` (never overridden at runtime).
- **Dependencies:** Step 2.
- **Deliverables:** `packages/config` package; central env registry; config validation tests.
- **Verification evidence:** Unit tests pass; boot fails fast on invalid config.
- **Completion criteria:** Invalid config is rejected at startup with a clear error; registry documented.

---

## Step 4 — CI Pipeline

- **Objective:** GitHub Actions mirroring §16.2: build → unit/integration test → coverage gate (QR-002) → dependency audit → SAST → secret scan → deploy staging → health checks; canary/rollback hooks reserved.
- **Dependencies:** Step 1, Step 3; GitHub Actions runner.
- **Deliverables:** `.github/workflows/ci.yml` + deploy workflows; coverage floor scaffolding; `packages/api-spec` contract-lint job; actions + images pinned (SHA/tag).
- **Verification evidence:** A trivial PR goes through the full gate set; a failing gate blocks merge; synthetic secret triggers the secret scan.
- **Completion criteria:** CI/CD gates block promotion; zero secrets in repo/CI (G1-10; WP-009).

---

## Step 5 — Code Quality Tooling

- **Objective:** Shared ESLint/Prettier/TS-strict/editorconfig for Node/RN/Next; Ruff/Black for Python; husky pre-commit hooks (lint + secret scan).
- **Dependencies:** Step 4.
- **Deliverables:** Root + per-package lint/format configs; pre-commit hooks; lint fix scripts.
- **Verification evidence:** Lint+format pass in CI and pre-commit on a sample change.
- **Completion criteria:** `npm run lint` + `npm run format:check` green repo-wide; hooks active (NFR-039).

---

## Step 6 — Shared Packages

- **Objective:** Foundation packages per `06` Phase A: `packages/errors`, `packages/logger`, `packages/test-utils`; stubs for `packages/events` (bus client + outbox relay) and `packages/idempotency` (Redis).
- **Dependencies:** Step 4, Step 5.
- **Deliverables:** Packages with unit tests (error envelope, structured logger with no-PII assertions, idempotency store, outbox relay).
- **Verification evidence:** Package tests green; coverage gate met.
- **Completion criteria:** Error envelope + logging + idempotency primitives reusable by all services (`06` §3).

---

## Step 7 — IaC (dev/staging/prod)

- **Objective:** Terraform provisioning for compute, PostgreSQL, Redis, Qdrant, object storage, networking, secret manager, per-environment isolation (AR-009, NFR-036).
- **Dependencies:** Step 4; M-01/M-06 decisions; provider accounts (WP-006).
- **Deliverables:** `infra/terraform/{modules,environments/dev,staging,prod}`; provider-neutral modules; bucket/collection/key provisioning; budget alerts (AR-040).
- **Verification evidence:** `terraform plan`/`apply` clean in dev + staging; plan output shows no secrets; drift detection runs.
- **Completion criteria:** IaC applies cleanly in dev and staging; environments reproducible from code (G1-09; WP-010).

---

## Step 8 — Backend Skeleton

- **Objective:** Monorepo service skeleton: API Gateway service + one placeholder service per logical service, `/healthz` + `/readyz`, Fastify HTTP layer, TS strict.
- **Dependencies:** Step 6, Step 7.
- **Deliverables:** `services/*` scaffolds; gateway with routing, CORS allow-list, request logging, tracing (`X-Request-Id` + W3C `traceparent`); health endpoints.
- **Verification evidence:** `/healthz`/`/readyz` return 200 on gateway and skeletons in dev; integration test for gateway→skeleton routing.
- **Completion criteria:** Skeleton services run inside the compose stack and pass the routing test (`06` Phase A).

---

## Step 9 — Database Layer (Migration 001)

- **Objective:** `packages/db` migration runner (`node-pg-migrate`); migration `001` creating `users`, `profiles`, `pregnancies`, `consents`, `audit_logs`, `conversations`, `messages` with append-only consent/audit semantics.
- **Dependencies:** Step 7, Step 8.
- **Deliverables:** Migration `001` (up/down), schema-version bookkeeping, migration tests (apply on pristine + incremental DB, rollback, immutability probes on `consents`/`audit_logs`).
- **Verification evidence:** Migration applies and rolls back in dev/staging; append-only `UPDATE`/`DELETE` on `consents`/`audit_logs` fails; consent immutability test green (AR-012).
- **Completion criteria:** Migration 001 runs and rolls back; DB tests green (G1-12; WP-013; QR-003).

---

## Step 10 — Authentication Foundation (Skeleton)

- **Objective:** Auth service skeleton: OTP request/verify stubs, token model scaffold (JWT RS256/ES256, 15-min access, rotating refresh), rate-limit 5/15 min wiring. **NOTE:** Full OTP/MFA lifecycle is Phase 3 (WP-025); Step 10 only lands the skeleton + Redis OTP-state plumbing.
- **Dependencies:** Step 8, Step 9.
- **Deliverables:** Auth service scaffold; token/claims module; Redis session-state wiring; rate-limit middleware on the OTP route.
- **Verification evidence:** Unit tests for token claims + rate-limit 429 + `Retry-After`; skeleton integrates with gateway.
- **Completion criteria:** Auth scaffolding compiles, runs, and is rate-limited (foundation only — not the Phase 2/3 auth).

---

## Step 11 — Observability Foundation

- **Objective:** OTel collector + Prometheus/Grafana/Loki/Tempo/Alertmanager + Sentry; per-service instrumentation; mandatory dashboards/alerts (§18.2/§18.3: AI latency/cost, queue depth, emergency failures, security events, cost thresholds).
- **Dependencies:** Step 8, Step 9.
- **Deliverables:** Observability stack in compose; shared instrumentation package; alert rules; synthetic check + alert firing test.
- **Verification evidence:** Trace + log + metric flow visible in Grafana/Loki for a skeleton request; a synthetic failure fires an alert (no-PII-in-logs verified).
- **Completion criteria:** Observability live; synthetic alert fires (G1-13; WP-014; NFR-037).

---

## Step 12 — Secrets Management

- **Objective:** Wire the managed secret manager into services + CI; no secrets in code/images/config/logs; rotation schedule defined (FR-170, NFR-022).
- **Dependencies:** Step 7, Step 8.
- **Deliverables:** Secret-manager module in `packages/config`; secret references in IaC; rotation runbook + schedule; pre-commit + CI secret scanning verified.
- **Verification evidence:** Secret scan reports clean; rotation drill for one secret succeeds; env-isolation check (no cross-env secrets).
- **Completion criteria:** Zero secrets in repo/CI; secrets injected at runtime (G1-11; WP-012/WP-029 pre-Phase-3).

---

## Step 13 — Documentation & Gate G1 Evidence

- **Objective:** Co-located docs (service READMEs, runbooks, local + CI runbook); assemble the Gate G1 evidence package.
- **Dependencies:** Steps 1–12.
- **Deliverables:** READMEs; runbook for local/CI (`FR-170`); evidence registry records (env + commit SHA per artifact — PM-39); Gate 1 checklist signed (`21` §3).
- **Verification evidence:** Every evidence item has a record with environment + SHA; Gate 1 checklist signed by approvers.
- **Completion criteria:** **Gate G1 accepted** (`14` §4): IaC applies cleanly; CI/CD gates block promotion; migration 001 runs and rolls back; zero secrets; synthetic alert fires.

---

## End of Phase 1 Foundation

- **Next gate:** Phase 2 (Backend Core, WP-015+) requires **explicit re-authorization** after Gate G1 acceptance and after the remaining open decisions (M-02…M-07 where not yet closed) are recorded in `decision-log.md`. No Phase 2 work starts before that authorization (`implementation-readiness-gate.md`).

---

**END OF DOCUMENT — Repository Bootstrap Order (Phase 1 Foundation).** Step 13 completion = Gate G1 accepted. Stop there and await authorization for Phase 2.
