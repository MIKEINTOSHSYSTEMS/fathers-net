# 00. Requirement Inventory

**Source:** `docs/FathersNet-Complete-SRS.md` (FN-SRS-001, Version 2.0)
**Purpose:** Complete extraction of all requirements from the SRS into a controlling inventory used as the foundation for every implementation-plan document.
**Classification convention:** **Confirmed** (SRS-stated) · **Recommended** (engineering decision) · **Configurable** (parameter with default) · **Assumption** (requires human validation).

## 1. Total Requirement Count

| Series | Meaning | Count | ID Range |
| --- | --- | --- | --- |
| PD | Project Definition (vision, mission, goals) | 11 | PD-001…PD-011 |
| FR | Functional Requirements | 170 | FR-001…FR-170 |
| NFR | Non-Functional Requirements | 50 | NFR-001…NFR-050 |
| AR | Architecture Requirements | 40 | AR-001…AR-040 |
| OR | Operational Requirements | 30 | OR-001…OR-030 |
| QR | Quality/Testing Requirements | 19 | QR-001…QR-019 |
| US | User Stories | 20 | US-001…US-020 |
| UC | Use Cases | 5 | UC-001…UC-005 |
| UR | User Requirements (grouped) | 4 | UR-001…UR-004 |
| **Total** | | **349** | |

**ID continuity verified:** all series are gap-free across their documented ranges.

## 2. Project Definition (PD-001…PD-011)

| ID | Requirement Summary | Priority |
| --- | --- | --- |
| PD-001 | Vision: improve maternal/newborn/child health by actively involving fathers | Must Have |
| PD-002 | Mission: trusted digital companion with culturally appropriate, medically responsible support | Must Have |
| PD-003 | Problem statement: father exclusion, misinformation, unpreparedness, low facility engagement, limited evidence | Must Have |
| PD-004 | Objective: ≥60% of fathers complete ≥1 partner-support action/week in pilot | Must Have |
| PD-005 | Objective: demonstrable pre/post knowledge improvement | Must Have |
| PD-006 | Objective: reduce misinformation exposure via myth handling + FAQ | Must Have |
| PD-007 | Objective: ANC attendance + birth-preparedness checklist completion | Must Have |
| PD-008 | Objective: capture authentic father experiences for research | Must Have |
| PD-009 | Objective: research-grade evidence (anonymized datasets, dashboards, impact reports) | Should Have |
| PD-010 | Objective: scalable national digital fatherhood platform | Should Have |
| PD-011 | KPI framework and success metrics (Appendix F) govern measurement | Must Have |

## 3. Functional Requirements (FR-001…FR-170)

### 3.1 Onboarding, Registration & Consent Management (FR-001…FR-010)

| ID | Summary | Priority |
| --- | --- | --- |
| FR-001 | Registration via WhatsApp invitation link/QR and mobile app signup | Must Have |
| FR-002 | Capture/validate profile fields (name, phone, country, region, language, age group, EDD/LMP, stage) | Must Have |
| FR-003 | Plain-language Terms & Privacy consent with version/timestamp/identity recording | Must Have |
| FR-004 | Consent withdrawal restricting non-essential processing; audit records preserved | Must Have |
| FR-005 | Phone verification via OTP before activation; rate-limited | Must Have |
| FR-006 | Re-onboarding/profile editing with pregnancy-week recomputation | Must Have |
| FR-007 | Account deletion (right-to-erasure) with grace period and confirmation | Must Have |
| FR-008 | SSO/identity reuse across WhatsApp and app with one identity | Should Have |
| FR-009 | Unique non-guessable UUID per user; phone never a primary key | Must Have |
| FR-010 | Referral/cohort tagging for enrollment attribution | Should Have |

### 3.2 WhatsApp Channel & Conversational Engagement (FR-011…FR-030)

