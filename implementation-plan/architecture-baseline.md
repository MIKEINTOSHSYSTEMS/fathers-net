# FathersNet Architecture Baseline

**Status:** FROZEN as the canonical engineering reference (Phase 0.5 Architecture Freeze)
**Controlling input:** `03-system-architecture-plan.md`, `04-technology-stack-analysis.md`, `06-backend-development-plan.md`, `05-database-implementation-plan.md`, `07-whatsapp-platform-implementation-plan.md`, `08-ai-rag-implementation-plan.md`, `09-mobile-application-development-plan.md`, `10-admin-dashboard-development-plan.md`, `11-security-and-privacy-plan.md`, `12-devops-and-infrastructure-plan.md`, `13-testing-and-quality-plan.md`, `14-development-phase-roadmap.md`, `17-final-execution-roadmap.md`, `21-quality-gate-checklist.md`, `decision-log.md`
**Authority:** SRS `docs/FathersNet-Complete-SRS.md` (FN-SRS-001 v2.0) remains the single source of truth for requirements. This baseline consolidates approved planning decisions only; it introduces **no new requirements**.
**Classification legend (SRS §1.8):** **Confirmed** (SRS-mandated) · **Recommended** (SRS Recommended Reference Architecture or documented engineering recommendation) · **Configurable** (parameter with pilot default) · **Assumption/Open** (needs human decision — the M-01…M-07 items)
**Rule:** Any implementation that conflicts with this document requires an ADR/decision-log change before code lands (see `implementation-contract.md`).

---

## 1. Executive Summary

FathersNet (Ayay) is a greenfield, Ethiopia-first digital fatherhood and family-health platform with five surfaces: mobile app (Android-first, iOS supported), WhatsApp business channel, web admin/research portal, AI assistant with RAG, and a research/evidence pipeline. It operates in English and Amharic under hard constraints: intermittent low-bandwidth connectivity (A-02), low-literacy and voice-first users (A-06), healthcare safety (C-01), privacy-by-design (C-02), and aggressive cost control on AI tokens and messaging (A-07, C-03).

- **Backend:** Node.js (LTS) + TypeScript microservices behind an API gateway; Python for AI/data/ingestion/evaluation services. **Confirmed (FR-159, AR-005; §16.1/§17.2).**
- **Data plane:** PostgreSQL 16 system of record (27 tables) + Qdrant vector store (`fathersnet_knowledge`) + Redis (cache/queue/sessions/rate-limit) + S3-compatible object storage. **Confirmed (ADR-003, AR-002; §13/§16.1).**
- **Event backbone:** Redis + BullMQ pilot; Kafka/cloud-native managed bus at scale, behind a bus adapter. **Recommended (`04` §8).**
- **AI:** Gemini 2.0 Flash → GPT-4o-mini → Claude 3 Haiku tiers; OpenAI `text-embedding-3-small` (1536) primary / Gemini embeddings fallback; AssemblyAI primary / Google STT fallback (EN+AM); mandatory medical safety layer. **Recommended (`04` §12, §13; `08`).**
- **WhatsApp:** Meta Cloud API primary behind a provider abstraction (FR-149); 360Dialog/Twilio/WATI alternates; `X-Hub-Signature-256` webhook validation. **Recommended (`04` §11; `07`).**
- **Mobile:** React Native (TypeScript) + SQLite offline-first local store (ADR-004). **Recommended (`04` §4; M-04 open).**
- **Admin portal:** Next.js (React 18+, TypeScript), WCAG 2.1 AA, role-based modules, MFA. **Recommended (`04` §6; `10`).**
- **DevOps:** Docker Compose reference topology + nginx; Terraform IaC; GitHub Actions CI/CD per §16.2; OTel + Grafana stack + Sentry. **Recommended (`04` §15–§16; `12`).**
- **Hosting:** single cloud, multi-zone, African region — provider/region is **M-01 (open)**. GCP `africa-south1` is the engineering default; AWS `af-south-1` is the documented alternate.

