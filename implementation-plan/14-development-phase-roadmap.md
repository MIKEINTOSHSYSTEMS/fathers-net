# 14. Development Phase Roadmap

**Source:** `docs/FathersNet-Complete-SRS.md` (FN-SRS-001 v2.0) — Appendix D (Recommended Implementation Roadmap, Phases 0–7), Appendix E (team structure), Appendix F (KPI framework), §19 Disaster Recovery, QR-013 (release gate), QR-017 (UAT), QR-018 (pilot evaluation), and the full requirement series.
**Inputs:** `00-requirement-inventory.md` (349 requirements), `02-srs-requirement-analysis.md` (dependency map, §3).
**Sibling documents:** `03-system-architecture-plan.md`, `04-technology-stack-analysis.md`, `05-database-implementation-plan.md`, `06-backend-development-plan.md`, `07-whatsapp-platform-implementation-plan.md`, `08-ai-rag-implementation-plan.md`, `09-mobile-application-development-plan.md`, `10-admin-dashboard-development-plan.md`, `11-security-and-privacy-plan.md`, `12-devops-and-infrastructure-plan.md`, `13-testing-and-quality-plan.md`, `15-team-and-resource-plan.md`, `20-resource-and-delivery-analysis.md`, `21-quality-gate-checklist.md`, `22-feature-implementation-matrix.md`.
**Purpose:** Controlling, end-to-end development phase roadmap for the FathersNet (Ayay) platform. Translates the SRS dependency map into eleven executable phases (Phase 0–Phase 10), each with objectives, deliverables, dependencies, configurable effort references, acceptance criteria, and verification evidence.
**Classification convention:** **Confirmed** (SRS-mandated) · **Recommended** (engineering decision) · **Configurable** (parameter with default) · **Assumption** (requires human validation).

---

## 1. Executive Purpose

This document is the master sequencing and delivery roadmap for the FathersNet (Ayay) platform from an empty repository to a live, evaluated pilot. It exists to answer three questions at any point in the program: **what are we building now, what must be true before we build it, and how do we prove it is done.**

The roadmap decomposes the SRS dependency map from `02-srs-requirement-analysis.md` — *Infrastructure → Database → Authentication → User/Profile → Content/KB → Pregnancy Engine → WhatsApp → AI/RAG → Mobile → Admin → Research → Pilot Operations* — into eleven phases (Phase 0–Phase 10). Each phase is a **verifiable unit of delivery**: it names the SRS requirements it satisfies, the artifacts it produces, the dependencies it requires, the effort reference it needs, the acceptance criteria that prove completion, and the verification evidence that a reviewer can inspect.

The roadmap is deliberately stricter than the SRS reference roadmap in Appendix D. The SRS Appendix D is a high-level 8-phase reference model; this roadmap decomposes its Phase 1 (Foundation) into three phases (Foundation, Backend Core, Authentication & Security) because the SRS treats authentication, consent, audit, and encryption as **cross-cutting, never-retrofitted** controls (02 §5, FR-123…FR-132, NFR-016…NFR-029). It also inserts an explicit **Integration** phase (Phase 8) before full-system testing so research/analytics, partner sync, end-to-end data flows, and feature-flag rollout are proven before UAT.

Delivery is governed by three roadmap quality gates that align to `21-quality-gate-checklist.md` and the SRS release gate QR-013:

- **Gate G1 — Planning & Architecture Gate.** The Phase 0 deliverable package (SRS baseline freeze, architecture review, tech-stack sign-off, STRIDE threat model, environment procurement, and approvals M-01…M-07 in the decision log). **Gate 1 acceptance** is formally granted at the end of Phase 1 once the foundation is demonstrably buildable. Opens the backend build.
- **Gate G2 — Core Platform & Security Gate.** Accepted at the end of Phase 3 when the backend core, full authentication/token lifecycle, RBAC enforcement, audit logging, encryption, secrets, and webhook security pattern are complete and verified. Opens the WhatsApp and AI builds.
- **Gate G3 — Release & Pilot Launch Gate.** Verified during the Phase 9 full QA pass ("Gates 2–3"), and formally granted at Phase 10 as the pilot go/no-go after UAT (QR-017), clinical/content validation (QR-019), release review (QR-016), and rollback readiness are confirmed. Authorizes founding-cohort onboarding.

All person-week figures in this document are **configurable reference values, not commitments** (consistent with SRS §1.11, Appendix C/D). Detailed cost, resource, and delivery analysis is owned by `20-resource-and-delivery-analysis.md`; this document summarizes.

---

## 2. Roadmap Overview

### 2.1 Mapping to the SRS Dependency Map (02 §3)

The roadmap mirrors the mandatory layering of `02-srs-requirement-analysis.md` §3:

| 02 Dependency-Map Layer | Roadmap Phase | Sequencing Logic |
| --- | --- | --- |
| Infrastructure & Environment | Phase 1 (Foundation) | Nothing runs without IaC, secrets, CI/CD, DB baseline, observability (02 §4 "Infrastructure" row) |
| Database Schema | Phase 1 (migration baseline) + Phase 2 (domain migrations) | Persistence blocks every service (02 §4 "Database") |
| Authentication & Identity | Phase 2 (OTP/tokens initial) + Phase 3 (complete lifecycle) | No identity → nothing authenticated (02 §4 "Authentication") |
| User & Profile | Phase 2 | No enrollment without identity + schema (02 §4 "User & Profile") |
| Content & Knowledge Base | Phase 2 (content service) → feeds Phase 5 (RAG grounding) | AI ungrounded and no content to show without CMS/review workflow (02 §4 "Content/KB") |
| Pregnancy Engine | Phase 2 | No journey personalization without user service (02 §4 "Pregnancy Engine") |
| Reminders & Notifications | Phase 2 (reminder engine foundation) → Phase 8 (provider failover) | Depends on scheduler + notifications (02 §2.1) |
| WhatsApp Platform | Phase 4 | Depends on auth, user, reminder, templates (02 §4 "WhatsApp") |
| AI Assistant & RAG | Phase 5 | Depends on content/KB + WhatsApp (02 §4 "AI/RAG") |
| Mobile Application | Phase 6 | Depends on auth, AI, WhatsApp parity (02 §4 "Mobile") |
| Admin Dashboard | Phase 7 | Depends on all services + RBAC + audit (02 §4 "Admin") |
| Research & Analytics | Phase 8 | Depends on AI themes, journal, consent (02 §4 "Research") |
| Pilot Deployment & Operations | Phase 10 | Depends on everything (02 §4 "Pilot Ops") |

### 2.2 Relationship to SRS Appendix D (Reference Roadmap, Phases 0–7)

| SRS Appendix D Phase | This Roadmap | Notes |
| --- | --- | --- |
| Phase 0 Planning & Design (Weeks 1–4) | **Phase 0** | Same intent; adds decision-log approvals M-01…M-07 and Gate G1 as explicit exits |
| Phase 1 Platform Foundation (Weeks 5–10) | **Phases 1–3** | Decomposed into Foundation / Backend Core / Auth & Security so security is never retrofitted |
| Phase 2 WhatsApp Platform (Weeks 11–16) | **Phase 4** | Equivalent scope (provider abstraction, state machine, templates, media, emergency, campaigns) |
| Phase 3 AI Assistant Platform (Weeks 15–20) | **Phase 5** | Equivalent scope (ingestion, RAG, safety layer, model evaluation) |
| Phase 4 Mobile Application (Weeks 17–24) | **Phase 6** | Equivalent scope (journey, journal, checklist, budget, offline, notifications) |
| Phase 5 Administration Platform (Weeks 21–26) | **Phase 7** | Equivalent scope (user mgmt, CMS, campaigns, research, analytics) |
| — (not in Appendix D) | **Phase 8 (Integration)** | New: research/analytics pipeline, partner sync, end-to-end data flows, feature-flag rollout, notification failover |
| Phase 6 Testing & Validation (Weeks 25–28) | **Phase 9** | Equivalent intent; formalizes Gates 2–3 and UAT QR-017 |
| Phase 7 Pilot Deployment (after Phase 6) | **Phase 10** | Equivalent intent; adds QR-018 pilot evaluation and Gate 3 |

Phases intentionally overlap where SRS Appendix D does ("Phases overlap where indicated"). Phase 5 (AI) may begin while Phase 4 (WhatsApp) completes; Phase 8 runs concurrently with the tail of Phase 7. Critical-path dependencies from 02 §4 are never parallelized.