| ID | Summary | Priority |
| --- | --- | --- |
| FR-011 | WhatsApp Business API integration behind a managed message gateway | Must Have |
| FR-012 | First-contact welcome: message, project explanation, consent, language, profile | Must Have |
| FR-013 | Quick-reply intents: Report a Myth, Share a Challenge, Ask a Question, Daily Journal, Emergency Help | Must Have |
| FR-014 | Weekly fatherhood prompt engine segmented by pregnancy week | Must Have |
| FR-015 | Daily pulse micro-journaling with 4 rotating categories | Must Have |
| FR-016 | Weekly legacy prompt (Sunday) — letters to future child | Must Have |
| FR-017 | Opt-in confirmation; broadcasts only to explicitly opted-in users | Must Have |
| FR-018 | Voice-note intake: store audio, transcribe, persist transcription + metadata | Must Have |
| FR-019 | Photo submissions with secure object storage and access control | Must Have |
| FR-020 | Intent routing with helpful fallback for invalid messages | Must Have |
| FR-021 | Delivery/API/media failure handling with retry and alerting | Must Have |
| FR-022 | Never expose father phone numbers in broadcasts/groups/reports | Must Have |
| FR-023 | Full per-user conversation log with access control | Must Have |
| FR-024 | Multilingual handling (English, Amharic) incl. templates and intent | Must Have |
| FR-025 | Emergency language detection → immediate facility-care guidance | Must Have |
| FR-026 | Interactive myth-report flow with AI categorization | Must Have |
| FR-027 | "Share a Challenge" flow with category/week tagging, anonymized research use | Must Have |
| FR-028 | Conversation state persistence across interruptions | Should Have |
| FR-029 | Quiet hours and regional scheduling windows | Should Have |
| FR-030 | WhatsApp analytics: enrollment, active fathers, response rate, prompt engagement, categories | Must Have |

### 3.3 Pregnancy Journey & Personalization (FR-031…FR-040)

| ID | Summary | Priority |
| --- | --- | --- |
| FR-031 | Compute/maintain pregnancy week from EDD/LMP, auto-advance | Must Have |
| FR-032 | Week-by-week educational content aligned to pregnancy week | Must Have |
| FR-033 | Milestone tracking + notifications (first ANC visit, trimester ends, viability, birth) | Must Have |
| FR-034 | Journey timeline/dashboard: week, milestones, pending actions, recent journal | Must Have |
| FR-035 | Weekly father support-action recommendations with completion tracking | Must Have |
| FR-036 | Trimester transition messaging | Should Have |
| FR-037 | EDD countdown and milestone dates | Must Have |
| FR-038 | User preferences (language, channel, notification frequency, content categories) | Must Have |
| FR-039 | Partner involvement/shared journey (milestones, checklists) | Should Have |
| FR-040 | Journey data viewable by authorized healthcare workers with consent | Should Have |

### 3.4 Reminders & Notifications (FR-041…FR-050)

| ID | Summary | Priority |
| --- | --- | --- |
| FR-041 | Reminders for ANC appointments, vaccinations, postnatal checks, birth-prep milestones | Must Have |
| FR-042 | Multi-channel delivery: push, WhatsApp, (optional) SMS/email fallback | Must Have |
| FR-043 | Configurable reminder timing/lead and quiet hours | Should Have |
| FR-044 | One-time and recurring reminder templates | Must Have |
| FR-045 | Delivery/acknowledgement tracking; failures to admin dashboard | Should Have |
| FR-046 | Critical/emergency notifications bypass quiet hours | Must Have |
| FR-047 | Reminder localization (English, Amharic) | Must Have |
| FR-048 | Duplicate-reminder suppression across channels | Should Have |
| FR-049 | Admin-defined reminder templates with review/approval | Should Have |
| FR-050 | Reminder analytics (delivered, opened, acknowledged, ignored) | Should Have |

### 3.5 Father Diary / Journal & Voice Notes (FR-051…FR-058)

| ID | Summary | Priority |
| --- | --- | --- |
| FR-051 | Journal entries in text/voice/photo with chronological timeline | Must Have |
| FR-052 | Journal private by default; explicit sharing only | Must Have |
| FR-053 | Prompt responses auto-create linked journal entries | Must Have |
| FR-054 | Weekly legacy prompt letters stored privately | Must Have |
| FR-055 | Voice-note transcription, searchable | Must Have |
| FR-056 | AI tagging (week, category, mood, topic) reviewable by admins | Must Have |
| FR-057 | Journal export (PDF/JSON) by the user | Must Have |
| FR-058 | Admin journal-review interface for flagged/shared entries (consent-aware) | Should Have |

### 3.6 AI Assistant, RAG Knowledge Base & AI Operations (FR-059…FR-075)