**Not yet frozen (open human decisions):** M-01 (cloud), M-02 (WhatsApp provider), M-03 (LLM/embedding contract + embedding-model fix), M-04 (mobile framework), M-05 (pilot cohort size), M-06 (object-storage host), M-07 (budget cap default). All other technology and architecture decisions below are frozen and binding.

---

## 2. System Context

**Actor surfaces (SRS §15.1, `03` §3.3):**
- Fathers/partners via WhatsApp (primary channel, ADR-001) and mobile app (Android-first).
- Staff: administrator, researcher, content manager, AI admin, healthcare worker (medical reviewer), support — six roles per FR-094/§14.7.
- Providers (external): WhatsApp Business API, LLM/embedding/ASR, SMS/push/email notification channels, cloud, object storage.

**Regulatory/operational context:** Ethiopian health-data residency expectations; DPAs with every processor before data flows (FR-073, NFR-029); research separated and anonymized at collection (AR-013, AR-032, FR-119); consent as immutable versioned events (AR-012); clinical review of content (OR-021, QR-019); pilot cohort and impact measurement per §5.9/PD-004.

---

## 3. Architecture Principles

From `03` §2 (P-01…P-20), all traceable to AR-001…AR-040 and ADR-001…ADR-006. **Binding.**

| Principle | Statement |
| --- | --- |
| P-01 | WhatsApp-first channel (ADR-001) |
| P-02 | Microservices with API gateway + event-driven communication (AR-001) |
| P-03 | Three-tier data architecture: relational + vector + object (AR-002, ADR-003) |
| P-04 | RAG-grounded AI with a mandatory medical safety layer (AR-006) |
| P-05 | Provider abstraction for every third-party dependency (AR-004, ADR-001/005) |
| P-06 | Stateless, horizontally scalable services; state externalized to Redis (AR-008) |
| P-07 | Strict environment isolation dev/staging/prod (AR-009) |
| P-08 | Consent as immutable, versioned event stream (AR-012) |
| P-09 | Research data separated + anonymized at collection (AR-013) |
| P-10 | Knowledge lifecycle governs AI retrievability (AR-015/016) |
| P-11 | Scheduled/queued pipelines with retry, idempotency, observability (AR-007) |
| P-12 | Canonical data model with referential integrity (FR-162) |
| P-13 | Security and privacy by design, enforced server-side (FR-126) |
| P-14 | Offline-first mobile with local-first sync (AR-025, ADR-004) |
| P-15 | AI governance and full auditability (AR-020) |
| P-16 | Infrastructure-as-Code with CI/CD and progressive deployment (AR-036/037) |
| P-17 | Pluggable future integration |
| P-18 | Cost control as an architectural constraint (AR-040, C-03) |
| P-19 | Role-based admin with MFA and segregation of duties (AR-033, FR-106) |
| P-20 | Near-real-time analytics feed (AR-031) |

---

## 4. Technology Decisions

Single source of truth: `04` §18 classification matrix. This table is the frozen baseline.

