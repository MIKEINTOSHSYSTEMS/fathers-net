# 11. Security and Privacy Implementation Plan

**Document:** FathersNet (Ayay) — Security and Privacy Plan
**Source of truth:** `docs/FathersNet-Complete-SRS.md` (FN-SRS-001 v2.0), Security and Privacy Specification §14, plus §4 (FR-094…106, FR-123…132), §5 (NFR-016…029), §7.4 (webhook/media security), §9 (AI safety), §12 (API security), §13 (security-relevant tables), §15 (architecture, ADRs), §17/§18 (testing, logging/retention), §19 (DR).
**Predecessors:** `00-requirement-inventory.md`, `02-srs-requirement-analysis.md`, `03-system-architecture-plan.md`, `04-technology-stack-analysis.md`, `05-database-implementation-plan.md`, `06-backend-development-plan.md`, `07-whatsapp-platform-implementation-plan.md`, `08-ai-rag-implementation-plan.md`, `09-mobile-application-development-plan.md`, `10-admin-dashboard-development-plan.md`
**Scope:** Threat-model-driven security controls, authentication and authorization architecture, RBAC implementation, encryption and key management, audit logging, privacy controls, AI security, webhook and media security, OWASP mapping, incident response, security testing, dependencies, risks, and verification for the greenfield build.
**Classification convention:** **Confirmed** (SRS-stated) · **Recommended** (engineering decision) · **Configurable** (parameter with default) · **Assumption** (requires human validation). Every recommendation carries Source, Confidence, Reasoning, and Impact-if-changed.

---

## 1. Executive Purpose

This document is the controlling **security and privacy reference** for the FathersNet (Ayay) build. It converts the binding requirements of FN-SRS-001 v2.0 — principally the Security and Privacy Specification (§14) and the security/privacy requirement groups (FR-123…132, NFR-016…029) — into a concrete, implementable control architecture that engineers build against, that the testing team verifies against (QR-007, QR-009), and that a security reviewer or external auditor can assess against.

The plan is derived from these SRS areas, referenced by name:

- **Security and Privacy Specification §14** — STRIDE threat model (§14.1, eight attack areas), encryption strategy (§14.2), audit logging (§14.3), OWASP Top 10 mapping (§14.4), privacy-by-design (§14.5), authentication & authorization architecture (§14.6), roles & permission matrix (§14.7), healthcare data governance (§14.8), privacy requirements (§14.9), healthcare safety requirements (§14.10), AI governance (§14.11), data ownership (§14.12).
- **Functional Requirements** — security/privacy controls FR-123…132; admin/RBAC FR-094…106 (MFA FR-101, sessions FR-102, retention FR-105, segregation of duties FR-106); WhatsApp security FR-011…030; AI safety FR-059…075 (audit trail FR-069, no-PHI-to-providers FR-073).
- **Non-Functional Requirements** — NFR-016 (ASVS), NFR-017 (defense-in-depth), NFR-018 (auth standards), NFR-019 (STRIDE + pen test), NFR-020 (attack classes), NFR-021 (encryption), NFR-022 (secrets), NFR-023 (tamper-evident audit), NFR-024 (verifiable deletion), NFR-025…029 (privacy/data protection), NFR-046…050 (AI quality/safety).
- **API Specification §12** — API conventions and security constraints (§12.1), authentication APIs (§12.2), WhatsApp webhook validation (§12.4), admin API auth/MFA (§12.10).
- **Database Specification §13** — `users.phone_e164` app-level encryption (§13.3.1), immutable `consents` (§13.3.4), `ai_conversations` audit records (§13.3.20), append-only `audit_logs` (§13.3.24), retention/purging rules (§13).
- **Architecture Specification §15** — trust boundaries in the system diagram (§15.1), architecture requirements AR-009/AR-012/AR-013/AR-019/AR-020/AR-023/AR-027/AR-030/AR-032/AR-033 (§15.2), emergency escalation (§15.3).
- **Monitoring & Operations §18 and DR §19** — log retention classes (§18.1), alerting (§18.3), RPO/RTO (§19).

**What this document deliberately does NOT do:** it does not select final commercial security vendors (procurement remains open per `02` §6), does not produce per-table DDL (see `05`), does not define CI/CD job wiring (see `12`), and does not set guaranteed capacity commitments beyond the SRS's configurable reference defaults. Where the SRS states a **Recommended** approach, this document confirms it or proposes an engineering alternative that still satisfies the confirmed requirement, always labeled.

**Security posture statement (Confirmed, from §14, NFR-016, FR-129):** zero critical/high-severity vulnerabilities open at release; OWASP ASVS-aligned controls; defense-in-depth; STRIDE-modeled threat surface; healthcare-adjacent data handled with encryption, audit, least privilege, and consent governance. The SRS makes no self-claimed regulatory certification (§1.10); all compliance language is "designed to support alignment" and must be validated by legal review before launch (NFR-041).

---

## 2. Security Architecture (Defense-in-Depth)

### 2.1 Defense-in-Depth Model (NFR-017)

| Layer | Controls | SRS Source |
| --- | --- | --- |
| Perimeter / network | Network isolation, allow-listed egress, WAF rules, no public service-to-service exposure | NFR-017, NFR-020 (A10 SSRF), §14.1.6 |
| Edge / gateway | TLS termination, rate limiting, API authentication, CORS allow-list, request validation | §12.1, §12.2, FR-169, §14.1.6 |
| Application / service | Server-side RBAC + ownership checks per endpoint, deny-by-default, input validation, output encoding, idempotency, audit hooks | FR-126, FR-129, §14.1.2, §14.3 |
| Data | Encryption at rest and in transit, app-level encryption for sensitive fields, key management, retention/purging, research separation | FR-123, NFR-021, §14.2, §14.8, AR-013 |
| People / process | Least privilege, MFA, segregation of duties, quarterly access reviews, security training, incident response | §14.1.7, FR-101, FR-106, FR-131 |
| Monitoring / detection | Tamper-evident audit logs, security alerting, anomaly detection, pen-testing cadence | NFR-023, FR-131, NFR-019 |

| Attribute | Value |
| --- | --- |
| **Statement** | No single control is relied on; a failure in one layer is caught by the next. |
| **Source** | NFR-017 (defense-in-depth); §14.1 (per-threat multi-layer mitigations) |
| **Classification** | Confirmed |
| **Confidence** | High |
| **Reasoning** | NFR-017 explicitly mandates network isolation, least privilege, secrets management, and patching. Every STRIDE mitigation in §14.1 lists multiple compensating controls (e.g., §14.1.1 pairs OTP expiry with lockout, rate limits, MFA, and fingerprinting). |
| **Impact if changed** | Removing any single layer (e.g., WAF, rate limiting, or access-logging) degrades a specific STRIDE mitigation and can fail NFR-016's zero-critical-at-release gate. |

### 2.2 Security Boundaries and Trust Zones

Trust zones are derived from the §15.1 system diagram. Each zone has an explicit trust level and boundary control.

| Zone | Components | Trust level | Boundary controls |
| --- | --- | --- | --- |
| **Z1 Client / End-user** | Mobile app, WhatsApp client, web admin browser | Untrusted | TLS 1.2+; bearer tokens; OTP; device fingerprint; signed expiring URLs |
| **Z2 Edge** | API Gateway, Message Gateway / Webhooks, Authentication Service | Semi-trusted (validate everything) | API key/app-secret HMAC for webhooks (§7.4.1); rate limiting (§12.1); WAF; TLS termination |
| **Z3 Core services** | User & Profile, Pregnancy Engine, Reminder Engine, Conversation Engine, Content & CMS, Campaign, Research & Analytics | Trusted (internal) | Service-to-service mTLS or network policy; JWT with role/ownership claims; internal egress allow-list |
| **Z4 AI processing** | AI Orchestration, Medical Safety Layer, RAG, ASR, NLU | Trusted (internal) but external-call-aware | Pseudonymization before provider calls (FR-073, AR-019); provider abstraction (§9.8, ADR-005); DPA per provider (NFR-029) |
| **Z5 Data** | PostgreSQL, Object Storage, Redis, Message Bus / Queue | Trusted (internal) | Encryption at rest; KMS-managed keys; role-separated DB credentials; research schema separation (AR-013) |
| **Z6 External processors** | WhatsApp provider, LLM/embedding providers, ASR/transcription, notification providers | Untrusted (contracted) | DPA (NFR-029); signed webhooks inbound; allow-list of outbound; secret isolation per provider |