| ID | Summary | Priority |
| --- | --- | --- |
| FR-059 | AI assistant on WhatsApp + app, grounded answers | Must Have |
| FR-060 | RAG: chunking, embeddings, semantic retrieval, source-cited generation | Must Have |
| FR-061 | Grounding restricted to curated approved knowledge; decline otherwise for health topics | Must Have |
| FR-062 | Safety classification of every inbound question and outbound answer | Must Have |
| FR-063 | Emergency keyword response with urgent facility guidance; never diagnose | Must Have |
| FR-064 | Language and intent detection (EN/AM; question/emergency/myth/challenge/journal) | Must Have |
| FR-065 | Medical safety layer validating outputs before delivery; escalate uncertain cases | Must Have |
| FR-066 | AI feedback loop (thumbs up/down) with low-rated answer review | Should Have |
| FR-067 | AI operations dashboard: conversations, safety flags, prompts, models, coverage | Should Have |
| FR-068 | Prompt management with versioning and approval | Should Have |
| FR-069 | Audit trail of AI interactions (prompt, response, model, version, safety flags) | Must Have |
| FR-070 | Knowledge-base management: add/review/approve/version/translate/retire | Must Have |
| FR-071 | Hallucination/accuracy monitoring with sampling and scoring | Should Have |
| FR-072 | Model selection and fallback on provider outage/cost limits | Should Have |
| FR-073 | No personal health data to AI providers without anonymization + DPA | Must Have |
| FR-074 | Knowledge-gap capture for content teams | Should Have |
| FR-075 | Fine-tuning dataset pipeline from approved Q&A pairs (no PII) | Could Have |

### 3.7 Educational Content & Content Management (FR-076…FR-085)

| ID | Summary | Priority |
| --- | --- | --- |
| FR-076 | Content library: pregnancy, labor/birth, first years | Must Have |
| FR-077 | Content types: article, video, audio, infographic, checklist, FAQ | Must Have |
| FR-078 | CMS with review/approval, versioning, scheduling, audit history | Must Have |
| FR-079 | Localization/translation workflow (EN/AM) with parity checks | Must Have |
| FR-080 | Content expiry/archiving (removal from active surfaces and AI grounding) | Should Have |
| FR-081 | Medical review tagging; unapproved medical content flagged | Must Have |
| FR-082 | WhatsApp content embedding as short messages with deep links | Should Have |
| FR-083 | Content search by topic/week/keyword/language | Should Have |
| FR-084 | Content consumption analytics | Should Have |
| FR-085 | Content quality ratings → review queue | Could Have |

### 3.8 Birth Preparation, Checklists & Budget (FR-086…FR-093)

| ID | Summary | Priority |
| --- | --- | --- |
| FR-086 | Hospital Preparation module: checklist, bag, shopping list, transport plan, emergency contacts | Must Have |
| FR-087 | Shopping list linked to budget tracker (planned/actual/variance) | Must Have |
| FR-088 | Checklist completion progress in journey dashboard | Must Have |
| FR-089 | Offline availability of birth-preparation + emergency guidance | Must Have |
| FR-090 | Document management (antenatal card photo, referral letters) encrypted/access-controlled | Could Have |
| FR-091 | Birth-preparedness reminders tied to checklist gaps from week 34 | Should Have |
| FR-092 | Danger-sign education content with emergency action card (plain language + audio) | Must Have |
| FR-093 | Birth-plan summary (facility, transport, support person) shareable/printable | Could Have |

### 3.9 Admin Portal, Dashboards & User Management (FR-094…FR-106)

| ID | Summary | Priority |
| --- | --- | --- |
| FR-094 | Web admin portal with RBAC (admin, researcher, content manager, AI admin, healthcare worker, support) | Must Have |
| FR-095 | Executive dashboard: father count, week distribution, active users, trends, regions | Must Have |
| FR-096 | User-management UI (search, view, policy-compliant edit) | Must Have |
| FR-097 | Admin review queues for flagged content (journals, AI answers, myths, challenges) | Should Have |
| FR-098 | Immutable audit-log view | Must Have |
| FR-099 | Operational report export (CSV/PDF) role-limited | Should Have |
| FR-100 | Consent-management views (status, version, withdrawal history) | Must Have |
| FR-101 | MFA for admin/privileged accounts | Must Have |
| FR-102 | Session management: expiration, revocation, concurrent-session control | Should Have |
| FR-103 | Admin notification preferences for key events | Should Have |
| FR-104 | Support-agent interface: lookup, issue history, KB search | Should Have |
| FR-105 | Data-retention configuration per data class with automated purging | Must Have |
| FR-106 | Granular RBAC enforcing segregation of duties (author ≠ medical approver) | Must Have |