| Capability | Baseline technology | Class | Source |
| --- | --- | --- | --- |
| Backend — application | Node.js (LTS v20/v22) + TypeScript microservices, **Fastify** HTTP layer | Recommended (capability Required) | `04` §3, §18 |
| Backend — AI/data | Python 3 services (ingestion, retrieval, eval, research) | Recommended (capability Required) | `04` §5, §18 |
| Mobile | React Native (TypeScript) | Recommended; **Configurable RN-vs-Flutter (M-04)** | `04` §4, §18 |
| Mobile offline storage | SQLite + queued sync + field-level conflict merge (100 MB LRU) | Recommended (offline-first Required) | `04` §4; ADR-004; §8.5 |
| Web/admin portal | Next.js (React 18+, TypeScript), WCAG 2.1 AA | Recommended (web Requirements Required) | `04` §6, §18 |
| Relational database | PostgreSQL 16 (`postgres:16-alpine`) | Recommended (ADR-003) | `04` §7, §18 |
| Vector database | Qdrant (`fathersnet_knowledge`, cosine, HNSW m=16/ef_construct=200) | Recommended (ADR-003, §9.3); pgvector documented alternate | `04` §7, §18; `03` D-07 |
| Queue / message bus | Redis + BullMQ (pilot); Kafka/Pub/Sub at scale behind bus adapter | Recommended (event-driven Required) | `04` §8, §18 |
| Cache / sessions / rate limit | Redis 7 (`--appendonly yes`) | Recommended (AR-008, §16.1) | `04` §9, §18 |
| Object storage | S3-compatible (GCS/S3 production; MinIO compose); SSE; signed expiring URLs | Recommended; host **M-06** | `04` §10, §18 |
| Speech-to-text | AssemblyAI primary / Google STT fallback (EN+AM) | Recommended (capability Required) | `04` §11, §18 |
| LLM | Gemini 2.0 Flash → GPT-4o-mini → Claude 3 Haiku; cost-aware routing; 5 s timeout; retry-once | Recommended (fallback Required); model names Configurable | `04` §12, §18; ADR-005 |
| Embeddings | OpenAI `text-embedding-3-small` (1536) primary / Gemini fallback; dimension guard | Recommended; dimension Configurable at reindex | `04` §12, §18 |
| WhatsApp | Meta Cloud API behind abstraction (360Dialog/Twilio alternates) | Recommended (abstraction Required); provider **M-02** | `04` §11, §18; ADR-001 |
| Cloud hosting | Single cloud, multi-zone, African region, Terraform, Docker Compose reference + nginx, managed/GKE path | Recommended; provider/region **M-01** | `04` §14, §18 |
| CI/CD | GitHub Actions per §16.2 (build → test → coverage → scan → deploy staging → canary/rollback on main) | Recommended (capability Required) | `04` §15, §18 |
| Monitoring | OTel + Prometheus/Grafana/Loki/Tempo/Alertmanager + Sentry + synthetic checks | Recommended (capability Required) | `04` §16, §18 |
| Workflow automation | n8n (per §16.1, pinned versioned tag) + BullMQ for time-critical jobs | Recommended (scheduler Required) | `04` §17, §18 |
| Deployment topology | nginx reverse proxy (TLS), Docker Compose reference, managed/orchestrated prod equivalent | Recommended (IaC/containerized Required) | `04` §18; ADR-006 |

**Locked ADRs (SRS §15.4, not changeable without SRS change):** ADR-001 WhatsApp-first · ADR-002 separation of concerns · ADR-003 PostgreSQL + separate vector store · ADR-004 SQLite offline-first mobile · ADR-005 multi-provider AI abstraction with fallback · ADR-006 single-cloud multi-zone IaC hosting.

---

## 5. Service Boundaries

### 5.1 Logical services (13; `06` §2.1 — the build-level split)

API Gateway · Auth · User & Profile · Pregnancy Engine · Reminder Engine · Content & CMS · Checklist & Budget · Journal · WhatsApp/Conversation · Campaign · AI Orchestration · Research & Analytics · Admin Service.

Internal services with no public §12 endpoints (Pregnancy Engine, Reminder Engine, Research pipeline, Journal internals) are consumed via gateway/admins through internal REST contracts defined in OpenAPI (QR-003).

### 5.2 Architectural boundaries vs pilot packaging

- 11 architectural boundaries per `03` §3.1 (includes the Medical Safety Layer as a boundary).
- **Pilot deployable units (6)** per `03` D-01: `edge-gateway` (gateway + auth front) · `identity-user` (auth core + user/profile/pregnancy + journal + checklist/budget) · `engagement` (conversation + reminder + campaign) · `content` (CMS) · `research-analytics` · `ai-orchestration` (AI + safety layer + ASR orchestration).
- Service **contracts and table ownership** remain per §5.1; only packaging is consolidated. Splitting units later must not change contracts (`03` D-01, AR-001). The unit→service mapping table is a Phase 1 artifact (Phase 0 contradiction row 5).

