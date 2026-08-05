# 06. Backend Development Plan

**Source:** `docs/FathersNet-Complete-SRS.md` (FN-SRS-001 v2.0) — authority for API endpoints (§12), backend/data/automation requirements (FR-159…FR-170), database (§13), and monitoring (§18).
**Inputs:** `00-requirement-inventory.md`, `02-srs-requirement-analysis.md` (dependency map).
**Purpose:** Phased, production implementation roadmap for the FatherNode (Ayay) backend: Node.js microservices per SRS §17.2/§16.1, organized around the API groups of SRS §12.
**Classification convention:** **Confirmed** (SRS-mandated) · **Recommended** (engineering decision) · **Configurable** (parameter with default).

---

## 1. Executive Purpose

This document is the controlling engineering roadmap for the backend of the FathersNet (Ayay) platform. It translates the SRS into a buildable, phased sequence of backend work — from repository and infrastructure scaffolding (Phase A) through twelve vertical slices that each land a complete, testable, deployable capability mapped to a defined SRS API group and its functional requirements.

The backend is a set of **Node.js microservices** behind an API gateway (SRS §15.1, §16.1, FR-159), communicating through an **event-driven bus** (FR-160) with **idempotency everywhere** (FR-161), running on a **background scheduler** (FR-163), and observed through **centralized logging, tracing, metrics, and alerting** (FR-166). Every phase conforms to the API conventions of SRS §12.1 (path versioning `/v1/`, OpenAPI 3.x contract, standard error codes, rate limits, bearer tokens, idempotency keys) and ships with its own tests, migrations, and verification evidence so that quality gates (QR-002…QR-013) are provable at each step rather than at the end.

Scope boundaries: this document owns the **backend API and service implementation** (FR-159…FR-170, plus the FR groups behind each API group). The WhatsApp conversation state machine is detailed in `07-whatsapp-platform-implementation-plan.md` and executed in Phase H; the AI/RAG pipeline and medical safety layer are detailed in `08-ai-rag-implementation-plan.md` and executed in Phase J. Database schema details are owned by `05-database-implementation-plan.md`; infrastructure/DevOps by `12-devops-and-infrastructure-plan.md`; security/privacy by `11-security-and-privacy-plan.md`; testing/quality gates by `13-testing-and-quality-plan.md`. This document does not repeat those plans; it sequences and integrates them from the backend perspective.

---

## 2. Backend Architecture Overview

### 2.1 Service Topology (SRS §15.1, FR-159)

| Service | Responsibility | Primary SRS API Group |
| --- | --- | --- |
| API Gateway | TLS termination, authN/authZ enforcement, rate limiting, routing, request tracing | §12.1 (platform) |
| Auth Service | OTP issuance/verification, token issue/refresh/rotation/revocation, MFA for staff | §12.2 |
| User & Profile Service | Profiles, pregnancy profile, preferences, consents, data export/deletion | §12.3 |
| Pregnancy Engine | Week/trimester computation, milestones, countdown, support-action recommendations | internal; serves §12.3, §12.5, §12.8 |
| Reminder Engine | Reminder template engine, scheduling, quiet hours, channel delivery, dedup, analytics | internal; serves FR-041…050 |
| Content & CMS Service | Content CRUD, review workflow, versioning, localization, search, archive | §12.5 |
| Checklist & Budget Service | Hospital preparation checklists, custom items, progress, budget tracker | §12.6, §12.7 |
| Journal Service | Journal entries (text/voice/photo), sharing, media upload, transcription linkage | §12.9 |
| WhatsApp / Conversation Service | Provider abstraction, webhook, state machine, message log, templates | §12.4 |
| Campaign Service | Campaigns, audience segmentation, approval gate, throttled delivery, metrics | §12.10 (campaigns) |
| AI Orchestration Service | RAG ask, safety layer orchestration, feedback, conversations, safety events, knowledge base | §12.8 |
| Research & Analytics Service | Anonymized pipeline, theme/sentiment, research schema, KPI computation, export governance | §12.10 (research export) |
| Admin Service | Admin facade over all services, RBAC/MFA enforcement, audit views, reports, support tickets, retention | §12.10 |

Internal services (Pregnancy Engine, Reminder Engine, Research pipeline) have no public endpoints in §12 and are consumed through the gateway by other services and by the admin facade; their internal REST/gRPC contracts are defined in the OpenAPI spec and exercised by integration tests (QR-003).

### 2.2 Event-Driven Architecture (FR-160)

**Confirmed.** Services communicate asynchronously via a message bus (Redis Streams for the pilot; NATS/Kafka upgrade path documented in `03-system-architecture-plan.md`). The request path never blocks on long work (NFR-004).

| Event (topic) | Publisher | Consumers | Purpose |
| --- | --- | --- | --- |
| `user.enrolled` | User Service | Pregnancy, Reminder, Research, WhatsApp, Campaign | Journey start, scheduling, cohort enrollment |
| `user.profile.updated` | User Service | Pregnancy (recompute), Research | Re-personalization, recompute week |
| `user.consent.changed` | User Service | Research (restrict/stop), Campaign (exclude), WhatsApp (opt-out) | Consent lifecycle enforcement |
| `user.deletion.requested` | User Service | All services | Anonymize research linkage, schedule purge |
| `pregnancy.week.changed` | Pregnancy Engine | Reminder, Content, Campaign, AI | Segment switch, milestone detection |
| `milestone.reached` | Pregnancy Engine | Reminder, Notification | Notify father per FR-033 |
| `reminder.due` | Reminder Engine | Notification dispatchers | Delivery via push/WhatsApp/SMS |
| `message.inbound` / `message.outbound` | WhatsApp Service | AI, Research, Analytics | Conversation log, themes, metrics |
| `media.processed` | WhatsApp/Journal | AI (transcription), Research | Voice transcription, theme extraction |
| `content.published` | Content Service | AI Orchestration (RAG ingestion) | Keep knowledge base current (AR-015/AR-016) |
| `content.retired` | Content Service | AI Orchestration | Deactivate chunks |
| `journal.entry.created` | Journal Service | AI (tagging), Research | FR-056, FR-114 |
| `ai.answer.completed` | AI Orchestration | Analytics, AI Ops | Audit/feedback loop, cost monitoring |
| `safety.event.raised` | AI / WhatsApp | Admin notifications, AI Ops | Emergency escalation (FR-062/063) |
| `research.record.ready` | Research pipeline | Analytics | Aggregated dashboards |

**Outbox pattern (Recommended):** every service persists domain writes and event publications in one local transaction (`outbox` table per service), and a relay publishes to the bus; consumers use the event `id` as an idempotency key. This satisfies FR-161 ("no duplicate records or messages") even across crashes and retries.

### 2.3 Idempotency (FR-161)

**Confirmed.** Applies in four layers:

1. **API writes:** clients send `Idempotency-Key` on all POST/PUT/PATCH/DELETE; the gateway or service stores the key → response mapping in Redis (TTL configurable, default 24 h) and replays the stored response on retry.
2. **WhatsApp webhook:** deduplicated on `provider_message_id` (unique index on `messages.provider_message_id`, §13.3.11) — a re-delivered webhook produces no duplicate message record (§7.4.1).
3. **Event consumers:** each consumer tracks processed event IDs; duplicate bus deliveries are no-ops.
4. **Scheduler jobs:** each run is bound to a job-run ID; a job that fires twice (e.g., after leader re-election) performs no duplicate work because its output is keyed by run ID (FR-163).

### 2.4 Scheduler (FR-163)

**Confirmed.** A dedicated scheduler service (deployed on a leader-elected worker for the pilot; job queue with leases) owns all time-driven work:

| Job | Cadence (Configurable) | Owner | Requirement |
| --- | --- | --- | --- |
| Pregnancy week rollover | daily | Pregnancy Engine | FR-031, FR-037 |
| Milestone check | daily | Pregnancy Engine | FR-033 |
| Weekly fatherhood prompts | weekly (per segment) | Reminder Engine | FR-014, FR-044 |
| Daily pulse rotation | daily | Reminder Engine | FR-015 |
| Sunday legacy prompt | weekly (Sunday) | Reminder Engine | FR-016, FR-054 |
| Appointment/vaccination/postnatal reminders | continuous | Reminder Engine | FR-041, FR-044 |
| Birth-preparedness gap nudges (week ≥34) | weekly | Reminder Engine | FR-091 |
| Campaign dispatch | per schedule | Campaign Service | FR-107, FR-111 |
| Research ingestion & aggregation | near-real-time + daily rollup | Research & Analytics | FR-113, FR-118 |
| Retention/purge jobs | daily | Admin Service | FR-105, AR-014 |
| Backup verification | per policy | DevOps | NFR-014, FR-165 |
| AI eval sampling | weekly | AI Orchestration | FR-071, QR-011 |

Failure handling: exponential-backoff retry with jitter per job, dead-letter queue with operator alerting, and run-level observability (attempts, last error, duration) — surfaced on the ops dashboard (FR-163, §18.3).

### 2.5 Data Layer (FR-162)

**Confirmed.** PostgreSQL is the system of record (SRS §13, ADR-003), Qdrant holds RAG knowledge embeddings (collection `fathersnet_knowledge`, §9.3), and object storage holds media under anonymized paths (`media/voice|photo/<anonymized_user_id>/<message_id>.<ext>`, §7.4.2). Research tables are logically separated with restricted access (AR-013). Database details live in `05-database-implementation-plan.md`; this plan sequences migrations per phase (§4).

### 2.6 Observability (FR-166, §18)