| Attribute | Value |
| --- | --- |
| **Statement** | The system is partitioned into six trust zones; no zone may assume the trust of another, and every crossing point enforces an explicit control. |
| **Source** | §15.1 diagram (gateway/auth at edge; core services; AI; data); §12.1 (security considerations); §14.2 (encryption across boundaries); AR-009 (environment isolation) |
| **Classification** | Confirmed (structure); Recommended (zone labels and boundary controls) |
| **Confidence** | High |
| **Reasoning** | The §15.1 diagram places the API Gateway and Message Gateway at the edge, services in a core tier, AI behind an orchestration layer, and data stores at the bottom — a natural zone separation. NFR-017 and NFR-020 (SSRF) require network isolation and allow-listed egress, which presupposes defined zones. |
| **Impact if changed** | Merging zones (e.g., letting core services reach the public internet directly) re-introduces SSRF and data-leakage vectors (§14.1.3, A10) and violates NFR-020/NFR-017. |

### 2.3 Environment Isolation (AR-009, FR-170)

| Control | Implementation |
| --- | --- |
| Environments | dev, staging, prod fully isolated in compute, data, credentials, and traffic (AR-009). |
| Data | Production data never used in lower environments; synthetic/no-PII test data only (QR-012). |
| Secrets | Per-environment secret scopes; lower environments use their own keys/credentials (FR-170, NFR-022). |
| Deployment | Infrastructure as code (IaC) with drift detection; canary/rolling deploys (AR-036, AR-037, FR-168). |

| Attribute | Value |
| --- | --- |
| **Statement** | Environment isolation is non-negotiable and enforced by IaC, not by convention. |
| **Source** | AR-009; FR-170; QR-012; NFR-036 |
| **Classification** | Confirmed |
| **Confidence** | High |
| **Reasoning** | AR-009's acceptance criterion is explicit ("production data never used in lower environments"); QR-012 mandates synthetic test data; FR-170 mandates environment isolation and data-access governance. |
| **Impact if changed** | Cross-environment data reuse fails AR-009/QR-012, creates privacy exposure (FR-124), and invalidates research data integrity. |

---

## 3. Authentication

### 3.1 User OTP Flow (§14.6, §12.2)

The confirmed flow (SRS §14.6 step 1–4) maps to the §12.2 endpoints:

1. **Request:** `POST /v1/auth/otp/request` — body carries phone (E.164) and optionally `channel` and `purpose`. Validated; rate-limited; OTP is generated, stored with expiry, delivered on the chosen channel. **The OTP value is never logged** (§12.2).
2. **Verify:** `POST /v1/auth/otp/verify` — constant-time OTP comparison, expiry check, failed-attempt counter; on success issues a short-lived JWT access token and a refresh token (§14.6 step 2). Account activation completes (§12.2).
3. **Use:** access token sent as `Authorization: Bearer <jwt>` on all API calls (§14.6 step 3; §12.1).
4. **Refresh:** `POST /v1/auth/refresh` — refresh token rotates on each use; revocation on reuse detection (§14.6 step 4).
5. **Logout:** `POST /v1/auth/logout` — current session revoked; revocation recorded.

| Attribute | Value |
| --- | --- |
| **Statement** | Phone-verified OTP establishes the father identity; JWT bearer tokens carry subsequent sessions; refresh rotation is mandatory. |
| **Source** | §14.6 (Confirmed flow); §12.2 endpoint table; FR-005; §14.1.1 |
| **Classification** | Confirmed |
| **Confidence** | High |
| **Reasoning** | The flow and endpoints are explicit in the SRS. FR-005 requires OTP verification with rate limiting before activation; §14.1.1 lists OTP expiry/lockout and refresh rotation among its mitigations. |
| **Impact if changed** | Switching to password-based user auth contradicts the confirmed OTP flow (§14.6) and the phone-first identity model (FR-002, FR-009), and would weaken credential-stuffing resistance for a low-literacy user base. |

### 3.2 JWT Strategy (Recommended)

| Parameter | Value | Classification |
| --- | --- | --- |
| Algorithm | RS256 or ES256 (asymmetric) | Recommended (§14.6) |
| Access token lifetime | 15 minutes default | Configurable (§14.6) |
| Refresh token lifetime | 30 days default, revocable | Configurable (§14.6) |
| Claims | `sub` (user UUID, FR-009), `role`, `token_version` | Recommended (§14.6) |
| Storage | Client-side only (mobile secure storage / in-memory web), never server-side | Recommended (§14.6) |
| Logging | Never logged, never in URL | Confirmed (§14.6, §12.1) |

| Attribute | Value |
| --- | --- |
| **Statement** | Use asymmetric signed JWTs (RS256/ES256) with user id, role, and token-version claims; short-lived access tokens and rotating refresh tokens. |
| **Source** | §14.6 ("signed JWT (RS256/ES256) with claims for user id, role, and token version; stored only client-side; never in logs"); §14.1.1 (short-lived access tokens; refresh-token rotation) |
| **Classification** | Recommended (algorithm/claims); Confirmed (short-lived access + rotating refresh lifecycle) |
| **Confidence** | High |
| **Reasoning** | §14.6 explicitly recommends RS256/ES256. Token versioning supports revocation of all tokens for a user on privilege change or compromise. Asymmetric signing lets the gateway verify without sharing the signing key, fitting the stateless scale model (AR-008). |
| **Impact if changed** | HS256 (shared-secret symmetric) is simpler but requires secret sharing to every verifier and weakens revocation; long-lived access tokens would violate §14.6 defaults and §14.1.1's short-lived requirement. |

### 3.3 Token Lifecycle and Session Management (FR-102, §14.6)

| Control | Specification | Source |
| --- | --- | --- |
| Access-token expiry | Default 15 min, configurable; enforced at gateway on every request | §14.6 |
| Refresh-token expiry | Default 30 days, configurable; revocable server-side | §14.6 |
| Refresh rotation | New refresh token issued on each refresh; old token invalidated; reuse of a revoked token triggers alarm and full session revocation | §14.6 step 4; §14.1.1 detection |
| Logout | Revokes the session server-side and records the event | §12.2 |
| Concurrent sessions | Policy for admin accounts; FR-102 requires expiry, revocation, and concurrent-session control for admin | FR-102 |
| Revocation on role change | Changing a user's role or status bumps `token_version`, invalidating outstanding tokens | Recommended (derived from §14.6 token-version claim) |

### 3.4 OTP Rate Limiting, Lockout, and Fingerprinting (§14.1.1, §12.2, §7.4.3)

| Control | Specification | Classification |
| --- | --- | --- |
| OTP request rate limit | 5 requests per phone number per 15 minutes; returns `429` with `Retry-After` | Confirmed (§12.2, §7.4.3) |
| OTP verify attempts | Max 5 per 15 minutes per phone; lockout after repeated failures | Confirmed (§12.2 "lockout after failures"; §7.4.3 "max 5") |
| OTP expiry | Short configurable TTL (e.g., 5–10 min) with single-use semantics | Recommended (from §14.1.1 "OTP verification with expiry") |
| OTP comparison | Constant-time comparison; format/length validation | Confirmed (§12.2) |
| OTP logging | Never log the OTP value or deliverable payload | Confirmed (§12.2 "do not log OTP") |
| Device fingerprint | Captured on OTP request and verify; used for anomaly detection, not as sole authentication factor | Confirmed (§12.2 request field; §14.1.1 mitigation) |
| Standard API rate limits | 120 requests/min per user standard tier; AI 30/min; admin export 10/min | Configurable (§12.1) |
| Messaging rate limits | Per-user outbound cap (e.g., 3–5 non-interactive/day); broadcast throughput throttling to provider limits | Configurable (§7.4.3) |

### 3.5 Staff Authentication and MFA (FR-101, NFR-018, AR-033)