### 2.3 Cross-Cutting Concerns Applied in Every Phase

Per `02-srs-requirement-analysis.md` §5, these are applied at every layer and never retrofitted:

1. **Security & privacy** (FR-123…FR-132, NFR-016…NFR-029) — enforcement and evidence appear in Phase 1 onward, not only Phase 3.
2. **Auditability** (FR-098, FR-069, AR-020) — consent, admin, and AI actions are logged from the first migration.
3. **Localization** (FR-138, NFR-033) — English and Amharic from the first template and first UI string.
4. **Observability** (FR-166, NFR-037) — metrics/logs/traces from the first service.
5. **Idempotency** (FR-161) — from the first webhook and queue consumer.
6. **Testing discipline** (QR-001, QR-002, QR-015) — every phase ships its own tests and traceability, so gates are provable at each step rather than at the end.

---

## 3. Phase 0: Planning and Architecture Validation

### Objectives
- Freeze the SRS baseline (FN-SRS-001 v2.0) as the controlling requirements source and lock change management (02 §6, QR-015).
- Validate the architecture and technology stack before any code exists, so build phases start from approved decisions (AR-001…AR-010, AR-036…AR-040).
- Produce a security threat model (STRIDE) and DPIA artifacts so privacy/security are designed in (FR-130, FR-132, NFR-019, NFR-025).
- Resolve the seven open decisions M-01…M-07 into the decision log (02 §6).
- Secure environments, accounts, providers, and third-party agreements before procurement-dependent phases begin (AR-009, NFR-036, NFR-029, D-01…D-03).

### Deliverables
- Frozen SRS baseline and requirement traceability framework (QR-015) linking every requirement to a test/verification owner (`22-feature-implementation-matrix.md`).
- Architecture review record against `03-system-architecture-plan.md` covering AR-001…AR-010, AR-036…AR-040 (service topology §15.1, event-driven bus FR-160, API platform AR-003).
- Technology-stack sign-off from `04-technology-stack-analysis.md` (backend, DB, vector store AR-002, mobile framework M-04, observability).
- STRIDE threat model covering §14.1 areas (auth attacks, authorization failures, data leakage, AI prompt injection, webhook attacks, API abuse, insider access, malware uploads) with mitigations mapped (FR-130, NFR-019, NFR-020).
- Decision-log entries approving **M-01** (cloud provider, ADR-006), **M-02** (WhatsApp provider, §7.1), **M-03** (LLM provider contract, §9.8), **M-04** (mobile framework, §8.1), **M-05** (pilot cohort size, §5.9), **M-06** (object storage + host, FR-150, AR-002), **M-07** (budget cap default, §8.3) — all with stated assumption and human-validation owner (02 §6).
- Environment procurement: cloud accounts, DNS, WhatsApp Business Manager + number registration (D-01, §7.4.3), LLM/embedding + transcription accounts (D-02, D-06), object storage (M-06), secret manager.
- DPIA + record of processing activities for the defined data classes (FR-132, NFR-028) and third-party DPA checklist (FR-073, FR-151, NFR-029).
- Research ethics and governance groundwork: ethics-approval plan for research data use (D-05, NFR-042, OR-017), research consent model design (FR-117).
- Quality Gate G1 package: baseline + decision + architecture sign-offs consolidated into `21-quality-gate-checklist.md`.
- Team/resource plan (Appendix E model → `15-team-and-resource-plan.md`), risk register (Appendix G → `16-risk-management-plan.md`).

### Dependencies
- None on code. Inputs are the SRS (approved), 02 dependency map, 03/04 architecture and stack analysis, and the seven M-decisions requiring human validation (02 §6). External: provider availability and policy acceptance (D-01, D-02, D-03).

### Estimated Effort (Configurable Reference)
- **Reference: 16 person-weeks** (best 12 / realistic 16 / conservative 24). Distributed across architecture, product leadership, security, privacy, and procurement activities (Appendix E). Not a commitment.

### Acceptance Criteria
- All seven decisions M-01…M-07 are recorded in the decision log with an approver, a rationale referencing the relevant ADR, and an open/closed status; none are marked Assumption-pending.
- STRIDE review and DPIA are complete with no unresolved critical/high findings (FR-130, FR-132, NFR-019).
- Environment accounts and provider relationships exist and are documented (D-01…D-03, NFR-029).
- SRS baseline is frozen and the traceability framework (QR-015) is populated from `00-requirement-inventory.md`.

### Verification Evidence
- Decision-log records M-01…M-07 (with dates, approvers, ADR references).
- Approved architecture review minutes; approved stack recommendation; threat-model document; DPIA artifacts.
- Procurement/account records; DPA status table.
- Traceability matrix baseline export (QR-015); quality-gate checklist G1 completed and signed.

---

## 4. Phase 1: Foundation

### Objectives
- Stand up a reproducible, isolated, secure delivery platform that every later phase builds upon (AR-036, AR-037, NFR-036).
- Make persistence, secrets, and observability operational from day one (FR-164, FR-166, FR-170, NFR-022, NFR-037).
- Prove the CI/CD pipeline can build, test, scan, and deploy the skeleton end-to-end (FR-167, AR-037, QR-013 skeleton).
- Grant **Gate 1 acceptance** so the backend build can start on a verified foundation.

### Deliverables
- **Repository + monorepo scaffold** (git, branch/PR workflow, lint/test/coverage gates per NFR-039) with documentation co-located (FR-170, OR-015).
- **CI/CD skeleton** (FR-167, AR-037): build → unit test → coverage gate (QR-002 floor) → security scan (SAST, dependency, secret scan) → deploy to dev/staging → health check; canary/rollback hooks reserved (FR-168, NFR-038).
- **IaC** (AR-036, NFR-036): reproducible dev/staging/prod provisioning for compute, PostgreSQL, Qdrant, Redis, object storage, networking; environment isolation (AR-009, FR-170) with production data never in lower environments.
- **Dev environment** for the full team, incl. local Docker Compose reference (SRS §16.1) mirroring the production topology (NFR-036).
- **Secret manager** wired into services and CI (FR-170, NFR-022): no secrets in code, images, config, or logs; rotation schedule defined (NFR-022).
- **Database migration baseline** (FR-164, AR-011): migration framework; migration 001 creating the core operational tables from §13.3 — `users`, `profiles`, `pregnancies`, `consents`, `audit_logs`, `conversations`, `messages` (first-ever migrations per 02 §4 "Database" first-task row); append-only consent and audit semantics from the start (AR-012, NFR-023).
- **Observability foundation** (FR-155, FR-166, NFR-037, OR-007, OR-008): centralized logs, metrics, traces, alert routing with severity + escalation; uptime/availability baseline for NFR-010.
- Backup/DR skeleton aligned to §19 defaults (RPO ≤ 15 min, RTO ≤ 4 h) (FR-165, AR-039) — full DR in Phase 10.

### Dependencies
- Phase 0 decisions and procurement (M-01…M-07), approved architecture (AR-036…AR-040). External: cloud regional availability (D-03).

### Estimated Effort (Configurable Reference)
- **Reference: 26 person-weeks** (best 20 / realistic 26 / conservative 34). DevOps + backend + DB + QA coverage (Appendix E Engineering).

### Acceptance Criteria (Gate 1)
- `terraform`/IaC applies cleanly in dev and staging; environments are reproducible from code (NFR-036, AR-036).
- CI/CD runs build + test + scan + deploy on every PR/merge with gates blocking promotion (FR-167, AR-037); a staging deploy passes health checks (NFR-038).
- Migration 001 applies and rolls back cleanly; consent and audit tables are append-only (FR-164, AR-012).
- A secret-scan finds zero secrets in the repository and CI (NFR-022).
- Observability dashboards show skeleton service health, logs, and alerts fire on a synthetic failure (FR-166, OR-008).

### Verification Evidence
- CI pipeline run logs and green staging deploy; IaC apply output; migration run/rollback evidence; secret-scan report; dashboards + synthetic alert capture; Gate 1 checklist signed per `21-quality-gate-checklist.md`.

---

## 5. Phase 2: Backend Core

### Objectives
- Deliver the functional backend services that the platform's channels and surfaces depend on, per `06-backend-development-plan.md` and `05-database-implementation-plan.md` (FR-159).
- Stand up the event-driven backbone with idempotency from the first consumer (FR-160, FR-161).
- Provide working identity, enrollment, personalization, content, and engagement-adjacent APIs behind a versioned API platform (AR-003, §12).
- Land the domain schema migrations for §13.3 tables beyond the Phase 1 baseline (AR-011).