**Confirmed.** Every service emits: structured JSON logs (no PII, FR-127/§18.1), OpenTelemetry traces with `X-Request-Id` correlation, and Prometheus metrics (HTTP latency/error rate, queue depth/age, job failure rate, AI latency/token cost, WhatsApp delivery counters). Alert rules per §18.3: system failures, **emergency escalation failures**, high error rates, security events, cost thresholds, queue backlogs. Dashboards: service health, AI, business KPIs, WhatsApp, database, queue (AR-038, OR-007).

---

## 3. API Platform Foundation

The gateway and shared platform packages implement SRS §12.1 for every phase. Each phase builds on this foundation; nothing here is re-implemented per service.

### 3.1 Contract-First OpenAPI 3.x (AR-003, FR-153)

- Single source of truth: `packages/api-spec/` contains one OpenAPI 3.x file per service (`auth.yaml`, `users.yaml`, `content.yaml`, `whatsapp.yaml`, `checklists.yaml`, `budget.yaml`, `ai.yaml`, `journal.yaml`, `admin.yaml`) plus `common.yaml` (error envelope, pagination, security schemes).
- CI validates every spec (lint + `openapi-cli`), generates TypeScript request/response types consumed by services and clients, and runs **schema-compatibility checks** (QR-005) so breaking changes cannot merge.
- Version in the URL path: `/v1/…`. Additive changes (new fields, new endpoints) are backward-compatible within v1; breaking changes require `/v2/` with the §12.1 deprecation policy (default 6-month notice, changelog entry).

### 3.2 Error Handling (§12.1)

Uniform envelope on all failures: `{ "error": { "code": "<string>", "message": "<human text>", "request_id": "<uuid>", "errors": [ { "field": "...", "reason": "..." } ] } }`. Standard codes:

| Code | Meaning | Typical Trigger |
| --- | --- | --- |
| 400 | Validation error | malformed field, bad enum |
| 401 | Unauthenticated / invalid token | missing/expired bearer, bad webhook signature |
| 403 | Forbidden (role lacks permission) | RBAC denial (FR-126) |
| 404 | Not found | resource or route missing |
| 409 | Conflict | duplicate (e.g., consent already withdrawn, FR-004) |
| 422 | Unprocessable entity | semantically invalid (e.g., EDD before today) |
| 429 | Rate limited | quota exceeded; returns `Retry-After` |
| 500 | Internal error | unhandled; no PII in body |
| 502 / 503 | Upstream / unavailable | provider down, gateway upstream failure |

Validation middleware is shared; every schema field from §12 is enforced server-side (OWASP input validation, FR-129). Logs never contain message bodies, tokens, or phone numbers (FR-022, §18.1).

### 3.3 Pagination

Uniform convention across all list endpoints (§12.3…12.10): `?limit=` (default 20, max 100, configurable) and `?offset=` for shallow sets (admin user lists); cursor tokens (`?cursor=`) for high-volume streams (journal entries, messages, AI conversations, audit logs). Response shape: `{ "items": [...], "next_cursor": "<token|null>", "total": <int|null> }`. All list endpoints support the filters named in §12 and are indexed accordingly (NFR-007).

### 3.4 Versioning & Deprecation (§12.1)

Path versioning `/v1/`; `Sunset` / `Deprecation` response headers on deprecated endpoints; changelog in `packages/api-spec/CHANGELOG.md`; deprecated endpoints removed only after the notice period; NFR-040 compliance checked by CI.

### 3.5 Rate Limiting & Quotas (FR-169, §12.1)

- Gateway-level token bucket in Redis, keyed by authenticated user and by IP for unauthenticated endpoints.
- Defaults (Configurable): standard tier **120 req/min/user**; AI endpoints **30 req/min/user**; admin export endpoints **10 req/min/user**; OTP **5/15 min per phone** (§12.2); all return `429` + `Retry-After`.
- Message-gateway quotas: per-user outbound cap (3–5 non-interactive messages/day, Configurable), broadcast throughput throttle respecting provider limits, OTP attempt lockout (§7.4.3).
- Quota usage exposed via `RateLimit-*` headers; quota telemetry feeds cost/abuse alerts (§18.3).

### 3.6 Idempotency at the Platform

- `Idempotency-Key` required on all state-changing endpoints; service must reject a replay that would conflict (409) or replay the stored response.
- Webhook dedup (Phase H), event-consumer dedup, and scheduler run-id binding are platform primitives in `packages/idempotency/` and `packages/events/` (FR-161).

### 3.7 Tracing & Observability Plumbing

- Every request carries `X-Request-Id`; W3C `traceparent` propagated across services and to the bus.
- Middleware emits structured logs (request/response, duration, status, user role — never PII), trace spans, and HTTP metrics by default (FR-166).
- Correlation IDs flow into the `audit_logs` records (FR-098, §13.3.24) so every audit entry links to its request trace.

---

## 4. Development Phases

All timelines are **Configurable reference estimates** aligned with SRS Appendix D. Each phase is independently releasable, deployable, and gated by the quality checks in §6.

> **Migration numbering (this plan vs `05`).** Database schema detail is owned by `05-database-implementation-plan.md` §4.2, which is authoritative for migration IDs and grouping. The per-phase "Database changes" bullets below reference `05` §4.2 migration IDs; they do **not** define a competing `000N` sequence. Tables listed in a phase that are **not** in the `05` §4.2 catalog (e.g., `reminder_templates`, `shared_journey_links`, `data_export_jobs`, `whatsapp_templates`, `support_tickets`) are engineering additions that must be added to `05` §4.2 (with schema approval + a `decision-log.md` entry) before that phase lands. The auth tables proposed in Phase B are subject to the pending auth-state storage decision (`05` §4.3).

---

### Phase A — Project Scaffolding + Infrastructure

**Objective.** Establish the monorepo, service skeleton, API gateway platform, event bus, scheduler platform, database migration tooling, observability stack, and CI/CD pipeline such that every subsequent phase lands into a running, observed, testable environment. Satisfies the foundation requirements FR-159 (microservices + gateway), FR-160 (bus plumbing), FR-161 (idempotency primitives), FR-163 (scheduler skeleton), FR-164 (migration tooling), FR-166 (observability), FR-167 (CI/CD), FR-169 (gateway rate limiting), FR-170 (docs in repo), plus AR-001…AR-010 and NFR-036…040.

**Components.**
- Monorepo tooling (npm workspaces + Turbo), TypeScript strict, shared lint/format/test configs.
- `packages/api-spec`: OpenAPI common + per-service skeletons; contract lint in CI (AR-003).
- `packages/logger`, `packages/config`, `packages/errors`, `packages/events` (bus client + outbox relay), `packages/idempotency` (Redis), `packages/db` (migration runner), `packages/test-utils`.
- API Gateway service: routing, TLS, bearer/JWT verification pass-through, rate limiting, request tracing, CORS allow-list (§12.1).
- Scheduler service skeleton with leader election, job registry, retry/DLQ, run-id binding (FR-163).
- Observability: OpenTelemetry collector, Prometheus/Grafana, Loki (or equivalent), alert rules per §18.3.
- CI/CD: GitHub Actions pipeline mirroring SRS §16.2 — build → unit/integration → coverage gate → security scans (dependency audit, SAST, secret scan) → deploy staging → health checks; feature flags service (FR-168) with config-source bootstrap.
- Docker Compose reference stack (SRS §16.1): nginx, gateway+services base image, PostgreSQL, Redis, Qdrant, n8n, backup container. Secrets wired through the environment secret manager (NFR-022, FR-170).

**Files expected.**
```
fathers-net/
├─ package.json  turbo.json  tsconfig.base.json  .eslintrc.cjs  .prettierrc
├─ .github/workflows/ci.yml  cd.yml
├─ docker-compose.yml  .env.example
├─ packages/
│  ├─ api-spec/           # openapi/*.yaml, common.yaml, CHANGELOG.md
│  ├─ config/  logger/  errors/  events/  idempotency/  db/  test-utils/
├─ services/
│  ├─ gateway/            # src/{routes,middleware,plugins,index}.ts
│  ├─ scheduler/          # src/{jobs,leader,retry,index}.ts
│  └─ <each later service> generated skeleton (health endpoint only)
├─ infra/
│  ├─ terraform/  nginx/  grafana/provisioning/  alerts/
├─ scripts/{deploy.sh,healthcheck.sh,rollback.sh,promote.sh}
└─ docs/{runbooks,architecture,api}
```

**Dependencies.** Cloud account and secret manager (D-03, M-01); repository; no application dependencies. All later phases depend on this phase.

**APIs implemented.** None beyond platform endpoints — `GET /healthz`, `GET /readyz` (liveness/readiness, NFR-013) on gateway and each skeleton service.

**Database changes.** Migration runner configured (FR-164, `packages/db`); base tables land per `05` §4.2: `001` `extensions-and-schemas`, `002` `users-and-profiles` (`users` §13.3.1, `profiles`), `003` `pregnancies-and-babies` (`pregnancies` §13.3.3), `004` `consents-and-preferences` (`consents` §13.3.4); plus schema-version bookkeeping table. Immutable `audit_logs` (§13.3.24) is `05` §4.2 migration 015, deferred to Phase 3 (WP-027); Phase 2 ships app-layer access logging (FR-127). Vector store (Qdrant) and object storage buckets provisioned empty.

**Tests required.** Unit tests for `packages/*` (config validation, error envelope, idempotency store, outbox relay); integration test for gateway → skeleton-service routing, rate limiting, and `/healthz`; contract lint passing; CI pipeline green with coverage gate scaffolded (QR-002 baseline).

**Verification evidence.** CI green on every merge (build/test/scan); `docker compose up` brings up the full reference stack with all containers healthy; `/healthz` and `/readyz` return 200 on gateway and skeletons; rate-limit test returns `429` + `Retry-After` at the configured threshold; trace + log + metric flow visible in Grafana/Loki; alert rules configured and firing on synthetic failure; README/runbook for local and CI workflow committed (FR-170).