| Control | Specification |
| --- | --- |
| Staff credential | Strong password with strong-hash storage (OAuth 2.0/OIDC-aligned, NFR-018) |
| MFA | Mandatory for all admin/privileged accounts (FR-101); MFA enforced before access to admin endpoints (§12.10, AR-033) |
| Session expiration | Staff sessions expire; idle timeout; FR-102 session controls apply to admin accounts |
| Access reviews | Periodic (quarterly) review of staff access and role assignments (§14.8 access control policies, §14.1.7) |
| Credential stuffing defense | Rate limiting + lockout + anomaly detection (§14.1.1 detection: failed-login counters, login anomaly detection) |

### 3.6 Authentication Decisions

| Attribute | Value |
| --- | --- |
| **Statement** | OTP is the father-user identity factor; MFA + strong password is the staff factor; all session state is stateless tokens + server-side revocation records. |
| **Source** | §14.6; FR-005; FR-101; FR-102; NFR-018; AR-033 |
| **Classification** | Confirmed |
| **Confidence** | High |
| **Reasoning** | The SRS separates user auth (OTP) from staff auth (password + MFA), mandates revocation-capable refresh tokens, and requires MFA on admin endpoints in both §12.10 and AR-033. |
| **Impact if changed** | Removing MFA for staff fails FR-101 (Must Have) and the §14.1.7 insider-threat mitigation; removing refresh rotation re-opens the §14.1.1 token-theft vector. |

---

## 4. Authorization

### 4.1 Authorization Model (FR-126, §14.1.2)

| Principle | Implementation |
| --- | --- |
| Server-side enforcement | RBAC + ownership checks evaluated on **every** data endpoint; client-side view hiding is cosmetic only (FR-126, §12.1) |
| Deny-by-default | No endpoint grants access by default; each requires an explicit role permission **and** an ownership/scope check (§14.1.2) |
| IDOR protection | Resource IDs are UUIDs (FR-009) but are never trusted; every `resource_id` in a request is validated against the caller's ownership/role scope before use (§14.1.2) |
| Field-level restriction | Response fields are trimmed per role (e.g., masked phone, no journal content for researcher views) (§14.1.2, FR-022, FR-099) |
| Attribute checks | Consented-only and scope-gated access for healthcare and research reads (§14.8, FR-040) |
| Segregation of duties | No single role may both author and medically approve content, or request and approve a research export (FR-106, §14.7) |

### 4.2 IDOR and Cross-User Protection Implementation

| Control | Specification |
| --- | --- |
| Ownership predicate | `users/me/*` endpoints bind to `sub` claim; no caller-supplied user id accepted on self endpoints (§12.3) |
| Partner scope | Checklist/budget/journal-share endpoints allow self **or** explicitly linked partner (`partner_user_id`, §13.3.3; FR-039/FR-146); journal stays private unless `shared_with_partner=true` (FR-052) |
| Admin scope | Admin endpoints require staff bearer + MFA; user lookup returns masked phone (§12.10, FR-022) |
| Research scope | Research dashboards operate only on anonymized/aggregated data (AR-032); research export is approver-gated (FR-116, §14.7) |
| Healthcare scope | Healthcare partner reads only journey data of users with explicit care-coordination consent (FR-040, §14.12) |
| Negative testing | Automated authorization test suite asserting `403`/`404` for cross-user, cross-role, and revoked-consent access attempts in CI (§14.1.2 detection; QR-007) |

| Attribute | Value |
| --- | --- |
| **Statement** | Authorization is enforced server-side on every request as a two-part check: role permission + ownership/scope predicate. |
| **Source** | FR-126; §14.1.2; §12.1; §14.8 access control policies |
| **Classification** | Confirmed |
| **Confidence** | High |
| **Reasoning** | FR-126's acceptance criterion requires denied access for unauthorized roles on every data request; §14.1.2 names ownership checks and deny-by-default explicitly; §12.1 confirms server-side authorization by role. |
| **Impact if changed** | Client-side-only authorization or permissive defaults fail FR-126 and map directly to OWASP A01 and the §14.1.2 tampering/elevation threat. |

### 4.3 Role Matrix (§14.7)

The SRS §14.7 permission matrix is reproduced verbatim as the controlling authorization contract:

| Role | Admin Dashboards | User Mgmt | Content Author | Medical Approve | Campaigns | Research Export | AI Ops | Support |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Father/User | No | Own profile | No | No | No | No | No | Own tickets |
| Researcher | Research only | No | No | No | No | Request + approve-gated | Read research | No |
| Healthcare Partner | Read journey (consented) | No | Suggest | Review (medical) | No | No | Read safety | No |
| Content Manager | Content | No | Yes | No | Yes | No | No | No |
| Administrator | Yes | Yes | Yes | No | Yes | No | Read | Yes |
| Super Administrator | Yes | Yes + manage roles | Yes | No | Yes | No | Full | Yes |

| Attribute | Value |
| --- | --- |
| **Statement** | The §14.7 matrix is the authorization contract and must be implemented as the canonical permission catalog, not re-interpreted per team. |
| **Source** | §14.7; FR-094; FR-106 |
| **Classification** | Confirmed |
| **Confidence** | High |
| **Reasoning** | §14.7 is explicit and is reinforced by FR-094 (RBAC portal) and FR-106 (no single role authors and approves, researcher export needs a separate approver). |
| **Impact if changed** | Any deviation (e.g., granting Researcher user management) fails the segregation-of-duties acceptance criteria of FR-106 and the insider-risk posture of §14.1.7. |

---

## 5. RBAC Implementation

### 5.1 Roles and Permission Catalog

Implementation maps §14.7 roles onto admin views (AR-030) and API groups (§12). Each role is a permission set; permissions are checked at gateway and service layers.

| Role | Admin views (AR-030 / §11) | Authorized API groups (§12) | Notes |
| --- | --- | --- | --- |
| **Father/User** | None (mobile/WhatsApp only) | Auth (§12.2), Profile (§12.3), Content read (§12.5), Checklist (§12.6), Budget (§12.7), AI ask (§12.8), Journal self (§12.9) | Self-scoped; own-profile-only admin surface (own tickets) |
| **Researcher** | Research dashboards only (AR-032, anonymized only) | `GET /v1/admin/reports` (research subset), `POST /v1/admin/research/export` (request-only; approval required) | Cannot view raw personal data; export approver-gated (§14.7, FR-116) |
| **Healthcare Partner** | Read journey (consented), AI safety read | `GET` consented journey data (FR-040), content suggest, medical review/approve actions (§12.5) | Read-scoped, consent-gated, role-limited (FR-040, §14.12) |
| **Content Manager** | Content/CMS, campaigns | Content CRUD + submit (§12.5), WhatsApp templates/campaigns (§12.4) | Cannot medically approve (FR-106) |
| **Administrator** | Executive dashboard, user mgmt, campaigns, audit read, support | Admin APIs (§12.10) with MFA; `GET /v1/admin/audit-logs` read-only | Cannot medically approve; research export requires separate approver |
| **Super Administrator** | All admin modules + role management | All admin APIs with MFA; audit-logs read; role assignment | Highest privilege; MFA mandatory (FR-101); quarterly access review (OR-019) |
| **AI Operations Admin** | AI ops dashboard (§11 AI module; FR-067) | `GET /v1/ai/conversations`, `GET /v1/ai/safety-events`, prompt management (§12.8) | Prompt changes versioned and approved (FR-068) |
| **Support Agent** | Support interface (FR-104) | `GET/POST /v1/admin/support/tickets`, WhatsApp message log (role-filtered) | Access with documented reason; read-scoped (FR-058 context) |

| Attribute | Value |
| --- | --- |
| **Statement** | Roles from §14.7 are implemented as explicit permission sets bound to views and API groups; new roles must be added to the catalog before use. |
| **Source** | §14.7; FR-094; §12.4/§12.5/§12.8/§12.10 endpoint authorization columns; AR-030; §11 admin modules |
| **Classification** | Confirmed (role set and matrix); Recommended (permission-to-API mapping) |
| **Confidence** | High |
| **Reasoning** | §14.7 fixes the role set; §12 endpoint tables specify per-endpoint authz (e.g., `Bearer + MFA` on admin, role-filtered on AI/support). AR-030 requires role-based modules. |
| **Impact if changed** | Adding roles or permissions without updating the matrix/catalog creates drift between the contract (§14.7) and enforcement, failing FR-106 and audit review (OR-019). |