### 5.3 Cross-service rules (`03` §3.4, `06` §2)
- Every service exposes an OpenAPI 3.x contract (AR-003, FR-153) and documents published/subscribed events in the canonical event catalog (`03` §4.6).
- No direct inter-service DB reads; no shared code between Node and Python services — interop only via REST/event contracts (D-06).
- Outbox pattern: domain writes + outbox rows in one local transaction; relay publishes to the bus; consumers dedupe on event `id` (FR-161).

---

## 6. Database Strategy

- **PostgreSQL 16**, canonical 27-table model (`05` §2, SRS §13), JSONB for flexible payloads, `pg_trgm` for EN search. Managed/cloud in prod; self-hosted allowed in compose reference. **Confirmed (ADR-003).**
- **Migrations:** `node-pg-migrate`, numbered `001…` (17-step order per `05` §4), reversible `up`/`down`, immutable once applied, additive-first; destructive changes gated by review and rehearsed on staging (FR-164, AR-011). Migration 001 creates `users`, `profiles`, `pregnancies`, `consents`, `audit_logs`, `conversations`, `messages` with append-only consent/audit semantics (AR-012, NFR-023).
- **Consent immutability:** append-only `consents` (versioned events), `audit_logs` append-only with `REVOKE UPDATE/DELETE` + `BEFORE UPDATE OR DELETE` trigger defense-in-depth (AR-012, NFR-023).
- **Privacy:** `phone_e164` AES-256-GCM at rest via KMS envelope key; `phone_e164_digest` keyed-HMAC unique index for lookup without decrypting; phone never a PK (FR-009, §14.2). Admin surfaces mask phones (FR-022).
- **Research separation:** `fn_research` schema with `research_writer`/`research_reader` least-privilege roles (AR-013, §10.1.3); physical-database option at scale.
- **RLS:** row-level security enforced as defense-in-depth; service-layer auth remains primary (FR-126).
- **Retention/purge:** `retention_policy` config seeded in migration 017; automated purge jobs with audit (FR-105, AR-014). Verifiable deletion per NFR-024.
- **Qdrant:** `fathersnet_knowledge`, cosine, HNSW m=16/ef_construct=200, payload filtering for language/week/document-version; nightly snapshot; snapshot before any migration/rebuild (AR-015/016, §19). pgvector is the documented fallback (`03` D-07) — swap requires eval-set revalidation (NFR-047).
- **Object storage paths** per §7.4.2: `media/voice|photo/<anonymized_user_id>/<message_id>.<ext>`; deny-by-default buckets; signed expiring URLs (FR-150).
- **Backup/DR:** continuous WAL / PITR for RPO ≤15 min; RTO ≤4 h (§19); quarterly restore-to-staging drill (NFR-014).

---

## 7. AI Architecture

- **Pipeline** (`08` §2): ingestion (DOCX/PDF/MD/HTML/TXT → normalize → chunk 512 tokens/128 overlap → embed 1536 → upsert with metadata) → retrieval (top-K 5, threshold 0.75, cross-encoder rerank, MMR) → prompt assembly with citations (AR-017) → generation via model router → **output safety validation** → respond with sources/disclaimer or decline (FR-060/061, NFR-046).
- **Safety layer is in the request path** (AR-006): input safety classification + emergency detection (FR-062/063, §9.6) run **before** generation; output validated before delivery (FR-065); escalation to human review (FR-097, OR-010); emergency flow short-circuits (§15.3).
- **Model tiers** (ADR-005, §9.8): Gemini 2.0 Flash primary; GPT-4o-mini fallback 1; Claude 3 Haiku fallback 2. 5 s first-token timeout; retry-once-then-failover; per-intent routing (simple/high-volume → cheapest capable; complex/safety-sensitive → upgraded); every routing decision logged (model, provider, latency, tokens, cost) (FR-069).
- **Embeddings:** dimension 1536 with runtime dimension guard; **embedding model must be fixed before any ingestion** (vector-space stability; M-03 condition). Changing the model requires re-embedding + full eval revalidation (`08` §6.2).
- **ASR:** AssemblyAI primary / Google STT fallback, EN+AM; per-language routing decided by eval-set scores at Phase 5 kickoff (D-06; `08` §17).
- **Knowledge lifecycle:** only `published` content retrievable; `content.published/retired` drive ingestion/retirement (AR-015/016); version-keyed caching with deterministic invalidation (FR-068/080).
- **Evaluation:** bilingual eval set; ≥90% accuracy (NFR-047); emergency false-negative + safety regression suites are release-blocking (QR-011/014); hallucination monitoring (NFR-050); cost-aware daily budget + alerts (AR-040).
- **Grounded-only rule:** answers cite sources or decline; no diagnosis (C-01); user text never triggers tool access (prompt-injection defenses, §14.1.4); pseudonymized provider payloads (FR-073, AR-019); DPAs required before data flows (NFR-029).