### 3.10 Campaigns & Broadcast Management (FR-107…FR-112)

| ID | Summary | Priority |
| --- | --- | --- |
| FR-107 | Campaign creation: audience segmentation, scheduling | Must Have |
| FR-108 | Template approval before broadcast (platform + internal) | Must Have |
| FR-109 | Campaign monitoring: delivery, read, reply, opt-out metrics | Must Have |
| FR-110 | A/B variants for message testing | Could Have |
| FR-111 | Scheduling limits and rate throttling to avoid fatigue | Should Have |
| FR-112 | Broadcast opt-out handling (immediate removal) | Must Have |

### 3.11 Analytics, Research & Evidence Generation (FR-113…FR-122)

| ID | Summary | Priority |
| --- | --- | --- |
| FR-113 | Structured research data collection in research-ready schema | Must Have |
| FR-114 | AI theme/topic extraction across journal, myths, challenges | Must Have |
| FR-115 | Research dashboards: myths, challenges, sentiment, themes, engagement by week | Must Have |
| FR-116 | Anonymized dataset export with ethics/approval gate and audit | Must Have |
| FR-117 | Separate research/media consents, independently revocable | Must Have |
| FR-118 | Program KPI and impact metric computation | Must Have |
| FR-119 | De-identification/pseudonymization at collection | Must Have |
| FR-120 | Pre/post assessment delivery for knowledge/confidence measurement | Should Have |
| FR-121 | Publication-ready outputs (figures, tables, methodology notes) | Could Have |
| FR-122 | Research governance workflow: request → ethics → approval → export → audit | Must Have |

### 3.12 Privacy, Security & Data Protection Controls (FR-123…FR-132)

| ID | Summary | Priority |
| --- | --- | --- |
| FR-123 | Encryption in transit (TLS 1.2+) and at rest (KMS-managed) | Must Have |
| FR-124 | Data minimization | Must Have |
| FR-125 | Consent lifecycle: capture, versioning, re-consent, withdrawal, proof | Must Have |
| FR-126 | Server-side RBAC/ABAC on all data endpoints | Must Have |
| FR-127 | Access logging for personal/health data (identity, timestamp, reason, result) | Must Have |
| FR-128 | Data-subject rights: access, rectification, erasure, portability, restriction | Must Have |
| FR-129 | OWASP-aligned app security: validation, encoding, rate limiting, sessions, dependency scanning | Must Have |
| FR-130 | STRIDE threat modeling + SAST/DAST/penetration testing before release | Must Have |
| FR-131 | Incident response: logging, alerting, containment, notification, post-incident review | Must Have |
| FR-132 | DPIA artifacts and record of processing activities | Should Have |

### 3.13 Accessibility, Offline-First & Localization (FR-133…FR-142)

| ID | Summary | Priority |
| --- | --- | --- |
| FR-133 | Voice-first interaction (voice notes in, audio guidance out) | Must Have |
| FR-134 | Low-literacy UX: icons, images, short messages, audio, minimal text | Must Have |
| FR-135 | Emergency/danger-sign content offline pre-cached | Must Have |
| FR-136 | Offline journaling/checklist use with queued sync | Must Have |
| FR-137 | Low-bandwidth optimization: compression, progressive loading, data-saving modes | Should Have |
| FR-138 | Localization framework (EN/AM) across all surfaces | Must Have |
| FR-139 | RTL/non-Latin script rendering for future languages | Could Have |
| FR-140 | WCAG 2.1 AA for web/admin interfaces | Must Have |
| FR-141 | Assistive-technology compatibility (TalkBack/VoiceOver, dynamic type) | Should Have |
| FR-142 | Culturally appropriate content and imagery incl. Amharic audio | Should Have |

### 3.14 Community & Partner Features (Deferred) (FR-143…FR-148)