### Deliverables
- **API platform foundation** (AR-003, §12.1): API gateway with routing, bearer auth, rate limiting (FR-169, §12.1), standardized error codes, pagination, `/v1/` versioning, OpenAPI 3.x contract, idempotency keys on writes (FR-161).
- **Auth service (initial)** (FR-005, §12.2): OTP request/verify for phone verification with rate limiting and lockout; short-lived access tokens + refresh tokens (NFR-018 baseline); refresh rotation reserved for Phase 3 completion.
- **User & profile service** (FR-001, FR-002, FR-006, FR-008, FR-009, FR-010, §12.3): registration (app + WhatsApp-invite entry), profile CRUD, EDD/LMP handling, UUID identities (FR-009), cohort tagging (FR-010), preferences (FR-038).
- **Consent lifecycle service** (FR-003, FR-004, FR-125, §12.3): versioned, immutable consent capture, withdrawal, re-consent; separate participation/research/media/WhatsApp-opt-in consent types (FR-117).
- **Pregnancy engine** (FR-031, FR-032, FR-033, FR-037): week/trimester computation and auto-advance from EDD/LMP, milestone derivation, countdown; recomputation on profile edit (FR-006).
- **Content service / CMS foundation** (FR-076…FR-085, §12.5): content CRUD with versioning, draft→review→approve→publish→archive workflow (FR-078, FR-081), EN/AM localization fields (FR-079), medical-review tagging and segregation of duties (FR-081, FR-106), content search (FR-083).
- **Reminder engine (foundation)** (FR-041, FR-044, FR-047): reminder template engine and scheduler integration on the background scheduler (FR-163); quiet hours (FR-029, FR-043) and critical-priority bypass (FR-046).
- **Journal service** (FR-051…FR-058, §12.9): text/voice/photo entries, private-by-default (FR-052), prompt-linked auto-entries (FR-053), sharing flag (FR-052, FR-039), export (FR-057).
- **Checklist & budget service** (FR-086, FR-087, FR-088, §12.6/§12.7): hospital-bag/birth-prep checklists, custom items, progress, budget tracker with planned/actual/variance and configurable cap (M-07).
- **Event bus + outbox + scheduler** (FR-160, FR-161, FR-163): outbox pattern, idempotent consumers, job-run idempotency, scheduled jobs for prompts/pulses/reminders (FR-014…FR-016) with failure observability.

### Dependencies
- Phase 1 foundation (CI/CD, IaC, secret manager, migration baseline). Phase 0 decisions M-01…M-07. Database and service detail plans `05`/`06`. Security patterns from `11` applied as baseline (authz checks on every endpoint, access logging of sensitive data FR-127).

### Estimated Effort (Configurable Reference)
- **Reference: 62 person-weeks** (best 50 / realistic 62 / conservative 80). Backend engineers (2–3), DB engineer, QA, security review slice (Appendix E).

### Acceptance Criteria
- All §12.2/12.3/12.5/12.6/12.7/12.9 endpoints exist, are OpenAPI-documented, authenticated, rate-limited, and idempotent (AR-003, FR-161, FR-169).
- Registration completes end-to-end with OTP verification, versioned consent, UUID issuance, and pregnancy-week computation (UC-001, FR-001…FR-010, FR-031).
- A content item can traverse draft → medical review → approved → published and appears in content APIs; unapproved medical content is never published (FR-078, FR-081, FR-106).
- Journal, checklist, and budget writes are private by default and ownership-scoped (FR-052, FR-126).
- Unit coverage ≥ 80% on core backend services and ≥ 70% overall (QR-002); integration tests cover service contracts and data flows (QR-003).

### Verification Evidence
- OpenAPI spec committed and validated; endpoint test reports; E2E registration run (QR-004 journey 1); migration logs for Phase 2 tables; coverage reports; event-bus idempotency replay test showing no duplicates (FR-161).

---

## 6. Phase 3: Authentication and Security

### Objectives
- Complete the authentication, authorization, and data-protection surface so it is a finished, verified platform capability before the channel and AI builds consume it (NFR-016…NFR-024, NFR-025…NFR-029).
- Enforce RBAC, audit, encryption, and secrets as *platform invariants* on every endpoint (FR-126, FR-127, FR-170, AR-008).
- Establish the webhook security pattern that the WhatsApp provider integration will reuse (FR-011, §7.4.1, §14.1.5).
- Grant **Gate 2 acceptance**.

### Deliverables
- **Complete OTP/MFA/token lifecycle** (FR-005, FR-101, NFR-018, §14.6): OTP expiry/lockout, refresh-token rotation and revocation-on-reuse, logout revocation, session expiration/revocation/concurrent-session control for staff (FR-102), MFA for all admin/privileged accounts (FR-101, AR-033).
- **RBAC enforcement** (FR-094, FR-106, FR-126, §14.7 permission matrix): role + ownership checks server-side on all data endpoints; deny-by-default; segregation of duties (author ≠ medical approver; researcher export requires separate approver).
- **Audit logging** (FR-098, FR-127, NFR-023): append-only, tamper-evident audit_logs covering admin, consent, export, deletion, access-to-sensitive-data, and security events; no PII in logs (§14.3, §18.1).
- **Encryption** (FR-123, NFR-021): TLS 1.2+ (1.3 preferred) in transit; KMS-managed at rest incl. application-level encryption of phone numbers and media (AR-002, FR-150); signed expiring URLs for media.
- **Secrets management + rotation** (FR-170, NFR-022): completed rotation procedure, secret-scanning in CI, environment isolation verification (AR-009).
- **Webhook security pattern** (FR-011, §7.4.1, §14.1.5): HMAC-SHA256 `X-Hub-Signature-256` validation, constant-time comparison, signature-mismatch rejection and alerting, idempotency key handling — implemented as a reusable pattern validated with a test harness.
- **Rate limiting & abuse controls** (FR-169, NFR-020): gateway + per-endpoint rate limits with `429` + `Retry-After` (§12.1), OTP attempt caps (§7.4.3).
- **Incident response runbooks** (FR-131, OR-009): detection, triage, containment, notification, post-incident review; security-alert routing.
- **AI-specific security groundwork** (optional to land early): prompt-injection test cases and input-classification hooks to be consumed by Phase 5 (FR-062, §14.1.4).

### Dependencies
- Phase 2 backend core (all services exist to enforce authorization against). Phase 1 foundation. Security detail from `11-security-and-privacy-plan.md`.

### Estimated Effort (Configurable Reference)
- **Reference: 36 person-weeks** (best 28 / realistic 36 / conservative 48). Backend + security engineer/consultant + QA security testing (Appendix E Security & Privacy).

### Acceptance Criteria
- Authentication flows pass OWASP-aligned tests: OTP lockout, token reuse revocation, MFA enforcement on staff (NFR-018, FR-101).
- Every endpoint is authorization-tested with deny-by-default; no IDOR or role-escalation test passes (FR-126, §14.1.2, NFR-020).
- Audit log is append-only and tamper-evident; an audit view proves who-did-what-when (FR-098, NFR-023).
- Encryption verified end-to-end for at-rest and in-transit data (FR-123, NFR-021); secret scan reports zero findings (NFR-022).
- Webhook signature-validation suite passes positive and negative cases (FR-011, §7.4.1).
- Zero critical/high findings in SAST/DAST/dependency scans at gate exit (FR-129, NFR-016).

### Verification Evidence
- Security test suite results (auth, authz, webhook, rate-limit, injection); SAST/DAST/dependency scan reports; audit-log verification tests; encryption attestation (KMS key usage, TLS profile scan); Gate 2 checklist signed per `21-quality-gate-checklist.md`.

---

## 7. Phase 4: WhatsApp Platform

### Objectives
- Deliver the primary conversational channel per `07-whatsapp-platform-implementation-plan.md` and SRS §7 (ADR-001: WhatsApp-first).
- Build the provider abstraction so provider switching is operationally trivial (FR-149, AR-004).
- Implement the full conversation state machine, template governance, media pipeline, emergency workflow, and campaign engine (AR-021…AR-024).
- Ensure every webhook and outbound message is idempotent, secure, and observable (FR-161, §7.4.1, NFR-003).

