# 10. Admin Dashboard Development Plan

**Source:** `docs/FathersNet-Complete-SRS.md` (FN-SRS-001 v2.0) — authority for the Admin Dashboard Specification (§11), Admin APIs (§12.10), API conventions (§12.1), Roles & Permission Matrix (§14.7), Authentication/Authorization Architecture (§14.6), Audit Logging (§14.3), Web/Admin Architecture Requirements (AR-030…AR-035), Admin Portal functional requirements (FR-094…FR-106), Campaigns (FR-107…FR-112), Research/Evidence (FR-113…FR-122), and AI Operations (FR-067…FR-071, §9.5–9.8, §14.11).
**Inputs:** `00-requirement-inventory.md`, `02-srs-requirement-analysis.md` (dependency map: Auth → User/Profile → Content/KB → WhatsApp → AI → Admin → Research).
**Purpose:** Phased, production implementation roadmap for the web administration portal and its supporting Admin Service: role-based dashboards, user management, content management, campaign management, analytics, research tools, AI operations, and the support queue, consumed through the §12.10 admin API group.
**Classification convention:** **Confirmed** (SRS-mandated) · **Recommended** (engineering decision) · **Configurable** (parameter with default) · **Assumption** (requires human sign-off).

---

## 1. Executive Purpose

The Admin Dashboard is the operational command center for the FathersNet (Ayay) pilot. It is the single surface through which MERQ program staff, researchers, content managers, AI operations staff, healthcare reviewers, and support agents operate the platform. The SRS mandates a **role-based web portal** (FR-094, AR-030) with seven functional domains: overview dashboards (§11.1), user management (§11.2), campaign management (§11.3), content management (§11.4), research dashboards (§11.5), AI operations (§11.6), and analytics (§11.7).

**Source:** SRS §11, FR-094, AR-030 | **Confidence:** High (Confirmed) | **Reasoning:** §11 lists the required views and §14.7 defines which roles see which modules; there is no alternate portal in the SRS. | **Impact if changed:** Any re-scope of modules alters AR-030 acceptance and §14.7 column coverage.

The portal is **not** a security boundary. Every view, action, export, and API call is enforced **server-side** by the Admin Service and per-endpoint RBAC (FR-126, AR-030). The SPA renders only what the authenticated session is permitted to call; hiding a control in the UI is a usability measure, never an authorization mechanism. Admin authentication requires **staff credentials + MFA** (FR-101, AR-033, §12.1), with short-lived sessions and revocation (FR-102, §14.6). All administrative and sensitive-data actions are written to the immutable `audit_logs` (FR-098, §14.3, §13.3.24).

**Source:** §12.1 (admin endpoints additionally require staff credentials and MFA), FR-101, FR-102, FR-126, FR-098 | **Confidence:** High (Confirmed) | **Reasoning:** SRS is explicit that admin endpoints require Bearer + MFA and that authorization is enforced server-side by role. | **Impact if changed:** Moving to client-side-only gating would violate FR-126 and NFR-016/§14.1.2; removing MFA would violate FR-101 and AR-033.

Scope boundaries: this document owns the **admin portal experience and the Admin Service facade** (endpoints in §12.10 plus the admin-read surfaces over the internal services). Database schema for the underlying entities (users, content, campaigns, research, audit) is owned by `05-database-implementation-plan.md`; the parent services (auth, user, content, campaign, AI, research) are owned by `06-backend-development-plan.md`, `07-whatsapp-platform-implementation-plan.md`, and `08-ai-rag-implementation-plan.md`. This document sequences and integrates those capabilities from the admin perspective, and reuses the §12.1 platform conventions (error codes, pagination, rate limits, idempotency) defined in `06-backend-development-plan.md`.

---

## 2. Admin Platform Architecture

### 2.1 Topology (SRS §15.1, FR-159, AR-030)

The portal is a **single-page application (SPA)** served by a static/CDN front (React; §17.2 notes Jest for frontend) that talks only to the API gateway. All admin traffic terminates at a dedicated **Admin Service** facade (owning §12.10 endpoints) which composes the internal services:

| Portal Layer | Client | Server (gateway) | Backing Services (internal) |
| --- | --- | --- | --- |
| Overview Dashboard | SPA module | `/v1/admin/overview` | Research & Analytics, User, Campaign |
| User Management | SPA module | `/v1/admin/users`, `/v1/admin/users/:id`, `/v1/admin/users/export` | User & Profile, Pregnancy Engine, Consent |
| Content Management | SPA module | `/v1/content*` (admin-role variants) | Content & CMS Service |
| Campaigns | SPA module | `/v1/admin/campaigns` | Campaign & Broadcast, WhatsApp templates |
| Analytics | SPA module | `/v1/admin/reports` | Research & Analytics pipeline |
| Research Dashboard | SPA module | `/v1/admin/research/export` + read-only research views | Research & Analytics (anonymized store) |
| AI Operations | SPA module | `/v1/ai/conversations`, `/v1/ai/safety-events`, prompt APIs | AI Orchestration, Medical Safety Layer |
| Support | SPA module | `/v1/admin/support/tickets` | Support queue, Journal lookup, KB search |
| Audit | SPA module | `/v1/admin/audit-logs` | Audit service over `audit_logs` |

**Source:** §15.1, §12.10, FR-159 | **Confidence:** High (Confirmed endpoints; Recommended for SPA framework choice) | **Reasoning:** §15.1 shows the web portal attached to the gateway; §12.10 defines the admin API surface; a single admin facade keeps RBAC/MFA enforcement in one place. | **Impact if changed:** Splitting admin endpoints across services duplicates enforcement; keeping them in the SPA without a facade removes the server-side enforcement that FR-126 requires.

### 2.2 Security Posture (FR-126, FR-101, FR-102, §12.1, §14.6)

- **Bearer token + MFA:** every `/v1/admin/*` request requires a valid staff access token (JWT, default 15-min TTL, Configurable) whose claims include `user_id`, `role`, and `token_version`, and whose MFA step was completed at login (§14.6). The gateway rejects admin-route requests lacking the `mfa_verified` claim.
- **Server-side RBAC (deny-by-default):** the Admin Service resolves the caller's role against the §14.7 matrix on every call, and each endpoint also applies row/field-level rules (e.g., phone masked for all but `super_administrator` per FR-022; research export requires an *approver* role distinct from the requester per FR-106/§14.7).
- **Session controls (FR-102):** admin sessions expire (Configurable default: 15-min access TTL, 30-day refresh with rotation); sessions are revocable individually and globally (`/v1/auth/logout`, token-version bump); concurrent-session policy is Configurable (recommended default: 1 active admin session per staff account, configurable per role).
- **CSRF/XSS/clickjacking:** SPA uses SameSite cookies or in-memory tokens with custom headers; CSRF tokens on all state-changing admin forms; strict Content-Security-Policy; output encoding of all user-derived text (journal content, myth text, AI answers) before render (FR-129, NFR-020).
- **Access logging (FR-127):** any admin read/write that touches personal or health data logs actor, timestamp, reason/justification, and result to `audit_logs`; no PII in log bodies (§18.1).

**Source:** §12.1, §14.6, FR-101, FR-102, FR-126, FR-127, FR-129 | **Confidence:** High (Confirmed) | **Reasoning:** All cited controls are stated requirements; the "no client-side-only security" rule is the direct consequence of FR-126 and §14.1.2. | **Impact if changed:** Weakening any of these (e.g., role checks in SPA only) invalidates FR-126, NFR-016, and the §14.1.2 mitigations.

### 2.3 Real-Time Analytics Feed (AR-024, AR-031)

The analytics pipeline publishes near-real-time events (enrollment, engagement, campaign status, safety events) to the message bus; the Analytics/Admin service maintains lightweight aggregated views and an SSE (Server-Sent Events) or WebSocket feed the dashboard subscribes to. Latency target: **Configurable**, recommended ≤ 30 s from event to visible metric (AR-024 "near-real time", AR-031). A fallback polling interval (Configurable default 60 s) keeps dashboards functional if the live feed is unavailable.

**Source:** AR-024, AR-031 | **Confidence:** Medium (AR-024 Must Have; AR-031 Should Have; feed mechanics Recommended) | **Reasoning:** SRS mandates near-real-time dashboard metrics for WhatsApp events and real-time analytics rendering but does not prescribe the transport. | **Impact if changed:** If live rendering is dropped, AR-031 is unmet (Should Have); if analytics stay batch-only, AR-024 acceptance (near-real-time) fails.

### 2.4 Design System (AR-029, AR-034, AR-035)

The portal implements the shared design system (tokens, components, patterns) used across app and web (AR-029, AR-034) and applies plain-language, voice-first copy guidelines to all admin-facing text (AR-035). The design system tokens (color, type, spacing) are WCAG 2.1 AA-verified (§12) so contrast compliance is inherited, not bolted on.

**Source:** AR-029, AR-034, AR-035 | **Confidence:** High (Confirmed) | **Reasoning:** AR-034/AR-035 are Confirmed; AR-029 is Must Have. | **Impact if changed:** A divergent admin theme breaks AR-029/AR-034 and risks WCAG contrast regressions.

---