---

### Phase B — Authentication Service

**Objective.** Implement the §12.2 Authentication API group: OTP request/verify, token issuance with refresh rotation, logout/revocation — the identity foundation for every other phase. Satisfies FR-005 (OTP verification, rate-limited), FR-009 (UUID identity, phone never a PK), NFR-018 (OAuth 2.0/OIDC posture, short-lived tokens, strong hashing), §14.6 (auth flow, session management, refresh rotation, revocation on reuse), FR-129 (rate limiting, lockout), and FR-127 (auth/access logging). MFA for staff (FR-101) is designed here and activated in Phase L.

**Components.**
- Auth Service: OTP issue/verify with constant-time comparison and failure lockout (§12.2); JWT access tokens (RS256/ES256, default 15-min TTL, Configurable) + refresh tokens (default 30 days, revocable, rotation with reuse-detection) (§14.6); device-fingerprint capture; OTP delivery via notification provider adapter (SMS primary; WhatsApp template fallback, Configurable) (FR-152).
- OTP store (Redis + Postgres record): expiry, max attempts 5/15 min, lockout counters (for §14.1.1 detection).
- Gateway auth middleware: bearer verification, token version/revocation checks, token-type claim enforcement (refresh vs access).
- Admin/MFA credential model (staff accounts, password hashing with Argon2id) ready for Phase L.

**Files expected.**
```
services/auth/
├─ src/
│  ├─ app.ts  config.ts  index.ts
│  ├─ middleware/  # requireToken, rateLimit
│  ├─ services/{otp,token,staff}
│  ├─ repositories/{otp,refreshToken,staff}
│  ├─ providers/{sms,whatsapp}.ts   # notification abstraction (FR-152)
│  └─ routes/{otp,refresh,logout}.ts
├─ test/unit  test/integration  test/contract
├─ openapi.yaml  Dockerfile  package.json
```

**Dependencies.** Phase A (gateway, events, db, secrets). Notification provider credentials required (D-01/D-03; M-02/M-03 apply to channel providers used for OTP).

**APIs implemented (SRS §12.2).**
| Endpoint | Method | Purpose |
| --- | --- | --- |
| `/v1/auth/otp/request` | POST | Request OTP (E.164 phone, device fingerprint, channel, purpose) |
| `/v1/auth/otp/verify` | POST | Verify OTP; issue access + refresh tokens |
| `/v1/auth/refresh` | POST | Rotate refresh token; issue new access token |
| `/v1/auth/logout` | POST | Revoke current session/token |

**Database changes.** Auth tables `otp_codes` (id, phone_hash, purpose, code_hash, expires_at, attempts, locked_until), `refresh_tokens` (id, user_id, token_hash, rotated_from, revoked_at, expires_at), `staff_users` + `staff_mfa` (placeholder role model for Phase L) — **placement pending** the auth-state storage decision (`05` §4.3): if a Postgres record is chosen they land as a `05` §4.2 migration (proposed append as `018`); if Redis-only they are not created (state in Redis per `03` §3.1 / `11` §3.2). No OTP/token values stored in plaintext.

**Tests required.** Unit: OTP generation/expiry/lockout, constant-time compare, token claims, refresh rotation and reuse-detection (reuse ⇒ revoke family). Integration: full OTP→verify→refresh→logout flow against Postgres; rate-limit lockout at 5/15 min; revocation on logout. Contract: `auth.yaml` schema validation. Security: no PII or OTP in logs (assert in tests); brute-force lockout test (QR-007 prep).

**Verification evidence.** §12.2 flow green in integration suite; refresh-token-reuse test demonstrates revocation; lockout test demonstrates 5-attempt cap; CI gate ≥80% coverage on `services/auth` core; OpenAPI contract tests pass; auth events (`user.authenticated`, `token.revoked`) visible on the bus and in audit log.

---

### Phase C — User & Profile Service

**Objective.** Implement the §12.3 User Profile API group: profile CRUD, pregnancy start, preferences, consent lifecycle, personal data export, and account deletion. Satisfies FR-001/FR-002 (registration profile fields), FR-003/FR-004 (consent capture and withdrawal), FR-006 (re-onboarding/recompute hooks), FR-007 (right-to-erasure workflow), FR-008 (identity reuse across channels), FR-009 (UUID), FR-010 (cohort tagging), FR-038 (preferences applied across surfaces), FR-100 (consent views), FR-117 (separate research/media consents), FR-124 (data minimization), FR-125 (consent lifecycle), FR-128 (subject rights), and NFR-025…029.

**Components.**
- User & Profile Service: profile CRUD; pregnancy start (EDD/LMP) validated and routed to Pregnancy Engine (Phase E) for week computation; preferences store; consent records (append-only, versioned, §13.3.4); export job orchestration; deletion workflow (request → confirmation → grace period → anonymize research linkage → delete → deletion record, FR-007).
- Cohort/referral tagging on enrollment (FR-010) from invitation tokens.
- Emits `user.enrolled`, `user.profile.updated`, `user.consent.changed`, `user.deletion.requested` (outbox, §2.2) so downstream services react (research stop, campaign exclusion, WhatsApp opt-out, reminder reschedule) (FR-004, FR-017, FR-112).

**Files expected.**
```
services/users/
├─ src/
│  ├─ app.ts  config.ts  index.ts
│  ├─ middleware/  # requireToken, ownership (self)
│  ├─ services/{profile,pregnancy,preferences,consent,export,deletion}
│  ├─ repositories/{profile,consent,preference,exportJob,deletionJob}
│  ├─ events/  # producers + consumers
│  └─ routes/{me,pregnancy,preferences,consents,export}.ts
├─ test/unit  test/integration  test/contract  test/privacy
├─ openapi.yaml  Dockerfile  package.json
```

**Dependencies.** Phase B (identity). Phase E for week computation (integration contract, stubbed in tests until Phase E lands).

**APIs implemented (SRS §12.3).**
| Endpoint | Method | Purpose |
| --- | --- | --- |
| `/v1/users/me` | GET | Own profile |
| `/v1/users/me` | PATCH | Update profile fields (validated; EDD/LMP consistency) |
| `/v1/users/me/pregnancy` | PUT | Set/update EDD or LMP; recompute week |
| `/v1/users/me/preferences` | PUT | Language, channels, quiet hours, content categories |
| `/v1/users/me/consents` | GET | View consent records |
| `/v1/users/me/consents/:id/withdraw` | POST | Withdraw a consent (409 if already withdrawn) |
| `/v1/users/me/export` | POST | Request personal data export (rate-limited 10/min) |
| `/v1/users/me` | DELETE | Request account deletion (confirmation required) |

**Database changes.** Profiles/pregnancies/consents/user_preferences land in `05` §4.2 migrations 002–004 (`profiles` §13.3.2, `pregnancies` §13.3.3 with `edd`/`lmp` constraint + week 1–45 check, `consents` append-only with `withdrawn_at`, `user_preferences` §13.3.26); consent immutability enforced at DB layer (AR-012). Operational support tables `data_export_jobs`, `deletion_requests`, `cohort_tags` are additions beyond the `05` §4.2 catalog (see §4 numbering note) — added to `05` §4.2 with approval before use.

**Tests required.** Unit: field validation, consent versioning, withdrawal idempotency, preference enum validation. Integration: full consent lifecycle (grant → withdraw → proof), export job produces portable JSON/PDF per FR-057/FR-128 with SLA, deletion workflow with grace period and deletion record, cohort tagging. Privacy tests (QR-009): no over-collection (FR-124), masked phone in any listing. Contract: `users.yaml`.

**Verification evidence.** Consent immutability test passes (no UPDATE on `consents`); export artifact generated and audited; deletion runbook executes end-to-end in staging; events `user.enrolled`/`user.consent.changed` consumed by stub consumers; coverage gate ≥80% on `services/users` core; OpenAPI contract green.

---

### Phase D — Content & CMS Service

**Objective.** Implement the §12.5 Content API group with the review/approval workflow, versioning, localization, and archive lifecycle. Satisfies FR-076 (content library across pregnancy/labor/first-years), FR-077 (content types: article/video/audio/infographic/checklist/faq), FR-078 (CMS review workflow + audit history), FR-079 (EN/AM translation workflow with parity checks), FR-080 (expiry/archiving), FR-081 (medical review tagging), FR-082 (WhatsApp embedding hooks), FR-083 (content search), FR-084 (consumption analytics events), FR-085 (quality ratings), FR-106 (author ≠ medical approver segregation), and AR-015 (knowledge lifecycle) — feeding the RAG knowledge base in Phase J.

**Components.**
- Content & CMS Service: draft/submit/approve/publish/archive state machine; `content_versions` snapshots with diff; localization pairs (EN/AM) with parity validation; medical-review flag for non-reviewed medical content (FR-081); search (PostgreSQL FTS over approved content, §12.5 filters language/week/type); consumption event emission; quality-rating capture (FR-085).
- Segregation of duties enforced: `content_manager` may create/submit; only `medical_reviewer`/approved roles may approve medical content (FR-106, §14.7).
- Publish/archive events drive RAG ingestion and retirement (AR-016) consumed by Phase J.

**Files expected.**
```
services/content/
├─ src/
│  ├─ app.ts  config.ts  index.ts
│  ├─ services/{cms,workflow,localization,search,ratings}
│  ├─ repositories/{content,contentVersion,translation,rating}
│  ├─ events/{publish,retire,consumption}
│  └─ routes/{content,workflow}.ts
├─ test/unit  test/integration  test/contract
├─ openapi.yaml  Dockerfile  package.json
```

**Dependencies.** Phase B (auth), Phase C (role/consent model for RBAC). Clinical content readiness (D-04, QR-019) is a program dependency for publish, not for build.