### Deliverables
- **Provider abstraction layer** (FR-149, AR-004): adapter interface over WhatsApp Business API with a second provider as a test-double (per M-02); failover connection handling (§7.4.3).
- **Webhook** (FR-011, §7.4.1): GET verification handshake and POST inbound handler with HMAC validation (using the Phase 3 pattern), async processing, provider-message-id deduplication (FR-161), error handling per policy (FR-021).
- **Conversation state machine** (FR-028, AR-022, §7.2): IDLE, OPT_IN, PROFILE_COLLECTION, WEEKLY_PROMPT, DAILY_PULSE, MYTH_REPORT, SHARE_CHALLENGE, ASK_QUESTION, EMERGENCY, THANK_YOU, GOODBYE with configured timeouts (§7.2.4), state persistence across interruptions, fallback responses for invalid input (FR-020), quiet hours (FR-029).
- **Welcome & enrollment flows** (FR-012, FR-017): first-contact welcome, consent request, language selection, profile collection, opt-in confirmation, broadcast opt-out (FR-112).
- **Prompts & pulses** (FR-014, FR-015, FR-016, FR-053): weekly prompt engine segmented by pregnancy week, daily pulse with rotating categories, Sunday legacy prompt; response capture to journal (FR-053, FR-054).
- **Template governance** (FR-108, AR-021): template library with platform pre-approval + internal clinical/content approval gate before any outbound send; versioning and usage metrics.
- **Media pipeline** (FR-018, FR-019, AR-023, §7.4.2): voice-note intake with size/type checks, malware scan, encrypted object storage by anonymized ID, transcription queue (AssemblyAI primary / Google fallback, EN/AM per D-06); photo intake with compression; signed expiring URLs (FR-150).
- **Emergency workflow** (FR-025, FR-063, §9.6, §15.3): danger-keyword detection (EN + Amharic equivalents), immediate facility-care guidance, bypass quiet hours, admin/on-call notification, 5-minute follow-up escalation.
- **Intent routing** (FR-013, FR-020, FR-024, FR-064): quick replies for the five intents; multilingual intent handling (EN/AM).
- **Conversation logging & analytics feed** (FR-023, FR-030, AR-024): per-user conversation log with access control; near-real-time enrollment/engagement metrics events on the bus.
- **Campaign service** (FR-107…FR-112, §11.3): campaign creation with audience segmentation (week, region, language, cohort, consent), scheduling, approval-gated templates, delivery/read/reply/opt-out metrics, rate throttling (FR-111), opt-out enforcement (FR-112).
- **Messaging controls** (FR-021, §7.4.3): per-user outbound caps, broadcast throttling, exponential-backoff retry with alerting, 24-hour window enforcement, dedup across channels (FR-048).

### Dependencies
- Phase 3 (auth, RBAC, audit, webhook security pattern). Phase 2 services (user, profile, pregnancy, consent, reminder, journal). Content service for FR-082 embedding. SRS §7 state machine spec.

### Estimated Effort (Configurable Reference)
- **Reference: 40 person-weeks** (best 32 / realistic 40 / conservative 52). Backend + WhatsApp-specific engineer + content reviewer slice (Appendix E).

### Acceptance Criteria
- Provider abstraction switches between two providers in a test with no downstream service change (FR-149, AR-004).
- State machine passes the full §7.2 transition and timeout test matrix, including interruption resume (FR-028, AR-022).
- All outbound messages are approved templates; an unapproved template is blocked (FR-108, AR-021).
- Emergency keyword tests (EN/AM) route to EMERGENCY before normal answering; no diagnosis output (FR-025, FR-063, NFR-046).
- Voice/photo pipeline passes type-check, scan, storage, transcription, and searchable attachment (FR-018, FR-019, FR-055).
- Campaign delivery respects consent, opt-out, and throttle limits; metrics report delivery/read/reply (FR-107…FR-112).
- WhatsApp conversational tests pass per QR-010.

### Verification Evidence
- Provider-switch integration test log; state-machine transition traces; template-approval gate audit records; emergency drill transcripts; media pipeline run logs; campaign delivery report; QR-010 test suite results.

---

## 8. Phase 5: AI/RAG Platform

### Objectives
- Deliver the grounded AI assistant on WhatsApp and app per `08-ai-rag-implementation-plan.md` and SRS §9 (ADR-002).
- Implement ingestion, chunking, embeddings, vector retrieval, safety layer, and model routing so answers are grounded, cited, and safe (FR-059…FR-075, AR-005, AR-006, AR-015…AR-020).
- Operationalize AI governance, evaluation, and monitoring before the mobile app consumes the assistant (NFR-046…NFR-050, §14.11).
- Build the evaluation set and safety regression suite (QR-011, QR-014).

### Deliverables
- **Ingestion pipeline** (FR-070, AR-015, AR-016, §9.2): CMS-approved document intake (DOCX/PDF/MD/HTML/TXT), normalization, chunking (512 tokens / 128 overlap / configured separators), embedding (OpenAI text-embedding-3-small or Gemini), incremental upsert/retire; ingestion runs audited.
- **Vector store** (AR-002, §9.3): Qdrant collection `fathersnet_knowledge`, cosine + HNSW (m=16, ef=200); lifecycle-state-controlled retrieval eligibility (AR-015).
- **Retrieval pipeline** (FR-060, AR-017, §9.4): embed → top-K 5 above threshold 0.75 → cross-encoder rerank → MMR (λ 0.5) → context assembly with citations.
- **Intent & language detection** (FR-064): EN/AM classification of question/emergency/myth/challenge/journal before routing.
- **Medical safety layer** (FR-062, FR-065, AR-006, NFR-046): input classification (emergency first, §9.6), output validation against no-diagnosis/no-prescription rules, escalation queue for uncertain cases; emergency short-circuits RAG (FR-063, §9.6).
- **Model routing & fallback** (FR-072, AR-018, §9.8): Gemini Flash primary, GPT-4o-mini and Claude 3 Haiku fallback tiers; 5 s start-output timeout; cost-aware routing table; routing decisions logged (model, provider, latency, tokens, cost).
- **AI orchestration service** (FR-059, §12.8): `/v1/ai/ask` sync/async with job polling, feedback capture, conversations list, safety-events queue.
- **AI operations dashboard (admin foundation)** (FR-067): conversation review, safety flags, prompt management, knowledge coverage.
- **Prompt management** (FR-068, NFR-049): versioned, approved prompt library (system prompt §9.5, EN/AM variants).
- **AI audit trail** (FR-069, AR-020): prompt, response, model, version, sources, safety flags, timestamps persisted per interaction.
- **Knowledge-gap capture** (FR-074): unanswerable questions logged for content teams.
- **AI feedback loop** (FR-066): thumbs up/down capture; low-rated answers to review queue.
- **Pseudonymization to providers** (FR-073, AR-019): identifiers removed before provider calls; DPA verified (M-03).
- **Evaluation set + safety regression suite** (QR-011, QR-014, NFR-047): ground-truth eval set (≥ 90% accuracy target, configurable), hallucination sampling, bias/fairness review, hallucination/safety monitoring with alerting (NFR-050).
- **AI ops monitoring** (FR-071, §18.2/18.3): AI latency/token/cost metrics, safety-event alerting, hallucination monitoring.

### Dependencies
- Phase 4 (WhatsApp conversation engine and AI routing integration). Phase 2 content service (approved knowledge base, AR-015). Phase 3 (audit, pseudonymization, incident handling). SRS §9 pipeline spec.

### Estimated Effort (Configurable Reference)
- **Reference: 46 person-weeks** (best 36 / realistic 46 / conservative 60). AI/ML engineer, data engineer, AI safety reviewer, backend (Appendix E AI & Data).

### Acceptance Criteria
- An approved document ingested end-to-end is retrievable with citations referencing exact chunks (FR-060, AR-017, QR-011).
- A health question answered only from approved context; an out-of-KB question declines with a provider referral (FR-061, NFR-048).
- Emergency keyword questions produce facility-care guidance with no diagnosis in ≥ 100% of tested cases (FR-063, NFR-046).
- Evaluation set accuracy meets the configured target and safety regression passes before any AI release (QR-011, QR-014).
- Provider outage fails over to a fallback tier with no user-visible failure (FR-072, AR-018, NFR-015).
- Every interaction is auditable with prompt/model/version/safety flags (FR-069, AR-020); no personal identifiers sent to providers (FR-073).
- Prompt changes require approval and are reversible (FR-068).

### Verification Evidence
- Ingestion run logs with chunk/embed/upsert/retire events; retrieval + citation sample outputs; eval-set and safety-regression runs (QR-011/QR-014); fallback drill log; AI audit-record samples; pseudonymization packet inspection; AI ops dashboard screenshots; alert-firing capture.