## 3. User Management

Implements SRS §11.2 and FR-096 (view/search/edit per policy), FR-100 (consent views), FR-095 inputs, FR-099 (role-limited export), FR-022 (masked phone), FR-004/FR-125 (consent lifecycle), and FR-007 (deletion workflow oversight).

### 3.1 Search (FR-096, §11.2)

- **Search keys:** name, phone (masked), user ID (UUID), cohort tag.
- **Phone handling (FR-022):** search may accept a phone input, but result lists render the phone **masked** (`+251 9•••• ••01`) for every role except `super_administrator`; the mask is applied server-side, never by the SPA. Search matches on a one-way hash or E.164-equivalent to avoid returning unmasked numbers in logs.
- **Pagination:** cursor-based per §12.1 conventions (`?cursor=`, `limit` default 20, max 100).

**Source:** §11.2, FR-096, FR-022 | **Confidence:** High (Confirmed) | **Reasoning:** §11.2 enumerates the search keys; FR-022 mandates masking in administrative views; §12.1 defines list pagination. | **Impact if changed:** Revealing unmasked phones violates FR-022 and §14.1.3.

### 3.2 Filters (§11.2)

| Filter | Values (Configurable taxonomy) | Backing data |
| --- | --- | --- |
| Consent status | `granted` / `withdrawn` / `none`, per consent type (participation, research, media, whatsapp_opt_in) | `consents` (§13.3.4) |
| Language | `en`, `am` | `profiles.language` |
| Region | country/region codes | `profiles.region` |
| Pregnancy week | week range or trimester | `pregnancies.pregnancy_week` |
| Enrollment date | date range | `users.created_at` |
| Account status | `active`, `suspended`, `deleted` (soft) | `users.status` |
| Cohort | cohort tag | `profiles.cohort` |

All filters combine (AND) server-side with indexed queries (NFR-007). Consent-status filters respect the separate consent types so staff can identify users lacking research consent (FR-117).

**Source:** §11.2, FR-100, FR-117 | **Confidence:** High (Confirmed) | **Reasoning:** §11.2 lists the filter set; consent-type separation is confirmed by FR-117. | **Impact if changed:** Removing consent-type granularity would hide research-consent gaps from staff and risk using non-consented data in research.

### 3.3 User Detail & Account Status (FR-096)

The user detail view shows: profile (name, region, language, age group, cohort), pregnancy context (week, trimester, EDD), consent records (status, version, granted/withdrawn timestamps, history — FR-100), account status, enrollment source, and recent activity summary. Role-limited actions:

| Action | Roles (§14.7) | Notes |
| --- | --- | --- |
| View profile | Administrator, Super Administrator, Healthcare Partner (consented journey read), Support (troubleshooting) | field-level masking |
| Suspend / unsuspend | Administrator, Super Administrator | audited (`user.update`); suspension blocks logins and scheduled outreach |
| Request re-consent | Administrator, Super Administrator | generates re-consent flow (FR-125) |
| Edit profile fields (policy-compliant) | Administrator, Super Administrator | restricted field set; every change audited |
| View consent history | Administrator, Super Administrator, Researcher (research consent only) | read-only |
| View journal/conversation (flagged) | Healthcare Partner (consented), AI Ops, Support (documented reason) | FR-058 context; access logged |

The suspension action must be coordinated with the message gateway: a suspended user receives no outbound messages and their outbound AI/support path is blocked (coordinated with `07-whatsapp-platform-implementation-plan.md`).

**Source:** FR-096, FR-100, §14.7, FR-058, FR-127 | **Confidence:** High (Confirmed roles/actions; Recommended row-level action set) | **Reasoning:** §14.7 defines who may access user management; FR-096 requires policy-compliant edits; FR-127 mandates access logging on sensitive data. | **Impact if changed:** Granting suspend to roles outside §14.7 breaks the matrix; editing fields without audit breaks FR-098/FR-127.

### 3.4 Export (§11.2, FR-099)

- **Format:** CSV (FR-099 operational reports also support PDF via `/v1/admin/reports`).
- **Field whitelist (role-limited):** exportable fields are driven by the requesting role — phone never exported unmasked; research users export only from the anonymized research store (§7).
- **Rate limit:** 10 requests/min on export endpoints (§12.1); async job with notification on completion; every export request and artifact download logged (`export.request`) with justification.
- **Delivery:** secure, expiring signed URL (Configurable TTL, default 24 h); file stored under access-controlled object storage.

**Source:** §11.2, FR-099, §12.1, FR-127 | **Confidence:** High (Confirmed) | **Reasoning:** §11.2 mandates role-limited CSV export; §12.1 sets the 10/min export rate limit; FR-127 requires logging. | **Impact if changed:** Removing role-limiting risks leaking fields beyond permission (FR-099); removing rate limits risks abuse (§14.1.6).

### 3.5 Bulk Actions (role-gated) (§11.2)

| Bulk action | Roles | Behavior |
| --- | --- | --- |
| Tag cohort | Administrator, Super Administrator | applies cohort tag to selected IDs; audited |
| Send campaign | Administrator, Super Administrator | creates draft campaign pre-populated with selected audience (subject to §5 approval gate) |
| Suspend / unsuspend | Administrator, Super Administrator | per-user, audited, with confirmation and batch result report |
| Request re-consent | Administrator, Super Administrator | triggers per-user re-consent flows (FR-125) |

Bulk actions operate on the currently filtered result set (capped, Configurable default 5,000) and are executed as idempotent async jobs with per-item results surfaced in the UI and audit log. No bulk action may bypass the segregation-of-duties and approval gates in §5 (campaign) or §7 (research).

**Source:** §11.2, FR-096, FR-106, FR-161 | **Confidence:** High (Confirmed actions; Recommended execution mechanics) | **Reasoning:** §11.2 lists the four bulk actions as role-gated; FR-161 mandates idempotency for any queued processing. | **Impact if changed:** Allowing bulk campaign/research actions without gates would violate FR-106 and the §14.7 matrix.

---

## 4. Content Management

Implements SRS §11.4 and FR-076…FR-085: WYSIWYG editing, versioning with diff/history/rollback, the approval workflow (draft → medical review → approved → publish/schedule → archive), localization (FR-079), expiry (FR-080), and medical-review tagging (FR-081) with segregation of duties (FR-106, OR-021).

### 4.1 Content Lifecycle (§11.4, §13.3.16, AR-015)

| Status | Meaning | Entry / Exit |
| --- | --- | --- |
| `draft` | Author editing; not visible anywhere | created by `content_manager` author |
| `pending_medical_review` | Health-related content awaiting clinical review | `submit` by author; **required if the item is medical in nature** (FR-081) |
| `approved` | Cleared for release (medical review where applicable) | approval by a role distinct from author (FR-106) |
| `published` | Live on user surfaces and AI grounding | publish or schedule |
| `archived` | Retired from all surfaces and RAG retrieval | expiry (FR-080), manual archive, or supersession |

Non-medical content (e.g., logistics/FAQ without health claims) may transition `draft → approved → published` after standard review; the classification of "medical in nature" is **Confirmed** as determined by content metadata (`medical_reviewed` flag, §13.3.16) set on submit and enforced at the approval gate.

**Source:** §11.4, FR-078, FR-080, FR-081, §13.3.16, AR-015, OR-021 | **Confidence:** High (Confirmed) | **Reasoning:** §11.4 states the exact workflow; §13.3.16 defines the status enum; AR-015 ties lifecycle state to RAG retrieval eligibility. | **Impact if changed:** Publishing without the medical gate violates OR-021 and FR-081; altering statuses requires a schema migration of `content.status` (§13.3.16).

### 4.2 WYSIWYG Editor (§11.4, FR-077)

A WYSIWYG editor supports the six content types (article, video, audio, infographic, checklist, faq — FR-077). Editing captures a sanitized rich-text model (blocks, not arbitrary HTML) with an allow-list for embedded media references; output is rendered through the design system and validated server-side (FR-129). Checklist items and FAQ Q/A pairs are structured fields (not free text), so parity checks and version diffs remain reliable.

**Source:** §11.4, FR-077, FR-129 | **Confidence:** High (Confirmed) | **Reasoning:** §11.4 mandates a WYSIWYG editor; FR-077 defines types; FR-129 requires input validation. | **Impact if changed:** Storing raw HTML risks XSS (§14.4) and breaks diff/parity tooling.

### 4.3 Versioning, Diff, History, Rollback (§11.4, FR-078, §13.3.17)

Every save creates a `content_versions` snapshot (version, change_note, body_snapshot, reviewed_by, created_at — §13.3.17). The portal provides:

- **History:** version list with author, timestamp, change note, status at time of version.
- **Diff:** field-level and line-level diff between any two versions (EN and AM separately).
- **Rollback:** reverting to a prior version creates a *new* version restoring that snapshot (immutable history preserved); the rollback itself must pass the same approval gate if the content is medical.

**Source:** §11.4, FR-078, §13.3.17 | **Confidence:** High (Confirmed) | **Reasoning:** §11.4 explicitly requires diff/history and rollback; §13.3.17 gives the snapshot schema. | **Impact if changed:** Without version snapshots, rollback and audit-history (FR-078) are unimplementable.