**APIs implemented (SRS §12.5).**
| Endpoint | Method | Purpose |
| --- | --- | --- |
| `/v1/content` | GET | List published content (filters: language, week, type) |
| `/v1/content/:id` | GET | Content detail incl. media refs |
| `/v1/content` | POST | Create draft (content_manager) |
| `/v1/content/:id` | PUT | Update content — new version |
| `/v1/content/:id/submit` | POST | Submit for medical/review approval |
| `/v1/content/:id/approve` | POST | Approve (medical reviewer; segregation of duties) |
| `/v1/content/:id/archive` | POST | Archive/expire; remove from retrieval |

**Database changes.** `content` (§13.3.16) + `content_versions` (§13.3.17) land in `05` §4.2 migration 011 (`content`); `content_translations`, `content_ratings`, `content_tags` are additions beyond the `05` catalog (see §4 numbering note). FTS index for search; status transitions constrained (draft → pending_medical_review → approved → published → archived, AR-015).

**Tests required.** Unit: workflow state transitions, version snapshot, parity check (EN/AM required fields). Integration: author cannot approve (SoD test, FR-106); archived content excluded from search and from retrieval events; publish emits `content.published`. Contract: `content.yaml`. E2E smoke: draft→submit→approve→publish→searchable (QR-004 prep).

**Verification evidence.** SoD test green; workflow E2E passes; archive removes content from search + emits retirement event; localization parity check fails on missing Amharic body; OpenAPI contract green; coverage gate met.

---

### Phase E — Pregnancy Engine + Reminder Engine

**Objective.** Implement the pregnancy journey computation and the reminder/notification engine. Satisfies FR-031 (week/trimester auto-computation from EDD/LMP), FR-032 (week-aligned content surfacing), FR-033 (milestones + notifications), FR-034 (journey timeline data), FR-035 (support-action recommendations + completion), FR-036 (trimester transitions), FR-037 (EDD countdown + milestone dates), FR-041…FR-050 (reminders: generation, multi-channel, lead times, templates, dedup, critical override, localization, analytics), FR-091 (birth-preparedness gap nudges from week 34), FR-163 (scheduler), and AR-007 (scheduled/queued jobs with retry + idempotency).

**Components.**
- **Pregnancy Engine:** pure computation module (week, trimester, EDD countdown, milestone schedule: first ANC, trimester ends, viability, birth) with no I/O (unit-testable); consumes `user.profile.updated`/`pregnancy.updated` to recompute; persists to `pregnancies`; emits `pregnancy.week.changed` and `milestone.reached`; exposes internal query contract for the User service `/v1/users/me/pregnancy` response and for WhatsApp/content personalization.
- **Reminder Engine:** template engine (one-time + recurring rules, §12.4/§7.3 prompt types), lead-time and quiet-hour logic (FR-043, FR-029), channel ordering + dedup (FR-048), critical/emergency override bypassing quiet hours (FR-046), localization of templates (FR-047), delivery/acknowledgement tracking (FR-045), reminder analytics (FR-050), admin-defined templates with review/approval (FR-049) — CRUD exposed via Phase L admin facade.
- Scheduler integration: weekly/daily/Sunday prompt jobs (FR-014/015/016), appointment reminders, week-34 gap nudges (FR-091), week rollover.

**Files expected.**
```
services/pregnancy/
├─ src/
│  ├─ app.ts  config.ts  index.ts
│  ├─ core/week.ts  milestones.ts  countdown.ts   # pure, heavily unit-tested
│  ├─ handlers/{profileUpdated,milestoneDue}.ts
│  └─ routes/internal/pregnancy.ts
services/reminders/
├─ src/
│  ├─ app.ts  config.ts  index.ts
│  ├─ services/{template,leadTime,quietHours,dedup,delivery,ack}
│  ├─ repositories/{appointment,notification,reminderTemplate}
│  ├─ routes/internal/reminders.ts
│  └─ handlers/{promptJobs,pulseJobs,legacyJobs,gapNudges}.ts
```

**Dependencies.** Phase C (pregnancy profile, preferences). Notification provider integration (FR-152) for channel dispatch. Phase H consumes reminder output via the message gateway; Phase L exposes admin template CRUD.

**APIs implemented.** No public endpoints in §12 beyond `/v1/users/me/pregnancy` (implemented in Phase C, powered here). Internal contracts: `GET /internal/pregnancy/:userId` (current week/trimester/EDD/milestones), `GET /internal/reminders/:userId` (scheduled + past with status). Additive public surfaces (Recommended): `/v1/reminders/:id` GET and `PATCH /v1/reminders/:id/acknowledge` for FR-045 acknowledgement; `/v1/admin/reminder-templates` GET/POST/PUT/PATCH (FR-049) delivered through the Admin service in Phase L.

**Database changes.** `appointments` (§13.3.15) lands in `05` §4.2 migration 010 (`budget-and-appointments`), `notifications` (§13.3.25) in migration 014. `reminder_templates`, `reminder_events`, `milestones`, `support_actions` are additions beyond the `05` catalog (see §4 numbering note). Indexes on `appointments.scheduled_at`, `notifications.user_id`.

**Tests required.** Unit: week/trimester math across edge dates (LMP vs EDD, leap years, week 40+), milestone derivation, quiet-hour math, lead-time scheduling, dedup across channels (FR-048), critical override (FR-046). Integration: full schedule→dispatch→ack flow against Postgres with a stub channel provider; duplicate-run test proving scheduler idempotency (FR-163/FR-161). Contract: internal contracts + additive endpoints.

**Verification evidence.** Week-computation property tests green (FR-031); milestone notification E2E delivers at correct dates (FR-033); quiet-hours test defers to next allowed slot; duplicate scheduler run produces zero duplicate notifications; delivery/ack analytics rows appear (FR-050); coverage gate met.

---

### Phase F — Checklist & Budget Services

**Objective.** Implement the §12.6 Checklist and §12.7 Budget API groups for birth preparation. Satisfies FR-086 (hospital checklist, hospital bag, shopping list, transport plan, emergency contacts), FR-087 (shopping list ↔ budget tracker with planned/actual/variance), FR-088 (completion progress in journey), FR-089 (offline-sync-ready API design for the module), FR-090 (document media support, Could-Have), FR-091 (gap data exposed to reminders), FR-093 (birth-plan summary, Could-Have), FR-146 (partner-shared checklists, opt-in), and UC-004.

**Components.**
- Checklist service: template-driven checklists (hospital_bag/birth_prep §13.3.12), per-user instances, custom items, category grouping, completion toggles, progress computation, offline sync contract (revision timestamps + per-field last-write-wins for conflict-safe merges, §8.5), partner visibility scoping (FR-146).
- Budget service: entries with category validation (§8.3), planned/actual/notes/receipt refs, totals + variance + remaining-cap computation (§8.3 calculations), per-field merge on PATCH for offline sync.
- Gap computation for birth-preparedness reminders (FR-091) exposed to Reminder Engine; completion events feed journey dashboard and engagement metrics (FR-088, PD-007).

**Files expected.**
```
services/checklists/
├─ src/{app.ts,services/{instance,progress,customItem,share},repositories,events,routes/checklists.ts}
services/budget/
├─ src/{app.ts,services/{entry,summary},repositories,routes/budget.ts}
```
Plus `packages/birth-prep-templates/` (hospital-bag defaults per §8.2, Configurable content).

**Dependencies.** Phase C (user/partner identity). Phase E (week gating for FR-091; journey integration). Phase G (media upload for receipt images, FR-087).

**APIs implemented (SRS §12.6, §12.7).**
| Endpoint | Method | Purpose |
| --- | --- | --- |
| `/v1/checklists` | GET | List checklists (hospital bag, birth prep) |
| `/v1/checklists/:id` | GET | Checklist + categories/items + progress % |
| `/v1/checklists/:id/items` | POST | Add custom item |
| `/v1/checklists/:id/items/:itemId` | PATCH | Toggle completion (sync + conflict resolution) |
| `/v1/budget/entries` | GET | List entries with totals computed |
| `/v1/budget/entries` | POST | Create entry (category validation) |
| `/v1/budget/entries/:id` | PATCH | Update entry (per-field merge) |
| `/v1/budget/entries/:id` | DELETE | Delete entry |
| `/v1/budget/summary` | GET | Total planned/actual/remaining + variance |

**Database changes.** `checklists` (§13.3.12) + `checklist_items` (§13.3.13) land in `05` §4.2 migration 009, `budget_entries` (§13.3.14) in migration 010. `shared_journey_links` (partner access records for FR-146) is an addition beyond the `05` catalog (see §4 numbering note). Progress column maintained on write (avoid N+1 reads, NFR-007).

**Tests required.** Unit: progress math, budget totals/variance/remaining per §8.3, category enum validation, per-field merge semantics. Integration: checklist → shopping → budget linkage (FR-087), partner sharing scoping (owner vs partner vs stranger, FR-146), offline revision/conflict merge. Contract: `checklists.yaml`, `budget.yaml`. E2E prep: UC-004 journey.

**Verification evidence.** Budget summary matches §8.3 formulas on fixture data; partner-scoped access denies strangers; conflict merge test passes with field-level LWW; completion events visible on the bus for journey/reminders; coverage gate met.

---

### Phase G — Journal Service

**Objective.** Implement the §12.9 Journal API group with text/voice/photo entries, media upload, sharing, and export. Satisfies FR-051 (text/voice/photo entries in chronological timeline), FR-052 (private by default), FR-053 (prompt responses auto-create linked entries), FR-054 (legacy letters stored privately), FR-055 (voice transcription searchable), FR-056 (AI tagging reviewed by admins), FR-057 (user export PDF/JSON), FR-058 (flagged-entry review queue), FR-018/FR-019 (WhatsApp voice/photo intake integration), FR-133/FR-136 (voice-first + offline sync API contract).