---

## 9. Phase 6: Mobile Application

### Objectives
- Deliver the complementary mobile surface (ADR-001: WhatsApp-first, app as complement) per `09-mobile-application-development-plan.md` and SRS §8.
- Implement offline-first, secure-local, low-literacy, and localized UX (FR-133…FR-142, UR-004, AR-025…AR-029).
- Integrate identity, journey, journal, checklist, budget, notifications, and AI chat against the backend (US-002, US-004, US-005, US-006, US-007, US-010).

### Deliverables
- **App scaffold + auth** (FR-008, FR-005): React Native or Flutter per M-04; phone verification via the auth service, token storage, identity linkage with WhatsApp enrollment (single identity FR-008).
- **Journey experience** (FR-031…FR-040): week view, milestone timeline, countdown, support-action recommendations with completion, trimester content switching, preferences honored (FR-038).
- **Journal** (FR-051…FR-058): text/voice/photo entries, private-by-default, prompt-linked auto-entries, transcription display and search, export (PDF/JSON FR-057).
- **Checklists** (FR-086, FR-088, §8.2): hospital bag grouped by category, completion toggles, custom items, progress shown in journey.
- **Budget tracker** (FR-087, §8.3): planned/actual/variance, configurable budget cap (M-07), receipt-image capture.
- **Offline mode** (FR-089, FR-135, FR-136, AR-025, §8.5): SQLite local store, pre-cached emergency/danger-sign + education content (FR-135), offline journaling/checklist with queued sync, monotonic sequence numbers, per-field last-write-wins conflict merge, LRU cache eviction (100 MB configurable).
- **Sync engine** (FR-136, FR-136 guarantees, AR-025): no data loss, no duplicates, conflict-safe merges on reconnect.
- **Notifications** (FR-042, FR-046, AR-026): push with deep linking; WhatsApp secondary; critical bypass of quiet hours; calendar export (ICS, §8.6).
- **AI chat integration** (FR-059): grounded AI questions via `/v1/ai/ask` with source citations rendered.
- **Partner sync** (FR-039, FR-146, §8.4): mutual link acceptance, shared milestones/checklists, opt-in shared journal; offline propagation via server.
- **Accessibility & voice-first** (FR-133, FR-134, FR-141, NFR-032): TalkBack/VoiceOver, dynamic type, icons/audio guidance.
- **Localization** (FR-138, NFR-033): EN/AM UI strings through the localization framework from the first screen.
- **Distribution readiness** (AR-028): Play Store/App Store pipeline + APK sideload build (AR-028, Should Have).
- **Design-system conformance** (AR-029, AR-034).

### Dependencies
- Phase 3 (auth/RBAC) and Phase 5 (AI endpoints) complete; Phase 4 (WhatsApp parity for enrollment and prompts). Phase 2 services (journal, checklist, budget, content). Localization content from content team.

### Estimated Effort (Configurable Reference)
- **Reference: 56 person-weeks** (best 44 / realistic 56 / conservative 72). Mobile engineers (2), backend support slice, QA mobile testing (Appendix E Engineering).

### Acceptance Criteria
- Registration and identity linkage work in the app (FR-008); an existing WhatsApp user signs in without re-registration (US-001).
- Journal, checklist, and budget entries created offline sync without loss or duplication on reconnect (FR-136, AR-025).
- Emergency and danger-sign content renders from cache with no connectivity (FR-089, FR-135).
- Core flows usable by assistive technology and low-literacy users (FR-134, FR-141, NFR-032); task success ≥ 80% in usability test (NFR-030).
- All UI renders fully in Amharic (FR-138, NFR-033).
- Notifications open the correct in-app screen via deep link (AR-026); critical notifications bypass quiet hours (FR-046).
- Sensitive local data is encrypted (AR-027).

### Verification Evidence
- Device-matrix test report (low-end Android, iOS) incl. offline scenarios; sync conflict-resolution test log; APK sideload install proof; accessibility audit (automated + manual); Amharic UI screenshots; push/deep-link test captures; usability study results (NFR-030).

---

## 10. Phase 7: Admin Dashboard

### Objectives
- Deliver the operational control surface per `10-admin-dashboard-development-plan.md` and SRS §11, so the program can operate, review, and report (FR-094…FR-106, AR-030…AR-035).
- Provide role-based modules, MFA, and session controls for all staff (FR-101, FR-102, AR-033).
- Make AI ops and research review actionable (FR-067, FR-097).

### Deliverables
- **Portal foundation** (FR-094, AR-030): RBAC-based modules (admin dashboard, user mgmt, CMS, campaigns, AI ops, research, support) with server-side enforcement (FR-126); MFA + session controls (FR-101, FR-102, AR-033).
- **User management** (FR-096, §11.2): search by name/masked phone/ID/cohort, filters, role-limited CSV export, bulk role-gated actions (tag cohort, campaign, suspend, re-consent).
- **Content management (CMS UI)** (FR-078, FR-097, §11.4): WYSIWYG editor, versioning with diff/rollback, draft→medical review→approved→publish/schedule→archive; medical-review tagging (FR-081); segregation of duties (FR-106).
- **Campaign management (UI)** (FR-107…FR-112, §11.3): create/schedule campaigns, template library with approval status, per-campaign delivery/read/reply/opt-out metrics.
- **Executive & analytics dashboards** (FR-095, FR-118, §11.1/§11.7): father count, week distribution, active users, trends, regions; DAU/WAU, retention curves, cohort analysis.
- **AI operations dashboard** (FR-067, §11.6): conversation review, safety-alert queue, prompt management with approval (FR-068).
- **Research dashboards** (FR-113, FR-115, AR-032, §11.5): theme visualization, sentiment trends on anonymized data only; governed export workflow (FR-116, FR-122).
- **Consent management views** (FR-100): status, version, withdrawal history per user.
- **Audit-log view** (FR-098): immutable read-only query by auditors.
- **Operational report export** (FR-099): CSV/PDF role-limited.
- **Support-agent interface** (FR-104, §18.4): user lookup, issue history, help-desk KB search.
- **Retention configuration** (FR-105): per-class retention rules with automated purge + audit.
- **Admin notifications** (FR-103): alerts for enrollment thresholds, safety flags, incidents.
- **Accessibility compliance** (FR-140, NFR-031): WCAG 2.1 AA from the first screen.

### Dependencies
- Phases 2–5 services (users, content, campaigns, AI, research). Phase 3 (RBAC, audit, MFA). Phase 5 AI ops events.

### Estimated Effort (Configurable Reference)
- **Reference: 34 person-weeks** (best 26 / realistic 34 / conservative 44). Frontend engineers (2), backend slice, QA (Appendix E Engineering).

### Acceptance Criteria
- Each role sees only its permitted modules; server-side authorization tests block every unauthorized action (FR-094, FR-126, AR-030).
- MFA is enforced on all staff logins; sessions expire and revoke (FR-101, FR-102).
- Content approval workflow enforces author ≠ medical approver (FR-106, QR-019).
- Campaign scheduling and template approval blocks unapproved sends (FR-108).
- Research dashboards contain no direct identifiers (AR-032); export requires ethics/approval gate and is audited (FR-116, FR-122).
- Audit-log view is read-only and complete (FR-098).
- Web/admin interfaces pass WCAG 2.1 AA audit (FR-140, NFR-031).

### Verification Evidence
- Role-matrix test results; MFA/session test captures; CMS workflow trace; campaign approval-gate records; research dashboard data-inspection (no identifiers); export-governance audit trail; accessibility audit report.

---

## 11. Phase 8: Integration

### Objectives
- Prove end-to-end data flows across all services and surfaces before full-system testing (FR-160, FR-162, UC-001…UC-005).
- Deliver the research/analytics pipeline and governance, partner sync, notification failover, and feature-flag rollout (FR-113…FR-122, FR-039/FR-146, FR-152, FR-168).
- Verify every use case and journey against the integrated system (QR-004).