### 4.4 Approval Workflow (§11.4, FR-078, FR-081, FR-106, OR-021)

| Step | Actor role (§14.7) | System action |
| --- | --- | --- |
| Create/edit draft | Content Manager | new version; status `draft` |
| Submit | Content Manager | status → `pending_medical_review` if medical, else `approved`-eligible |
| Medical review / approve | Healthcare Partner (medical reviewer) — must differ from author (FR-106) | approves or returns with comments → back to `draft` |
| Publish / schedule | Content Manager | status → `published`; emits `content.published` → RAG ingestion (AR-016) |
| Archive / expire | Content Manager | status → `archived`; emits `content.retired` → chunk deactivation (AR-015) |

The system **blocks** self-approval: the author and approver `user_id`s are compared server-side (FR-106). Review comments and decisions are stored with the version record and appear in the audit trail.

**Source:** §11.4, FR-078, FR-081, FR-106, OR-021, §14.7 | **Confidence:** High (Confirmed) | **Reasoning:** FR-106 mandates segregation of duties; OR-021 mandates clinical review before content reaches users or RAG; §14.7 assigns medical-approve to Healthcare Partner only. | **Impact if changed:** Self-approval or missing medical gate breaks OR-021/FR-081 and the §14.7 matrix.

### 4.5 Localization (FR-079)

EN/AM translation pairs are managed as parallel fields (`title_en`/`title_am`, `body_en`/`body_am`, §13.3.16). The workflow includes: translation request → translator produces AM version → reviewer parity check (structural and length parity, placeholder consistency) → both versions must be approved/published together. Publishing is blocked while a locale is missing or fails parity for the content type. A translation queue surfaces outstanding locale gaps per item.

**Source:** FR-079, §13.3.16, NFR-033 | **Confidence:** High (Confirmed) | **Reasoning:** FR-079 mandates a translation workflow with parity checks; schema stores parallel locale fields. | **Impact if changed:** Publishing a single-locale item would break NFR-033 for Amharic users and the parity check in FR-079.

### 4.6 Expiry & Archiving (FR-080)

Each published item can carry an expiry date (Configurable). A scheduled job flags expiring items; the portal notifies the content team (FR-103 admin notification preference). At expiry, status transitions to `archived`, the item is removed from user surfaces, and `content.retired` deactivates its RAG chunks (AR-015, AR-016). Manual archive is available at any time.

**Source:** FR-080, AR-015, AR-016 | **Confidence:** High (Confirmed) | **Reasoning:** FR-080 requires expiry/archive with removal from active surfaces and AI grounding; AR-015/AR-016 define retrieval-lifecycle coupling. | **Impact if changed:** Expired content remaining retrievable would violate FR-080 and the AI grounding rule FR-061.

### 4.7 Search & Consumption Analytics (FR-083, FR-084)

Content library search covers topic, week, keyword, language (FR-083) over approved content with relevance ranking. Consumption events (views, completions, favorites) are captured and aggregated for the Analytics module (§6); low-rated content (FR-085, Could Have) surfaces in a review queue.

**Source:** FR-083, FR-084, FR-085 | **Confidence:** High (Confirmed for FR-083/084; FR-085 Could Have) | **Reasoning:** FR IDs carry the stated behavior and priorities. | **Impact if changed:** FR-085 is a Could-Have; deferring it does not block launch but removes the quality-rating review loop.

---

## 5. Campaigns

Implements SRS §11.3 and FR-107…FR-112: creation, audience segmentation, scheduling, template approval gate (FR-108), delivery/read/reply/opt-out tracking (FR-109), rate throttling (FR-111), and opt-out handling (FR-112). Delivery mechanics live in `07-whatsapp-platform-implementation-plan.md`; this plan covers the admin-side management surface and approval gate.

### 5.1 Campaign Creation & Segmentation (FR-107)

| Campaign field | Values |
| --- | --- |
| Name / label | free text |
| Template | chosen from the approved template library (EN/AM variants) |
| Audience filter | pregnancy week range, region, language, cohort, consent status (must include `whatsapp_opt_in = granted`, FR-017/FR-107) |
| Schedule | date/time, timezone, quiet-hour-safe local delivery (FR-029) |
| Channel | WhatsApp broadcast (MVP); push as future |

Audience preview shows projected recipient count and eligibility breakdown **without unmasked phone numbers** (FR-022). A campaign cannot target users without recorded `whatsapp_opt_in` consent (FR-017).

**Source:** §11.3, FR-107, FR-017, FR-022, FR-029 | **Confidence:** High (Confirmed) | **Reasoning:** §11.3 enumerates creation/scheduling/template/tracking; FR-107 requires segmentation by the listed dimensions; FR-017 requires opt-in. | **Impact if changed:** Targeting non-opted-in users violates FR-017 and NFR-044 (WhatsApp policy).

### 5.2 Template Approval Gate (FR-108, AR-021, §7.3)

Two-stage approval, both tracked as campaign state:

1. **Platform pre-approval:** template must hold WhatsApp platform approval status (`approved`) before it can be scheduled (§7.3, AR-021). Template library records platform status and re-checks on changes.
2. **Internal approval:** a template or campaign requires internal approval by a role distinct from the campaign creator (content/administrator per §14.7). Draft templates carry `pending_approval`; delivery is **blocked** until both approvals are recorded.

**Source:** FR-108, AR-021, §7.3, §14.7 | **Confidence:** High (Confirmed) | **Reasoning:** FR-108 explicitly blocks delivery until approval; AR-021 requires the internal gate; §7.3 requires platform approval. | **Impact if changed:** Skipping the gate risks WhatsApp policy violation (NFR-044) and unapproved health messaging.

### 5.3 Scheduling, Throttling & Quiet Hours (FR-111, FR-029)

- Campaigns schedule within delivery windows (batch cohort within window, NFR-005) and honor quiet hours (FR-029).
- **Per-user messaging caps (Configurable):** recommended 3–5 broadcast messages per user per week; the scheduler enforces caps so overlapping campaigns cannot over-message (FR-111).
- Throughput is throttled to respect WhatsApp platform rate limits; schedule windows and throttle are surfaced in the UI so operators see projected delivery time.

**Source:** FR-111, FR-029, NFR-005 | **Confidence:** High (Confirmed caps Configurable) | **Reasoning:** FR-111 requires scheduling limits and rate throttling to avoid fatigue; NFR-005 defines batch delivery windows. | **Impact if changed:** Removing caps causes messaging fatigue and platform rate-limit violations (FR-111, NFR-044).

### 5.4 Delivery Tracking (FR-109, §13.3.19)

Per-campaign metrics over `campaign_messages` (delivery_status: queued, sent, delivered, read, failed, opted_out):

| Metric | Definition |
| --- | --- |
| Delivery rate | sent/delivered ÷ eligible recipients |
| Read rate | read ÷ delivered |
| Reply rate | inbound replies tied to the campaign within the response window ÷ delivered |
| Opt-out rate | opted_out ÷ delivered |
| Failure rate | failed ÷ sent, with failure reason breakdown |

Campaign summary appears on the overview dashboard (§11.1) and the campaign detail view shows per-metric time series. Status transitions come from WhatsApp delivery callbacks (delivered/read statuses) and inbound reply matching (idempotent on `provider_message_id`).

**Source:** §11.3, FR-109, §13.3.19, §7.4 | **Confidence:** High (Confirmed) | **Reasoning:** §11.3 requires delivery/read/reply/opt-out tracking; §13.3.19 defines the status enum. | **Impact if changed:** Metric definitions must stay aligned with `campaign_messages` statuses or reporting becomes ambiguous.

### 5.5 Opt-Out Handling (FR-112)

Inbound opt-out ("STOP"/opt-out keyword or explicit request) is processed immediately: the user is removed from all future broadcast audiences and future sends are blocked; the event updates `whatsapp_opt_in` consent state and notifies campaign scheduling (FR-004/FR-112). The campaign module reflects the opted-out user as `opted_out` on in-flight campaigns and excludes them from future ones. Confirmation message per §7.3.2.

**Source:** FR-112, FR-004, §7.3.2 | **Confidence:** High (Confirmed) | **Reasoning:** FR-112 mandates immediate removal from future broadcasts; consent state is the enforcement point. | **Impact if changed:** Delayed opt-out processing violates FR-112 and WhatsApp policy (NFR-044).

### 5.6 A/B Variants (FR-110, Could Have)

A/B testing with variant delivery and response comparison is a Could-Have; design is deferred but the campaign schema must tolerate `variant` metadata without migration.

**Source:** FR-110 | **Confidence:** High (Confirmed priority) | **Reasoning:** FR-110 is explicitly Could Have. | **Impact if changed:** Adding variants requires a small additive schema change only; backward-compatible per §12.1.

---

## 6. Analytics

Implements SRS §11.1 (overview) and §11.7 (engagement, retention, cohort analysis), fed by AR-024/AR-031 real-time feeds, and the Research & Analytics pipeline (FR-113…FR-121, §10).

### 6.1 Overview Dashboard (§11.1, FR-095)