| ID | Summary | Priority |
| --- | --- | --- |
| FR-143 | Moderated father community groups | Won't Have (later) |
| FR-144 | Mentorship pairing | Won't Have (later) |
| FR-145 | Community engagement feeding anonymized research | Won't Have (later) |
| FR-146 | Partner-to-partner milestone sharing and shared checklists | Should Have |
| FR-147 | Community safety reporting and blocking | Won't Have (later) |
| FR-148 | Offline community digest | Won't Have (later) |

### 3.15 Integration & External Services (FR-149…FR-155)

| ID | Summary | Priority |
| --- | --- | --- |
| FR-149 | WhatsApp provider abstraction layer (switching supported) | Must Have |
| FR-150 | Cloud object storage for media with access control and retention | Must Have |
| FR-151 | LLM/embedding provider integration with DPA and pseudonymization | Must Have |
| FR-152 | Notification provider integration with failover | Must Have |
| FR-153 | REST/OpenAPI API + webhook events | Should Have |
| FR-154 | Future FHIR/HL7 interoperability design (not MVP) | Won't Have (MVP) |
| FR-155 | Analytics/observability integration (metrics, logs, traces) | Must Have |

### 3.16 Financial / Payment Readiness (Design Only) (FR-156…FR-158)

| ID | Summary | Priority |
| --- | --- | --- |
| FR-156 | Payment/mobile-money readiness design (not activated in MVP) | Won't Have (MVP) |
| FR-157 | Financial-literacy content for fathers | Should Have |
| FR-158 | Consumer-protection/reporting design if payments introduced | Won't Have (MVP) |

### 3.17 Backend, Data, Automation & Observability (FR-159…FR-170)

| ID | Summary | Priority |
| --- | --- | --- |
| FR-159 | Microservices backend: API gateway, auth, user, pregnancy engine, reminder engine, WhatsApp service, AI orchestration | Must Have |
| FR-160 | Event-driven architecture with message queue/bus | Must Have |
| FR-161 | Idempotency for message delivery and data ingestion | Must Have |
| FR-162 | Canonical data model: relational + vector + object storage | Must Have |
| FR-163 | Background scheduler with failure handling and observability | Must Have |
| FR-164 | Versioned schema migrations, import/export tooling | Must Have |
| FR-165 | Backup, DR, business continuity with RPO/RTO per data class | Must Have |
| FR-166 | Centralized logging, tracing, metrics, alerting | Must Have |
| FR-167 | CI/CD with automated build/test/security/deploy | Must Have |
| FR-168 | Feature flags + canary/rolling deployments | Should Have |
| FR-169 | Rate limiting and quota management at gateway and message gateway | Must Have |
| FR-170 | Security: secrets management, environment isolation, RBAC, data-access governance | Must Have |

## 4. Non-Functional Requirements (NFR-001…NFR-050)

| Group | IDs | Key Requirements |
| --- | --- | --- |
| Performance & Scalability | NFR-001…009 | 500+ concurrent fathers (configurable); median ≤500 ms / p95 ≤2 s; WhatsApp ack within provider timeout, 5 s median; async processing for AI/transcription/theme; batch broadcast within windows; horizontal scaling; predictable DB query performance; graceful degradation; AI generation ≤10 s |
| Availability & Reliability | NFR-010…015 | 99.9% availability (configurable); redundancy for critical services; RPO ≤15 min / RTO ≤4 h; health checks + self-healing; automated backup verification; third-party outage resilience |
| Security | NFR-016…024 | OWASP ASVS compliance, zero critical/high at release; defense-in-depth; OAuth 2.0/OIDC, strong hashing, MFA, short sessions; STRIDE + periodic pen testing; attack-class coverage; encryption at rest/in transit; secrets management + rotation; tamper-evident audit logging; verifiable deletion |
| Privacy & Data Protection | NFR-025…029 | Privacy-by-design + minimization; subject-rights processing with SLAs; research pseudonymization at collection; DPIA + processing register; third-party DPAs |
| Usability, Accessibility & Localization | NFR-030…035 | First-time/low-literacy usable (task success ≥80%); WCAG 2.1 AA; assistive tech; EN/AM with translation framework; plain-language/voice-first; offline-first |
| Operability, Maintainability & Portability | NFR-036…040 | Cloud + IaC + reproducible envs; centralized observability; zero-downtime deploys + rollback; maintainable code (lint/test/coverage floor); API versioning policy |
| Compliance & Standards | NFR-041…045 | Regulatory alignment (legal review before launch); research ethics; accessibility standards; WhatsApp Business policy; FHIR/HL7 future alignment |
| AI Quality & Safety | NFR-046…050 | No diagnosis/prescription (safety layer); accuracy target ≥90% on eval set (configurable); source citation or decline; AI governance (registry, prompt versioning, audits, bias review); hallucination/safety monitoring with alerting |
| Configurable Capacity Targets | NFR-050 grouping | Reference defaults: 500+ cohort; 500 concurrent conversations; 5,000 AI interactions/day; ~50 research records/father/month; ~5 MB voice / ~2 MB photo; ~10,000 outbound messages/day |