### Deliverables
- **Research/analytics pipeline** (FR-113, FR-114, FR-118, FR-119): event-driven transformation of journal/prompt/myth/challenge/voice/engagement events into anonymized `research_responses`/`research_users` records with theme + sentiment extraction and confidence scores (§10.1); pseudonymization at collection (FR-119, NFR-027); KPI computation (FR-118).
- **Research governance workflow** (FR-116, FR-122): request → ethics check → approval → governed export → audit; research/media consent independence and revocation (FR-117); retention per ethics terms (FR-105).
- **Pre/post assessment support** (FR-120): delivery and scoring hooks for knowledge/confidence measurement (PD-005).
- **Partner sync end-to-end** (FR-039, FR-146, §8.4): mutual link, shared milestones/checklists, opt-in shared journal, offline propagation, unlink semantics.
- **Notification provider failover** (FR-152): push → WhatsApp → SMS/email fallback with delivery tracking and dedup across channels (FR-048, FR-045).
- **End-to-end data flows** (FR-160, FR-162): outbox-relay integrity, consumer idempotency at scale, journey E2E for UC-001…UC-005, research record readiness from live app + WhatsApp events.
- **Feature-flag rollout platform** (FR-168, OR-027): feature flags wired into CI/CD with canary/rolling deployment for phased rollout (pilot → regional → national).
- **API/webhook integration surface** (FR-153): REST/OpenAPI consumers guide, webhook event catalog for partners.
- **Operational readiness artifacts** (OR-015, OR-024): co-located technical documentation, environment data export/migration procedures.

### Dependencies
- Phases 4–7 (WhatsApp, AI, mobile, admin) all present and consuming the same backend. Phase 3 (audit, pseudonymization, consent governance). SRS §10 research schema.

### Estimated Effort (Configurable Reference)
- **Reference: 20 person-weeks** (best 16 / realistic 20 / conservative 28). Data engineer, backend, QA integration slice (Appendix E AI & Data + Engineering).

### Acceptance Criteria
- A journal/prompt/myth/challenge created on any channel produces an anonymized research record with theme scores within the defined latency (FR-113, FR-114, FR-119).
- Research export follows the governance gate and is fully audited; no identifiers present (FR-116, FR-122, NFR-027).
- Partner-linked accounts share milestones/checklists and sync offline without conflict loss (FR-039, FR-146, §8.4).
- A simulated primary-channel failure routes notifications to the configured fallback (FR-152).
- Feature flags toggle a service behavior in production with canary rollout and rollback (FR-168, NFR-038).
- All five use cases (UC-001…UC-005) pass as E2E journeys (QR-004).

### Verification Evidence
- Research-record samples with theme confidence and pseudonymization attestation; export-governance audit trail; partner-sync conflict-merge test; notification-failover drill; canary/rollback deployment log; UC E2E test reports.

---

## 12. Phase 9: Testing

### Objectives
- Execute the complete quality program per `13-testing-and-quality-plan.md` and QR-001…QR-019 before any pilot exposure (QR-013).
- Re-verify Gates 2–3 ("Gates 2–3"): security regression (Gate 2) and release readiness (Gate 3).
- Conduct UAT with representative users (QR-017) and clinical/content validation (QR-019).

### Deliverables
- **Unit testing sweep** (QR-002): ≥ 80% core backend, ≥ 70% overall, gates blocking promotion.
- **Integration testing sweep** (QR-003): service contracts, data flows, WhatsApp mocks, DB migrations/constraints/immutability, AI pipeline components.
- **E2E testing** (QR-004, §17.4): registration → opt-in → weekly prompt → AI question → response; emergency escalation; hospital bag + budget; offline journal sync; campaign delivery; research export governance; mobile device matrix; dashboard role tests.
- **Contract testing** (QR-005): internal/external API schema compatibility.
- **Performance/load testing** (QR-006, NFR-001…NFR-009): 500+ concurrent fathers, median ≤ 500 ms / p95 ≤ 2 s, WhatsApp ack + 5 s processing, batch broadcast window, AI ≤ 10 s, graceful degradation.
- **Security testing** (QR-007): SAST, DAST, dependency scan, penetration test, STRIDE follow-up (FR-130, NFR-016, NFR-019).
- **Accessibility testing** (QR-008): automated + manual WCAG 2.1 AA for web/admin (FR-140, NFR-031).
- **Privacy testing** (QR-009): consent flow, minimization, export, deletion, pseudonymization, subject-rights SLAs (FR-128, NFR-026).
- **WhatsApp conversational testing** (QR-010): flows, templates, media, errors, safety responses.
- **AI quality evaluation** (QR-011, QR-014): accuracy/hallucination/safety/bias on eval set; safety regression before any AI release (NFR-047, NFR-050).
- **Test data management** (QR-012): synthetic realistic data, no production PII in test environments.
- **Defect & requirement traceability** (QR-015): every requirement has test coverage + status; traceability matrix refreshed.
- **User-acceptance testing** (QR-017): representative fathers, partners, healthcare workers, administrators execute defined scenarios; defect closure before release.
- **Clinical/content validation** (QR-019): all health content and AI grounding validated against the authoritative guide (A-04, OR-021).
- **Release review** (QR-016): rollback readiness, monitoring dashboards live, alerting verified.
- **Final Gates 2–3 verification** against `21-quality-gate-checklist.md`.

### Dependencies
- Phases 0–8 artifacts (all code, schemas, pipelines, dashboards, runbooks). External: pen-test provider, clinical reviewer availability (D-04), representative user pool for UAT.

### Estimated Effort (Configurable Reference)
- **Reference: 42 person-weeks** (best 32 / realistic 42 / conservative 56). QA lead + team, all squads contribute fixes, security consultant, clinical reviewer (Appendix E).

### Acceptance Criteria
- All QR-001…QR-019 items pass; QR-013 release gate conditions are demonstrably met (unit+integration+E2E+security+accessibility+performance+clinical review).
- Zero critical/high security findings at gate exit (NFR-016, FR-129).
- Performance targets met at configured pilot scale (NFR-001…NFR-009).
- UAT scenarios pass with defined thresholds (QR-017); defects triaged and closed or risk-accepted by program.
- Traceability matrix shows 100% of Must-Have requirements covered (QR-015).
- Gates 2–3 checklist items all verified green.

### Verification Evidence
- Test-suite execution reports per layer (unit/integration/E2E/contract/performance/security/accessibility/privacy/WhatsApp/AI); pen-test report; load-test report; accessibility audit; UAT sign-off records; clinical validation sign-off; traceability matrix export; Gates 2–3 checklist signed.

---

## 13. Phase 10: Pilot Deployment

### Objectives
- Launch the founding cohort safely per OR-027…OR-030 and SRS §18, with rollback readiness and live support (OR-001, OR-002).
- Operate, monitor, and evaluate the pilot against the KPI framework (PD-011, Appendix F) and measure program objectives (PD-004…PD-008).
- Conduct the pilot evaluation (QR-018) and feed findings into the roadmap (PD-010).
- Grant **Gate 3** as the formal pilot go/no-go and demonstrate DR/business continuity readiness (§19, OR-012, OR-023).

### Deliverables
- **Gate 3 — Release & Pilot Launch Gate**: final go decision after UAT (QR-017), clinical validation (QR-019), release review (QR-016), rollback readiness, and monitoring/alerting verification (OR-008).
- **Cohort onboarding operations** (FR-010, OR-028): invitation distribution, referral/cohort tagging, enrollment support, WhatsApp + app onboarding playbooks.
- **Production monitoring & alerting live** (OR-007, OR-008): availability (NFR-010), latency, WhatsApp delivery failures (OR-011), AI safety monitoring (NFR-050, OR-010), cost budget alerts (AR-040).
- **Support operations** (OR-002, OR-003, §18.4): Level 1–4 escalation model staffed; runbooks for deployment, backup, restore, incident, AI failure, WhatsApp outage (OR-003); help-desk KB (OR-016).
- **Incident management** (OR-009, FR-131): on-call rotation, severity/escalation, post-incident reviews; emergency healthcare escalation path (Level 4).
- **Disaster recovery & business continuity** (§19, FR-165, AR-039, OR-012, OR-023): quarterly restore drill, backup verification (NFR-014), failover exercise; manual fallback procedures for emergency guidance.
- **Rollback readiness** (QR-016, OR-030): versioned content and app releases with rollback paths; feature-flag controlled rollout (FR-168, OR-027).
- **Stakeholder communication** (OR-029): launch + ongoing reporting cadence (M&E framework OR-018).
- **Pilot evaluation** (QR-018): usability, engagement, safety events, program KPIs (PD-004…PD-008, FR-118, Appendix F); findings feed the roadmap (PD-010).
- **Phase-0 backlog clean-up** (could-do items FR-075, FR-090, FR-093, FR-110, FR-121 as resources allow).

### Dependencies
- Phase 9 (all gates green). External: WhatsApp policy acceptance (D-01), LLM availability (D-02), ethics approval (D-05), clinical review (D-04), cloud regional availability (D-03).