| KPI | Definition | Source data |
| --- | --- | --- |
| Total users | registered father accounts (active) | `users` |
| Active users | distinct users with activity in period (DAU/WAU) | engagement events |
| Response rate | inbound responses ÷ prompts/campaigns delivered in period | `prompt_responses`, `campaign_messages` |
| Enrollment trends | new users per day/week with cumulative line | `users.created_at` |
| Pregnancy-week distribution | histogram of current `pregnancy_week` | `pregnancies` |
| Regional breakdown | users by region (non-identifying) | `profiles.region` |
| Campaign summary | active/scheduled/sent campaigns with delivery/read/reply/opt-out | `campaigns`, `campaign_messages` |

KPIs are computed from live data (FR-095) and rendered in near-real time (§2.3). Time-range selector (7/30/90 days, Configurable defaults).

**Source:** §11.1, FR-095, FR-030 | **Confidence:** High (Confirmed) | **Reasoning:** §11.1 lists the exact metrics; FR-095 requires computation from live data. | **Impact if changed:** Metric definition drift breaks FR-095 acceptance and KPI traceability (OR-018).

### 6.2 Engagement (DAU/WAU) (§11.7)

Engagement metrics: DAU/WAU/MAU, WhatsApp response rate, prompt engagement by type (weekly/daily_pulse/legacy), content consumption (views, completions, favorites — FR-084), voice submission counts. Engagement is segmented by pregnancy week, region, cohort, language for the analytics views.

**Source:** §11.7, FR-030, FR-084 | **Confidence:** High (Confirmed) | **Reasoning:** §11.7 explicitly requires DAU/WAU, response rates, and content consumption. | **Impact if changed:** Changing engagement definitions affects KPI reporting and OR-018 M&E cadence.

### 6.3 Retention & Cohort Analysis (§11.7)

- **Retention curves:** cohort retention (users active in week N ÷ enrolled in week 0) for enrollment cohorts.
- **Cohort analysis:** side-by-side performance of enrollment cohorts (source channel, referral source) on activation, week-over-week engagement, prompt response, and checklist completion (FR-035/FR-088).
- Computed over the anonymized analytics layer to avoid exposing personal identities in research-facing views (AR-032).

**Source:** §11.7, FR-118, AR-032 | **Confidence:** High (Confirmed) | **Reasoning:** §11.7 requires retention and cohort analysis; FR-118 defines impact/KPI computation. | **Impact if changed:** Restricting to operational (non-anonymized) data would violate AR-032 for researcher-visible views.

### 6.4 Operational Reports (FR-099)

`/v1/admin/reports` generates role-limited CSV/PDF operational reports covering enrollment, engagement, campaigns, and research dashboards (FR-099). Report definitions are versioned templates; generation is async with audit logging and signed-download delivery. Researcher role receives research-scope reports only; Administrator receives operational scope.

**Source:** FR-099, §12.10 (`/v1/admin/reports`) | **Confidence:** High (Confirmed) | **Reasoning:** FR-099 requires role-limited operational report export; §12.10 exposes the endpoint. | **Impact if changed:** Report scope leaking beyond role violates FR-099's "without exposing personal information beyond role permissions."

---

## 7. Research Dashboard

Implements SRS §11.5 and FR-113…FR-122, AR-032 (anonymized data only) and AR-013 (research data separation).

### 7.1 Operating Only on Anonymized Data (AR-032, FR-119, FR-115)

The research dashboard queries **only** the research store (`research_responses`, `research_users`, `research_analytics`, §10.1.3 / §13.3.22–23) — never operational tables. Direct identifiers (name, phone, E.164) are structurally absent (FR-119); views contain no names, phones, or raw messages tied to identity. The research store is physically/logically separated with restricted access (AR-013). Any chart, table, or export produced here is verified at render time by the server against the anonymized-only rule.

**Source:** AR-032, FR-119, AR-013, §10.1.3 | **Confidence:** High (Confirmed) | **Reasoning:** AR-032 is Must Have ("no direct identifiers"); §10.1.3 states research tables contain no names/phones/identifiers. | **Impact if changed:** Exposing operational data in research views is a direct AR-032 and NFR-027 violation.

### 7.2 Theme Visualization (§11.5, FR-114, §10.1.2)

Theme frequency and distribution charts from AI theme extraction (baseline taxonomy: fear, anxiety, joy, confusion, cultural_pressure, financial_stress — Configurable) with confidence scores. Filters: response category, cohort, region, language, pregnancy week, period. Themes are surfaced per prompt category (myth, challenge, support_act, financial, clinic_experience, legacy — §10.1.1).

**Source:** §11.5, FR-114, §10.1.2 | **Confidence:** High (Confirmed taxonomy Configurable) | **Reasoning:** §10.1.2 defines the theme taxonomy and confidence-score requirement. | **Impact if changed:** Taxonomy changes require updating the extraction config and re-running the pipeline (FR-114).

### 7.3 Sentiment Trends (§11.5, §10.1.3)

Sentiment time series (`sentiment_score`, -1.0…1.0, Configurable) by cohort/week/region. Trend views support the research KPIs (FR-115) and impact reporting (FR-118).

**Source:** §11.5, §10.1.3 | **Confidence:** High (Confirmed) | **Reasoning:** Sentiment score is a confirmed research schema field; §11.5 requires sentiment trends. | **Impact if changed:** Re-scoring sentiment changes comparability with historical research analytics records.

### 7.4 Governed Anonymized Export (FR-116, FR-122, UC-005)

The export workflow implements the full governance chain: **request → ethics check → data access approval → export → audit** (FR-122).

| Step | Actor | System behavior |
| --- | --- | --- |
| 1. Request | Researcher | POST `/v1/admin/research/export` with scope (categories, cohorts, weeks, fields, purpose) |
| 2. Ethics check | Governance/Admin | purpose and scope validated against ethics approval record (OR-017); auto-block if no approval on file |
| 3. Approval | Approved approver role — must differ from requester (FR-106, §14.7) | approve or reject with reason; no self-approval |
| 4. Export | System | de-identification re-check, aggregation where applicable, dataset assembly from research store only |
| 5. Audit | System | `export.request`/`export.approved`/`export.generated` records with requester, scope, timestamp, hash |

Exports are delivered via expiring signed URLs; export artifact hashes are stored for integrity (FR-116 "full audit logging"). Rejection and approval reasons are retained. A new export requires a fresh approval; approvals do not auto-approve future exports.

**Source:** FR-116, FR-122, FR-106, §12.10 (`/v1/admin/research/export`), UC-005, OR-017 | **Confidence:** High (Confirmed) | **Reasoning:** FR-122 defines the exact workflow; FR-106 requires a separate approver; UC-005 is a Must Have use case. | **Impact if changed:** Removing the ethics/approval gate violates FR-116/FR-122 and OR-017, and breaks NFR-042 (research ethics).

---

## 8. AI Operations

Implements SRS §11.6 and FR-067…FR-071, §9.5–9.8, §14.11.

### 8.1 Conversation Review (§11.6, FR-067)

Browse AI conversations with filters (user segment, language, date, safety status: normal/flagged/emergency, §13.3.20 `safety_status`). Conversations are viewable by `ai_admin`/`support` (role-filtered, §12.8). Review actions: mark resolved, add note, escalate to on-call reviewer, route to content/knowledge gap queue (FR-074). Every review action is audited.

**Source:** §11.6, FR-067, §12.8, §13.3.20 | **Confidence:** High (Confirmed) | **Reasoning:** §11.6 requires conversation review with filters and safety flags; §13.3.20 defines the audit record. | **Impact if changed:** Conversation access outside ai_admin/support roles violates §12.8 role-filtering.

### 8.2 Safety Alerts Queue (§11.6, FR-062, FR-063, FR-065, §15.3)

Emergency events and flagged responses enter a safety queue. Each alert shows severity, message excerpt (minimized), user context (masked), model/prompt version, and status. The queue drives the emergency escalation workflow (§15.3): immediate facility-care guidance delivered, on-call reviewer notified, follow-up checks, and escalation on non-response. Unresolved alerts age alerts per policy (Configurable). Safety alerts are visible to `ai_admin` and read-only to `healthcare_partner`/`administrator` per §14.7.

**Source:** §11.6, FR-062, FR-063, FR-065, §15.3, §14.7 | **Confidence:** High (Confirmed) | **Reasoning:** §15.3 defines the escalation state machine; §11.6 requires the alerts queue. | **Impact if changed:** Delayed alert handling risks failing the emergency escalation acceptance criteria (FR-063, QR-011).

### 8.3 Prompt Management (FR-068, §9.5, §14.11)

Prompt library with versioning and approval: each prompt (system prompt EN/AM, §9.5 baseline) is versioned; edits create a new version in `pending_approval`; approval by a role distinct from the editor publishes it; prior versions remain recoverable and the active version is flagged. The AI governance record links every conversation to the exact prompt version (§13.3.20 `prompt_version`, FR-069). Model/version visibility is surfaced per conversation (FR-067: model, provider, latency, tokens) with a model registry view reflecting the §9.8 fallback tiers.