## 5. Architecture Requirements (AR-001…AR-040)

| Group | IDs | Key Requirements |
| --- | --- | --- |
| Architecture Core | AR-001…010 | Microservices + API gateway + event-driven bus; relational + vector + object stores; REST/OpenAPI platform; WhatsApp provider abstraction; RAG + medical safety layer; scheduled/queued jobs with retries/idempotency; stateless horizontal scaling; environment isolation; pluggable adapters for future integration |
| Data & Knowledge | AR-011…020 | Canonical data model with referential integrity; versioned immutable consent events; research data separation; time/event-based retention with purging; knowledge lifecycle controlling retrieval; incremental ingestion; source citations; provider abstraction + model fallback; pseudonymization to providers; auditable AI records |
| WhatsApp | AR-021…024 | Approved templates + internal approval gate; flow-builder logic with state persistence; media type-checks + malware scanning; near-real-time analytics feed |
| Mobile | AR-025…029 | Offline-first with local storage/queued sync/conflict-safe merges; push + deep linking; encrypted local storage; store + sideload/APK distribution; design-system consistency |
| Web/Admin | AR-030…035 | Role-based modules; real-time analytics; research dashboard on anonymized data only; MFA + session controls; design system; plain-language/voice-first copy |
| DevOps & Ops | AR-036…040 | IaC; CI/CD with canary deployments; monitoring/logging/alerting dashboards; backup + DR per RPO/RTO; cost monitoring with budget alerts |

## 6. Operational Requirements (OR-001…OR-030)

| Group | IDs | Key Requirements |
| --- | --- | --- |
| Operations | OR-001…012 | Operations team with on-call; support channels with SLAs; runbooks; maintenance windows; change management; service catalog/status page; centralized monitoring; alerting with severity + escalation; incident management process; AI incident tracking; WhatsApp/API failure monitoring; DR drills |
| People & Knowledge | OR-013…016 | Training materials; end-user guidance; technical documentation co-located; help-desk KB workflow |
| Governance | OR-017…026 | Research governance structure; M&E framework tied to KPIs; audit function; AI governance processes; clinical review for content; data-processing register; business continuity plan; data export/migration procedures; retention/deletion schedules; periodic privacy/security/compliance reviews |
| Rollout | OR-027…030 | Phased rollout with feature flags; pilot operations; stakeholder communication plan; versioned content/app releases with rollback |

## 7. Quality/Testing Requirements (QR-001…QR-019)

| ID | Summary | Priority |
| --- | --- | --- |
| QR-001 | Layered test strategy (unit, integration, E2E, contract, performance, security, accessibility, privacy) | Must Have |
| QR-002 | ≥80% unit coverage core backend, ≥70% overall | Must Have |
| QR-003 | Integration tests for service contracts and data flows | Must Have |
| QR-004 | E2E tests for critical journeys | Must Have |
| QR-005 | Contract testing for internal/external APIs | Should Have |
| QR-006 | Performance/load testing before release | Must Have |
| QR-007 | Security testing (SAST, DAST, dependency, pen test) | Must Have |
| QR-008 | Accessibility testing (WCAG 2.1 AA) | Must Have |
| QR-009 | Privacy testing (consent, minimization, export, deletion, pseudonymization) | Must Have |
| QR-010 | WhatsApp conversational testing (flows, templates, media, errors, safety) | Must Have |
| QR-011 | AI quality evaluation (accuracy, hallucination, safety, bias, sampling) | Must Have |
| QR-012 | Test data management (synthetic, no production PII) | Must Have |
| QR-013 | Release gate: unit+integration+E2E+security+accessibility+performance+clinical review | Must Have |
| QR-014 | AI releases pass evaluation set + safety regression | Must Have |
| QR-015 | Defect/requirement traceability with coverage status | Must Have |
| QR-016 | Release review: rollback readiness, dashboards, alerting verification | Must Have |
| QR-017 | User-acceptance testing with representative users | Must Have |
| QR-018 | Pilot evaluation (usability, engagement, safety, KPIs) | Must Have |
| QR-019 | Clinical/content validation against authoritative guide | Must Have |

