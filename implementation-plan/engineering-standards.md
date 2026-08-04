# FathersNet Engineering Standards

**Status:** FROZEN as part of the Phase 0.5 Architecture Freeze
**Controlling input:** `architecture-baseline.md`, `06-backend-development-plan.md` §3, `05-database-implementation-plan.md` §10, `11-security-and-privacy-plan.md`, `12-devops-and-infrastructure-plan.md` §5, `13-testing-and-quality-plan.md`, SRS §12.1/§16/§17
**Scope:** Engineering conventions that govern every commit in the monorepo. This document defines process standards; it does not add requirements. Where the SRS states a rule, it is marked **Required**; where this document fills a gap, it is marked **Standard**.

---

## 1. Folder Organization

**Monorepo layout (Standard; anchored on `06` §7 and `12`):**

```
/                        monorepo root (npm workspaces + Turbo)
  packages/              shared libraries (all Node/TS)
    api-spec/            OpenAPI 3.x specs (per service + common.yaml) + CHANGELOG.md
    config/              env/config validation (JSON-schema)
    errors/              error envelope + error codes
    logger/              structured JSON logger (no PII)
    events/              bus client + outbox relay + event catalog types
    idempotency/         idempotency store (Redis) + keys
    db/                  node-pg-migrate runner + migrations + seeds
    test-utils/          test fixtures, mocks, helpers
  services/              Node.js backend microservices (one dir per logical service)
    <service>/           e.g. gateway/, auth/, users/, content/, ...
      src/               controllers/services/repositories/routes per `06` phase layout
      db/                migrations/ (or use packages/db/migrations), seeds/
      test/              unit + integration
  ai-services/           Python AI/data services (ingestion, retrieval, eval, research)
    <service>/           app/, tests/ (PyTest), pyproject.toml
  apps/
    mobile/              React Native (TypeScript) per `09`
    web/                 Next.js admin/research portal per `10`
  infra/
    terraform/           modules + environments/ (dev, staging, prod)
    docker/              compose files, Dockerfiles, nginx conf
  docs/                  SRS + implementation-plan set (co-located, FR-170)
  .github/workflows/     CI/CD per §16.2
```

- One folder per deployable unit boundary per `03` D-01; logical services inside share the unit folder when packaged together.
- No new top-level folders without a decision-log note.

---

## 2. Naming Conventions