**Source:** FR-068, FR-067, FR-069, §9.5, §14.11, §13.3.20 | **Confidence:** High (Confirmed) | **Reasoning:** FR-068 mandates versioning+approval+reversibility; §14.11 requires prompt versioning and model registry. | **Impact if changed:** Prompt edits without approval/versioning break FR-068 and NFR-049 (model/prompt governance).

### 8.4 Knowledge Gaps & Feedback (FR-066, FR-074)

Low-rated AI answers (thumbs down, §13.3.21) and knowledge-gap captures (FR-074) route to review queues: content team for knowledge gaps, AI ops for answer quality. Hallucination/accuracy monitoring samples (FR-071) and accuracy metrics (NFR-047) surface on the AI ops dashboard with alerting thresholds (NFR-050).

**Source:** FR-066, FR-074, FR-071, NFR-047, NFR-050 | **Confidence:** High (Confirmed for FR-066/074; FR-071/NFR-047/050 Should Have) | **Reasoning:** SRS assigns these as stated; NFR-050 requires threshold alerting. | **Impact if changed:** Deferring FR-071/FR-074 (Should Have) is possible but reduces safety visibility; NFR-050 alerting on safety counts is recommended to keep.

---

## 9. Permissions & RBAC

Implements SRS §14.7 role matrix, FR-094, FR-106 (segregation of duties), FR-101 (MFA), FR-102 (sessions), and access reviews (§14.1.7).

### 9.1 Role Matrix (§14.7)

| Role | Admin Dashboards | User Mgmt | Content Author | Medical Approve | Campaigns | Research Export | AI Ops | Support |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Father/User | No | Own profile | No | No | No | No | No | Own tickets |
| Researcher | Research only | No | No | No | No | Request + approve-gated | Read research | No |
| Healthcare Partner | Read journey (consented) | No | Suggest | Review (medical) | No | No | Read safety | No |
| Content Manager | Content | No | Yes | No | Yes | No | No | No |
| Administrator | Yes | Yes | Yes | No | Yes | No | Read | Yes |
| Super Administrator | Yes | Yes + manage roles | Yes | No | Yes | No | Full | Yes |

**Confirmed consequences for the portal (derived from the matrix, not invented):**

- **Researcher:** sees only research dashboards + audit of own export requests; no user management, no content authoring, no campaigns.
- **Healthcare Partner:** consented read of journey data; content *suggestions* (cannot publish); medical approval; read-only safety alerts.
- **Content Manager:** content authoring + campaigns; **cannot** medically approve (FR-106) and cannot approve own content.
- **Administrator:** broad operations; no medical approval (matrix = No), no research export; read-only AI ops.
- **Super Administrator:** full operations incl. role management; still cannot medically approve (matrix = No) and cannot self-approve research exports (FR-106).
- **Father/User:** only own profile and own tickets.

The UI renders modules from the server-provided permission set (AR-030: others hidden); enforcement is server-side on every endpoint (FR-126). A single "role" is a set of permission flags resolved from the matrix; permission changes invalidate tokens (token-version bump) so a revoked permission takes effect immediately.

**Source:** §14.7, FR-094, FR-106, AR-030 | **Confidence:** High (Confirmed) | **Reasoning:** §14.7 is the authoritative matrix; FR-106 adds the segregation rule; AR-030 requires role-based module visibility. | **Impact if changed:** Any change to the matrix must be re-applied in both §14.7 and the permission-resolver, and regression-tested per QR-013.

### 9.2 Segregation of Duties (FR-106)

Enforced invariants, checked server-side and in the audit trail:

1. **Author ≠ medical approver:** content author and medical reviewer must differ (`content_versions.reviewed_by ≠ author`).
2. **Campaign creator ≠ internal approver:** a campaign cannot be approved by its creator.
3. **Research requester ≠ approver:** export approval must come from a role/identity distinct from the requester.
4. **No role may both request and approve** a governed export.

**Source:** FR-106, §14.7 | **Confidence:** High (Confirmed) | **Reasoning:** FR-106 states the rule; §14.7 assigns conflicting capabilities to distinct roles. | **Impact if changed:** Self-approval paths would invalidate the single most important control in §14.1.7 (insider misuse).

### 9.3 MFA (FR-101, AR-033)

- Staff login: username/password (Argon2id) + **MFA** (TOTP primary; backup codes; SMS/email fallback Configurable) before any admin session issues tokens.
- MFA enforced for Administrator, Super Administrator, Researcher, Content Manager, Healthcare Partner, and Support staff accounts (§14.6 "MFA for privileged accounts"; FR-101 "administrator and privileged accounts").
- MFA device enrollment/recovery is itself a privileged, audited operation (recovery requires super-admin approval).
- The MFA claim is embedded in the access token; refresh does not bypass it (each admin session must complete MFA at establishment).

**Source:** FR-101, AR-033, §14.6 | **Confidence:** High (Confirmed) | **Reasoning:** FR-101 and AR-033 mandate MFA for staff; §14.6 specifies staff MFA. | **Impact if changed:** Removing MFA fails FR-101, AR-033, and §14.1.1 mitigations for credential stuffing.

### 9.4 Session Management (FR-102)

- Access tokens: default 15-min TTL (Configurable); refresh tokens default 30 days with rotation and reuse-detection (reuse revokes the family, §14.6).
- Revocation: per-session logout, per-user revoke-all, and role/permission-based invalidation (token-version bump).
- Concurrent-session control: Configurable policy; recommended default 1 concurrent admin session per staff account with new-login notification.
- Idle timeout on the SPA (Configurable, recommended 15 min) with automatic re-auth.

**Source:** FR-102, §14.6 | **Confidence:** High (Confirmed; policy values Configurable) | **Reasoning:** FR-102 requires expiration, revocation, and concurrent-session control; §14.6 defines the token model. | **Impact if changed:** Long-lived unrevocable sessions violate FR-102 and §14.1.1.

### 9.5 Access Reviews (§14.1.7, OR-019)

Quarterly access reviews are supported by: role/assignment export (super-admin only), last-login and last-action reporting, dormant-account detection, and a review checklist workflow. Findings (reassignment/revocation) are executed and audited.

**Source:** §14.1.7, OR-019 | **Confidence:** High (Confirmed) | **Reasoning:** §14.1.7 requires quarterly access reviews; OR-019 requires an audit function. | **Impact if changed:** Skipping reviews leaves dormant privileged accounts as insider risk.

---

## 10. Admin APIs

Implements SRS §12.10 (Bearer + MFA), §12.1 conventions (errors, rate limits, pagination, versioning), and FR-126 enforcement. All admin endpoints require staff credentials + MFA (verified at gateway and Admin Service). Every request/response conforms to the §12.1 error envelope.

### 10.1 Endpoint-by-Endpoint Plan (§12.10)

| Endpoint | Method | Purpose | Authz (from §14.7) | Key behaviors / notes |
| --- | --- | --- | --- | --- |
| `/v1/admin/overview` | GET | Executive KPIs (§11.1) | administrator | aggregated only; supports `?period=`; no personal data |
| `/v1/admin/users` | GET | Search/filter users (§11.2) | administrator | masked phone (FR-022); filters: consent status, language, region, week, enrollment date, cohort, account status; cursor pagination |
| `/v1/admin/users/:id` | PATCH | Manage user status (§11.2) | administrator | `suspend`/`unsuspend`/`reactivate`; audited (`user.update`); validates status transitions |
| `/v1/admin/users/export` | GET | Export user list (CSV) | administrator | role-limited field whitelist; async job; 10/min rate limit (§12.1); signed-download delivery |
| `/v1/admin/campaigns` | GET/POST | List/create campaigns (§11.3) | administrator / content_manager (create); admin approval separate | POST validates template approval (FR-108) and opt-in audience (FR-017); scheduling per FR-029/FR-111 |
| `/v1/admin/reports` | GET | Operational reports (§11.7) | administrator / researcher | role-scoped report set (FR-099); PDF/CSV; async |
| `/v1/admin/audit-logs` | GET | Query audit log (§13.3.24) | administrator / super (read-only) | immutable read-only; filters: action, actor, resource, date range; cursor pagination; OR-019 |
| `/v1/admin/research/export` | POST | Request anonymized export (UC-005) | researcher + separate approval (FR-122) | governance workflow §7.4; de-identification re-check; audit; requester ≠ approver (FR-106) |
| `/v1/admin/support/tickets` | GET/POST | Support queue (FR-104) | support agent (+ owner for own tickets) | ticket create/update/close; user lookup; KB search linkage |

Supplementary admin-surface APIs (read/filter variants) that §11 implies but §12.10 groups under service APIs: `/v1/content*` admin-role operations (§4), `/v1/ai/conversations`, `/v1/ai/safety-events` (§8), and read-only research analytics queries served from the anonymized store (§7). These reuse the §12.8/§12.5 authz rules extended for admin roles.

**Source:** §12.10, §14.7, FR-094…FR-106, FR-107…FR-122 | **Confidence:** High (Confirmed endpoints; supplementary read APIs Recommended) | **Reasoning:** §12.10 is the authoritative admin API list; §14.7 assigns authz; the supplementary reads are the natural admin faces of the internal services §11 requires. | **Impact if changed:** Adding/removing endpoints requires updating the `admin.yaml` OpenAPI spec, the Admin Service route table, and QR-005 contract tests.