### 5.2 Enforcement Points

| Enforcement point | Mechanism |
| --- | --- |
| API Gateway | Token validation, MFA assertion for admin routes, gateway rate limits (§12.1) |
| Service layer | Permission + ownership/scope predicate on every handler (FR-126); deny-by-default |
| Database | Role-separated DB credentials; research schema access restricted (AR-013); no app-level table writes outside service layer |
| Admin UI | Role-gated modules (AR-030) — cosmetic only, server enforces |
| Audit | Every authorization decision (grant and deny) logged for sensitive actions (§14.3, FR-127) |

### 5.3 Segregation of Duties (FR-106, §14.7)

| Rule | Enforcement |
| --- | --- |
| Author ≠ medical approver | Content submit (`/v1/content/:id/submit`) and approve (`/v1/content/:id/approve`) require different roles; the system blocks a single user from holding both actions on the same item (FR-106) |
| Research export requires separate approver | Researcher requests (`POST /v1/admin/research/export`); a different role approves; both events audited (FR-116, §14.7) |
| Role-management privilege isolated | Only Super Administrator assigns roles (§14.7); assignment events audited |

---

## 6. Encryption

### 6.1 In Transit (NFR-021, §14.2)

| Control | Specification |
| --- | --- |
| TLS version | TLS 1.2+ required; 1.3 preferred for all external and internal service communication (§14.2) |
| HSTS | Enabled on web endpoints (§14.2); enforce on admin/research portal |
| Cipher policy | Modern cipher suite allow-list; TLS termination at the gateway |
| Internal traffic | Service-to-service traffic encrypted (mTLS or network-policy-encrypted); §14.2 covers "all external and internal service communication" |
| Certificates | Managed certificates with rotation; no wildcard self-signed certs in production |

### 6.2 At Rest (§14.2, FR-123)

| Store | Control |
| --- | --- |
| PostgreSQL | Page-level/cloud-disk encryption (TDE or volume encryption) with KMS-managed keys (§14.2) |
| Object storage (media, exports) | Server-side encryption with managed keys; versioned (§14.2, §7.4.2) |
| Vector store | Snapshot encryption and at-rest encryption of the underlying store |
| Redis / queue | At-rest persistence encryption where enabled; used primarily for transient state |
| Backups | Encrypted at rest; restore procedures verify checksums (§19) |

### 6.3 Application-Level Encryption (phone_e164)

| Item | Specification |
| --- | --- |
| Field | `users.phone_e164` — "Unique, encrypted at rest; never used as PK" (§13.3.1) |
| Scheme | Application-level deterministic encryption (e.g., AES-256-GCM with a deterministic key derivation for uniqueness, or format-preserving/hash-index pattern) enabling unique lookup without plaintext storage |
| Key | Dedicated data-key under the KMS (§7), distinct from volume keys |
| Indexing | Uniqueness preserved via the deterministic encryption; phone never appears in URLs, logs, or media paths (§7.4.2 storage paths use anonymized user id) |

| Attribute | Value |
| --- | --- |
| **Statement** | The phone number is app-level encrypted at rest; the unique lookup is preserved without storing plaintext. |
| **Source** | §13.3.1 ("Unique, encrypted at rest; never used as PK"); §14.2 ("application-level encryption for sensitive fields (e.g., phone number)") |
| **Classification** | Confirmed (requirement); Recommended (deterministic AES-GCM scheme) |
| **Confidence** | High |
| **Reasoning** | The SRS is explicit that the phone is encrypted at rest and never a primary key. Deterministic encryption (or a derived-lookup key) is the standard way to preserve the unique constraint while meeting FR-009 (UUID primary key, phone never primary key) and FR-022 (phone never exposed). |
| **Impact if changed** | Plaintext phone storage fails §13.3.1/§14.2, elevates the §14.1.3 data-leakage risk, and would require a re-encryption migration. |

### 6.4 Media Encryption (§14.2, §7.4.2)

| Control | Specification |
| --- | --- |
| Media at rest | All voice/photo/document media encrypted at rest with managed keys (§14.2, §7.4.2) |
| Media in transit | TLS to/from object storage; provider media download via authenticated provider API (§7.4.2 workflow step 2) |
| Delivery | Signed, expiring URLs only; no public media endpoints (§7.4.2, §14.1.3) |
| Storage paths | `s3://<bucket>/media/{voice,photo}/<anonymized_user_id>/<message_id>.<ext>` — never keyed by phone number (§7.4.2) |

### 6.5 Mobile Local Encryption (AR-027, ADR-004)

| Control | Specification |
| --- | --- |
| Local store | SQLite local-first store (ADR-004) with encrypted database for sensitive data (AR-027) |
| Keystore | Android Keystore / iOS Keychain for local secrets and token storage (AR-027) |
| Tokens | Access/refresh tokens stored only client-side in secure storage (§14.6); never in shared prefs/logs |
| Media cache | Cached media kept within the encrypted app sandbox |

---

## 7. Key Management

### 7.1 Strategy (NFR-022, §14.2)

| Attribute | Value |
| --- | --- |
| **Statement** | Use a cloud KMS (e.g., AWS KMS / GCP KMS) or a self-hosted secret manager; keys rotate on schedule; secrets never in code, images, config, or logs. |
| **Source** | §14.2 (Recommended); NFR-022 (Confirmed: rotation + no secrets in source control, images, or logs) |
| **Classification** | Recommended (KMS choice); Confirmed (rotation + no-secrets rule) |
| **Confidence** | High |
| **Reasoning** | NFR-022 is a Must-Have with explicit acceptance criteria. KMS gives managed key lifecycle, IAM-separated access, and audit for the encryption strategy of §14.2. |
| **Impact if changed** | Keys stored in plaintext config or containers fail NFR-022's acceptance criteria and re-open §14.2/§14.1.3. |

### 7.2 Key Inventory

| Key / Secret | Purpose | Rotation (configurable) |
| --- | --- | --- |
| TLS certificate private keys | Transport encryption | Per certificate policy (e.g., ≤90 days, auto-renew) |
| DB encryption keys (volume/TDE) | PostgreSQL at-rest encryption | Per provider policy; periodic re-key |
| Object-storage encryption keys | Media/exports at rest | Per provider policy |
| App-level data key (phone encryption) | `phone_e164` field encryption | Periodic; deterministic scheme keeps ciphertext stable across rotation |
| JWT signing keys (RS256/ES256) | Access-token signing | Short-interval rotation with overlapping validity (token `kid` header) |
| JWT verification keys | Gateway verification | Matches signing key rotation |
| WhatsApp app secret | Webhook `X-Hub-Signature-256` HMAC (§7.4.1) | Scheduled rotation with dual-active secret window |
| WhatsApp verify token | GET handshake (§7.4.1) | Scheduled rotation |
| Provider API credentials | WhatsApp/LLM/ASR/notification providers | Per provider policy; scheduled rotation |
| OTP signing/derivation secret | OTP generation/verification | Scheduled rotation |
| Database application credentials | Service → DB access | Role-separated; scheduled rotation |
| Message-bus / cache credentials | Queue, Redis | Scheduled rotation |

| Attribute | Value |
| --- | --- |
| **Statement** | A complete secrets inventory is maintained with an owner, purpose, scope, and rotation schedule per entry. |
| **Source** | NFR-022; §14.2; §7.4.1 (app secret, verify token); §14.6 (JWT signing) |
| **Classification** | Recommended (inventory structure and rotation cadences) |
| **Confidence** | High |
| **Reasoning** | NFR-022 demands scheduled rotation and no secrets in code/images/logs; an inventory is the operational prerequisite for that audit. Rotation windows are operational parameters and therefore configurable. |
| **Impact if changed** | An incomplete inventory makes rotation audits (NFR-022) and the incident-response key-revocation step (§14) unverifiable. |