---

## 8. WhatsApp Architecture

- **Provider abstraction** (FR-149, AR-004, ADR-001): adapter interface (`sendMessage`, `sendMedia`, `webhook:verify|signature|dispatch`, template management). Meta Cloud API primary; 360Dialog/Twilio/WATI adapters selectable at config. Provider-swap test required in staging (AR-004). Provider decision = **M-02**.
- **Webhook** (§7.4.1, §12.4): public signature-only endpoint at `/webhooks/whatsapp` (GET verification handshake: `hub.verify_token` constant-time compare, echo `hub.challenge` or 403; POST: `X-Hub-Signature-256` HMAC-SHA256 of raw body, constant-time compare, reject 401 on mismatch + security log). **Parsing JSON before signature validation is forbidden.** Admin-facing inspection under `/v1/whatsapp/*` with bearer + RBAC (`07` §3.2 reconciliation).
- **Dedup/idempotency:** unique on `messages.provider_message_id`; 200-ack before async processing (FR-161).
- **Conversation state machine:** 11 states per §7.2.2, persisted (FR-028, AR-022); quick-reply intents (5), language/intent handling, myth/challenge flows, emergency detection priority, 24-hour window + quiet hours, opt-in/opt-out enforcement (FR-017/112).
- **Media pipeline** (§7.4.2): type/size gate (>16 MB voice rejected), malware scan (AR-023), photo compress to ≤1600px JPEG q80, store under anonymized path, queue ASR, signed expiring URLs.
- **Templates:** approval workflow with internal clinical gate (AR-021) + platform approval (§7.4.3); EN/AM from first template (FR-138, NFR-033).
- **Scheduling:** n8n for campaign/reminder orchestration with approval gates; BullMQ for high-volume time-critical paths (prompt/reminder fan-out, transcription/AI jobs).
- **Provider policy dependency (D-01):** WhatsApp BSP onboarding for Ethiopia is a launch blocker (R-02); abstraction is the contingency (FR-149).

---

## 9. Mobile Architecture

- **Framework:** React Native (TypeScript) — **M-04 open**; Flutter is the documented fallback. If Flutter is chosen, `09`/`19` §11 must be re-derived in the same change set.
- **Offline-first (ADR-004, AR-025):** SQLite local store; queued writes; monotonic sequence numbers + server-authoritative revisions; field-level last-write-wins conflict resolution; no data loss/duplication (FR-136). Encrypted local storage (AR-027). 100 MB LRU content cache (§8.5).
- **Sync:** WebSocket sync channel (engineering addition) for partner sync (FR-039/146) + offline flush; signed expiring URLs for media (AR-026).
- **Emergency:** pinned offline emergency content (FR-135); emergency call + guidance reachable without network.
- **Channels:** push (FCM) + deep links (AR-026); Google Play/App Store + APK sideload (AR-028, A-02).
- **Accessibility/localization:** EN/AM from first screen; low-literacy voice-first rules; TalkBack/VoiceOver certification (AR-035, FR-134/138).
- **Identity:** single identity across WhatsApp + app (FR-008); tokens stored securely; phone verification via auth service.

---

## 10. Admin Architecture