### Estimated Effort (Configurable Reference)
- **Reference: 26 person-weeks** (best 20 / realistic 26 / conservative 36). Operations + support + program + M&E + engineering standby (Appendix E Research & Community, Operations).

### Acceptance Criteria
- Gate 3 granted: release gate QR-013 evidence and rollback readiness verified (QR-016).
- Founding cohort enrolled and onboarded with support SLAs active (OR-002, OR-028).
- Monitoring dashboards and alerting verified live; availability target tracked (NFR-010, OR-007, OR-008).
- DR drill meets RPO ≤ 15 min / RTO ≤ 4 h (NFR-012, §19).
- Pilot evaluation report delivered measuring usability, engagement, safety events, and KPIs (QR-018, PD-011, Appendix F).
- Safety events (emergency escalation, hallucination flags) reviewed with zero critical follow-through failures (NFR-050, OR-010).

### Verification Evidence
- Gate 3 sign-off record; enrollment/onboarding reports; support-SLA metrics; monitoring dashboard + alert captures; DR drill report (RPO/RTO measurements); pilot-evaluation report (QR-018) with KPI dashboard export; post-incident review records.

---

## 14. Cross-Phase Dependencies

Which deliverables unlock later phases, and the risk of rework if a dependency is skipped or degraded (derived from 02 §4 "Blockers If Absent"):

| Deliverable (Phase) | Unlocks | Risk of Rework If Skipped |
| --- | --- | --- |
| Decision-log approvals M-01…M-07 (P0) | All build phases | Provider/platform lock-in mid-build; procurement delays; stack re-architecture (ADR churn) |
| STRIDE threat model + DPIA (P0) | Security design across P1–P8 | Security retrofits after code exists (violates 02 §5 rule 1); findings block QR-013 at the end |
| IaC + env isolation (P1) | Every deploy from P2 onward | Hand-rolled environments; prod-data leakage into dev (AR-009); non-reproducible deploys (NFR-036) |
| Secret manager + CI scans (P1) | All services | Credentials in code/logs (NFR-022); rotation debt; CI gate failures late |
| Migration baseline + append-only consent/audit (P1) | Consent lifecycle, audit, research governance | Immutable-history semantics hard to retrofit; compliance evidence missing at release |
| Identity + consent lifecycle (P2) | Enrollment, WhatsApp opt-in, research consent, campaign eligibility | Re-registration and consent rework across channels (FR-008, FR-017, FR-117) |
| Pregnancy engine (P2) | Weekly prompts, reminders, personalization, research week-tagging | Wrong-segment prompts (FR-014), miscounted milestones (FR-033), skewed research (FR-027) |
| Content service + approval workflow (P2) | RAG grounding (AR-015), WhatsApp embedding (FR-082), admin CMS | Ungrounded AI (FR-061); unapproved content published (FR-081, QR-019) |
| Event bus + outbox + idempotency (P2) | Webhook dedup, research ingestion, campaigns, partner sync | Duplicate messages/records (FR-161) erode trust and pollute research data |
| RBAC + audit + encryption + secrets (P3) | WhatsApp, AI, mobile, admin, research | Data exposure (FR-126, FR-127); Gate 2 failure blocks QR-013; retrofitting authz into shipped services is high-cost |
| Webhook security pattern (P3) | WhatsApp webhook (P4) | Forged/replayed messages (NFR-020); emergency false-trigger abuse |
| Provider abstraction (P4) | Provider switching, outage resilience (NFR-015, FR-149) | Lock-in to Meta; policy/pricing changes become emergencies |
| WhatsApp template governance (P4) | Campaigns, broadcasts, reminders | Platform-approval rejection blocks outbound; 24-hour window violations (NFR-044) |
| Media pipeline + transcription (P4) | Journal voice entries, AI voice, research audio | Voice-note feature unusable (FR-018); research loses voice corpus |
| Emergency workflow (P4) | AI emergency handling, safety-event queue | Harm risk; Level-4 escalation path absent at pilot (PD safety) |
| Ingestion + retrieval + safety layer (P5) | Mobile AI, admin AI ops, research themes | Unsafe answers (NFR-046); ungrounded content; evaluation-set debt blocks QR-011/QR-014 |
| Eval set + safety regression (P5) | Any AI release (QR-014), pilot AI quality | Unmeasured accuracy; hallucination incidents in pilot; NFR-047 unmet |
| Offline-first sync (P6) | Low-connectivity pilot usability (UR-004, FR-136) | Data loss/duplication; user abandonment in intermittent-connectivity areas (A-02) |
| MFA + session controls (P7) | Staff access, research governance | Insider-risk exposure (FR-101, §14.1.7); audit gaps |
| Research pipeline + governance (P8) | Evidence generation (PD-008/PD-009), impact reports | No research-grade datasets; ethics/consent violations; publication blocked |
| Partner sync (P8) | FR-039/FR-146 should-have | Feature deferred entirely; partner-inclusive journey absent |
| Feature flags + canary (P8) | Phased rollout (OR-027), rollback (OR-030) | Blast-radius risk at cohort launch; rollback unproven at QR-016 |
| Full QA + UAT (P9) | Gate 3, pilot launch | Launching with unknown quality; QR-013 unmet; recall risk |
| Monitoring/alerting + DR drill (P10) | Pilot operations, RPO/RTO proof | Unmonitored failures; recovery-time misses during live pilot (§19) |

**Sequencing rule:** a phase may not begin its core build until the phase it depends on (02 §4) has its acceptance criteria met. Overlap is permitted only for phases that are not on the critical dependency path (e.g., Phase 5 AI preparation can begin against content-service mocks while Phase 4 completes, but AI grounding against real knowledge requires Phase 2 content service).

---

## 15. Milestones and Checkpoints

| Milestone | Checkpoint (End of) | Acceptance Gate | Evidence Owner |
| --- | --- | --- | --- |
| M0 — Baseline & decisions approved | Phase 0 | Gate G1 package signed (M-01…M-07, STRIDE, DPIA, stack) | Product/Leadership + Security |
| M1 — Foundation live | Phase 1 | **Gate 1 acceptance** (CI/CD, IaC, secrets, migration 001, observability) | DevOps + Backend |
| M2 — Backend core functional | Phase 2 | Internal checkpoint (UC-001 E2E green; QR-002 coverage floors) | Backend + QA |
| M3 — Security complete | Phase 3 | **Gate 2 acceptance** (auth lifecycle, RBAC, audit, encryption, webhook pattern; zero critical/high) | Security + QA |
| M4 — Channels integrated | Phase 5 | Internal checkpoint (WhatsApp ↔ AI RAG E2E; emergency drill; QR-010, QR-011 pass) | WhatsApp + AI |
| M5 — App + Admin feature complete | Phase 7 | Internal checkpoint (mobile E2E journeys; admin role tests; AR-025…AR-035) | Mobile + Admin |
| M6 — Integration complete | Phase 8 | Internal checkpoint (UC-001…UC-005 E2E; research pipeline; partner sync; feature flags) | Data + Backend |
| M7 — QA + UAT complete | Phase 9 | **Gates 2–3 verified**; QR-013 release-gate evidence; UAT sign-off (QR-017); clinical validation (QR-019) | QA Lead + Program |
| M8 — Pilot go-live | Phase 10 start | **Gate 3 granted** (rollback readiness, monitoring/alerting live, DR drill) | Program + Operations |
| M9 — Pilot evaluated | Phase 10 end | QR-018 pilot-evaluation report; KPI framework report (PD-011, Appendix F) | Research + M&E |

Checkpoint cadence inside phases: weekly engineering demos, per-sprint phase-work reviews, and phase-exit review meetings with the acceptance evidence above. All milestones reference `21-quality-gate-checklist.md` for the exhaustive item list.

---

## 16. Effort and Scheduling

### 16.1 Person-Week Reference Estimates

**All figures are configurable reference values, not commitments** (SRS §1.11, Appendix C). They assume the Appendix E team model (Engineering 2–3 backend + 2 mobile + 2 frontend + DevOps + QA; AI & Data; Healthcare & Content; Security & Privacy; Product & Leadership), a monorepo with a shared service platform, and that the cross-cutting controls (02 §5) are delivered as part of each phase rather than retrofitted.