### 7.3 Secrets Controls

| Control | Specification |
| --- | --- |
| Secret storage | KMS / secret manager; injected at runtime via environment references resolved by the secrets service; never committed |
| CI/CD | Secret scanning in pipelines and pre-commit; no secrets in build logs; branch-protection on secret-bearing config |
| Rotation | Dual-active (overlapping) rotation for webhook secrets to avoid signature gaps during rollout (§7.4.1); JWT keys rotated with `kid`-based key selection |
| Emergency rotation | On compromise or incident, immediate revocation and rotation of affected keys (§14 incident response) |
| Access control | Least-privilege IAM per service; secrets access itself audited |
| Logs | Redaction policy: tokens, OTPs, keys, and PII are scrubbed from application and security logs (§14.3, §12.1) |

---

## 8. Audit Logging

### 8.1 audit_logs Table (§13.3.24)

The canonical audit store is the append-only `audit_logs` table:

| Column | Notes |
| --- | --- |
| `id` | bigserial PK |
| `actor_user_id` | FK → users.id, nullable for system actors |
| `action` | e.g., `user.update`, `consent.withdraw`, `export.request` |
| `resource_type` / `resource_id` | Target of the action |
| `ip` / `user_agent` | Context |
| `result` | `success` / `denied` / `error` |
| `created_at` | timestamptz; indexed along with `action` |

Constraints: **append-only (no update/delete)**; indexes on `created_at` and `action` (§13.3.24).

### 8.2 Append-Only and Tamper-Evidence (NFR-023, §14.3)

| Control | Specification |
| --- | --- |
| Append-only | DB triggers/roles forbid UPDATE/DELETE on `audit_logs`; the application has no audit-write API exposed to services with update/delete ability (§13.3.24) |
| Tamper-evidence | Hash-chained or signed log entries (each entry carries a hash of the previous entry) or an immutable log sink; verify integrity on a schedule |
| Time sync | Logs are time-synced (NTP) for reliable forensics (§14.3) |
| Retention | Audit logs retained per compliance policy (§18.1); configurable, with no truncation before the retention window |
| Access | Read-only audit role for auditors (OR-019); no role can edit audit records (§14.7) |

### 8.3 Events That MUST Be Logged (§14.3, FR-127)

| Event class | Examples |
| --- | --- |
| Authentication & security | Failed OTP attempts, token reuse alarms, MFA events, signature mismatches, denied access, lockouts (§14.1 detection) |
| Admin actions | User status changes, role assignments, template approvals, campaign operations (§14.3, FR-098) |
| Consent lifecycle | Grant, version change, withdrawal, re-consent (§14.3, FR-100, AR-012) |
| Exports | Personal-data export, research dataset export, report exports (FR-127, FR-116) |
| Deletion | Account-deletion requests, grace-period completion, purge jobs (FR-007, FR-105, §14.8) |
| Sensitive-data access | Access to journal, voice, health data, phone — identity, timestamp, reason, result (FR-127) |
| AI governance | Prompt changes, model changes, safety events (§14.11, FR-069) |
| Data retention purges | Automated purge runs and their scope (FR-105, §13 retention) |

### 8.4 No-PII-in-Logs Rule (§14.3, §12.1)

| Rule | Implementation |
| --- | --- |
| No message content | Logs carry no message body beyond what the action requires; `ai_conversations` stores pseudonymized content in the DB, not in operational logs (§14.3, §13.3.20) |
| No PII | Phone numbers, names, and tokens scrubbed from application and security logs (§14.3, §12.1, §18.2 error tracking "no PII") |
| Correlation | Events reference internal UUIDs and resource ids, never phone numbers (§14.3, FR-009) |
| AI logs | `ai_conversations.question` stored **pseudonymized** (§13.3.20); prompts/sources/safety flags recorded for governance (FR-069, AR-020) |

### 8.5 Retention (§18.1)

| Log type | Retention (configurable) |
| --- | --- |
| Application logs | 30 days |
| Security logs (auth failures, signature mismatches, denied access) | 1 year |
| AI interaction logs | Per governance policy |
| Audit logs (immutable) | Per compliance policy |

---

## 9. Privacy Controls

### 9.1 Data Minimization (FR-124, §14.5)

| Control | Specification |
| --- | --- |
| Field inventory | Every collected field traced to an approved purpose; no field exceeds the collection purpose (FR-124 acceptance criterion) |
| Collection review | Design reviews confirm minimization (§14.5, NFR-025) |
| Optional fields | Non-essential fields (e.g., name beyond phone) are optional (§13.3.2) |
| Profiles split | Non-identifying attributes in `profiles`; phone only in encrypted `users` (FR-002, §13.3.1–2) |

### 9.2 Consent Lifecycle (FR-125, §14.8)

| Stage | Implementation |
| --- | --- |
| Capture | Plain-language Terms & Privacy presented at registration; explicit acceptance required before enrollment (FR-003, UC-001) |
| Versioning | `consents.version` records the template version; `consent_type` ∈ participation / research / media / whatsapp_opt_in (FR-117, §13.3.4) |
| Re-consent | Template or purpose change triggers re-consent before new processing (§14.8) |
| Withdrawal | `POST /v1/users/me/consents/:id/withdraw`; state → `withdrawn`; non-essential processing stops; audit records preserved (FR-004, §13.3.4, §12.3) |
| Proof | Immutable, versioned, timestamped consent events linked to user (AR-012); consent views in admin (FR-100) |
| Opt-in enforcement | Broadcasts only to `whatsapp_opt_in` users; opt-out removes immediately (FR-017, FR-112) |

### 9.3 Data Subject Rights (FR-128, NFR-026)

| Right | Implementation path | SLA (configurable) |
| --- | --- | --- |
| Access | `GET /v1/users/me`, consents view, self-service | Within defined SLA |
| Rectification | `PATCH /v1/users/me`, pregnancy update | Within defined SLA |
| Erasure | `DELETE /v1/users/me` — request → confirmation → grace period → deletion → deletion record (FR-007, §14.8) | Within defined SLA |
| Portability | `POST /v1/users/me/export` → PDF/JSON delivered securely (FR-057, UR-003) | Within defined SLA |
| Restriction | Consent withdrawal restricts non-essential processing (FR-004); research use restricted on research-consent withdrawal | Within defined SLA |
| Deletion of media | Secure deletion including media and copies with verification where required (NFR-024, FR-105) | Within defined SLA |

### 9.4 Data Classification (§14.8)

| Class | Examples | Handling |
| --- | --- | --- |
| Public | Marketing content | No restriction |
| Internal | Analytics aggregates | Role-gated |
| Confidential | Profiles, consent, journey | Encrypted; least privilege |
| Highly Confidential | Journal, voice, health info | Encrypted; ownership-scoped; audit-logged |

Retention rules are configured **per data class** with automated purge + audit (FR-105, §14.8, AR-014).

### 9.5 Pseudonymization of Research Data (FR-119, NFR-027)

| Control | Specification |
| --- | --- |
| At collection | De-identification/pseudonymization at the point of collection (FR-119) |
| Separation | Research data physically/logically separated and restricted (AR-013); `research_users` holds only anonymized cohort identities (FR-122, §13.3.23) |
| Linkage keys | Access-controlled linkage keys; direct identifiers removed before analytic use/export (NFR-027) |
| Research dashboards | Operate only on anonymized/aggregated data (AR-032, FR-115) |
| Exports | Ethics/approval-gated, de-identified, aggregated, fully audited (FR-116) |
| Research consent | Participation, research, and media consents are separate and independently revocable (FR-117) |

### 9.6 DPIA and Processing Register (FR-132, NFR-028)

| Artifact | Scope |
| --- | --- |
| DPIA | Completed and recorded before go-live for high-risk processing (FR-132, NFR-028) |
| Record of processing activities | Maintained, lawful bases documented (NFR-028, OR-022) |
| Third-party DPAs | Executed with WhatsApp, LLM/embedding, ASR, and cloud processors before data flows (NFR-029, FR-073) |
| Transfer compliance | Cross-border data transfers comply with applicable law (NFR-029) |

---

## 10. AI Security