**Components.**
- Journal service: entry CRUD, timeline, privacy enforcement (owner-only read/write; `shared_with_partner` opt-in per entry), prompt-response auto-linking (`entry_type=prompt_response|legacy`), flag state for admin review (FR-058), export job (PDF/JSON) reusing the export infrastructure from Phase C.
- Media service (shared object-storage primitive): signed expiring upload/download URLs, type/size validation, malware scan hook (§7.4.2, FR-019, AR-023), retention tagging.
- Transcription integration: on voice entry, enqueue ASR (AssemblyAI primary, Google fallback, §9.7), persist `journal_media.transcript` + status (FR-055); transcription search index.
- Emits `journal.entry.created` for AI tagging (Phase J, FR-056) and research ingestion (Phase K, FR-113).

**Files expected.**
```
services/journal/
├─ src/
│  ├─ app.ts  config.ts  index.ts
│  ├─ services/{entry,media,transcription,export,share,review}
│  ├─ repositories/{entry,media,flag}
│  ├─ events/{entryCreated,mediaProcessed}
│  └─ routes/{entries,media}.ts
├─ test/unit  test/integration  test/contract
├─ openapi.yaml  Dockerfile  package.json
```

**Dependencies.** Phase C (identity), Phase D (no hard dep; content types referenced). ASR provider credentials (D-06). Phase J consumes `journal.entry.created`; Phase K consumes research events.

**APIs implemented (SRS §12.9).**
| Endpoint | Method | Purpose |
| --- | --- | --- |
| `/v1/journal/entries` | GET | List entries (private by default) |
| `/v1/journal/entries` | POST | Create text entry (media refs allowed) |
| `/v1/journal/entries/:id` | GET | Get entry (owner or shared partner) |
| `/v1/journal/entries/:id` | PATCH | Update entry |
| `/v1/journal/entries/:id` | DELETE | Delete entry |
| `/v1/journal/entries/:id/share` | POST | Share with linked partner (opt-in) |
| `/v1/journal/media` | POST | Upload voice/photo (signed upload) |

**Database changes.** `journal_entries` (§13.3.6, private-by-default constraint) + `journal_media` (§13.3.7) land in `05` §4.2 migration 006 (`journal`). `journal_flags` (FR-058 review queue) and `transcription_jobs` are additions beyond the `05` catalog (see §4 numbering note). Unique constraint preventing duplicate prompt-response entries (FR-161 idempotency on retried responses).

**Tests required.** Unit: privacy enforcement (owner/partner/stranger matrix), timeline ordering, entry-type rules. Integration: media signed-URL lifecycle (upload → access → expiry), transcription pipeline happy/failure paths with stub ASR, prompt-response auto-link, export artifact, share revocation. Privacy (QR-009): deletion of entry removes media references per retention. Contract: `journal.yaml`.

**Verification evidence.** Stranger-access test denies 403; shared-partner read works after explicit share; transcription status transitions pending→done with searchable text; export returns portable JSON/PDF; `journal.entry.created` event observed by stub consumer; coverage gate met.

---

### Phase H — WhatsApp / Conversation Service

**Objective.** Implement the §12.4 WhatsApp API group: signed webhook intake, provider abstraction, conversation state machine, message log, and template management. Detailed state-machine, template, and media specifications live in `07-whatsapp-platform-implementation-plan.md`; this phase implements the service per that plan. Satisfies FR-011 (gateway), FR-012 (welcome/consent/language flow), FR-013 (quick replies), FR-014/015/016 (prompt/pulse/legacy delivery integration), FR-017 (opt-in enforcement), FR-018/019 (voice/photo intake), FR-020 (fallback handling), FR-021 (retry + alerting), FR-022 (phone masking), FR-023 (conversation log + access control), FR-024 (EN/AM), FR-025 (emergency detection), FR-026/027 (myth/challenge flows), FR-028 (state persistence), FR-029 (quiet hours/scheduling windows), FR-030 (analytics events), FR-149 (provider abstraction), and AR-021…AR-024.

**Components.**
- Provider-abstraction layer (`whatsapp-provider` interface): adapters for Meta Cloud API (primary, §7.1), plus Twilio/WATI/360Dialog stubs; webhook verification handshake (GET echo challenge), HMAC signature validation (`X-Hub-Signature-256`, constant-time compare, §7.4.1), async processing after `200` ack.
- Conversation engine: state machine per §7.2 (IDLE, OPT_IN, PROFILE_COLLECTION, WEEKLY_PROMPT, DAILY_PULSE, MYTH_REPORT, SHARE_CHALLENGE, ASK_QUESTION, EMERGENCY, THANK_YOU, GOODBYE), state persistence (§7.2.4 timeouts), quick replies, fallback for unrecognized input (FR-020), emergency detection + escalation path (FR-025, §9.6), intent/language routing to AI (Phase J).
- Message log: full per-user conversation record with timestamps, types, media refs (§13.3.11), role-filtered reads (FR-023, FR-022).
- Messaging controls: per-user outbound caps, broadcast throttle, 24-hour window enforcement (template vs free-form, §7.4.3), quiet hours (FR-029), template library + approval status (FR-108).
- Media processing: download → type/size validation → malware scan → compression → object storage under anonymized paths (§7.4.2); voice enqueued for transcription (shared ASR integration from Phase G).

**Files expected.**
```
services/whatsapp/
├─ src/
│  ├─ app.ts  config.ts  index.ts
│  ├─ providers/{meta,twilio,wati,360dialog}.ts   # adapter impls
│  ├─ webhook/{verify,signature,dispatch}.ts
│  ├─ conversation/{stateMachine,flows,quickReplies,timeouts}.ts
│  ├─ media/{download,validate,scan,store}.ts
│  ├─ messaging/{window,quietHours,throttle,templates}.ts
│  └─ routes/{webhook,state,messages,templates}.ts
├─ test/unit  test/integration  test/contract  test/media
├─ openapi.yaml  Dockerfile  package.json
```

**Dependencies.** Phase B (identity), Phase C (profiles/consent/opt-out), Phase E (prompt segmentation, quiet hours), Phase D (content embedding, FR-082), Phase J (Ask-a-Question intent routing; stubbed in this phase). WhatsApp provider contract + business verification (D-01, M-02).

**APIs implemented (SRS §12.4).**
| Endpoint | Method | Purpose |
| --- | --- | --- |
| `/v1/whatsapp/webhook` | GET | Provider verification handshake (public, signature-checked) |
| `/v1/whatsapp/webhook` | POST | Inbound messages/statuses (HMAC validated; async queue) |
| `/v1/whatsapp/users/:id/state` | GET | Inspect conversation state (admin/ops) |
| `/v1/whatsapp/messages` | GET | Query outbound/inbound message log (admin/support, role-filtered) |
| `/v1/whatsapp/templates` | GET/POST | List/create templates with approval status (content/admin) |

**Database changes.** `conversations` (§13.3.10) + `messages` (§13.3.11 with unique `provider_message_id` for dedup) land in `05` §4.2 migration 008 (`conversations-and-messages`). `whatsapp_templates`, `whatsapp_media`, `broadcast_exclusions` (FR-017/112 opt-out list) are additions beyond the `05` catalog (see §4 numbering note). Idempotency: unique `provider_message_id` (§7.4.1).

**Tests required.** Unit: signature verification (valid/invalid/tampered, constant-time), state-machine transition table per §7.2.2, timeout behavior, quick-reply routing, emergency detection priority, window enforcement. Integration: webhook → state transition → message log flow with mocked provider; media pipeline (type/size/scan); dedup on duplicate `provider_message_id` (FR-161); opt-out blocks broadcast (FR-112). Contract + security: `whatsapp.yaml`; signature-mismatch returns `401`; no phone numbers in logs (FR-022). E2E (QR-010): opt-in → profile → weekly prompt → reply → thank-you → emergency path.

**Verification evidence.** Signature suite green; state-machine table tests pass; duplicate webhook produces one message row; opt-out user excluded from sends; emergency path raises `safety.event.raised` and notifies admin; media stored under anonymized path; WhatsApp analytics counters visible on the bus (FR-030); coverage gate met.

---

### Phase I — Campaign Service

**Objective.** Implement campaign creation, audience segmentation, template approval gating, throttled delivery, and delivery tracking. Satisfies FR-107 (audience segmentation: pregnancy week, region, language, cohort, consent status; scheduling), FR-108 (platform + internal template approval gate), FR-109 (delivery/read/reply/opt-out metrics per campaign), FR-110 (A/B variants, Could-Have), FR-111 (scheduling limits + rate throttling), FR-112 (opt-out removal), FR-017 (broadcast only to opted-in), FR-030 (analytics feed), and NFR-005 (batch delivery within windows).

**Components.**
- Campaign service: campaign CRUD (draft/scheduled/sending/sent/failed lifecycle, §13.3.18), audience-query builder executing segmentation against consented, opted-in users (FR-107/FR-017), schedule binding to scheduler (FR-163), template approval gate checking both internal review and WhatsApp platform approval state (FR-108), throttle queue respecting provider throughput and per-user caps (FR-111, §7.4.3), per-recipient delivery tracking (`campaign_messages`, FR-109), A/B variant allocation (FR-110), opt-out interception removing recipients immediately (FR-112).
- Delivery executes through the WhatsApp message gateway (Phase H); status callbacks (delivered/read/failed/opted_out) update `campaign_messages`.
- Campaign metrics aggregated for the admin dashboard (FR-109, §11.3).