- **Services/packages:** lowercase `kebab-case` (`user-profile`, `ai-orchestration`, `package-events`). Service dirs match the OpenAPI spec file name.
- **Code identifiers:** `camelCase` for variables/functions (TS/JS), `PascalCase` for classes/components, `snake_case` for DB columns, `UPPER_SNAKE_CASE` for env vars.
- **Files:** `kebab-case.ts` for modules; `*.test.ts` for tests; Python `snake_case.py`.
- **Topics/events:** `domain.entity.action` dot-case (`user.consent.changed`, `safety.event.raised`) — catalog in `03` §4.6. New topics must be added to the catalog first.
- **Buckets/collections:** `fathersnet_*` for Qdrant collections; S3/GCS buckets `fn-<env>-<purpose>`; paths per §7.4.2 (`media/voice|photo/<anonymized_id>/<message_id>.<ext>`).
- **Roles:** exactly the §14.7 six-role set; code names `administrator`, `researcher`, `content_manager`, `ai_admin`, `medical_reviewer`, `support`. (FR-094's "healthcare worker" maps to `medical_reviewer`; do not invent new role names without a matrix change.)
- **DB objects:** `snake_case`; research schema `fn_research`; operational schema stays `public` to match §13.4 DDL verbatim (`05` §4).

---

## 3. API Naming

- Paths: `/v1/<domain>/<resource>` plural nouns (`/v1/users`, `/v1/ai/ask`); no verbs in resource names (`POST /v1/users` not `/v1/createUser`).
- Internal service contracts: `/internal/<resource>` (no public exposure) per `06` §2.1/§4.
- Standard resource verbs: GET list/read, POST create/action, PUT replace, PATCH partial, DELETE remove. Sub-resources nested at most one level.
- Query params: `limit`, `offset`, `cursor`, `sort`, `q` (search) per `06` §3.3.
- Every endpoint defined in one OpenAPI file under `packages/api-spec/`; no endpoint ships without a spec row (AR-003, QR-005).

---

## 4. REST Standards (SRS §12.1 — Required)

- REST over HTTPS, JSON, URL-path versioning `/v1/`.
- OpenAPI 3.x as the single contract source; code-generated clients/types.
- Rate limits (Configurable defaults): standard 120 req/min/user; AI 30 req/min/user; admin export 10 req/min/user; OTP 5/15 min per phone; all `429` + `Retry-After`.
- Idempotency keys on all state-changing endpoints; replay returns the stored response.
- Standard codes: `400 401 403 404 409 422 429 500 502 503`.
- All list endpoints paginated; field masking for sensitive data (masked phone in admin views).

---

## 5. Error Response Format

Uniform envelope on all failures (`06` §3.2 — **Required**):

```json
{
  "error": {
    "code": "<string>",
    "message": "<human text>",
    "request_id": "<uuid>",
    "errors": [{ "field": "...", "reason": "..." }]
  }
}
```

- `request_id` always echoes the `X-Request-Id` header.
- `500` bodies never contain PII, stack traces, or internals (FR-022, §18.1).
- `errors[]` populated for validation failures (400/422); omitted when not applicable.
- `429` responses always include `Retry-After`.

---

## 6. Logging Format

**Structured JSON, one object per line (Required — FR-127, NFR-023).**

Required keys: `ts` (RFC3339), `level` (trace|debug|info|warn|error), `request_id`, `service`, `env`, `event` (dot-case), `message`, plus event-specific fields (duration_ms, status, user_role, provider, tokens, cost).

**Forbidden in logs (Required):** phone numbers, tokens, JWT bodies, message content, OTP values, full names, any PII (FR-022, §14.3). Use log-assertion tests to enforce.

**Security events** (signature mismatch, authz denial, export, deletion, admin action) additionally write to `audit_logs` (see §7) — a log line is not an audit record.

---

## 7. Audit Log Format

`audit_logs` (SRS §13.3.24, `06` §5.2 — append-only, tamper-evident). One record per audited action:

| Field | Rule |
| --- | --- |
| actor_user_id | staff/user id (never phone) |
| action | `domain.action` (`content.approve`, `consent.withdraw`, `export.request`) |
| resource | type + id |
| ip / user_agent | from request |
| result | success / denied / failed |
| request_id | correlation with trace |
| before / after | JSON diff where applicable (no PII) |

- Written via the shared `audit` package/middleware; `UPDATE`/`DELETE` revoked at DB level (AR-012, NFR-023).
- Consent events also append to the immutable `consents` stream (AR-012).

---

## 8. Database Migration Naming

**`node-pg-migrate` (Standard; `05` §4, §10).**

- Files: `<NNN>-<snake_case-description>.js|ts` (e.g., `001-extensions-and-schemas`, `005-pregnancy-reminder-tables`); sequential global numbering, never reused.
- Every migration ships a reversible `up` and `down`; additive-first (new columns nullable/default, new tables, new indexes); destructive changes (drops, type changes, renames) gated by review, rehearsed on staging, shipped with explicit down.
- Migrations are immutable once applied to any environment; a new migration fixes a wrong one.
- CI runs the full sequence on an ephemeral DB and asserts order/idempotency (QR-003/FR-164).

---

## 9. Commit Message Convention

**Conventional Commits (Standard — fills the gap in `19` §"commit discipline"):**

```
<type>(<scope>): <imperative summary>

[body]
```

- Types: `feat`, `fix`, `chore`, `docs`, `test`, `refactor`, `perf`, `security`, `ci`, `build`.
- Scope examples: `api-spec`, `auth`, `migration`, `whatsapp`, `ai`, `mobile`, `infra`.
- Body explains the **why** and references the ticket/requirement id (e.g., `FR-005`, `WP-015`).
- One logical change per commit; no secrets ever (history is immutable — a leaked secret means rotation + history rewrite).
- Merge commits to `develop`/`main` via squash with a Conventional Commits summary.

---

## 10. Branch Naming

- `feature/<ticket>-<slug>` (e.g., `feature/FN-123-otp-lockout`)
- `fix/<ticket>-<slug>`, `hotfix/<ticket>-<slug>`
- `chore/<ticket>-<slug>`
- Shared branches `main`, `develop` never receive direct pushes (NFR-039, `12` §5.2).

---

## 11. Pull Request Checklist

Every PR must satisfy all of the following before merge (`12` §5.3, `19` §16):

- [ ] Title/body follow Conventional Commits; links ticket + requirements (FR/AR/NFR/QR).
- [ ] OpenAPI spec updated and schema-compatible (no breaking change without `/v2/` + deprecation) (QR-005).
- [ ] Migration added or absent with justification; up/down verified locally.
- [ ] Unit + integration tests added/updated; coverage floors met (QR-002).
- [ ] Security: authz on new/changed endpoints (FR-126); no secrets; no PII in logs (assertions where relevant).
- [ ] Contract tests + E2E smoke green; safety suites untouched or still green (QR-011/014).
- [ ] Telemetry + audit hooks present where required (FR-166, FR-098).
- [ ] `22-feature-implementation-matrix.md` row updated if FR coverage changed (QR-015).
- [ ] CI fully green (lint, test, coverage, dependency audit, SAST, secret scan, contract, smoke).

---

## 12. Code Review Checklist

Reviewers verify (in addition to the PR checklist):

- [ ] Provider abstraction respected: no direct third-party SDK call outside an adapter (PM-08).
- [ ] No bypass of the API gateway or of authz middleware; deny-by-default maintained.
- [ ] Idempotency keys + event dedup correct on all write paths (FR-161).
- [ ] Sensitive data handling: phones encrypted (FR-123), pseudonymization to AI providers (AR-019).
- [ ] No architectural drift vs `architecture-baseline.md`; no new technology without an ADR entry.
- [ ] Error envelope and logging conventions honored; no secrets/PII in logs or errors.
- [ ] AI changes: safety layer intact (AR-006); prompts versioned and reviewable (AR-020).
- [ ] Performance sanity: no N+1 queries, indexes for new filters (NFR-007).
- [ ] Second reviewer required for AI-prompt/security-sensitive paths (NFR-039).

---

## 13. Testing Standards

- **Layers:** unit (Jest/PyTest) → integration/contract (QR-003/QR-005) → E2E (QR-004) → security (QR-007) → AI eval (QR-011) → accessibility (QR-008) → performance (QR-006).
- **Coverage floors:** ≥80% core backend, ≥70% overall (QR-002) — enforced in CI per service.
- **Test data:** synthetic only, no production PII (QR-012); consent fixtures with realistic versions; anonymized research datasets.
- **Release-blocking suites** (never skipped, block PR/merge): emergency false-negative, webhook signature, AI eval, privacy (QR-011/014, `19` §10).
- Every bug fix adds a regression test that fails on `main` before the fix.
- Mobile E2E across the device matrix (low-end Android + iOS) incl. offline/sync and assistive tech (`13` §17.4).

---

## 14. Documentation Standards

- Docs live in the repo, co-located with code (FR-170, OR-015); every service has a README (purpose, run, env, contracts).
- Changes to contracts/schema/flows update the owning plan document or the baseline in the **same change set**.
- ADR rationale belongs in `decision-log.md`, not code comments (this repo uses no-code-comment policy).
- Runbooks for any new operational procedure (`12` §11, OR-003).
- No README without a "References" line pointing to the owning plan doc + SRS section.

---

## 15. Dependency Update Policy

- Pin exact versions for app/runtime deps and image tags (never `latest`) (NFR-036).
- `npm audit --omit=dev` + `pip-audit` run on every PR; zero critical/high at release (QR-007).
- Direct dependency updates via dedicated PRs; lockfiles committed; supply-chain scan (SBOM) per NFR-023.
- Actions and base images pinned to SHA/tagged versions; change requires review (PM-17).
- Major framework/provider upgrades require a decision-log entry (ADR) before work starts.

---

## 16. Secrets Policy

- Secrets live only in the managed secret manager (GCP/AWS per M-01) + KMS; injected at runtime via env references (FR-170, NFR-022).
- Never commit: API keys, DB passwords, JWT secrets, WhatsApp app secret/access token, OTP/token values, `.env`, certs.
- Secret scanning (TruffleHog) in CI + pre-commit; leaked secret = immediate rotation + incident record.
- Environment-scoped secrets: lower environments use their own keys/credentials (AR-009).
- Rotation: scheduled; webhook secrets dual-active window; JWT `kid` rotation (`11` §7).

---

## 17. Configuration Policy

- All config via `packages/config` with JSON-schema validation; fail-fast at boot on invalid/missing config.
- Config classes: (a) code-level (no env), (b) env-var (12-factor, no secrets), (c) secrets (secret manager only), (d) runtime flags (feature flags via `packages/config` provider, FR-168), (e) DB-backed app config (retention policies, budget cap).
- No per-developer config committed; `.env.example` documented; feature flags code-reviewable and documented.
- `terraform plan` output must not print secret values; state contains no plaintext secrets (`12` §6.4).

---

## 18. Environment Variable Policy

- Convention: `UPPER_SNAKE_CASE`, prefix `FN_` (application) / `N8N_`, `WHATSAPP_`, `LLM_`, `ASR_` per domain.
- Naming is global (no per-service collisions); a central registry lives in `packages/config`.
- `NODE_ENV`/`ENV` = `dev|staging|prod`; never override at runtime.
- Secrets referenced by name from the secret manager; env files never contain secret values.
- Documented in each service README and in `12` §6.4; new variables reviewed in the PR.

---

**END OF DOCUMENT — FathersNet Engineering Standards.** These standards are part of the frozen baseline; the implementation contract (`implementation-contract.md`) makes them mandatory reading for every implementing agent.