### 10.1 Prompt Injection Defenses (§14.1.4)

| Control | Implementation |
| --- | --- |
| Input safety classification | Every inbound message classified before routing (§9.4 step 2, FR-062, FR-064) |
| System-prompt hardening | Delimiters and explicit grounding instructions; system prompt is versioned/approved content (FR-068, §9.5) |
| Output safety layer | Medical safety validation layer on every outbound answer before delivery (§9.4 step 8, FR-065, AR-006) |
| RAG grounding only | Answers grounded in approved chunks only; decline ungrounded health topics with referral (FR-061, C-01, §9.5) |
| No tool access from user text | User text can never invoke tools or change system behavior (§14.1.4) |
| Ingested-content vetting | Knowledge documents pass review/approval before indexing (FR-070, AR-015); retired documents deactivated (FR-080) |
| Injection test suite | Prompt-injection/jailbreak regression suite; injected-content tests in CI (§14.1.4 detection, QR-011/QR-014) |

### 10.2 Jailbreak and Safety Testing

| Test | Purpose |
| --- | --- |
| Jailbreak suite | Attempted system-instruction override, role-play escape, indirect-injection via media/transcribed voice |
| Safety regression | Emergency keywords always trigger emergency handling regardless of phrasing (FR-063, §9.6) |
| Evaluation set | ≥90% accuracy target on the evaluation set (NFR-047, configurable); source citation or decline enforced (NFR-048) |
| Hallucination monitoring | Sampling and scoring vs ground truth with alerting (FR-071, NFR-050) |

### 10.3 AI Audit Trail (FR-069, AR-020)

Persisted to `ai_conversations` (§13.3.20): `user_id`, `prompt_version`, `model`/`provider`, **pseudonymized** `question`, `answer`, `sources` (jsonb), `safety_status` (normal/flagged/emergency), `latency_ms`/`tokens`, `created_at`. Model registry and prompt versions are tracked for reproducibility (§14.11, AR-020).

### 10.4 AI Governance (§14.11, NFR-049)

| Area | Requirement |
| --- | --- |
| AI limitations | Disclosed; enforced by medical safety layer (§14.10, NFR-046) |
| Human oversight | AI ops dashboard, conversation review, review queues (FR-067, OR-020) |
| Prompt versioning | Versioned, approved prompt library (FR-068) |
| Model version tracking | Model registry in audit records (FR-069) |
| Bias monitoring | Fairness review on themes/responses; sampled reviews (§14.11) |
| Model update approval | Model change requires approval before routing (NFR-049, §14.11) |
| No-PHI to providers | Pseudonymization + DPA before any provider call (FR-073, AR-019, NFR-029) |

### 10.5 Emergency Safety (FR-063, §9.6, §15.3)

| Control | Specification |
| --- | --- |
| Emergency detection | Keyword set (bleeding, fits/seizure, unconsciousness, severe headache, blurred vision, baby not moving, water breaking, premature labor, severe pain, high fever) + classifier score (configurable, §9.6) |
| Priority | Emergency short-circuits RAG and normal answering; bypasses quiet hours (FR-046, §9.6) |
| Response | Urgent facility-care guidance from approved content; never diagnose/prescribe (FR-063, §14.10, C-01) |
| Escalation | Safety event → AI ops dashboard + on-call reviewer; follow-up checks at 5-min intervals per policy (§9.6, §15.3, FR-065) |
| Offline | Emergency/danger-sign content pre-cached offline (FR-135, FR-089) |

---

## 11. Webhook Security

### 11.1 Signature Validation (§7.4.1, §14.1.5, §12.4)

| Step | Specification |
| --- | --- |
| Header | `X-Hub-Signature-256: sha256=<hex>` (§7.4.1, §12.4) |
| Computation | HMAC-SHA256 of the **raw request body** with the configured app secret (§7.4.1) |
| Comparison | Constant-time comparison (never short-circuit on length/prelude) (§7.4.1, §14.1.5) |
| Reject | Mismatch → `401`, security event logged, no processing (§7.4.1) |
| Ack | Valid → `200` acknowledged **before** async processing (§7.4.1, §12.4) |
| GET handshake | `hub.verify_token` compared constant-time; echo `hub.challenge` on match, `403` otherwise (§7.4.1) |
| Secret rotation | Dual-active (overlapping) secret rotation so signatures never gap (§14.1.5, §14.2) |

### 11.2 Replay and Idempotency Protection (§14.1.5, §12.1)

| Control | Specification |
| --- | --- |
| Idempotency keys | Writes accept idempotency keys; duplicate message IDs deduplicated (§7.4.1, FR-161, FR-153) |
| Replay detection | Message-ID seen-set (persisted) rejects reprocessing of the same message (§14.1.5 detection: duplicate message-ID detection) |
| TLS | Webhook endpoint served only over TLS (§14.1.5) |
| Error handling | Invalid JSON → `400`; signature mismatch → `401`; unhandled → log + `500` with retry policy (§7.4.1) |

| Attribute | Value |
| --- | --- |
| **Statement** | Every webhook request is cryptographically verified with constant-time HMAC comparison before any processing; replay and duplicates are blocked by idempotency. |
| **Source** | §7.4.1 (Confirmed validation flow); §14.1.5; §12.4 (Confirmed: "HMAC-SHA256 of raw body with app secret; constant-time comparison; reject 401 on mismatch") |
| **Classification** | Confirmed |
| **Confidence** | High |
| **Reasoning** | The webhook validation flow is specified step-by-step as Confirmed in the SRS, including the exact header, comparison method, and error codes. |
| **Impact if changed** | Loose or non-constant-time comparison fails §12.4/§7.4.1, allows signature forgery, and re-opens the §14.1.5 spoof/replay threat. |

---

## 12. File/Media Security

### 12.1 Malware and Type/Size Validation (§14.1.8, §7.4.2, AR-023)

| Control | Specification |
| --- | --- |
| Media types | Voice: AAC/OGG/MP3 (as delivered by provider; audio/opus variants); photos: JPG/PNG (§7.4.2) |
| Size limits | Voice ≤ 16 MB (configurable), rejected above with helpful message; photos compressed before storage (§7.4.2) |
| Malware scan | Every uploaded/downloaded file scanned on arrival before storage (FR-019, §14.1.8, AR-023) |
| Quarantine | Scan failures quarantined and alerted; scan results logged (§14.1.8 detection) |
| No execution | No executable content executed; uploads stored inert and served only via signed URLs (§14.1.8) |
| Processing order | Download via provider → validate type/size → scan → compress → store (§7.4.2 workflow) |

### 12.2 Isolated Storage and Access Control (§14.1.8, §7.4.2)

| Control | Specification |
| --- | --- |
| Isolation | Media in a dedicated object-storage bucket with no public access; separate from app binaries and exports |
| Paths | `media/{voice,photo}/<anonymized_user_id>/<message_id>.<ext>` — never phone-number-keyed (§7.4.2) |
| Encryption | Encrypted at rest with managed keys (§14.2, §7.4.2) |
| Access | Owner + explicitly authorized roles (support with documented reason); signed expiring URLs for delivery (§7.4.2, FR-019, §14.1.3) |
| Retention | Media deletion follows data-class retention and user-deletion workflows (FR-105, FR-007, NFR-024) |

### 12.3 Photo Compression (§7.4.2)

| Parameter | Value (configurable) |
| --- | --- |
| Max dimension | e.g., 1600 px |
| Quality | e.g., JPEG quality 80 |
| Purpose | Control bandwidth/storage cost (FR-137 low-bandwidth) before storage |
| Post-compression | Optional consent-aware AI tagging (e.g., "hospital bag", "document") (§7.4.2) |

---

## 13. OWASP Top 10 Mapping

The SRS §14.4 mapping is reproduced and extended with concrete implementation controls and test gates.