**Files expected.**
```
services/campaign/
├─ src/
│  ├─ app.ts  config.ts  index.ts
│  ├─ services/{definition,segmentation,approval,throttle,delivery,metrics,abTest}
│  ├─ repositories/{campaign,campaignMessage,audience}
│  ├─ handlers/{dispatchJob,statusCallbacks,optOut}
│  └─ routes/campaigns.ts   # consumed by Admin facade
├─ test/unit  test/integration  test/contract
├─ openapi.yaml  Dockerfile  package.json
```

**Dependencies.** Phase C (consent/opt-in/cohort), Phase H (template approval + message gateway + opt-out), Phase E (week segmentation), Phase L (admin facade exposes CRUD).

**APIs implemented.** Public surfaces under §12.10 (delivered via Admin service): `GET/POST /v1/admin/campaigns`. Campaign service internal contract: `GET /internal/campaigns/:id/metrics`, `POST /internal/campaigns/:id/ab-variants` (FR-110). Additive (Recommended): `GET /v1/admin/campaigns/:id` (campaign detail + metrics) documented in `campaigns.yaml`.

**Database changes.** `campaigns` (§13.3.18) + `campaign_messages` (§13.3.19 with status enum) land in `05` §4.2 migration 012 (`campaigns`). `campaign_metrics` and `campaign_ab_variants` are additions beyond the `05` catalog (see §4 numbering note). Indexes per §13.3.19 (`campaign_id, delivery_status`).

**Tests required.** Unit: segmentation-filter correctness (week/region/language/cohort/consent), approval-gate blocking (FR-108), throttle math (FR-111), opt-out removal (FR-112). Integration: campaign → dispatch → status callback → metrics; opted-out recipient never receives a send; A/B variant allocation; duplicate-dispatch idempotency (FR-161/FR-163). Contract: `campaigns.yaml`.

**Verification evidence.** Opted-in-only delivery verified against a mixed fixture (FR-017); unapproved template blocks scheduling; delivery/read/reply/opt-out metrics populate per campaign (FR-109); throttle test respects per-user cap; coverage gate met.

---

### Phase J — AI Orchestration Service

**Objective.** Implement the §12.8 AI API group: grounded ask, async polling, feedback, conversation review, and safety-events, orchestrating the RAG pipeline, medical safety layer, and model fallback. Detailed RAG/ingestion/safety specifications live in `08-ai-rag-implementation-plan.md`; this phase implements the service per that plan. Satisfies FR-059 (AI on WhatsApp + app), FR-060 (RAG: chunking, embeddings, retrieval, cited generation), FR-061 (grounding restriction), FR-062 (safety classification of inputs/outputs), FR-063 (emergency response, no diagnosis), FR-064 (language/intent detection EN/AM), FR-065 (medical safety validation + escalation), FR-066 (feedback loop), FR-067 (ops dashboard data), FR-068 (prompt versioning/approval), FR-069 (audit trail), FR-070 (knowledge-base lifecycle), FR-071 (accuracy/hallucination monitoring), FR-072 (model fallback), FR-073 (pseudonymization before provider calls), FR-074 (knowledge-gap capture), FR-075 (fine-tuning dataset prep, Could-Have), and AR-005/006/016/017/018/019/020, NFR-046…050, QR-011/QR-014.

**Components.**
- AI Orchestration service: `/v1/ai/ask` sync or async (job id), intent/language classification (NLU), emergency detection first (§9.4), RAG retrieval (Qdrant `fathersnet_knowledge`, top-K 5, threshold 0.75, cross-encoder rerank, MMR), prompt assembly with citations, generation via model router (Gemini Flash primary; GPT-4o-mini; Claude 3 Haiku fallback, §9.8), medical safety validation layer (input + output), response with sources/disclaimer, knowledge-gap capture (FR-074).
- Knowledge-base manager: ingest approved content (consumes `content.published`/`content.retired`, AR-016), chunking (512 tokens/128 overlap, §9.2), embeddings, upsert/deactivate chunks, ingestion audit.
- Feedback loop: capture thumbs up/down, route low-rated answers to review queue (FR-066).
- Pseudonymization boundary: strip identifiers before any provider call; DPA + routing logs (FR-073, AR-019).
- Audit: every interaction persisted to `ai_conversations` (prompt version, model, provider, sources, safety status, latency, tokens) (FR-069, AR-020).
- Prompt management: versioned, approved prompt library (FR-068); eval sampling job for accuracy/hallucination metrics (FR-071, QR-011).

**Files expected.**
```
services/ai/
├─ src/
│  ├─ app.ts  config.ts  index.ts
│  ├─ nlu/{intent,language,emergency}.ts
│  ├─ rag/{ingest,chunk,embed,retrieve,rerank}.ts
│  ├─ safety/{inputClassifier,outputValidator,escalation}.ts
│  ├─ model/{router,fallback,cost}.ts
│  ├─ knowledge/{lifecycle,chunks}.ts
│  ├─ prompts/{versions,approval}.ts
│  ├─ feedback/  conversations/  safetyEvents/
│  └─ routes/{ask,feedback,conversations,safetyEvents}.ts
├─ test/unit  test/integration  test/eval  test/security
├─ openapi.yaml  Dockerfile  package.json
```

**Dependencies.** Phase D (content/KB lifecycle), Phase E (pregnancy-week context), Phase G (journal tagging events), Phase H (WhatsApp Ask-a-Question routing), Phase B/C (identity/RBAC). LLM + embedding providers with DPAs (D-02, M-03).

**APIs implemented (SRS §12.8).**
| Endpoint | Method | Purpose |
| --- | --- | --- |
| `/v1/ai/ask` | POST | Ask the AI assistant (sync or async with job id) |
| `/v1/ai/ask/:jobId` | GET | Poll async answer (owner) |
| `/v1/ai/feedback` | POST | Submit thumbs up/down referencing message id |
| `/v1/ai/conversations` | GET | List AI conversations (ai_admin/support, role-filtered) |
| `/v1/ai/safety-events` | GET | List safety/emergency events (ai_admin incident queue) |

**Database changes.** `ai_conversations` (§13.3.20) + `ai_feedback` (§13.3.21) land in `05` §4.2 migration 013 (`ai-audit`). `ai_prompt_versions`, `knowledge_documents` + `knowledge_chunks` (metadata + chunk state), `ai_eval_samples`, `knowledge_gaps` (FR-074) are additions beyond the `05` catalog (see §4 numbering note). Qdrant collection `fathersnet_knowledge` with document/version payloads (AR-015/AR-016).

**Tests required.** Unit: intent/language classification, emergency detection priority, retrieval threshold/rerank, prompt assembly/citation, safety-rule engine, model router fallback logic. Integration: ingest → approve → retrieve → cite; retired content not retrievable; provider failure triggers fallback (FR-072); pseudonymization verified before provider call (FR-073). Eval (QR-011/QR-014): accuracy ≥90% target on the approved evaluation set (Configurable, NFR-047), safety regression suite, hallucination sampling. Security: prompt-injection regression suite (§14.1.4). Contract: `ai.yaml`.

**Verification evidence.** Eval set + safety regression green at release gate (QR-014); grounded answers cite approved chunks; emergency path short-circuits to facility guidance with no diagnosis (FR-063, NFR-046); fallback tier activates on injected primary failure; audit rows contain prompt/model/version/tokens; knowledge-gap rows surface to content teams; coverage gate met.

---

### Phase K — Research & Analytics Service

**Objective.** Implement the anonymized research pipeline, theme/sentiment extraction, research schema population, KPI computation, and governed export. Satisfies FR-113 (structured research collection), FR-114 (AI theme/topic extraction), FR-115 (research dashboards on aggregated data), FR-116 (anonymized export with ethics/approval gate + audit), FR-117 (separate research/media consents, independently revocable), FR-118 (program KPIs/impact metrics), FR-119 (de-identification at collection), FR-120 (pre/post assessments, Should-Have), FR-121 (publication-ready outputs, Could-Have), FR-122 (governance workflow: request → ethics → approval → export → audit), FR-030 (WhatsApp analytics), and AR-013 (research separation), AR-032 (anonymized-only dashboards), NFR-027 (pseudonymization at collection), QR-009.

**Components.**
- Ingestion pipeline: consumes `journal.entry.created`, `message.outbound`/`message.inbound`, `media.processed`, prompt responses, myths, challenges; transforms to `research_responses` under an `anonymized_id` (non-reversible), separating research data from operational data (AR-013) at collection (FR-119).
- Theme/sentiment extraction: invokes AI service (Phase J) for themes with confidence scores (§10.1.2 taxonomy: fear, anxiety, joy, confusion, cultural_pressure, financial_stress) + sentiment −1.0…1.0; sampled human review as a research KPI.
- Analytics: weekly/monthly rollups into `research_analytics` (themes, sentiment, engagement by week/region/cohort); program KPIs and impact metrics (enrollment, active fathers, engagement, birth-preparedness completion, knowledge-improvement proxies) (FR-118); pre/post assessment scoring (FR-120).
- Export governance: request → ethics check → approval (separate approver per FR-106/FR-122) → de-identification/aggregation → secure export → full audit (`audit_logs`); consent-aware scope (research + media consents independently enforced, FR-117); consent withdrawal restricts and schedules deletion (FR-004/FR-125).
- Publication pack generation (FR-121, Could-Have): figures/tables from approved datasets.

**Files expected.**
```
services/research/
├─ src/
│  ├─ app.ts  config.ts  index.ts
│  ├─ pipeline/{ingest,anonymize,transform}.ts
│  ├─ extract/{themes,sentiment,review}.ts
│  ├─ analytics/{rollups,kpis,prepost}.ts
│  ├─ governance/{request,ethics,approval,export,audit}.ts
│  └─ routes/internal/research.ts
├─ test/unit  test/integration  test/privacy
├─ openapi.yaml  Dockerfile  package.json
```