## 8. User Stories (US-001…US-020)

Registration (US-001), pregnancy week personalization (US-002), weekly prompts (US-003), voice journaling (US-004), AI questions (US-005), reminders (US-006), hospital bag + budget (US-007), myth reporting (US-008), offline emergency guidance (US-009), Amharic (US-010), partner sync (US-011), healthcare worker review (US-012), executive dashboard (US-013), campaigns (US-014), research datasets (US-015), content review workflow (US-016), AI ops review (US-017), consent/privacy control (US-018), support KB (US-019), impact reports (US-020).

Priorities: US-001…010, 013, 014, 015, 016, 018 = Must Have; US-011, 012, 017, 019, 020 = Should Have.

## 9. Use Cases (UC-001…UC-005)

| ID | Use Case | Priority |
| --- | --- | --- |
| UC-001 | Father Registration & Consent | Must Have |
| UC-002 | Weekly Fatherhood Prompt & Response Collection | Must Have |
| UC-003 | AI Question Answering with Safety Escalation | Must Have |
| UC-004 | Birth Preparation Checklist & Budget Tracking | Must Have |
| UC-005 | Research Data Export (Anonymized) | Must Have |

## 10. User Requirements (UR-001…UR-004)

| ID | Summary | Priority |
| --- | --- | --- |
| UR-001 | Onboarding & registration: simple, phone-based, minimal friction | Must Have |
| UR-002 | Personalization: journey reflects father's week/language/context | Must Have |
| UR-003 | Trust & safety: plain-language privacy, consent control, export/delete | Must Have |
| UR-004 | Accessibility & inclusion: low-literacy, voice-first, offline | Must Have |

## 11. Assumptions, Dependencies, Constraints (from SRS §1.9)

| Class | IDs | Items |
| --- | --- | --- |
| Assumptions | A-01…A-07 | Ethiopia-first (EN/AM); WhatsApp + low/mid Android with intermittent connectivity; approved LLM + WhatsApp providers available; clinician-reviewed guide as knowledge foundation; configurable pilot cohort; voice-note usage; AI/messaging cost control priority |
| Dependencies | D-01…D-06 | WhatsApp API availability/policy in Ethiopia; LLM/embedding availability/cost/compliance; cloud regional availability; clinical review; research ethics approval; transcription/translation services (EN/AM) |
| Constraints | C-01…C-07 | No diagnosis/prescription; privacy-by-design + minimization; cost control; accessibility; offline-first; WhatsApp policy compliance; research anonymization + consent |

## 12. Inventory → Implementation Mapping (Overview)

| SRS Area | Primary Plan Document |
| --- | --- |
| Functional requirements (all groups) | `06-backend-development-plan.md`, `07-whatsapp-platform-implementation-plan.md`, `08-ai-rag-implementation-plan.md`, `09-mobile-application-development-plan.md`, `10-admin-dashboard-development-plan.md` |
| Non-functional (performance/availability/security/privacy/accessibility) | `12-devops-and-infrastructure-plan.md`, `11-security-and-privacy-plan.md`, `13-testing-and-quality-plan.md`, `23-healthcare-compliance-and-safety-plan.md` |
| Architecture requirements | `03-system-architecture-plan.md`, `04-technology-stack-analysis.md` |
| Database | `05-database-implementation-plan.md` |
| Operational | `14-development-phase-roadmap.md`, `17-final-execution-roadmap.md`, `16-risk-management-plan.md` |
| Quality/testing | `13-testing-and-quality-plan.md`, `21-quality-gate-checklist.md` |
| User stories/use cases/journeys | `02-srs-requirement-analysis.md`, `22-feature-implementation-matrix.md` |

**Requirement inventory confirmed: 349 requirements extracted.** All series gap-free. No requirements removed or simplified during extraction.