| OWASP 2021 | SRS control (§14.4) | Implementation controls | Verification |
| --- | --- | --- | --- |
| A01 Broken Access Control | Server-side RBAC + ownership checks (FR-094, FR-126) | §4 denial-by-default, ownership predicates, field-level trimming, segregation of duties | Authorization test suite in CI (§14.1.2); negative IDOR tests |
| A02 Cryptographic Failures | Encryption at rest/in transit; key management (FR-123, NFR-021) | §6 TLS 1.2+/1.3 + HSTS; at-rest DB/object/vector; app-level `phone_e164`; §7 KMS | Encryption audits; scan config; key-rotation checks |
| A03 Injection | Parameterized queries; input validation; LLM output encoding (FR-129) | ORM/parameterized SQL only; strict input validation; LLM output treated as data and encoded; sanitize rendered AI text | DAST + injection fuzzing (QR-007); AI output encoding tests |
| A04 Insecure Design | Threat modeling, DPIA, security design reviews (FR-130, FR-132) | §2 trust zones; §14.1 STRIDE baseline; DPIA per FR-132; design-review gate on significant changes | Threat-model review before release (NFR-019); DPIA records |
| A05 Security Misconfiguration | IaC, least privilege, security hardening baselines (NFR-017) | §2.3 IaC + drift detection; hardening baselines; least-privilege IAM; CORS allow-list (§12.1) | Baseline compliance scans; IaC policy checks (QR-007) |
| A06 Vulnerable Components | Dependency scanning; patching cadence (FR-129, NFR-016) | CI dependency/SCA scan; patch cadence; supply-chain scanning (§14.4 A08) | SCA gate blocks build on critical/high (NFR-016) |
| A07 Identification/Auth Failures | OTP, MFA, token lifecycle (NFR-018, FR-101) | §3 OTP rate-limit/lockout, MFA staff, token rotation, session controls | Auth test suite (QR-009); rate-limit tests |
| A08 Software/Data Integrity | Signed webhooks; idempotency; immutable audit logs; supply-chain scanning (NFR-023) | §11 HMAC constant-time webhooks; idempotency keys; §8.2 append-only audit; artifact signing/SBOM | Webhook security tests; audit-integrity checks; SBOM verification |
| A09 Logging/Monitoring Failures | Centralized observability; security alerts (FR-131, FR-166) | §8 audit/security logging; §14 detection alerts; centralized observability (FR-166, OR-007) | Alert-trigger tests; log-completeness review |
| A10 SSRF | Network isolation; allow-listed egress; SSRF test coverage (NFR-020) | §2.2 zone isolation; egress allow-list for providers; no user-controlled URLs fetched server-side; signed-URL delivery | SSRF test suite (QR-007); egress policy review |

---

## 14. Incident Response

### 14.1 Framework (FR-131, OR-009)

| Phase | Activities |
| --- | --- |
| **Detection** | Security alerting (§18.3: auth failures, signature mismatches, denied access, cost thresholds); anomaly detection on login/token reuse (§14.1.1); scan/alarm on quarantine (§14.1.8); rate-limit and cost alerts (§14.1.6) |
| **Triage** | Severity classification (S1–S4); on-call security/ops initial assessment; runbook selection |
| **Containment** | Revoke compromised tokens/keys (token-version bump, §3.3); suspend affected accounts; isolate/quarantine infected media; disable affected credentials; block offending IPs/WAF rules |
| **Eradication** | Remove malware/quarantined objects; patch vulnerable component; rotate exposed secrets (§7.3) |
| **Notification** | Notify affected users, the program, and regulators per legal/DPIA-derived obligations (§14.8 breach response; §1.10 no self-claimed certification — notification scope to be confirmed with legal review, NFR-041) |
| **Post-incident review** | Root-cause analysis, action tracking, audit-log completeness review, runbook updates (OR-009) |

### 14.2 Incident Classes and Response Runbooks

| Class | Trigger | Runbook outline |
| --- | --- | --- |
| Account takeover | Token-reuse alarm, failed-OTP spikes, login anomaly | Revoke all sessions (token version bump); verify OTP/MFA; notify user; review accessed records; audit |
| Data breach / leakage | PII/health data disclosed | Contain storage/export; assess scope via access logs; notify per policy; DPIA-driven legal review; post-incident review |
| Prompt-injection / harmful AI output | Safety-layer violation, unsafe answer reported | Pull answer from delivery; add to safety regression; AI ops review; prompt/knowledge update via approval (FR-068) |
| Webhook signature attack | Signature-mismatch alert spike | Verify secret rotation; block source; replay dedup review; audit |
| Malware upload | Scan/quarantine alert | Quarantine object; scan blast radius; remove artifacts; patch scanner rules; audit |
| API abuse / DoS | Rate-limit counters, cost spike | WAF/rate-limit escalation; quota enforcement; bot/CAPTCHA; cost alert; review harvest scope |
| Insider misuse | Anomalous access pattern, audit anomaly | Suspend access; preserve audit trail; HR/legal process per policy; quarterly review (OR-019) |
| AI model/provider incident | Provider outage, model anomaly | Failover per ADR-005 (§9.8); track as AI incident (OR-010); re-approve model routing if changed (NFR-049) |

### 14.3 Roles

| Role | Responsibility |
| --- | --- |
| On-call engineer | First responder; triage and containment (OR-001) |
| Security lead | Incident commander; forensics; notification coordination |
| Program/DPO contact | Legal/regulator/user notification per policy |
| AI ops reviewer | AI-safety incident review queue (FR-067, OR-010) |
| Communications | User/stakeholder communication per plan (OR-029) |

| Attribute | Value |
| --- | --- |
| **Statement** | A documented, role-based incident-response process covers detection through post-incident review for all §14.1 threat classes. |
| **Source** | FR-131; OR-009; §18.3 alerting; §14.1 per-threat detection rows |
| **Classification** | Confirmed (process requirement); Recommended (runbook inventory) |
| **Confidence** | High |
| **Reasoning** | FR-131 mandates logging, alerting, containment, notification, and post-incident review; OR-009 specifies the structured process; §18.3 defines the alert set. |
| **Impact if changed** | Missing runbooks for a threat class leaves that class's detection without a response path, failing FR-131 and NFR-019. |

---

## 15. Security Testing

### 15.1 Test Types and Schedule (QR-007, NFR-019, FR-130)

| Test | Tool class (Recommended) | Cadence | Gate |
| --- | --- | --- | --- |
| SAST | Static analysis in CI | Every PR / commit | Block critical/high findings |
| DAST | Dynamic scanning against staging | Every release candidate; continuous crawl | Zero critical/high |
| Dependency/SCA | Dependency + SBOM scan | Every build; continuous | Block critical/high (NFR-016, A06) |
| Secret scanning | Repo + CI log scanning | Every commit / push | Block on any secret (NFR-022) |
| Container/image scan | Image vulnerability scan | Every image build | Block critical/high |
| Penetration test | External test team | At least annually and before major releases (NFR-019); pre-launch mandatory (QR-013, FR-130) | All critical/high remediated or risk-accepted by security lead |
| Threat modeling | STRIDE review | On significant changes; annually refreshed (§14.1, NFR-019) | Identified risks documented, prioritized, remediated per policy |
| AI security eval | Eval set + safety regression + jailbreak suite | Every AI/prompt/model release (QR-014) | ≥90% accuracy target; no safety regressions |
| Privacy testing | Consent, minimization, export, deletion, pseudonymization (QR-009) | Pre-release and per major feature | All privacy flows verified |

### 15.2 Attack-Class Coverage (NFR-020)

Mandatory test coverage: injection, cross-site scripting, CSRF, SSRF, insecure deserialization, and abuse/rate-limit bypass — each with explicit test cases in the security suite.

### 15.3 Release Gates (QR-013, NFR-016)

| Gate | Requirement |
| --- | --- |
| Security scans | SAST + DAST + SCA + image + secret all green (zero critical/high) |
| Penetration test | Pre-launch penetration test complete; findings resolved |
| AI releases | Pass evaluation set + safety regression (QR-014) |
| Threat model | Current STRIDE model reviewed against changes |
| Clinical review | Health content/AI answers clinically reviewed (QR-013, OR-021) |
| Rollback readiness | Dashboards, alerting, rollback verified (QR-016) |

---

## 16. Dependencies and Blockers