**Dependencies.** Phase J (theme extraction), Phase G (journal events), Phase H (message events), Phase C (research/media consents), Phase L (admin facade exposes research dashboards/export). Research ethics approval (D-05) is a program gate for activation, not for build.

**APIs implemented.** Public surfaces under §12.10 (via Admin service): `POST /v1/admin/research/export`. Internal contract: `GET /internal/research/dashboard?type=themes|sentiment|engagement` (aggregated only, AR-032). Additive (Recommended): `GET /v1/admin/research/requests` and `POST /v1/admin/research/requests/:id/approve` for the governance workflow (FR-122), documented in `research.yaml`.

**Database changes.** `research_responses` (§13.3.22) + `research_users` (§13.3.23) land in `05` §4.2 migration 016 (`research-schema`, in `fn_research`). `research_analytics`, `research_export_jobs`, `research_governance_requests`, `research_linkage_keys` (access-controlled, separate table per §10.1.3) are additions beyond the `05` catalog (see §4 numbering note). Research tables physically/logically separated; no operational FK into research tables.

**Tests required.** Unit: anonymization (no direct identifiers), theme/sentiment mapping, KPI formulas, consent-gating of records. Integration: event → anonymized record → rollup → dashboard; export request blocked without approval; approved export contains zero identifiers (assert programmatically, QR-009/FR-116); consent withdrawal stops ingestion and schedules deletion. Contract: `research.yaml`.

**Verification evidence.** Identifier-scan test on exported artifacts passes; governance flow (request → ethics → approve → export → audit) E2E green (FR-122); KPI rollups match §2.10 metric definitions; research tables confirmed free of PII via privacy test; coverage gate met.

---

### Phase L — Admin Service

**Objective.** Implement the §12.10 Admin API group: executive KPIs, user management, campaign management, reports, audit-log views, governed research export, and support tickets, with MFA + RBAC + session controls. Satisfies FR-094 (RBAC portal enforcement server-side), FR-095 (executive KPIs), FR-096 (user management), FR-097 (review queues — journals, AI answers, myths, challenges), FR-098 (immutable audit-log view), FR-099 (operational report export CSV/PDF, role-limited), FR-100 (consent management views), FR-101 (MFA for admin), FR-102 (session expiration/revocation/concurrent control), FR-103 (admin notification preferences), FR-104 (support-agent interface), FR-105 (data-retention configuration + automated purging), FR-106 (segregation of duties), and AR-030…AR-033, §14.7 permission matrix.

**Components.**
- Admin facade service: aggregates read-model data across services (overview KPIs from analytics, user list from User service with masked phones, campaigns from Campaign service, research from Research service, review queues from Journal/AI services); performs no direct DB writes except admin-owned entities (audit trail always written to `audit_logs`).
- RBAC: role claims from tokens (§14.7 matrix), deny-by-default, ownership checks, and segregation-of-duties blocking (author ≠ medical approver; researcher export needs separate approver) (FR-106).
- MFA enforcement for all staff endpoints (FR-101, activated from the Phase B staff model); session policies: expiration, revocation, concurrent-session control (FR-102).
- Review queues: journals (FR-058), AI answers (FR-066/067), myths (FR-026), challenges (FR-027) with approve/escalate/dismiss actions, each audited (FR-097).
- Support: ticket CRUD + user lookup (masked) + helpdesk KB search (FR-104).
- Retention service: per-data-class retention configuration, automated purge jobs with audit (FR-105, AR-014); integrates with deletion/consent withdrawal (FR-004/FR-007).
- Admin notification preferences and routing (FR-103).

**Files expected.**
```
services/admin/
├─ src/
│  ├─ app.ts  config.ts  index.ts
│  ├─ middleware/{mfa,requireRole,audit}.ts
│  ├─ services/{overview,users,campaigns,reports,audit,research,queues,support,retention,notifications}
│  ├─ repositories/{ticket,retentionPolicy,adminNotification}
│  └─ routes/{overview,users,campaigns,reports,auditLogs,research,queues,support,tickets}.ts
├─ test/unit  test/integration  test/contract  test/security
├─ openapi.yaml  Dockerfile  package.json
```

**Dependencies.** All prior phases (read-model sources), Phase B (staff auth/MFA), Phase G (journal flags), Phase J (AI queues/safety events), Phase I (campaigns), Phase K (research). 

**APIs implemented (SRS §12.10).**
| Endpoint | Method | Purpose |
| --- | --- | --- |
| `/v1/admin/overview` | GET | Executive KPIs (aggregated) |
| `/v1/admin/users` | GET | Search/filter users (masked phone) |
| `/v1/admin/users/:id` | PATCH | Manage user status (audited) |
| `/v1/admin/users/export` | GET | Export user list (CSV, role-limited) |
| `/v1/admin/campaigns` | GET/POST | Manage campaigns (scheduling) |
| `/v1/admin/reports` | GET | Operational reports (PDF/CSV, role-limited) |
| `/v1/admin/audit-logs` | GET | Query immutable audit log (read-only, super/administrator) |
| `/v1/admin/research/export` | POST | Request governed anonymized dataset export |
| `/v1/admin/support/tickets` | GET/POST | Support queue |

Plus review-queue and retention surfaces (Recommended additive, documented in `admin.yaml`): `GET /v1/admin/queues/:type`, `POST /v1/admin/queues/:type/:id/action`, `GET/PUT /v1/admin/retention-policies`.

**Database changes.** Admin tables `roles`/`permissions` (seed per §14.7), `support_tickets`, `ticket_messages`, `retention_policies`, `admin_notifications`, `review_queue_items` (typed queue entries) are additions beyond the `05` §4.2 catalog (see §4 numbering note); `05` migration 017 seeds reference/config data, so `roles`/`permissions` need a `05` §4.2 entry with approval. `audit_logs` (§13.3.24, `05` migration 015) remains the append-only record for all admin actions.

**Tests required.** Unit: RBAC matrix per §14.7 (each role × each endpoint), SoD blocking, MFA challenge flow, session expiry/revocation/concurrent control, retention rule evaluation. Integration: overview KPIs computed from fixtures; user export masks phones and respects role scope; review-queue actions write audit rows; research export requires second approver (FR-106/122). Security: privilege-escalation attempts denied; MFA enforced on every staff endpoint (FR-101). Contract: `admin.yaml`. E2E: admin dashboard journeys (QR-004).

**Verification evidence.** RBAC matrix test passes for all roles/endpoints; MFA-gated access verified; audit log append-only and queryable; retention purge runs per policy with audit trail; support ticket lifecycle works; coverage gate met.

---

## 5. Cross-Cutting Backend Concerns

These apply to every service from Phase A onward and are enforced centrally, never retrofitted.

### 5.1 Authentication & Authorization (SRS §14.6/§14.7, FR-126)

- **AuthN:** bearer JWT (RS256/ES256) with claims `sub` (UUID — never phone, FR-009), `role`, `token_version`; short-lived access (15 min, Configurable) + rotating refresh (30 days, revocable) (§14.6). Public-only exceptions: `POST /v1/auth/otp/request` and WhatsApp webhook verification (§12.1). Staff endpoints additionally require MFA (FR-101).
- **AuthZ:** server-side RBAC per the §14.7 permission matrix, deny-by-default; ownership checks on every user-scoped endpoint (self/partner; admin role-gated); attribute-based checks where consent/media scope applies (FR-126, NFR-016 A01). Segregation of duties enforced at the authorization layer (author ≠ medical approver, export needs separate approver, FR-106).
- Gateway centralizes verification (cache of public keys, revocation check) while each service re-validates ownership claims — defense in depth (NFR-017).

### 5.2 Audit Logging (FR-098, FR-127, NFR-023)

- All admin, consent, export, deletion, sensitive-data-access, and security events write to `audit_logs` (§13.3.24) via a shared `audit` middleware/package: actor, action, resource, ip, user-agent, result, request-id.
- Append-only enforced at the DB layer (no UPDATE/DELETE grants); tamper-evidence via hash-chaining (Recommended); retention per compliance policy (§18.1).
- No PII in audit messages beyond the fields the event requires; message bodies never logged (§18.1).

### 5.3 Localization (FR-138, NFR-033)

- EN/AM from the first template and first user-facing string (02 analysis: "EN/AM from the first template and UI string").
- Shared `packages/i18n/` dictionaries + a parity lint that fails when a locale is missing; content/reminder/WhatsApp/AI-prompt localization follow the same pipeline (FR-047, FR-079, FR-024, FR-138). AI prompts maintain parallel EN/AM versions under prompt management (FR-068).

### 5.4 Observability (FR-166, §18)

- Structured JSON logs (30-day retention), security logs (1 year), AI interaction logs (per governance), immutable audit logs (per compliance) — §18.1 retention table.
- OTel traces + metrics on every service; `X-Request-Id`/`traceparent` correlation end-to-end and into the bus.
- Dashboards: service health, API latency (NFR-002), WhatsApp delivery, queue depth, AI latency/tokens/cost, DB slow queries, business KPIs (AR-038).
- Alerting per §18.3 including emergency-escalation failure, high error rate, security events, cost thresholds, queue backlogs.

### 5.5 Configuration Management & Secrets (FR-170, NFR-022)

- Environment-scoped config in `packages/config` with JSON-schema validation; no secrets in code, images, or logs; secrets injected from the secret manager (KMS) with rotation scheduled (NFR-022).
- Feature flags (FR-168) via `packages/config` (flag provider) with canary/rolling deployment support (SRS §16.2); every flag is code-reviewable and documented.
- Documentation co-located: runbooks, API docs, data dictionary, admin guides live in the repo and are updated in the same change set (FR-170, OR-015).

---

## 6. Backend Testing Strategy

Owned in detail by `13-testing-and-quality-plan.md`; enforced per phase as described in §4. Summary of the backend-specific approach:

| Layer | Scope | Tooling (Recommended) | Gate |
| --- | --- | --- | --- |
| Unit (QR-002) | Core domain logic of each service (pregnancy math, state machine, safety rules, consent lifecycle, segmentation, budget math, token lifecycle) | Jest + TypeScript | ≥80% coverage on core services; ≥70% overall (Configurable); coverage gate blocks CI |
| Integration (QR-003) | Service↔DB (Postgres), service↔bus (Redis), service↔provider mocks (WhatsApp, ASR, LLM, SMS) | Testcontainers, real Redis, provider stubs | Green on every merge |
| Contract (QR-005) | OpenAPI schema compatibility for internal + external contracts; per-service `openapi.yaml` validation | openapi-cli + schema-compat suite | Breaking-change detection blocks release |
| E2E (QR-004) | Critical journeys: Registration → Opt-in → Weekly prompt → AI question → Response; emergency escalation; checklist/budget; campaign delivery; research export governance | Playwright/supertest against staged stack | Runs pre-release (QR-013) |
| Performance (QR-006) | Latency targets (NFR-002: median ≤500 ms, p95 ≤2 s; WhatsApp 5 s median NFR-003), broadcast windows (NFR-005), load at 500+ concurrent (NFR-001) | k6 | Pre-release + on schedule |
| Security (QR-007) | SAST, dependency scan, secret scan, DAST, pen test; OTP brute-force, webhook forgery, IDOR, prompt injection, MFA bypass | semgrep, npm audit, trufflehog, OWASP ZAP | Zero critical/high at release (NFR-016) |
| Privacy (QR-009) | Consent flow, data minimization, export, deletion, pseudonymization, no-PII-in-logs assertions | automated privacy suite | Release gate |
| WhatsApp conversational (QR-010) | State machine, templates, media, errors, safety responses (Phase H) | mocked provider + signature suite | Release gate |
| AI quality (QR-011/014) | Accuracy eval set (≥90%, Configurable), safety regression, hallucination sampling, bias review | eval harness in `services/ai/test/eval` | AI release gate |
| Test data (QR-012) | Synthetic data, no production PII, consent fixtures | seeded via `packages/db` seeds | All environments |
| Traceability (QR-015) | Every requirement mapped to tests with status | test/requirement matrix | Maintained per release |

---

## 7. Repository Structure

Recommended monorepo layout (npm workspaces + Turborepo). Each service is independently deployable and versioned (FR-159).

```
fathers-net/
├─ package.json  turbo.json  tsconfig.base.json  .eslintrc.cjs  .prettierrc
├─ .github/workflows/            # ci.yml, cd.yml (SRS §16.2)
├─ docker-compose.yml            # SRS §16.1 reference stack
├─ packages/
│  ├─ api-spec/                  # openapi/{auth,users,content,whatsapp,checklists,budget,ai,journal,admin,campaigns,research}.yaml + common.yaml + CHANGELOG.md
│  ├─ config/  logger/  errors/  events/  idempotency/  i18n/  audit/  test-utils/
│  └─ db/                        # migrations/, seeds/, migration runner
├─ services/
│  ├─ gateway/
│  ├─ auth/
│  ├─ users/
│  ├─ content/
│  ├─ pregnancy/
│  ├─ reminders/
│  ├─ checklists/
│  ├─ budget/
│  ├─ journal/
│  ├─ whatsapp/
│  ├─ campaign/
│  ├─ ai/
│  ├─ research/
│  ├─ admin/
│  └─ scheduler/
├─ infra/
│  ├─ terraform/  nginx/  grafana/  alerts/  backups/
├─ scripts/                     # deploy/healthcheck/rollback/promote (SRS §16.2)
└─ docs/                        # architecture, api, runbooks, data-dictionary, admin-guides
```

Per-service template (consistent across all services):
```
services/<name>/
├─ src/{app,config,index}.ts
├─ src/routes/        src/middleware/  src/services/  src/repositories/  src/events/
├─ test/{unit,integration,contract,security,privacy,eval}/
├─ openapi.yaml  Dockerfile  package.json  tsconfig.json
```

---

## 8. Dependencies and Blockers

| # | Dependency | SRS Ref | Blocked Phase(s) | Action |
| --- | --- | --- | --- | --- |
| D-01 | WhatsApp Business API availability/policy + provider contract | §1.9, M-02 | H, I (integration testing) | Secure Meta Cloud API test account; abstraction layer allows later switch (FR-149) |
| D-02 | LLM/embedding provider + DPA | §1.9, M-03 | J | Contract + DPAs (FR-073); fallback tiers (FR-072) |
| D-03 | Cloud platform regional availability | §1.9, M-01 | A | Provision dev env early; multi-zone readiness (NFR-011) |
| D-04 | Clinical/medical review of content | §1.9, QR-019, OR-021 | D publish, J grounding | Content review workflow before publishing health content (FR-081) |
| D-05 | Research ethics approval | §1.9, FR-122, NFR-042 | K activation (not build) | Governance workflow built in Phase K; ethics gate before live collection |
| D-06 | Transcription/translation services (EN/AM) | §1.9, §9.7 | G, H (voice), J | ASR provider onboarding; AssemblyAI primary, Google fallback |
| M-06 | Object storage + host | §2.6, M-06 | A (provision), G/H (media) | Cloud object storage with SSE and retention tags |
| M-07 | Budget cap default | §2.6, M-07 | F | Program-suggested reference cap (Configurable) |
| Ops | Operations team, on-call, runbooks | OR-001…012 | L go-live | Recruit/rotate on-call; alert verification (OR-007/008) |

Hard sequencing constraint from `02-srs-requirement-analysis.md` §3: Infrastructure → Database → Authentication → User Profile → Content/KB → Pregnancy/Reminders → WhatsApp → AI → (Mobile/Admin/Research) → Pilot Ops. Phases A–D and B–C are strictly ordered; Phases D/E/F/G can partially overlap after C; H needs D+E; J needs D+H; K needs J+C; L needs all.

---

## 9. Risks and Mitigations

| Risk | SRS Basis | Impact | Mitigation | Owner Phase |
| --- | --- | --- | --- | --- |
| Microservice sprawl / over-decomposition | §15.1, FR-159 | Delivery slowdown, distributed-debug cost | Start with the 14 services above; no further split without ADR; shared packages for cross-cutting logic | A, continuous |
| Event ordering / duplicate processing | FR-160/161 | Duplicate prompts, double messages, incorrect week state | Outbox pattern + consumer idempotency keys + unique `provider_message_id`; integration tests with replayed events | A, E, H |
| AI safety failure (harmful/unsafe health output) | C-01, NFR-046/050, FR-062/063/065 | User harm, program risk | Medical safety layer first; eval set + safety regression gate (QR-011/014); no-diagnosis policy; emergency short-circuit | J |
| WhatsApp policy/template delays | C-06, FR-108, D-01 | Campaigns and outbound blocked | Template approval gate built early; provider abstraction; platform-approval tracking from Phase H | H, I |
| AI cost overrun | A-07, AR-040, NFR-009 | Budget breach | Model router with cost classes; caching frequent answers; cost alert thresholds (§18.3); token metrics per interaction | J |
| Consent/data-privacy regression | FR-125, NFR-025…029, AR-012/013 | Compliance/legal exposure | Immutable consents at DB; append-only audit; research separation; privacy test suite (QR-009) as release gate | C, K, L |
| Clinical content not ready | D-04, QR-019 | AI ungrounded, content gaps | Build workflows first (Phase D); ingest only approved content; knowledge-gap capture (FR-074) | D, J |
| Identity/OTP abuse | §14.1.1, FR-005, NFR-018 | Account takeover, message spam | Rate limits + lockout + constant-time compare + device fingerprinting + token rotation; security tests in CI | B |
| Retention/deletion SLA miss | FR-007/105, NFR-024 | Legal exposure, support burden | Automated purge jobs with audit; deletion runbooks; DR/restore drills | C, L |
| Research governance friction | FR-116/122, D-05 | No evidence generation | Governed workflow built in Phase K; ethics approval tracked as a program gate | K |

---

## 10. Verification Approach

Verification is continuous per phase (each phase lists its Verification evidence) and consolidated at release by the quality gates in `21-quality-gate-checklist.md` and `13-testing-and-quality-plan.md`.

| Gate | Criteria | Evidence |
| --- | --- | --- |
| Per-merge (QR-002/003/005) | Unit + integration + contract green; coverage floor met; OpenAPI compatibility | CI pipeline artifacts, coverage reports, contract reports |
| Per-phase demo | Phase verification evidence (§4) reproduced in staging | Recorded demo + test reports |
| Pre-release (QR-013) | Unit + integration + E2E + security + performance + accessibility + clinical review | Full gate report; alerting/rollback verified (QR-016) |
| AI release (QR-014) | Eval set + safety regression + hallucination sampling | Eval harness report with thresholds |
| Traceability (QR-015) | Every FR/AR behind each phase has passing tests | Requirement→test matrix (`22-feature-implementation-matrix.md`) |
| Operational (OR-007/008, FR-166) | Dashboards live, alerts fire on synthetic failure, runbooks exercised | Screenshots, alert evidence, drill logs |
| DR (FR-165, NFR-012) | Restore drill meets RPO ≤15 min / RTO ≤4 h | DR drill report (Phase A onwards, quarterly) |
| UAT / pilot (QR-017/018) | Representative fathers, staff, researchers | UAT sign-off, pilot evaluation report |

Every backend phase concludes only when: its APIs from SRS §12 are live and contract-verified, its migrations are applied and reversible (FR-164), its tests pass the QR gates, its telemetry is observable, and its acceptance criteria from the FR tables in `00-requirement-inventory.md` are demonstrably met.

---

**END OF DOCUMENT — 06. Backend Development Plan**