### 10.2 Error Codes (§12.1)

| Code | Meaning | Admin usage examples |
| --- | --- | --- |
| 400 | Validation error | malformed filter, bad date range |
| 401 | Unauthenticated / invalid token | missing/expired/mfa-less token on `/v1/admin/*` |
| 403 | Forbidden (role lacks permission) | researcher calling `/v1/admin/users`; content_manager calling audit-logs write |
| 404 | Not found | user/campaign/ticket id missing |
| 409 | Conflict | suspend of already-suspended user; duplicate ticket |
| 422 | Unprocessable entity | campaign with unapproved template; export scope exceeding approval |
| 429 | Rate limited | export >10/min; returns `Retry-After` |
| 500 | Internal error | unhandled; no PII in body |
| 502/503 | Upstream / unavailable | analytics pipeline down, provider outage |

### 10.3 Rate Limits & Idempotency (admin-specific)

- Admin export endpoints: **10 requests/min** (§12.1, Configurable). AI admin reads: 30/min. Standard admin reads: 120/min. All `429` + `Retry-After`.
- Writes (`/v1/admin/users/:id`, campaign create/update, ticket create) require `Idempotency-Key` (FR-161) so retries don't duplicate suspensions/campaigns/tickets.
- Sensitive-read (`audit-logs`, `users` detail) additionally log a justification field (FR-127).

**Source:** §12.1, FR-161, FR-127 | **Confidence:** High (Confirmed) | **Reasoning:** §12.1 fixes the export rate limit; §12.1 security notes require idempotency keys on writes and audit logging for admin actions. | **Impact if changed:** Raising export limits requires re-balancing §14.1.6 (API abuse) mitigations.

---

## 11. Development Phases

All timelines are **Configurable reference estimates**. Each phase is independently releasable and gated by the quality checks in §15 and QR-013. This sequence follows the dependency map in `02-srs-requirement-analysis.md`: auth/MFA before everything; user management before content/campaigns (they need audiences and owners); content before campaigns (campaign templates) and before analytics (content consumption); AI ops after AI service; research after analytics.

---

### Phase A — Admin Foundation: Auth, MFA & Session Infrastructure

**Objective.** Stand up the Admin Service skeleton, staff identity with MFA, session management, audit logging, RBAC permission resolver, and the portal shell such that every later phase lands into a secure, audited, role-gated environment. Satisfies FR-094 foundation, FR-101 (MFA), FR-102 (sessions), FR-098 (audit view foundation), FR-126 (server-side RBAC), AR-033, AR-030 shell, §14.6, and §12.1 admin conventions.

**Components.**
- Admin Service skeleton (OpenAPI `admin.yaml`, error envelope, pagination, idempotency, rate limiting for admin routes) per §12.1.
- Staff account model (already scaffolded in backend Phase B) with Argon2id password hashing, MFA enrollment/TOTP verify, backup codes, recovery flow (super-admin approved).
- Token claims: `role`, `token_version`, `mfa_verified`; gateway admin-route guard requiring MFA.
- Permission resolver: §14.7 matrix encoded as role → permission flags; deny-by-default middleware.
- `audit_logs` write middleware for admin actions + read-only `/v1/admin/audit-logs` endpoint (admin/super) with cursor pagination.
- Portal shell: design-system foundation (AR-034), login/MFA screens, session/idle handling, route guards driven by the permission resolver, EN/AM UI strings (NFR-033), WCAG baseline (§12).
- Admin notifications preference store (FR-103) scaffold.

**Dependencies.** Backend Phase A–B (gateway, auth service, staff/MFA tables, token model); `05-database-implementation-plan.md` migrations for `staff_users`, `staff_mfa`, `audit_logs`. Cloud secret manager for MFA issuer/keys.

**APIs implemented.** `/v1/admin/audit-logs` (GET); staff login/MFA endpoints (backend auth); permission-context endpoint consumed by the SPA.

**Tests.** Unit: permission-resolver matrix coverage (every §14.7 cell), token-claim validation, MFA verify (constant-time), audit middleware writes. Integration: MFA login flow end-to-end; 403 on role-mismatch for every matrix edge; audit read gated to admin/super; idempotent write replay; rate-limit 429 on export-style route.

**Verification evidence.** Role matrix unit test enumerates all §14.7 cells green; automated 403 assertions for researcher-on-user-management and content-manager-on-approval; MFA required to reach any `/v1/admin/*`; audit entries appear for every admin action in staging; portal shell loads with EN/AM and passes axe-core scan (§12).

---

### Phase B — User Management

**Objective.** Deliver §11.2: search, filters, user detail with consent views, account status management, role-limited CSV export, and bulk actions. Satisfies FR-096, FR-100, FR-095 inputs, FR-099 (export), FR-022 (masking), FR-004/FR-125 (consent views), FR-007 (deletion oversight).

**Components.**
- `/v1/admin/users` search/filter (masked phone server-side, §3.1), cursor pagination, combined indexed filters (§3.2).
- `/v1/admin/users/:id` PATCH (suspend/unsuspend/reactivate) with status-transition validation and audit.
- Consent management view: status, version, granted/withdrawn history per consent type (FR-100); re-consent request action.
- Bulk actions: cohort tag, campaign pre-seed, suspend/unsuspend, re-consent (§3.5), async idempotent jobs with per-item results.
- `/v1/admin/users/export` async CSV with role-limited field whitelist, signed-download, audit.
- Portal module: user list/detail, bulk action UI, export history.

**Dependencies.** Phase A; backend Phase C (user/profile/consent services), Phase E (pregnancy week for filters). Media/journal access later with Phase G (journal).

**APIs implemented.** `/v1/admin/users`, `/v1/admin/users/:id`, `/v1/admin/users/export` (§12.10).

**Tests.** Integration: search by name/phone-masked/id/cohort; each filter combination; suspend blocks login + outbound; consent history rendering; export CSV fields differ by role (phone masked vs not); bulk suspend idempotent; consent-withdrawn user filtered by consent status. Security: phone never appears unmasked in list/CSV for non-super roles (FR-022).

**Verification evidence.** User-management E2E: search → filter → suspend → export green in staging with synthetic data (QR-012); masked-phone assertion tests pass; export artifacts audited; bulk-job partial-failure report correct; permission tests prove researcher 403 on this module.

---

### Phase C — Content Management

**Objective.** Deliver §11.4: WYSIWYG editing, versioning with diff/history/rollback, approval workflow with medical gate, localization, expiry/archive. Satisfies FR-076…FR-083, FR-106, OR-021, AR-015/AR-016.

**Components.**
- WYSIWYG editor for article/video/audio/infographic/checklist/faq with structured checklist/FAQ fields and sanitized blocks (§4.2).
- Versioning service integration: snapshot on save (`content_versions`), history, diff (EN/AM), rollback-as-new-version (§4.3).
- Workflow engine: draft → pending_medical_review → approved → published (schedule) → archived; medical-flag classification; self-approval block (FR-106); review comments.
- Localization workflow: EN/AM parallel editing, parity checks, block-on-incomplete (§4.5).
- Expiry management + `content.retired` emission; notification to content team (FR-103).
- Content search (FR-083) and consumption-analytics event wiring (FR-084).
- Portal module: editor, version browser/diff/rollback, approval inbox for reviewers (Healthcare Partner), status board.

**Dependencies.** Phase A–B; backend Phase D (Content & CMS Service, §12.5). RAG ingestion triggered only on publish — wire to Phase F of `08-ai-rag-implementation-plan.md`.

**APIs implemented.** Admin-role variants of `/v1/content` (create/submit/approve/archive) per §12.5 authz extended for content_manager and healthcare_partner.

**Tests.** Integration: full lifecycle for a medical article (author → reviewer → publish) with self-approval blocked (409/403); diff correctness; rollback creates new version and re-enters approval if medical; AM parity block; expired item removed and `content.retired` emitted; search returns only approved/published. Contract: `content.yaml` schema (QR-005).

**Verification evidence.** E2E: content author submits, healthcare reviewer approves, publish → RAG index event observed (AR-016); rollback demonstrated with version history intact; localization parity test green; QR-019 clinical validation evidence attached for a seeded medical article.

---

### Phase D — Campaigns

**Objective.** Deliver §11.3: creation, segmentation, scheduling, template approval gate, throttling, delivery tracking, opt-out handling. Satisfies FR-107…FR-112, AR-021, NFR-005.

**Components.**
- Campaign builder: template picker (approved library EN/AM), audience filter builder (week/region/language/cohort/consent, opt-in required), audience preview (masked, FR-022).
- Two-stage approval gate: platform status + internal approver ≠ creator (FR-108, AR-021); delivery blocked otherwise.
- Scheduling with timezone, quiet hours (FR-029), per-user caps (FR-111), batch window (NFR-005).
- Tracking views over `campaign_messages`: delivery/read/reply/opt-out rates + time series (FR-109); campaign summary cards on overview.
- Opt-out processing: immediate exclusion + consent update (FR-112).
- Portal module: campaign list/detail, builder, approval inbox, metrics dashboard.