| Phase | Best (pw) | Realistic (pw) | Conservative (pw) | Note |
| --- | --- | --- | --- | --- |
| 0 — Planning & Architecture Validation | 12 | 16 | 24 | Decisions M-01…M-07, STRIDE, DPIA, procurement |
| 1 — Foundation | 20 | 26 | 34 | IaC, CI/CD, secrets, migration baseline, observability |
| 2 — Backend Core | 50 | 62 | 80 | API platform, auth-initial, user/profile, pregnancy, content, journal, checklist/budget, reminders |
| 3 — Authentication & Security | 28 | 36 | 48 | OTP/MFA/token lifecycle, RBAC, audit, encryption, secrets, webhook pattern |
| 4 — WhatsApp Platform | 32 | 40 | 52 | Provider abstraction, state machine, templates, media, emergency, campaigns |
| 5 — AI/RAG Platform | 36 | 46 | 60 | Ingestion, retrieval, safety layer, routing, eval set, AI ops |
| 6 — Mobile Application | 44 | 56 | 72 | Auth, journey, journal, checklist, budget, offline, sync, notifications |
| 7 — Admin Dashboard | 26 | 34 | 44 | User mgmt, CMS, campaigns, analytics, AI ops, research |
| 8 — Integration | 16 | 20 | 28 | Research pipeline, partner sync, E2E flows, feature flags |
| 9 — Testing | 32 | 42 | 56 | Full QA sweep, UAT QR-017, Gates 2–3 |
| 10 — Pilot Deployment | 20 | 26 | 36 | Cohort onboarding, monitoring, support, DR, QR-018 evaluation |
| **Total** | **316** | **404** | **534** | Reference only; see 20-resource-and-delivery-analysis.md |

### 16.2 Schedule Scenarios (Calendar Weeks, Configurable Team)

Assumes a steady-state team of ~10–12 FTE equivalent across Engineering/AI/QA with part-time clinical, security, and program roles; phases overlap where the dependency map permits. Figures are summaries — details in `20-resource-and-delivery-analysis.md`.

| Scenario | Phases 0–5 (Build to Channels+AI) | Phases 6–8 (App/Admin/Integration) | Phases 9–10 (QA + Pilot) | Total calendar weeks |
| --- | --- | --- | --- | --- |
| **Best** | 14 | 10 | 8 | ~32 |
| **Realistic** | 18 | 13 | 11 | ~42 |
| **Conservative** | 24 | 18 | 16 | ~58 |

The realistic scenario corresponds approximately to the SRS Appendix D reference timeline (Weeks 1–28 for phases equivalent to 0–7, pilot thereafter), extended by the explicit Integration phase and formal Gates 2–3.

### 16.3 Effort Drivers to Watch (Configurable Assumptions)

- Team availability and skill mix per M-04 (mobile framework) and hiring pool.
- Provider onboarding lead times (M-01 cloud, M-02 WhatsApp, M-03 LLM, D-01…D-03).
- Clinical review throughput (D-04, OR-021) for content and AI grounding.
- Ethics approval timeline (D-05) for research pipeline go-live.
- Translation/transcription vendor readiness for Amharic (D-06).

---

## 17. Risks to the Roadmap

| # | Risk | Likelihood | Impact | Mitigation / Contingency |
| --- | --- | --- | --- | --- |
| R-01 | Sequential gate dependencies (G1→G2→G3) delay overall delivery | Medium | High | Overlap non-critical-path phases (e.g., AI prep in P5 vs. P4 tail); checkpoint rather than hard-stop where evidence permits |
| R-02 | WhatsApp Business API availability/policy in Ethiopia delays P4 (D-01) | Medium | High | Provider abstraction (FR-149) lets a secondary provider step in; Phase 3 webhook pattern is provider-agnostic |
| R-03 | LLM provider cost/compliance issues delay P5 (D-02, A-07) | Medium | Medium-High | Multi-provider fallback tiers (§9.8); cost-aware routing; pseudonymization verified before calls (FR-073) |
| R-04 | Clinical review backlog (D-04, OR-021) blocks content + AI grounding | Medium-High | High | Content team runs ahead of Phase 2; review workflow built in Phase 2; QR-019 scheduled early in P9 |
| R-05 | Ethics approval (D-05) delayed for research pipeline | Medium | High | Research consent model designed in P0 (FR-117); pipeline built behind feature flags in P8; governance gates pre-approved |
| R-06 | M-decisions not approved in time (M-01…M-07 are Assumption-class) | Medium | High | Decision log made a Phase 0 hard exit; parallel supplier negotiations with fallback options |
| R-07 | Scope creep (Could-Have items FR-075, FR-090, FR-093, FR-110, FR-121 pulled in) | Medium | Medium | Phase 10 backlog only; change control through decision log (02 §6) |
| R-08 | Security retrofits if P1–P2 skip cross-cutting controls (02 §5) | Low (if roadmap followed) | Very High | P3 Gate 2 hard exit; CI security scans from Phase 1; no phase accepts incomplete controls |
| R-09 | Performance targets missed at pilot scale (NFR-001…NFR-009) | Medium | Medium-High | Load testing in P9 with configurable targets; scaling path documented (AR-008); graceful degradation (NFR-008) |
| R-10 | Offline sync conflict bugs undermine low-connectivity UX (FR-136, AR-025) | Medium | Medium | Conflict-resolution design from P6 first sprint; device-matrix E2E in P9 |
| R-11 | AI safety incidents in pilot (hallucination, emergency false-negatives) | Medium | High | Eval set + safety regression (QR-011/QR-014); monitoring/alerting (NFR-050); Level-4 escalation (OR-010) |
| R-12 | Team availability / turnover (staffing risk, Appendix G) | Medium | Medium | Co-located documentation (OR-015), runbooks, monorepo conventions; 15-team-and-resource-plan buffers |
| R-13 | Pilot engagement below PD-004 (≥60% weekly support action) | Medium-High | Medium | Personalization + campaign engine ready by P4/P7; M&E measures early; evaluation findings feed roadmap (QR-018) |
| R-14 | Third-party outage during pilot (WhatsApp/LLM) | Medium | Medium | Failover tiers (FR-072, FR-152), degradation plan (NFR-015), runbooks (OR-003), status page (OR-006) |

Full risk register in `16-risk-management-plan.md` (SRS Appendix G baseline).

---

## 18. Verification Approach

This roadmap is itself verified, not just executed. Its verification approach mirrors the SRS quality framework:

1. **Traceability as the spine (QR-015).** Every phase deliverable maps to named requirements (via `00-requirement-inventory.md` and `22-feature-implementation-matrix.md`). The traceability matrix is refreshed at every milestone and must show 100% of Must-Have requirements covered with test/verification status before Gate 3.
2. **Quality-gate checklists (`21-quality-gate-checklist.md`).** Gates G1 (Planning & Architecture), G2 (Core Platform & Security), and G3 (Release & Pilot Launch) each have an explicit checklist. A gate is not closed on narrative; it is closed on evidence artifacts named in the phase's Verification Evidence section.
3. **Test pyramids per phase (QR-001…QR-012).** Each phase ships unit, integration, and relevant E2E tests with coverage floors (QR-002). Full-system sweeps land in Phase 9: performance (QR-006), security (QR-007), accessibility (QR-008), privacy (QR-009), WhatsApp (QR-010), AI evaluation (QR-011), test data hygiene (QR-012).
4. **Release discipline (QR-013, QR-014, QR-016).** No production/pilot deployment without the combined release gate (unit+integration+E2E+security+accessibility+performance+clinical review), the AI eval set + safety regression for AI releases, and release review (rollback readiness, dashboards, alerting).
5. **Human-in-the-loop gates (QR-017, QR-018, QR-019).** UAT with representative users, pilot evaluation against the KPI framework (PD-011, Appendix F), and clinical/content validation against the authoritative guide (A-04) are all evidence-bearing checkpoints with sign-off records.
6. **DR and operations proof (§19, OR-012).** RPO/RTO are demonstrated by scheduled restore/failover drills with measurements, not assumed; monitoring/alerting are verified live before cohort onboarding.
7. **Artifact repository.** All verification evidence (test reports, scans, drills, sign-offs, dashboards) is recorded per phase so a reviewer can audit any acceptance criterion end-to-end, consistent with the plan-wide evidence convention used in documents 06–13.

---

**END OF DOCUMENT — 14. Development Phase Roadmap.** Phase sequencing follows the dependency map in `02-srs-requirement-analysis.md`; phases 0–7 decompose and extend SRS Appendix D; gates G1–G3 operationalize QR-013; effort figures are configurable references owned in detail by `20-resource-and-delivery-analysis.md`.