- **Portal:** Next.js (React 18+, TypeScript), WCAG 2.1 AA (FR-140, NFR-031); shared design system with mobile (AR-029/034); OpenAPI-generated client (FR-153).
- **Admin Service facade** (`06` Phase L, `10`): aggregates read-models across services; no direct DB writes except admin-owned entities; all admin actions write `audit_logs` (FR-098).
- **RBAC:** six roles per §14.7 (administrator, researcher, content manager, AI admin, healthcare worker/medical reviewer, support); deny-by-default; ownership checks; segregation of duties (author ≠ medical approver; export requires separate approver) (FR-106, FR-126). Permission matrix is a single source (`11` §10 / §14.7) — code and matrix must stay in sync (QR-013).
- **Security:** every admin endpoint Bearer + MFA (FR-101, §12.10); session expiry/revocation/concurrent control (FR-102); export rate limit 10/min with audit justification (FR-099/127).
- **Analytics:** executive KPIs, real-time feed (AR-031) with ≤30 s latency and 60 s polling fallback; Grafana business dashboards (AR-038).
- **Research views:** anonymized only (AR-032); governed export with second approver (FR-116/122).

---

## 11. Security Architecture

- **Zones (Z1–Z5, `11` §2):** Internet/Edge → Edge (WAF, TLS) → Semi-trusted Edge services (API Gateway, webhooks, auth) → Internal services → Data tier (trusted, encryption at rest, role-separated credentials). STRIDE coverage for all 8 §14.1 threat areas (G1-05).
- **Authentication:** OTP (SMS primary; WhatsApp template fallback — FR-152) with 5/15 min rate limit, expiry, lockout, device fingerprint; JWT access tokens RS256/ES256, 15 min TTL, claims `{sub, role, token_version}`; rotating refresh tokens 30 days, revocation on reuse (FR-102, §14.6, NFR-018). Public exceptions only: `POST /v1/auth/otp/request` and webhook verification.
- **Encryption:** TLS 1.2+ (1.3 preferred) + HSTS everywhere; KMS-managed keys at rest; AES-256-GCM app-level for `phone_e164`; SSE for object storage (FR-123, NFR-021).
- **Secrets:** managed secret store (GCP Secret Manager / AWS Secrets Manager per M-01) + KMS; environment-scoped, versioned, IAM-controlled; never in code/images/config/logs (NFR-022). Rotation with dual-active windows for webhook secrets; JWT `kid`-based rotation.
- **Audit:** tamper-evident append-only `audit_logs` (actor, action, resource, ip, user-agent, result, request-id, correlation); hash-chain integrity; quarterly integrity check (FR-098/127, NFR-023, OR-026). No PII in logs.
- **Compliance:** DPIA (FR-132), DPAs before data flows (NFR-029), record of processing (OR-022), verifiable deletion (NFR-024), subject rights (FR-128). OWASP ASVS baseline with zero critical/high at release (NFR-016).
- **Webhook security** pattern reusable across providers: HMAC constant-time, replay dedup, secret rotation (§14.1.5) — hardened in Phase 3 (WP-030).

---

## 12. Infrastructure Architecture

- **Cloud:** single provider, multi-zone in one African region (ADR-006). **M-01 open** — engineering default GCP `africa-south1` (two+ zones); AWS `af-south-1` documented alternate. All Terraform modules provider-neutral for portability (`12` §2.6).
- **IaC:** Terraform per environment (`dev`, `staging`, `prod`), fully isolated compute/data/credentials/traffic (AR-009); no production data in lower environments (QR-012); plan-gated applies; drift detection.
- **Containers:** Docker Compose reference topology per §16.1 (nginx, gateway+services, PostgreSQL, Redis, Qdrant, n8n, backup); production on managed runtime/Kubernetes with health checks, canary/rolling, autoscaling (NFR-006/013/038; `03` D-11).
- **Secrets:** managed secret manager wired into services and CI; rotation schedule defined (FR-170, NFR-022).
- **Networking:** private service networks, deny-by-default egress, WAF at ingress, per-endpoint rate limits (FR-169, NFR-017/020).
- **Cost control:** region-locked service selection; budget alerts + cost dashboard (AR-040); AI/messaging quotas and caps (C-03, A-07).