| # | Dependency | Type | Reason | Blocked control |
| --- | --- | --- | --- | --- |
| D-1 | Cloud KMS / managed secret manager availability in the chosen region | External (Confirmed, D-03) | §14.2/§7 require managed key lifecycle | §6 encryption, §7 key management |
| D-2 | MFA/OTP SMS provider with Ethiopian reach and reasonable cost | External | OTP delivery is the confirmed user-auth factor (§12.2, §7.4.3) | §3 authentication |
| D-3 | Penetration-testing vendor and schedule pre-launch | Procurement | QR-007/FR-130/NFR-019 mandate pen test before release | §15 release gates |
| D-4 | Legal review of privacy/DPIA and breach-notification scope | Program (Confirmed, NFR-041, FR-132) | SRS makes no certification claims (§1.10); notification scope must be confirmed | §14 notification, §9.6 DPIA |
| D-5 | DPA execution with WhatsApp, LLM/embedding, ASR, and cloud processors | External (Confirmed, NFR-029) | No data flows to processors without executed DPA | §9.6, §10.4, §7.2 |
| D-6 | Research ethics approval for research data use | Program (Confirmed, D-05) | Research export/analytics depend on consent + ethics (FR-116, §14.12) | §9.5 research pseudonymization |
| D-7 | TLS certificates and managed-CA issuance pipeline | Infrastructure | TLS 1.2+/1.3 + HSTS everywhere (§14.2) | §6.1 in transit |
| D-8 | Malware-scanning service availability for media uploads | External | §14.1.8/AR-023 require scanning on upload | §12 file/media security |

---

## 17. Risks and Mitigations

| # | Risk | Likelihood | Impact | Mitigation |
| --- | --- | --- | --- | --- |
| R-1 | OTP interception/SMS fraud in target region (§14.1.1) | Medium–High | Account takeover | Rate limits (5/15 min), expiry, lockout, device fingerprint, anomaly detection; admin accounts additionally MFA (FR-101) |
| R-2 | AI prompt injection / jailbreak (medium–high) | Medium–High | Unsafe responses | §10 input/output safety layers, grounded-only RAG, no tool access from user text, injection regression suite (§14.1.4) |
| R-3 | API abuse and cost spikes (AI/messages) | High | Cost, degraded service | §12.1 rate limits (120/30/10 per min), §7.4.3 messaging caps, WAF, quotas, cost alerts (§14.1.6) |
| R-4 | Webhook spoofing/replay | Medium | False emergencies, data pollution | §11 HMAC constant-time validation, idempotency, replay dedup, secret rotation (§14.1.5) |
| R-5 | Malicious media uploads | Medium | Malware on storage | §12 type/size validation, malware scan on upload, isolated bucket, no execution, quarantine alerts (§14.1.8) |
| R-6 | Insider misuse (researcher/admin/support) | Low–Medium | Privacy breach, research contamination | Least privilege, MFA, segregation of duties (FR-106), read-only audit roles, data-access justification, quarterly reviews (§14.1.7) |
| R-7 | Data leakage via logs/exports/third parties | Medium | Privacy breach, regulatory exposure | No-PII-in-logs rule (§8.4), signed expiring URLs, pseudonymization (§9.5), DPA enforcement (NFR-029), DLP reviews (§14.1.3) |
| R-8 | Key/secret compromise or rotation failure | Low–Medium | Encryption compromise, webhook forgery | §7 KMS, dual-active rotation for webhook secrets, emergency rotation path, secret scanning (NFR-022) |
| R-9 | Broken access control / IDOR regression | Medium | Cross-user data access | §4 ownership predicates, deny-by-default, negative authorization tests in CI (§14.1.2) |
| R-10 | Non-compliance exposure from self-claimed certification | Medium | Legal/regulatory | SRS §1.10 discipline: "designed to support alignment," legal review before launch (NFR-041), DPIA register (FR-132) |
| R-11 | Retention/purging errors on sensitive data | Medium | Retention violations or premature deletion | Per-class retention config (FR-105), automated purge with audit (§13), NFR-024 verifiable deletion |
| R-12 | Emergency escalation failure | Low | Safety harm | §9.6/§15.3 workflow, follow-up checks, admin/on-call alerting, offline danger-sign content (FR-135), §18.3 alert for escalation failures |

---

## 18. Verification Approach

### 18.1 Requirement-to-Control Verification

| Control area | Verified by | Method |
| --- | --- | --- |
| §2 Defense-in-depth / zones | NFR-017, NFR-020, A10 | Architecture audit, egress-policy review, zone-map inspection |
| §3 Authentication | FR-005, FR-101, FR-102, NFR-018, §12.2 | Auth integration tests: OTP flow, lockout, rate limit `429`, refresh rotation, reuse revocation, MFA enforcement |
| §4/§5 Authorization & RBAC | FR-126, FR-094, FR-106, §14.7 | Authorization matrix tests; negative IDOR tests; segregation-of-duties blocking tests |
| §6/§7 Encryption & keys | FR-123, NFR-021, NFR-022, §14.2 | TLS scan, at-rest encryption verification, `phone_e164` ciphertext audit, key-rotation checks |
| §8 Audit logging | NFR-023, FR-127, §13.3.24, §18.1 | Integrity hash verification, append-only enforcement test, event-catalog coverage, retention checks |
| §9 Privacy | FR-124…125, FR-128, FR-119, FR-132, NFR-025…029 | Privacy test suite (QR-009): consent lifecycle, subject rights, pseudonymization, DPIA artifacts |
| §10 AI security | FR-062…073, NFR-046…050, QR-011/QR-014 | AI eval set, safety regression, jailbreak suite, audit-record completeness (`ai_conversations`) |
| §11 Webhook | §7.4.1, §12.4, §14.1.5 | Signature valid/mismatch/absent tests, constant-time behavior, replay dedup, secret rotation window test |
| §12 File/media | §14.1.8, AR-023, §7.4.2 | Type/size rejection, malware-scan injection, quarantine, signed-URL expiry, compression verification |
| §13 OWASP | FR-129, NFR-020, QR-007 | SAST/DAST/SCA results, attack-class test suite, pen-test report |
| §14 Incident response | FR-131, OR-009 | Tabletop exercises per runbook class; alert-trigger tests; post-incident review artifacts |
| §15 Security testing | QR-007, QR-013, QR-014, NFR-019 | Release-gate evidence: scan reports, pen-test sign-off, AI eval results |

### 18.2 Tooling

| Layer | Tool class | Evidence artifact |
| --- | --- | --- |
| SAST | Static analyzer in CI | Scan report per commit/PR |
| DAST | Dynamic scanner on staging | Scan report per release candidate |
| SCA / SBOM | Dependency scanner | Vulnerabilities + SBOM manifest |
| Secret scanning | Repo/CI secret scanner | Clean scan on push |
| Container scanning | Image vulnerability scanner | Image scan report per build |
| Penetration testing | External team | Pen-test report + remediation tracker |
| AI evaluation | Eval harness + safety regression | Eval scores, safety-pass report |
| Audit integrity | Hash-chain verifier | Integrity verification log |

### 18.3 Acceptance Criteria (go-live)

| Criterion | Requirement source |
| --- | --- |
| Zero critical/high vulnerabilities open at release | NFR-016, FR-129 |
| All §14.1 STRIDE mitigations implemented and tested | FR-130, §14.1 |
| Authorization matrix fully enforced server-side; segregation-of-duties blocks verified | FR-106, FR-126, §14.7 |
| Audit logs append-only, tamper-evident, and complete for the §8.3 event catalog | NFR-023, §14.3 |
| Consent lifecycle and subject-rights flows verified end-to-end | FR-125, FR-128 |
| Webhook HMAC validation and idempotency verified (valid/mismatch/replay cases) | §7.4.1, §12.4 |
| Media malware scan, quarantine, and signed-URL delivery verified | §14.1.8, AR-023 |
| AI safety layer and audit trail verified (emergency, jailbreak, grounding) | FR-062…073, QR-014 |
| DPAs executed and DPIA/processing register current before go-live | NFR-028, NFR-029, FR-132 |
| Incident-response runbooks exercised via tabletop; roles assigned | FR-131, OR-009 |

---

*End of document. This plan is a planning artifact only and contains no application code.*