**Dependencies.** Phase A–C (approval roles from §14.7; content team owns templates); backend Phase H (campaign/broadcast service, WhatsApp templates); `07-whatsapp-platform-implementation-plan.md` template approval status feed.

**APIs implemented.** `/v1/admin/campaigns` GET/POST (§12.10).

**Tests.** Integration: campaign targeting excludes non-opted-in users (FR-017); unapproved template blocks scheduling (FR-108); caps enforced across overlapping campaigns (FR-111); status transitions from callbacks update metrics; opt-out immediately removes user from in-flight audience (FR-112); self-approval blocked. Load: batch dispatch within window (NFR-005).

**Verification evidence.** E2E: create → approve → schedule → send on WhatsApp sandbox → metrics populate; opt-out test shows immediate exclusion and consent flip; approval-gate negative test green; campaign summary appears on overview dashboard.

---

### Phase E — Analytics

**Objective.** Deliver §11.1 overview and §11.7 engagement/retention/cohort analysis with real-time feed (AR-024/AR-031) and operational reports (FR-099). Satisfies FR-095, FR-030, FR-084, FR-118, AR-024, AR-031.

**Components.**
- Analytics aggregation service consuming bus events (enrollment, engagement, prompt responses, campaign status, content consumption) into pre-aggregated views + research analytics tables (§10.1.3).
- Overview dashboard widgets (§6.1) with period selector; real-time SSE/WS feed with 60-s fallback polling (§2.3).
- Engagement views: DAU/WAU, response rates, content consumption (§11.7).
- Retention curves and cohort analysis over anonymized analytics (AR-032).
- `/v1/admin/reports` async PDF/CSV with role-scoped report set (FR-099).
- Portal module: dashboard, charts (design-system components), report generator/history.

**Dependencies.** Phase A–D (data from users/content/campaigns); backend Phase K (Research & Analytics pipeline); Research dashboard (Phase G) shares the pipeline.

**APIs implemented.** `/v1/admin/overview`, `/v1/admin/reports` (§12.10).

**Tests.** Integration: KPI math against seeded fixtures (total/active/response-rate/enrollment/week-distribution/region/campaign summary); near-real-time latency (≤30 s, Configurable); retention curve correctness; report role-scoping (researcher vs admin sets differ); rate limit 10/min on reports. Performance: dashboard queries meet NFR-007 targets at pilot scale.

**Verification evidence.** KPI fixtures assertions green; latency measurement shows AR-031 feed within threshold; report artifacts role-scoped and audited; Grafana business-KPI dashboard reflects the same numbers (AR-038).

---

### Phase F — AI Operations

**Objective.** Deliver §11.6: conversation review, safety alerts queue, prompt management with versioning/approval, model/version visibility. Satisfies FR-067, FR-068, FR-069, FR-062/063/065 surfaces, §14.11, NFR-049.

**Components.**
- Conversation browser: filters (safety status, language, date, segment), role-filtered access (§12.8), review actions, escalation to on-call reviewer (audited).
- Safety alerts queue with severity, age escalation, emergency follow-up visibility (§15.3); alert thresholds (NFR-050).
- Prompt library: EN/AM system prompts, versioned, approval workflow (approver ≠ editor), active-version flag, recovery.
- Model registry view: §9.8 tiers, fallback state, per-conversation model/provider/latency/tokens (FR-067); model-change approval tracking (NFR-049).
- Knowledge-gap and feedback queues (FR-066, FR-074).
- Portal module: AI ops dashboard, review workspace.

**Dependencies.** Phase A (roles/audit); backend Phase J (`08-ai-rag-implementation-plan.md`: AI orchestration, safety layer, conversations, feedback, model registry); Phase G (research reads) optional.

**APIs implemented.** Admin variants of `/v1/ai/conversations`, `/v1/ai/safety-events` (§12.8), prompt-management endpoints (internal admin surface per FR-068).

**Tests.** Integration: conversation list filtered by safety status; safety alert creation on emergency classification; prompt version approval blocks unapproved activation; model/version fields populated on every conversation record (FR-069); reviewer actions audited; alert age escalation fires. QR-011 regression hooks on safety queue.

**Verification evidence.** E2E: injected emergency triggers safety alert visible in queue and on-call notification; prompt edit requires approval; conversation shows model/prompt version; audit trail links each review action.

---

### Phase G — Research Dashboard

**Objective.** Deliver §11.5: theme visualization, sentiment trends, governed anonymized export with ethics/approval gate, audit. Satisfies FR-113…FR-122, AR-013, AR-032, UC-005, OR-017.

**Components.**
- Anonymized-only read path to research store (§7.1), verified server-side.
- Theme visualization (FR-114, §10.1.2) with confidence, filters (category/cohort/region/week/period).
- Sentiment trend views (§10.1.3).
- Governed export workflow: request → ethics check → approval (approver ≠ requester) → de-identification re-check → dataset assembly → audit with artifact hash (FR-116, FR-122).
- Research governance status: approvals on file, expiry, cohort coverage.
- Portal module: research dashboard (researcher role), approval inbox (approver role — an Administrator or designated approver; §14.7 research export column).

**Dependencies.** Phase A (roles/audit), Phase E (pipeline), backend Phase K (research schema, theme extraction, export jobs); ethics-approval records from program governance (OR-017).

**APIs implemented.** `/v1/admin/research/export` POST (§12.10); read-only research analytics views.

**Tests.** Integration: export blocked without ethics approval; requester = approver rejected (FR-106); exported dataset contains no identifiers (assert on column set and sample rows, FR-116/AR-032); every export audited with hash; scope beyond approval → 422. Privacy tests (QR-009) assert research store has no operational linkage.

**Verification evidence.** UC-005 executed end-to-end in staging: researcher requests, approver approves, anonymized dataset downloaded, audit trail complete; identifier-free assertion suite green.

---

### Phase H — Support Queue

**Objective.** Deliver FR-104: support-agent interface with user lookup, issue history, and searchable help-desk knowledge base; ties together the support escalation model (§18.4).

**Components.**
- `/v1/admin/support/tickets` GET/POST (create, comment, status, close) with owner-visible own-ticket views.
- User lookup (masked, FR-022) with consent-aware journal/conversation context for troubleshooting (documented reason, FR-127/§14.8).
- Help-desk KB search reusing content search (FR-083) + `OR-016` KB versioning.
- SLA tracking per §18.4 (L1 AI/self-service, L2 support, L3 engineering, L4 emergency escalation) with escalation timers and admin notifications (FR-103).
- Portal module: ticket queue, detail, KB sidebar.

**Dependencies.** Phase A–B (user lookup), Phase C (KB/content search), AI ops (L1 triage context).

**APIs implemented.** `/v1/admin/support/tickets` GET/POST (§12.10).

**Tests.** Integration: ticket create/update/close lifecycle; user lookup masked; journal context access logged with justification; KB search relevance; SLA escalation timer triggers notification; role matrix (support only; father only own tickets).

**Verification evidence.** Ticket E2E green; SLA escalation demonstrated in staging; KB search returns approved content; audit log shows documented-reason access.

---

## 12. Accessibility

Implements FR-140 (WCAG 2.1 AA), NFR-031, and AR-035 (plain-language copy), plus NFR-033 (EN/AM).

**Confirmed scope.** All web/admin interfaces meet WCAG 2.1 AA, including keyboard navigation, screen-reader support, and color contrast (FR-140). Automated + manual accessibility auditing is a release gate (QR-008, NFR-031).

### 12.1 Conformance Plan