---

## 13. Deployment Architecture

- **Pipeline (GitHub Actions, §16.2):** build → unit/integration tests → coverage gate (QR-002) → security scans (dependency audit, SAST, secret scan) → deploy staging → health checks → production behind approval gate with canary + automated rollback (FR-167/168, NFR-038).
- **Branches:** `feature/*` → `develop` (auto-deploy staging) → `main` (auto-deploy production behind approval + canary). PR checks must pass to merge (NFR-039; `12` §5.2–§5.4).
- **Rollback:** revision-pinned immutable artifacts; DB migrations forward-only with expand/contract discipline (rollback never requires destructive DB changes); flag-based kill switches (FR-168; `12` §6.3).
- **Environments:** dev (local compose + shared dev account), staging (prod-equivalent topology, all gate evidence, restore-drill mirror), prod. Evidence registry records environment + commit SHA (PM-39).

---

## 14. Observability Strategy

- **Transport:** OpenTelemetry (metrics, logs, traces); every request carries `X-Request-Id` + W3C `traceparent`; correlation IDs flow into `audit_logs` (`06` §3.7).
- **Storage/UI:** Prometheus (metrics) + Loki (logs) + Tempo (traces) + Alertmanager + Grafana dashboards; Sentry for errors; synthetic checks for SLA reporting (FR-166, AR-038, OR-007, NFR-037).
- **Structured logs:** JSON, no PII, no message bodies/tokens/phones (FR-022, NFR-023); retention windows per §18.1.
- **Mandatory dashboards/alerts (§18.2/§18.3):** service health; AI latency/token/cost; queue depth/age; WhatsApp delivery counters; DB slow queries; emergency-escalation failures; security events; cost thresholds. Severity + escalation per OR-008.
- **Trace points:** API → queue → consumer → AI provider; API → DB/Redis/Qdrant; webhook processing path (NFR-003/004).

---

## 15. Coding Standards

- **Language/typing:** TypeScript strict for Node + RN + Next.js; Python with type hints for AI/data. No `any`; strict null checks.
- **Contract-first:** OpenAPI 3.x in `packages/api-spec/` is the contract source; code generated from it; schema-compatibility checks block breaking merges (QR-005).
- **Format/lint:** shared ESLint + Prettier + editorconfig across workspaces; Python via Ruff/Black; lint enforced in CI (NFR-039).
- **Testing:** Jest (backend/frontend ≥80% core, ≥70% overall), PyTest (Python), contract tests (QR-005), E2E (Playwright/Cypress, Appium/Maestro/device matrix); safety suites release-blocking (QR-011/014).
- **Idempotency discipline:** `Idempotency-Key` on all state-changing endpoints; event consumers dedupe; scheduler runs bound to run-IDs (FR-161).
- **No comments policy:** code self-documents; ADR-level rationale lives in `decision-log.md`, not code comments.
- **Secrets hygiene:** never commit secrets; never log tokens/phones/bodies (NFR-022, FR-022).

---

## 16. Repository Standards

- **Monorepo** (npm workspaces + Turbo) per `06` §7: `packages/{api-spec, logger, config, errors, events, idempotency, db, test-utils}` + `services/*` (Node) + `ai/*` or `services-ai/*` (Python) + `apps/{mobile, web}` + `infra/` (Terraform) + `docs/`.
- One repo, one CI; every PR runs the full gate set (lint, tests, coverage, dependency audit, SAST, secret scan, contract tests, E2E smoke).
- Documentation co-located and versioned (FR-170, OR-015); this plan set + SRS live in the repo.
- `node-pg-migrate` migrations live beside each service's `db/` directory or centrally under `packages/db/migrations/` per `06` §7 layout; ordering is global (`05` §4).

---

## 17. Branch Strategy

Per `12` §5.2 and SRS §16.2:
- `main` — production; protected; deploys to prod behind approval + canary.
- `develop` — integration; deploys to staging; auto-deploy on push when checks pass.
- `feature/<ticket>-<slug>` — development branches; PR into `develop`.
- Optional `hotfix/*` for emergency fixes to `main`, merged back to `develop`.
- Rules: at least one approving review; AI-prompt/security-sensitive changes require a second reviewer; status checks required; never force-push shared branches (NFR-039; `12` §5.3). **Solo-maintainer exception (AGD-002, `decision-log.md` §7):** a rule-scoped bypass on ruleset `20422621` lets the sole maintainer merge own PRs — a documented exception, NOT an independent review; contributor rules are unchanged; the bypass is removed when a second account exists.

---

## 18. Versioning Strategy

- **API:** path versioning `/v1/`; additive changes backward-compatible within v1; breaking changes require `/v2/` with §12.1 deprecation policy (default 6-month notice), `Sunset`/`Deprecation` headers, changelog in `packages/api-spec/CHANGELOG.md`; NFR-040 checked by CI (`06` §3.4).
- **Database:** sequential migration numbers (`001`, `002`, …), immutable once applied, reversible, additive-first (`05` §4, §10.1).
- **Application artifacts:** SemVer for services/packages; release tags match deploy; revision-pinned images for rollback (NFR-036, NFR-038).
- **Plans/SRS:** plan-set versions tracked in `version.md`; SRS baseline frozen for development (WP-001). Any SRS-level change re-opens affected plan documents.

---

## 19. Definition of Done

A feature is Done only when **all** apply:
1. Implemented against the OpenAPI contract (QR-005) with no unapproved API changes.
2. Migrations applied forward and reversibly on a throwaway DB; schema-diff clean (FR-164, QR-003).
3. Unit/integration tests pass with coverage floors (QR-002); safety suites green (QR-011/014).
4. Security: authz checks on every endpoint (FR-126); no secrets, no PII in logs; SAST/dependency/secret scans clean (QR-007).
5. Telemetry emitted (traces/logs/metrics) and dashboards/alerts cover the feature (FR-166).
6. Idempotency + audit hooks present where required (FR-098/127/161).
7. Accessibility (web) and offline behavior (mobile) verified where applicable (QR-008, AR-025).
8. Evidence recorded in `implementation-status.md` with environment + commit SHA; decision-log updated if any decision changed (FR-170, QR-015, PM-39).
9. Code review approved and merged via the branch strategy; feature flagged where required (FR-168).
10. Cross-checked against `22-feature-implementation-matrix.md` and `00-requirement-inventory.md` — no orphaned or untraced work (QR-015).

---

## 20. Open Decisions Register (must close before dependent phases)

| ID | Decision | Baseline assumption (engineering) | Class | Must close before |
| --- | --- | --- | --- | --- |
| M-01 | Cloud provider + region + zones | GCP `africa-south1`, ≥2 zones (3 preferred) | Configurable | Phase 1 IaC (WP-010) |
| M-02 | WhatsApp provider | Meta Cloud API primary; fallback contract early | Configurable | Phase 4 (WP-036+) |
| M-03 | LLM/embedding contract + **fix embedding model** | Tiers per §9.8; embedding fixed before ingestion | Configurable | Phase 5 ingestion (WP-049+) |
| M-04 | Mobile framework | React Native | Configurable | Phase 6 mobile scaffold (WP-057+) |
| M-05 | Pilot cohort size | §5.9 default 500+ | Configurable | Phase 10 capacity/load |
| M-06 | Object storage host | S3-compatible per M-01; MinIO compose | Configurable | Phase 1 media provisioning; Phase 4 media pipeline |
| M-07 | Budget cap default | Program reference (≈$474k/$606k/$801k illustrative, `20` §3–§6) | Configurable | Phase 8 budget tracker (WP-0xx F) |

Approvers and closure records: `decision-log.md`. Phase 2+ implementation is not authorized until M-01…M-07 are closed (`implementation-readiness-gate.md`).

---

**END OF DOCUMENT — FathersNet Architecture Baseline (canonical engineering reference).** Any drift from this document requires a `decision-log.md` entry and an ADR update before code is written.