| WCAG 2.1 area | Admin implementation |
| --- | --- |
| Keyboard navigation (2.1.1) | All controls operable by keyboard; visible focus indicators; no keyboard traps in modals/editors; logical tab order across dashboards |
| Screen readers (1.1.1, 1.3.1, 4.1.2) | Semantic landmarks, ARIA roles for grids/tables/tabs/dialogs; descriptive labels on filters and bulk actions; live regions for real-time metric updates (no unannounced refresh); alt text on all charts (data tables as alternates) |
| Contrast (1.4.3, 1.4.11) | Design-system tokens validated to AA (4.5:1 text, 3:1 UI/graphical); chart palettes include non-color cues (patterns/labels) |
| Zoom & reflow (1.4.4, 1.4.10) | 200% zoom with no loss; reflow at 320 CSS px; responsive tables degrade to stacked cards |
| Timing (2.2.1) | Idle-timeout warnings with extend option; export job completion via notification not forced redirect |
| Language (3.1.1) | `lang` attribute per locale; EN/AM strings; Amharic (Ge'ez script) rendering verified (FR-139-ready) |
| Errors (3.3.x) | Validation messages inline, associated with fields, plain language; not color-only |
| Charts & data (1.1.1, 1.4.3) | Every chart has a data-table equivalent; colorblind-safe palettes; text labels on data points |

### 12.2 Verification

- **Automated:** axe-core in CI on every portal build; Lighthouse/Pa11y scans for the defined scope (QR-008).
- **Manual:** screen-reader walkthroughs (NVDA/VoiceOver) of login/MFA, user management, content editor, campaign builder, and support queue before release; keyboard-only pass of every interactive flow.
- **Gate:** accessibility checks are part of QR-013 release gate; any AA violation in the defined scope blocks promotion.

**Source:** FR-140, NFR-031, QR-008, NFR-033 | **Confidence:** High (Confirmed) | **Reasoning:** FR-140/NFR-031 are Must Have and QR-008 makes accessibility testing mandatory. | **Impact if changed:** Any AA failure in scope fails QR-008/QR-013; exempting admin surfaces would violate FR-140's explicit "web/admin interfaces" wording.

---

## 13. Dependencies and Blockers

| # | Dependency | Needed by | Blocking if absent |
| --- | --- | --- | --- |
| D-1 | Backend Phases A–B (gateway, auth, staff/MFA, token model) | Phase A | No admin identity or secure API path; nothing can run |
| D-2 | DB migrations for `staff_users`, `staff_mfa`, `audit_logs`, `users`, `profiles`, `consents`, `content*`, `campaigns*`, `ai_conversations`, `research_*` (SRS §13.3) | all phases | No persistence for admin entities |
| D-3 | User & Profile service + Pregnancy Engine (backend C, E) | Phase B | No searchable users, no week filters |
| D-4 | Content & CMS service (backend D) + RAG ingestion on publish | Phase C | No content pipeline; AI ungrounded |
| D-5 | Campaign/Broadcast service + WhatsApp template approval feed | Phase D | No delivery, no template status |
| D-6 | Research & Analytics pipeline + theme extraction (backend K) | Phases E, G | No dashboards, no governed export |
| D-7 | AI Orchestration + safety layer + model registry (backend J) | Phase F | No conversations/safety/prompts to review |
| D-8 | Clinical/medical review staffing (D-04, OR-021) | Phase C | Medical content cannot reach approval gate |
| D-9 | Research ethics approval (D-05, OR-017) | Phase G | Governed exports blocked at ethics gate |
| D-10 | WhatsApp provider availability + template platform approval (D-01) | Phase D | Campaigns cannot schedule approved templates |
| D-11 | MFA enrollment/management staffing + 2FA delivery channel | Phase A | Staff accounts cannot enroll MFA |
| D-12 | Design-system tokens verified for AA (AR-034) | Phase A | Portal contrast/component baseline unverified |
| D-13 | Real-time feed bus/SSE infrastructure (AR-024) | Phase E | Dashboards fall back to polling only; AR-031 partially unmet |

**Source:** §2 dependency map of `02-srs-requirement-analysis.md`, SRS §1.9 D-01…D-06, AR-030…AR-035 | **Confidence:** High | **Reasoning:** These are the SRS's own dependency statements and the confirmed sequencing in `02`. | **Impact if changed:** Reordering phases (e.g., research before user management) invalidates the §2 dependency map and starves later phases of data.

---

## 14. Risks and Mitigations

| # | Risk | Likelihood / Impact | Mitigation |
| --- | --- | --- | --- |
| R-1 | Client-side-only gating of admin actions (security regression) | Low / High | Server-side RBAC + MFA on every endpoint (FR-126, AR-033); automated 403 matrix tests; no role logic in SPA beyond rendering |
| R-2 | Phone-number disclosure via search/export/logs (FR-022) | Medium / High | Masking applied at API layer, never SPA; hash-based phone match; no PII in logs (§18.1); export field whitelist tested per role |
| R-3 | Segregation-of-duties bypass (author=approver, requester=approver) | Medium / High | Server-side comparison of actor IDs (FR-106); UI prevents self-action; negative tests for all three invariants (§9.2) |
| R-4 | Research dashboard exposing operational/PII data (AR-032) | Medium / Critical | Anonymized-only read path; render-time verification; identifier-free assertion suite; QR-009 privacy tests |
| R-5 | Campaign fatigue / platform rate-limit violations | Medium / Medium | Per-user caps + throttling (FR-111); quiet hours (FR-029); opt-in enforcement (FR-017); throughput throttles per NFR-005 |
| R-6 | MFA lockouts / recovery abuse | Medium / Medium | Backup codes; recovery requires super-admin approval (audited); rate-limited OTP/MFA attempts; fail-safe account unlock runbook |
| R-7 | Content published without clinical review | Medium / High | Medical classification flag (FR-081); approval gate blocks publish (OR-021); reviewer distinct from author; QR-019 clinical validation gate |
| R-8 | Real-time analytics feed failing during incidents | Medium / Low | Fallback polling (60 s, Configurable); dashboard degrades gracefully; feed health in Grafana alerts (§18.3) |
| R-9 | Governed export abused or leaked | Medium / Critical | Ethics gate + requester≠approver (FR-122/FR-106); de-identification re-check; artifact hashes; signed expiring URLs; full audit |
| R-10 | Accessibility regressions block release | Medium / Medium | axe-core in CI; manual screen-reader/keyboard passes pre-release; AA tokens in design system; QR-008 gate |
| R-11 | Staff account takeover (credential stuffing, §14.1.1) | Medium / High | MFA on all privileged roles (FR-101); short-lived sessions (FR-102); lockout; anomaly detection; access reviews |
| R-12 | Data-retention/purge misconfiguration | Medium / High | Retention per data class (FR-105); automated purge jobs with audit; purge dry-run in staging; restore tests (NFR-014) |

**Source:** SRS §14.1 threat model, FR-101/102/105/106/111/112/116/122/126, §11, §12.1 | **Confidence:** High | **Reasoning:** Risks are derived directly from the SRS threat model and stated requirement acceptance criteria. | **Impact if changed:** Removing any mitigation re-opens the corresponding §14.1 threat or fails the associated FR acceptance criterion.

---

## 15. Verification Approach

### 15.1 Requirement Traceability (QR-015)

Every §11 view, §12.10 endpoint, and admin FR (FR-094…FR-106, FR-107…FR-122 admin faces) is mapped to its verification artifact in `22-feature-implementation-matrix.md` and `21-quality-gate-checklist.md`. No admin requirement ships without a passing test and recorded evidence.

### 15.2 Layered Testing (QR-001…QR-013)

| Layer | Admin coverage |
| --- | --- |
| Unit (QR-002) | ≥80% core coverage on Admin Service (permission resolver, workflow engines, masking, export scope) and ≥70% overall |
| Integration (QR-003) | service-to-service contracts (admin facade ↔ user/content/campaign/AI/research services), DB constraints (consent immutability, audit append-only), workflow state transitions |
| E2E (QR-004) | Role-based portal journeys: MFA login; user search/filter/suspend/export; content author→medical-approve→publish; campaign create→approve→schedule→track; safety-alert review; research export governance (UC-005); support ticket |
| Contract (QR-005) | `admin.yaml` schema compatibility in CI; breaking changes blocked |
| Performance (QR-006) | Dashboard query latency at pilot scale (NFR-007); admin list pagination; export job throughput |
| Security (QR-007) | SAST/DAST; 403-matrix assertions; masked-phone leak tests; CSRF/XSS checks; MFA/lockout tests; §14.1 regressions |
| Accessibility (QR-008) | axe-core in CI + manual screen-reader/keyboard passes (§12) |
| Privacy (QR-009) | research store identifier-free; export scope; consent-gated user data; no PII in logs; purge verification |
| Release gate (QR-013) | all of the above + clinical review of content changes before production promotion |

### 15.3 Verification Evidence per Phase

Each phase (§11) records: CI green with coverage gate; integration/E2E execution results; contract lint; security scan status; accessibility scan; feature-flag rollout on staging; audit-log sampling showing the phase's actions; and a phase-exit review against the phase's objective. Rollback readiness (QR-016) and a summary of evidence are logged before promotion.

### 15.4 User Acceptance (QR-017)

UAT with representative administrators, content managers, researchers, healthcare reviewers, and support agents covers: MFA onboarding, user management, content approval workflow, campaign management, research export governance, AI ops review, and support queue — against the §11 view requirements.

### 15.5 Continuous Verification

- **Per change:** contract tests + role-matrix tests + axe-core + masked-phone tests run in CI on every merge.
- **Per release:** QR-013 gate (unit + integration + E2E + security + accessibility + performance + clinical review) and QR-016 release review (dashboards, alerting, rollback).
- **Per quarter:** access reviews (§9.5), audit-log sampling, threat-model refresh (§14.1), and pen-test findings triage per NFR-019.

**Source:** SRS §17 (QR-001…QR-019), §18 monitoring, §14.1, FR-098/FR-105/FR-126 | **Confidence:** High (Confirmed) | **Reasoning:** QR-001…QR-019 are confirmed quality requirements; QR-013 is the universal release gate. | **Impact if changed:** Weakening any gate (e.g., dropping accessibility or clinical review) violates QR-013 and the corresponding NFR.

---

**Completeness statement.** This plan covers all §11 admin views, all §12.10 admin endpoints with §12.1 conventions, the §14.7 role matrix with segregation of duties, FR-094…FR-106 and the admin faces of FR-107…FR-122, AR-030…AR-035, MFA (FR-101), session controls (FR-102), audit logging (FR-098), phone masking (FR-022), WCAG 2.1 AA (FR-140), and the research governance/ethics gate (FR-116, FR-122, AR-032). No requirement in scope has been omitted or simplified.
