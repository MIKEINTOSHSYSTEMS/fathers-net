# 15. Team and Resource Plan

**Document:** FathersNet (Ayay) — Team, Staffing, and Resource Implementation Plan
**Source of truth:** `docs/FathersNet-Complete-SRS.md` (FN-SRS-001 v2.0) — **Appendix E Operating Team Structure** is the controlling reference model for teams and roles (Product & Leadership; Engineering; AI & Data; Healthcare & Content; Research & Community; Security & Privacy). Also binding: Operational Requirements §18.6 — **OR-001** (defined operations team with on-call coverage and escalation paths), **OR-002** (user support channels with response SLAs), **OR-003** (runbooks), **OR-005** (change management), **OR-008** (alerting with severity/escalation), **OR-009** (incident management), **OR-010** (AI incident tracking), **OR-013** (training materials for administrators, content managers, support agents, researchers, healthcare workers), **OR-014** (end-user guidance), **OR-015** (co-located technical documentation), **OR-016** (help-desk KB workflow), **OR-017** (research governance structure), **OR-018** (M&E framework tied to KPIs), **OR-019** (audit function), **OR-020** (AI governance processes), **OR-021** (clinical review gate for content), **OR-022** (data-processing register), **OR-023** (business continuity), **OR-026** (periodic privacy/security/compliance reviews), **OR-027…OR-030** (phased rollout, pilot operations, stakeholder communication, versioned releases). Supporting authority: §14.7 roles & permission matrix (Father/User, Researcher, Healthcare Partner, Content Manager, Administrator, Super Administrator; segregation of duties), §18.4 support escalation model (Levels 1–4), §3 stakeholder register and personas (Program Administrator, Researcher, Content Manager, AI Operations Admin, Support Agent, Healthcare Worker), Appendix C reference cost model, Appendix F KPI framework, dependencies D-01…D-06 (WhatsApp provider, LLM/embedding, cloud, clinical review, research ethics, transcription/translation).
**Inputs:** `00-requirement-inventory.md` (OR-001…OR-030 inventory; QR-013/QR-017/QR-018/QR-019 gate ownership), `14-development-phase-roadmap.md` (phases 0–10, per-phase person-week reference estimates in §16.1, per-phase team distributions in §4–§13, milestones M0–M9 in §15, roadmap risks R-01…R-14 in §17).
**Sibling documents:** `13-testing-and-quality-plan.md` (QR ownership, quality gates), `12-devops-and-infrastructure-plan.md` (runbooks, observability, on-call tooling), `11-security-and-privacy-plan.md` (security review roles, pen-test), `16-risk-management-plan.md` (SRS Appendix G risk register), `20-resource-and-delivery-analysis.md` (detailed cost and delivery analysis).
**Purpose:** Production implementation plan for the people and resources that build, run, and evaluate the FathersNet (Ayay) platform: recommended team structure mapped to SRS Appendix E, per-role definitions with configurable FTE references, phase-by-phase staffing (phases 0–10), the post-pilot operational team, skills matrix, training and enablement (OR-013), communication cadence, external dependencies, person-week effort estimates cross-checked against `14-development-phase-roadmap.md`, resource risks and mitigations, and this plan's verification approach. This document plans only; it does not contain application code.
**Classification convention:** **Confirmed** (SRS-stated) · **Recommended** (engineering decision) · **Configurable** (parameter with default) · **Assumption** (requires human validation). Every major item carries **Source / Confidence / Reasoning / Impact-if-changed** annotations. All staffing figures are **configurable reference values, not commitments** (SRS §1.11, Appendix C).

---

## 1. Executive Purpose

This document is the controlling people-and-resource roadmap for FathersNet (Ayay). It answers three questions at any point in the program: **who is needed, when are they needed, and how are they organized, enabled, and sustained** from Phase 0 through the live, evaluated pilot and into post-pilot operations.

The plan is anchored to SRS Appendix E (Operating Team Structure), which defines the six-team reference model this document instantiates:

| SRS Appendix E Team | Reference Roles | Primary Program Role |
| --- | --- | --- |
| Product & Leadership | Product Owner, Project Manager, Technical Lead, Program Manager | Product direction, roadmap, delivery oversight, stakeholder coordination |
| Engineering | Backend, Mobile, Frontend, DevOps, QA | Application development, infrastructure, testing, deployment |
| AI & Data | AI/ML Engineer, Data Engineer, AI Safety Reviewer | AI pipeline, model evaluation, data processing, AI governance |
| Healthcare & Content | Clinical Reviewer, Content Manager, Healthcare Advisor, Translation Reviewer | Medical accuracy, content approval, cultural adaptation |
| Research & Community | Research Lead, Community Manager, Support Team | Participant engagement, research operations, user support |
| Security & Privacy | Security Engineer/Consultant, Privacy Advisor | Security reviews, privacy controls, incident response |

**Source:** SRS Appendix E. **Classification:** Confirmed (reference model). **Confidence:** High — the SRS names the teams, roles, and responsibilities explicitly. **Reasoning:** The Appendix E model is the intended staffing baseline; this plan maps every role to named SRS requirements so hiring, ramp, and handover are traceable. **Impact-if-changed:** Any deviation from the Appendix E model must be reflected in phase effort (section 10), gate ownership (section 8), and risk treatment (section 11); a smaller team extends calendar duration or reduces coverage, which directly threatens Gate G3 (QR-013).

**What this document deliberately does NOT do:** it does not set guaranteed headcount, hire dates, or salary figures as commitments; it does not write application code; it does not replace `20-resource-and-delivery-analysis.md`, which owns detailed cost and delivery analysis. Where the SRS states a **Recommended Reference Architecture** or **Configurable Parameter**, this plan carries the same classification and a sensible pilot default.

**How to read this document:** Section 2 defines the team structure and per-team responsibilities; section 3 defines each role (responsibilities, skills, phase need, configurable FTE); section 4 sequences staffing by phase 0–10 with ramp-up/ramp-down; section 5 defines the sustained post-pilot operational team (on-call, support, clinical review, AI ops); section 6 is the skills matrix; section 7 is training and enablement (OR-013); section 8 is communication and cadence; section 9 is external dependencies; section 10 is the effort estimate cross-checked against `14-development-phase-roadmap.md`; section 11 is resource risks and mitigations; section 12 is this plan's verification approach.

---

## 2. Team Structure

### 2.1 Recommended Team Structure

The six Appendix E teams operate as **one integrated delivery unit** with a thin program overlay. During build phases (0–9), Engineering, AI & Data, and QA form the delivery core; Healthcare & Content, Security & Privacy, Research & Community, and Product & Leadership provide enabling, gating, and review capacity. During Phase 10 and after, the Research & Community, Healthcare & Content, and Operations roles become the sustained service team.

**Source:** SRS Appendix E; `14-development-phase-roadmap.md` §16.2 (steady-state team of ~10–12 FTE equivalent across Engineering/AI/QA with part-time clinical, security, and program roles). **Classification:** Recommended. **Confidence:** High. **Reasoning:** A single integrated unit with named owners for each requirement series keeps the cross-cutting controls (02 §5: security, auditability, localization, observability, idempotency, testing) from being orphaned between teams. **Impact-if-changed:** Splitting into separate vendor or geographically disjoint teams raises communication overhead and must be accompanied by tighter interfaces (section 8) and co-located documentation (OR-015, section 7).

### 2.2 Team Map with Requirement Ownership

| Team (Appendix E) | Roles in This Plan | SRS Requirement Series Owned | Key Operating Responsibilities |
| --- | --- | --- | --- |
| **Product & Leadership** | Product Owner · Project Manager · Technical Lead · Program Manager | PD-001…PD-011; OR-018 (M&E); OR-029 (stakeholder comms); QR-015 (traceability) | Product vision and backlog; roadmap and gate G1–G3 coordination; architecture authority (ADR-001…ADR-006); funder/government reporting; decision-log approvals M-01…M-07 |
| **Engineering** | Backend Developers · WhatsApp Platform Engineer · Mobile Developers · Frontend Developers · DevOps Engineer · Database Engineer | FR-001…FR-170 build scope; AR-001…AR-040; NFR-001…NFR-015; NFR-036…NFR-040; QR-002…QR-006 | Application development (backend, WhatsApp, mobile, admin); infrastructure as code; CI/CD; observability; deployment; zero-downtime and rollback; on-call build support |
| **AI & Data** | AI/ML Engineer · Data Engineer · AI Safety Reviewer | FR-059…FR-075; FR-113…FR-122; NFR-046…NFR-050; AR-005, AR-006, AR-015…AR-020; QR-011, QR-014 | RAG pipeline; knowledge ingestion; model routing and fallback; medical safety layer; evaluation set; research pipeline and pseudonymization; AI governance records |
| **Healthcare & Content** | Clinical Reviewer · Content Manager · Healthcare Advisor · Translation Reviewer | FR-076…FR-085; OR-021 (clinical review gate); QR-019 (clinical validation); A-04 (authoritative guide) | Authoritative-guide-derived content library; CMS review/approval workflow; medical review tagging; EN/AM localization and parity; WhatsApp template clinical review |
| **Research & Community** | Research Lead · Community Manager · Support Team | FR-113…FR-122 (research governance); OR-002 (support SLAs); OR-017 (research governance); OR-018; OR-028 (pilot ops); QR-017 (UAT), QR-018 (pilot evaluation) | Ethics workflow; dataset governance and export; founding-cohort engagement; Level 1–2 support; UAT coordination; pilot evaluation |
| **Security & Privacy** | Security Engineer/Consultant · Privacy Advisor | FR-123…FR-132; NFR-016…NFR-029; AR-009; QR-007, QR-009; OR-019 (audit), OR-022 (data-processing register), OR-026 (periodic reviews) | STRIDE threat model; SAST/DAST/pen-test; webhook security; RBAC enforcement review; DPIA; data-processing register; privacy testing |

**Source:** SRS Appendix E roles/responsibilities column; requirement series from `00-requirement-inventory.md` §3–§7. **Classification:** Recommended mapping (the SRS confirms teams and responsibilities; the requirement-series ownership mapping is this plan's engineering decision). **Confidence:** High for team/role content; Medium for the exact requirement-series boundary between Healthcare & Content and Research & Community on research-content review. **Reasoning:** Ownership is assigned to the team whose primary discipline matches the requirement class, and cross-team gates (OR-021, QR-019, FR-106 segregation of duties) remain explicit so no team both authors and approves. **Impact-if-changed:** Re-assigning an owner team changes the phase staffing and the quality-gate checklist owner; the traceability matrix (QR-015) must be updated in the same change set.

---

## 3. Role Definitions

Every role below lists: responsibilities (with named SRS anchors), required skills, phases where needed, and a **configurable FTE reference**. FTE figures are reference values for the pilot and are not commitments (SRS §1.11, Appendix C); they assume the Appendix E integrated-team model.

### 3.1 Product & Leadership

| Role | Responsibilities | Required Skills | Phases Needed | FTE Reference (Configurable) |
| --- | --- | --- | --- | --- |
| **Product Owner** | Owns product vision and backlog; prioritizes Must/Should/Could (MoSCoW) against PD-001…PD-011; sets KPI targets with M&E (PD-011, Appendix F); owns change control through the decision log (02 §6); accepts phase deliverables at gates G1–G3. | Product management in health/social programs; backlog and priority discipline; low-literacy and emerging-market UX judgment; Amharic-context cultural awareness | 0, 2–10 | 0.5–1.0 |
| **Project Manager / Delivery Lead** | Runs the phase roadmap (14 §3–§13); owns milestones M0–M9; tracks effort vs. reference (14 §16.1); coordinates dependencies (14 §14); drives gate evidence packages for G1/G2/G3; manages delivery risks R-01…R-14. | Project/schedule management; dependency and gate management; cross-functional coordination; stakeholder reporting | 0–10 | 1.0 |
| **Technical Lead / Solutions Architect** | Architecture authority for ADR-001…ADR-006 and decisions M-01…M-07; guards AR-001…AR-040 compliance; approves technical design reviews; owns the cross-cutting-controls doctrine (02 §5); adjudicates engineering trade-offs. | System architecture (microservices, event-driven); RAG/AI platform design; cloud and IaC; security architecture literacy; strong written ADR discipline | 0–9 | 1.0 |
| **Program Manager (MERQ)** | MERQ program liaison; funder/government stakeholder coordination (OR-029); pilot cohort program operations (OR-028); ethics and partnership relationships; owns the M&E reporting cadence with Research Lead (OR-018). | Program management in health/NGO context; Ethiopian health-system landscape; ethics and partnership governance; report writing | 0, 10+ | 1.0 (build), 0.5–1.0 (pilot) |

### 3.2 Engineering

| Role | Responsibilities | Required Skills | Phases Needed | FTE Reference (Configurable) |
| --- | --- | --- | --- | --- |
| **Backend Developer (API/services)** | Implements FR-001…FR-170 server scope per `06-backend-development-plan.md`: user/profile, consent lifecycle, pregnancy engine, reminder engine, journal, checklist/budget, content service, event bus/outbox/scheduler; enforces idempotency (FR-161), rate limiting (FR-169), audit hooks (FR-098/127), and RBAC checks on every endpoint (FR-126). | Production API development (Node.js or equivalent); PostgreSQL; message queues; OAuth2/OIDC and token lifecycle; idempotency patterns; writing ≥80% core coverage tests (QR-002) | 1–8 (peak 2–5) | 2–3 |
| **WhatsApp Platform Engineer** | Implements FR-011…FR-030 per `07-whatsapp-platform-implementation-plan.md`: provider abstraction (FR-149, AR-004), webhook HMAC handling (FR-011, §7.4.1), conversation state machine (§7.2), template governance (FR-108, AR-021), media pipeline (FR-018/019, AR-023), emergency workflow (FR-025/063), campaign engine (FR-107…112). | WhatsApp Business API/Cloud API; provider abstraction design; state-machine implementation; media/transcription pipelines; template policy compliance (NFR-044); HMAC webhook security | 4 (with a Phase 8 maintenance slice) | 1–2 |
| **Mobile Developer** | Implements FR-133…FR-142, FR-031…FR-058, FR-086…FR-093 per `09-mobile-application-development-plan.md`: offline-first local store and sync engine (FR-136, AR-025), encrypted local storage (AR-027), low-literacy/voice-first UX, push + deep links (AR-026), AI chat integration, partner sync (FR-039/146), EN/AM localization. | React Native or Flutter (per M-04); SQLite and sync/conflict-resolution design; Android-first device testing incl. low-end devices; accessibility (TalkBack/VoiceOver); offline patterns | 6 (with Phase 8–10 maintenance slices) | 2 |
| **Frontend/Admin Developer** | Implements FR-094…FR-106, FR-107…FR-112 per `10-admin-dashboard-development-plan.md`: RBAC modules, executive/research/AI-ops dashboards, CMS UI, campaign manager, consent/audit views, MFA + session controls, WCAG 2.1 AA compliance (FR-140, NFR-031). | Modern frontend framework; role-based UI design; WCAG 2.1 AA; data visualization; design-system conformance (AR-029/034) | 7 (with Phase 8–10 slices) | 2 |
| **DevOps Engineer** | Implements AR-036…AR-040 and NFR-036…NFR-040 per `12-devops-and-infrastructure-plan.md`: IaC and environment isolation, CI/CD with canary/rollback, secrets management, monitoring/logging/alerting, backup and DR (RPO/RTO per §19), cost monitoring (AR-040). Becomes primary on-call owner post-pilot (OR-001). | Terraform/IaC; container orchestration; CI/CD pipelines; observability stacks; secrets and key management; incident response tooling | 1, 3, and continuous (on-call from Phase 10) | 1.0 |
| **Database Engineer** | Implements FR-162/FR-164 and the §13.3 schema per `05-database-implementation-plan.md`: migrations, indexes, consent immutability (AR-012), research separation (AR-013), retention purging (FR-105), vector-store integration with Qdrant. | PostgreSQL internals; migration tooling; query performance tuning; JSONB; append-only audit design | 1–2 (with Phase 8–10 support) | 1.0 |
| **QA Engineer** | Executes QR-001…QR-016 per `13-testing-and-quality-plan.md`: unit coverage gates, integration, E2E journeys (QR-004), performance (QR-006), accessibility (QR-008), privacy (QR-009), WhatsApp (QR-010), test data hygiene (QR-012), traceability refresh (QR-015); coordinates UAT (QR-017) and release review (QR-016). | Layered test engineering; performance/load tooling; security/privacy test collaboration; accessibility testing; test-data management; requirement traceability | 1 (ramp), 2–9 (active), 9 (peak), 10 (pilot QA) | 2 (lead + 1 analyst) |

### 3.3 AI & Data

| Role | Responsibilities | Required Skills | Phases Needed | FTE Reference (Configurable) |
| --- | --- | --- | --- | --- |
| **AI/ML Engineer** | Implements FR-059…FR-075 per `08-ai-rag-implementation-plan.md`: ingestion/chunking/embeddings, vector retrieval, reranking/MMR, model routing and fallback (FR-072, AR-018), evaluation set and safety regression (QR-011, QR-014), cost-aware routing. | LLM/RAG engineering; embedding and vector-store expertise; evaluation-set design; prompt engineering with versioning; provider abstraction (Gemini/GPT/Claude tiers) | 5 (with Phase 6/8 slices) | 1–2 |
| **Data Engineer** | Implements FR-113…FR-122: research pipeline (events → anonymized research records), theme/sentiment extraction, pseudonymization at collection (FR-119, NFR-027), KPI computation (FR-118), governed export (FR-116/122), retention per ethics terms (FR-105). | Event-driven data pipelines; pseudonymization/de-identification; analytics schemas; ETL orchestration; governance/audit integration | 5, 8 (with Phase 10 support) | 1.0 |
| **AI Safety Reviewer** | Operates the AI ops dashboard (FR-067); reviews conversation queues, safety flags, and emergency events (OR-010); scores evaluation-set samples and hallucination monitoring (FR-071, NFR-050); approves prompt/model changes (FR-068, NFR-049); runs bias/fairness reviews (NFR-049). | AI safety review practice; clinical-safety literacy (no-diagnosis boundary, NFR-046); evaluation and sampling methods; human-in-the-loop review workflows | 5 (training), 8+ (operational), continuous post-pilot | 0.5–1.0 |

### 3.4 Healthcare & Content

| Role | Responsibilities | Required Skills | Phases Needed | FTE Reference (Configurable) |
| --- | --- | --- | --- | --- |
| **Clinical Reviewer** | Medical accuracy gate for all health content and AI grounding (OR-021, QR-019, A-04); approves medical-review-tagged content (FR-081); validates danger-sign/emergency guidance (FR-063, FR-092); participates in clinical validation of the evaluation set; sole approver role for medical content (FR-106 segregation of duties). | Licensed clinical reviewer (midwife/physician/nurse with maternal-newborn expertise); evidence review; plain-language clinical communication; Amharic-context health literacy | 2 (first review cycle), continuous through 10 and post-pilot | 0.5 (throughput-constrained; see section 11) |
| **Content Manager** | Authors and curates the content library (FR-076/077); runs the CMS workflow draft → medical review → approved → publish → archive (FR-078, FR-080); owns the content calendar (Appendix I); embeds content into WhatsApp (FR-082); tracks consumption analytics (FR-084); captures knowledge gaps (FR-074). | Health-content production; CMS workflow discipline; plain-language/voice-first writing (AR-035, NFR-034); content analytics | 2 (authoring starts), continuous through 10 and post-pilot | 1.0 |
| **Healthcare Advisor** | Domain advisor for clinical workflows (referrals, danger-sign protocols, ANC/PNC standards); validates emergency-response content; provides the healthcare-worker perspective in UAT (QR-017) and pilot evaluation (QR-018); supports provider-facing consultation. | Maternal-newborn health expertise in the Ethiopian context; facility workflow knowledge; advisory communication | 0 (design inputs), 2+ (content), 9 (UAT), 10+ | 0.25–0.5 |
| **Translation Reviewer (EN/AM)** | Reviews and signs off Amharic translations of content, WhatsApp templates, notifications, and UI strings; enforces parity checks (FR-079); reviews Amharic voice/audio guidance (FR-142); validates Amharic emergency keywords and fallback messages (FR-024/025). | Native-level Amharic; health-terminology translation; EN↔AM parity review; audio/voice guidance review | 4 (templates), continuous from 4 through 10 and post-pilot | 0.5 |

### 3.5 Research & Community

| Role | Responsibilities | Required Skills | Phases Needed | FTE Reference (Configurable) |
| --- | --- | --- | --- | --- |
| **Research Lead** | Establishes research governance (OR-017): ethics approval plan (D-05, FR-117), research consent model, dataset governance and export approval gate (FR-116/122), theme-extraction quality sampling (FR-114), publication workflow; delivers QR-018 pilot evaluation and impact reports (US-020). | Public-health research design; ethics protocol authoring; M&E methodology; anonymized-dataset governance; publication practice | 0 (governance groundwork), 8 (pipeline), 10 (evaluation) and post-pilot | 0.5–1.0 |
| **Community Manager** | Owns founding-cohort engagement (OR-028): invitation and onboarding playbooks, referral/cohort tagging (FR-010), weekly engagement support, myth/challenge follow-up, retention tactics toward PD-004 targets, feedback capture for product team. | Community/program engagement; Ethiopian fatherhood program context; participant-relations ethics; engagement analytics | 10 (cohort onboarding) and post-pilot | 0.5 |
| **Support Agent (Level 1–2)** | Operates user support per OR-002 and §18.4: Level 1 self-service triage and Level 2 account/consent/troubleshooting via the support-agent interface (FR-104); maintains help-desk KB workflow (OR-016); executes opt-out and deletion requests within SLAs (FR-007/112, NFR-026); escalates Level 3/4 per runbook (OR-003, §18.4). | Support-desk practice; consent and privacy-literal handling; KB authoring; Amharic/English support; empathy with low-digital-literacy users | 9 (training + pre-launch), 10 (live), post-pilot | 1–2 |

### 3.6 Security & Privacy

| Role | Responsibilities | Required Skills | Phases Needed | FTE Reference (Configurable) |
| --- | --- | --- | --- | --- |
| **Security Engineer/Consultant** | Produces the STRIDE threat model (FR-130, §14.1); owns SAST/DAST/dependency scanning and penetration-test management (QR-007, NFR-019); implements webhook security pattern review (FR-011); verifies OWASP ASVS alignment (NFR-016); supports incident response (FR-131, OR-009); quarterly access reviews (§14.7). | Application-security engineering; threat modeling (STRIDE); SAST/DAST tooling; pen-test scoping; OWASP/ASVS; incident response | 0 (threat model), 3 (core), 9 (verification), and post-pilot (scan/pen cadence) | 0.5–1.0 (build), 0.5 (post-pilot) |
| **Privacy Advisor** | Produces the DPIA and record of processing activities (FR-132, NFR-028); reviews third-party DPAs (FR-073, FR-151, NFR-029); validates privacy-by-design and data minimization (FR-124, NFR-025); reviews subject-rights workflows (FR-128); leads periodic privacy reviews (OR-026). | Data-protection law and practice (Ethiopian + international alignment); DPIA methodology; DPA negotiation review; consent-lifecycle design | 0 (DPIA), 3 (privacy controls), 8 (research privacy), and post-pilot (OR-026) | 0.25 |

**Source:** SRS Appendix E (roles/responsibilities), §14.7 (permission matrix), §18.4 (escalation model), §18.6 (OR-001…OR-030); requirement anchors from `00-requirement-inventory.md`. **Classification:** Recommended (role definitions and FTE references are this plan's operationalization of the Confirmed Appendix E model; FTE figures are **Configurable**). **Confidence:** High for role-to-requirement mapping; Medium for FTE ranges, which depend on individual velocity, hiring pool, and overlap policies (14 §16.2). **Reasoning:** Each role is tied to at least one named requirement or requirement series so hiring and enablement can be prioritized by gate needs (G1→G2→G3). **Impact-if-changed:** Reducing FTE for any gating role (Clinical Reviewer, Security, QA Lead, Research Lead) directly lengthens the calendar for Gate G2/G3 evidence or narrows UAT/clinical validation coverage; the section 10 totals must be re-derived from the changed role assumptions.

---

## 4. Phase-Based Staffing

Staffing follows the eleven phases of `14-development-phase-roadmap.md` (Phase 0–Phase 10). The table shows which roles are active per phase, the approximate **peak headcount**, and the ramp-up/ramp-down note. Headcounts are **Configurable reference values** consistent with 14 §16.2's ~10–12 FTE steady-state core plus part-time enablers.

| Phase (14 reference) | Active Roles (from §3) | Peak Headcount (Configurable) | Ramp-Up / Ramp-Down Notes |
| --- | --- | --- | --- |
| **0 — Planning & Architecture Validation** (16 pw) | Product Owner, Project Manager, Technical Lead, Program Manager, Security Engineer, Privacy Advisor, Research Lead, Healthcare Advisor | ~6 FTE + enablers | All four Product & Leadership roles are core; Security/Privacy produce STRIDE + DPIA; Research Lead starts ethics groundwork; Technical Lead resolves M-01…M-07. No developers required yet — hiring for Phase 1–2 starts in parallel. |
| **1 — Foundation** (26 pw) | DevOps Engineer, Database Engineer, Backend Developer (early), QA Engineer (ramp), Technical Lead | ~5 FTE | DevOps + Database Engineer are the critical path for IaC/CI/CD/migration baseline; QA ramps to own CI gates; Technical Lead gates Gate G1. Backend team grows to full strength for Phase 2. |
| **2 — Backend Core** (62 pw) | Backend Developers (2–3), Database Engineer, QA Engineer, Security Engineer (slice), Content Manager, Clinical Reviewer (first cycle) | ~8–9 FTE | Peak Engineering demand. Content Manager + Clinical Reviewer begin authoring/reviewing the knowledge base ahead of Phase 5 AI grounding (R-04 mitigation, 14 §17). Security slice keeps cross-cutting controls non-retrofittable (02 §5). |
| **3 — Authentication & Security** (36 pw) | Security Engineer/Consultant (peak), Backend Developers, QA Engineer, Privacy Advisor | ~6 FTE | Security Engineer/Consultant is the critical path for Gate G2. QA runs the auth/authz/webhook security test suite. Privacy Advisor verifies encryption/consent/DPA coverage. |
| **4 — WhatsApp Platform** (40 pw) | WhatsApp Platform Engineer (1–2), Backend Developers, QA Engineer, Content Manager + Clinical Reviewer (template review), Translation Reviewer (EN/AM) | ~7 FTE | WhatsApp Platform Engineer is the critical path; Content/Clinical/Translation review WhatsApp templates through the approval gate (FR-108, AR-021). QA runs QR-010 conversational tests. |
| **5 — AI/RAG Platform** (46 pw) | AI/ML Engineer, Data Engineer, AI Safety Reviewer, Backend Developer (support), QA Engineer, Clinical Reviewer (eval set) | ~7 FTE | AI & Data team peaks. AI Safety Reviewer ramps on OR-010 workflows; Clinical Reviewer validates the evaluation set and emergency guidance (QR-011/QR-014). Overlaps with Phase 4 tail (14 §2.2). |
| **6 — Mobile Application** (56 pw) | Mobile Developers (2), Backend Developer (support), QA Engineer, Translation Reviewer, AI/ML Engineer (voice/AI integration slice) | ~7 FTE | Mobile Developers peak; QA runs device-matrix + offline-sync tests; Translation Reviewer signs off Amharic UI (FR-138). Localization content arrives from Content team. |
| **7 — Admin Dashboard** (34 pw) | Frontend Developers (2), Backend Developer (support), QA Engineer, Product Owner, Project Manager | ~6 FTE | Frontend Developers peak; Product Owner accepts dashboard role tests (FR-094/126); QA runs WCAG 2.1 AA + role-matrix tests. |
| **8 — Integration** (20 pw) | Data Engineer, Backend Developer, QA Engineer, Research Lead, AI Safety Reviewer (support) | ~5 FTE | Data Engineer owns the research pipeline and governed export; Research Lead signs off governance; QA runs UC-001…UC-005 E2E and notification failover; feature-flag rollout platform (FR-168). |
| **9 — Testing** (42 pw) | QA Engineer (peak), all squads (fixes), Security Engineer/Consultant, Clinical Reviewer, Product Owner, Project Manager, Support Agent (training), UAT coordinator | ~10 FTE (whole team) | QA Lead + team own QR-001…QR-019; every squad contributes fixes (14 §16.1 note); Security runs pen-test; Clinical Reviewer completes QR-019; UAT (QR-017) uses representative fathers, partners, healthcare workers, administrators; Support Agents train pre-launch (OR-013). |
| **10 — Pilot Deployment** (26 pw) | Program Manager, Community Manager, Support Agents (1–2), DevOps (on-call), Backend (standby), AI Safety Reviewer, Clinical Reviewer, Research Lead + M&E, Product Owner | ~8 FTE sustained | Handoff from build to operations: on-call rotation active (OR-001), support SLAs live (OR-002), community onboarding of founding cohort (OR-028), AI ops monitoring (OR-010), QR-018 evaluation run; Engineering steps down to standby/on-call. |

**Source:** `14-development-phase-roadmap.md` §4–§13 (phase objectives, dependencies, effort distributions) and §16.1 (person-week references). **Classification:** Recommended (staffing model) with Configurable headcount figures. **Confidence:** Medium-High — the phase sequence and dependency logic are Confirmed by 14; headcount is a planning reference that must be validated against actual availability (M-04, hiring pool; 14 §16.3). **Reasoning:** Staffing is front-loaded where the dependency map puts the critical path (P1 infrastructure → P2 backend → P3 security → P4 WhatsApp → P5 AI), and gating roles (Security, QA, Clinical) are scheduled to land their evidence before Gates G2 and G3. **Impact-if-changed:** Delaying any gating role's start (e.g., Clinical Reviewer not active by Phase 2) shifts the bottleneck later and risks R-04 (clinical review backlog) and R-05 (ethics delay) blocking Gate G3 at the end rather than at the phase where the work is cheapest.

### 4.1 Ramp-Up / Ramp-Down Summary

- **Ramp-up:** Technical Lead + DevOps + Database Engineer in Phase 0–1; Backend to full strength by Phase 2; WhatsApp/AI/Data specialists in Phases 4–5; Mobile and Frontend in Phases 6–7. Hiring for each specialist begins two phases before peak need because of provider and skill-pool lead times (14 §16.3).
- **Ramp-down:** Specialist roles (WhatsApp, Mobile, Frontend, Data) step to standby/maintenance slices in Phases 8–10 as their surface completes; QA ramps down after QR-018; Security/Clinical/Content/AI-safety transition into the sustained operational team (section 5).
- **Handover discipline:** Every ramp-down includes a documented handover to the operational team (OR-015 co-located documentation, runbooks OR-003) before the role's on-call/support obligations transfer — this is the primary R-12 (turnover) mitigation.

---

## 5. Operational Team (Post-Pilot)

After Gate G3 and founding-cohort go-live, build staffing converts to a sustained service team governed by OR-001…OR-030. This team is **not** a new organization; it is the Phase 10 roster continuing, with engineering on standby and the program-facing teams growing.

### 5.1 On-Call Operations (OR-001, OR-008, OR-009)

- **Structure (Configurable):** a 24×7 pager rotation (primary + secondary) drawn from DevOps Engineer and Backend Developer standby, sized so no single person is on call more than 1 week in 4; a secondary technical-on-call for AI/WhatsApp-specific incidents during the first three months of pilot.
- **Responsibilities:** respond to alerts by severity (OR-008); execute runbooks for deployment, backup, restore, incident handling, AI failure, WhatsApp outage (OR-003); run the structured incident process — detection, triage, containment, resolution, post-incident review, action tracking (OR-009, FR-131); track AI-specific incidents in the dedicated review queue (OR-010).
- **Service targets (Configurable):** severity-critical response ≤ 15 minutes; severity-high ≤ 1 hour; post-incident review within 5 business days; availability tracked against NFR-010 (99.9%).
- **Source:** OR-001, OR-003, OR-008, OR-009, OR-010; §18.4 escalation model. **Classification:** Confirmed structure; targets Configurable. **Confidence:** High. **Reasoning:** The SRS mandates a defined operations team with on-call and escalation; a rotating pager with documented runbooks is the reference implementation. **Impact-if-changed:** Fewer on-call participants lengthens rotation intervals and increases burnout/turnover (R-12); runbook gaps delay RTO ≤ 4 h (NFR-012).

### 5.2 Support Agents (OR-002, FR-104, §18.4)

- **Level 1 (AI + self-service):** the Ayay assistant, FAQ, and in-app/WhatsApp help flow (OR-014) absorb common questions — no human staffing, monitored by the AI Safety Reviewer.
- **Level 2 (Support Team):** 1–2 Support Agents handle account issues, consent, troubleshooting via the support-agent interface (FR-104); they own help-desk KB authoring and versioning (OR-016) and process subject-rights requests (access, rectification, erasure, portability, restriction) within defined SLAs (FR-128, NFR-026).
- **Level 3 (Technical):** escalated bugs route to engineering standby per runbook.
- **Level 4 (Emergency healthcare):** danger-sign escalations route to facility care and the on-call reviewer per §18.4; the AI Safety Reviewer and Clinical Reviewer are the human backstop (OR-010, §14.10).
- **SLA reference (Configurable):** Level 2 first response ≤ 4 business hours; subject-rights request fulfillment ≤ 30 days (or local-law-bound); opt-out and deletion processed immediately per FR-112/FR-007.

### 5.3 Content and Clinical Review Operations (OR-021, QR-019)

- Sustained cadence (Configurable): weekly clinical review window for new/updated health content and WhatsApp templates; monthly full review of the active content library; quarterly review of the AI knowledge base (A-04) against the authoritative guide; any content change that enters the AI knowledge base is re-ingested under AR-015/AR-016 lifecycle rules.
- The Clinical Reviewer is the sole medical approver (FR-106); the Content Manager authors; segregation of duties is enforced by the system and audited (FR-098).
- **Source:** OR-021, QR-019, FR-081, FR-106, A-04. **Classification:** Confirmed cadence structure; weekly/monthly/quarterly intervals Configurable. **Confidence:** High. **Reasoning:** OR-021 mandates the clinical review gate; a standing cadence prevents the backlog that R-04 warns about. **Impact-if-changed:** Reducing the review cadence increases the risk of unapproved content reaching users or AI grounding (FR-081, QR-019).

### 5.4 AI Operations (OR-010, FR-067, FR-071)

- The AI Safety Reviewer monitors the AI ops dashboard daily: conversation review, safety flags, emergency events, prompt versions, knowledge coverage (FR-067); runs hallucination/accuracy sampling and scoring (FR-071, NFR-050); approves prompt and model changes with versioning and reversibility (FR-068, NFR-049); maintains the model registry and bias/fairness review schedule (NFR-049, §14.11).
- Alert thresholds (Configurable): unsafe-response rate, emergency false-negative detection, hallucination flag counts, cost-per-AI-interaction against AR-040 budget alerts.

### 5.5 Research, M&E, and Program Operations (OR-017, OR-018, OR-028)

- Research Lead + M&E: run the KPI framework (PD-011, Appendix F) with the reporting cadence (weekly enrollment/engagement to program; monthly KPI report; quarterly impact report to funders per US-020); operate research governance — requests → ethics check → approval → governed export → audit (FR-122); deliver the QR-018 pilot-evaluation report and feed findings into the roadmap (PD-010).
- Community Manager: founding-cohort onboarding, engagement, retention tactics toward PD-004…PD-008; Program Manager owns OR-029 stakeholder communications.

### 5.6 Sustained Governance Roles (OR-019, OR-022, OR-023, OR-026)

- Audit function (OR-019): audit-log read access for compliance reviews — owned by Security/Privacy with the Super Administrator role (§14.7).
- Data-processing register and DPA review (OR-022): Privacy Advisor maintains the register and third-party DPA status.
- Business-continuity plan (OR-023) and DR drills (OR-012): DevOps Engineer runs quarterly restore drills and annual failover exercises; measurements must meet RPO ≤ 15 min / RTO ≤ 4 h (NFR-012).
- Periodic reviews (OR-026): annual privacy/security/compliance review and pre-major-release reviews — Security/Privacy + Legal (section 9).

---

## 6. Skills Matrix

### 6.1 Core vs. Nice-to-Have by Discipline

| Discipline | Core Skills (Required) | Nice-to-Have Skills | Gap-Fill Path |
| --- | --- | --- | --- |
| **Engineering (backend/WhatsApp)** | Production API development; PostgreSQL; OAuth2/OIDC; event-driven/idempotency patterns; webhook HMAC security; rate limiting; ≥80% coverage testing | WhatsApp Business API / Cloud API certification; n8n workflow automation; Qdrant/vector-store operations | Hiring (WhatsApp-specific), vendor-led WhatsApp policy training, cross-training from backend to WhatsApp abstraction |
| **Engineering (mobile)** | React Native or Flutter; SQLite + offline sync/conflict-resolution; Android-first device testing; secure local storage | Amharic script rendering; low-end-device profiling; TalkBack/VoiceOver certification | Framework choice per M-04; hiring; accessibility vendor audit; device-matrix labs |
| **Engineering (frontend/admin)** | RBAC UI patterns; WCAG 2.1 AA; data visualization; design-system tokens | Amharic UI string management; real-time dashboards | Hiring; accessibility training; design-system adoption (AR-029/034) |
| **Engineering (DevOps)** | IaC (Terraform); CI/CD; container orchestration; secrets management; observability; backup/DR | Multi-zone failover drills; Kubernetes | Hiring; cloud certification; DR drill practice |
| **AI & Data** | RAG pipelines; embeddings/vector stores; evaluation-set methodology; model routing/fallback; pseudonymization; ETL | Fine-tuning pipelines (FR-075 future); multilingual NLU (Amharic) | Hiring (AI/ML + data); eval-set craftsmanship training; Amharic NLU vendor research |
| **QA** | Layered test engineering; performance/load tooling; security/privacy test collaboration; accessibility testing; test-data hygiene | Pen-test support; AI eval-set scoring | Hiring QA lead; security-testing cross-training; UAT facilitation training |
| **Healthcare & Content** | Clinical maternal-newborn review; plain-language/voice-first writing; CMS workflow; EN/AM parity review | Ethiopian health-system experience; community-health messaging | Hiring/contracting clinical reviewers with local maternal-health credentials; translation-vendor certification |
| **Research & Community** | Ethics protocol authoring; M&E methodology; anonymized-data governance; participant engagement | Ethiopian fatherhood/behavior-change research; Amharic community facilitation | Hiring Research Lead; ethics-board relationship; community-facilitation training |
| **Security & Privacy** | STRIDE threat modeling; SAST/DAST/pen-test management; DPIA; DPA review; consent-lifecycle design | Healthcare-sector security; Ethiopian data-protection landscape | Contract security consultant; privacy-law advisory; annual pen-test vendor |

### 6.2 Cross-Cutting Skills Every Team Member Needs

- **Healthcare safety literacy:** no-diagnosis/no-prescription boundary (C-01, NFR-046), emergency escalation path (§14.10, §18.4 Level 4), disclaimer handling.
- **Privacy-by-design instinct:** data minimization (FR-124), no PII in logs (§14.3, §18.1), consent-aware features (FR-117), encryption awareness (FR-123).
- **Low-literacy and low-connectivity empathy:** voice-first and plain-language content (FR-133/134, AR-035), offline-first behavior (FR-135/136), Amharic context (FR-138).
- **Quality discipline:** every change ships tests and traceability entries (QR-015); coverage floors (QR-002); CI gates (NFR-039).

**Source:** Appendix E role responsibilities; SRS constraints C-01…C-07 and assumptions A-01…A-07. **Classification:** Recommended (skills definitions) with Configurable training scope. **Confidence:** Medium-High. **Reasoning:** The SRS does not define a skills taxonomy, so core/nice-to-have is this plan's operationalization aligned to the confirmed requirements each discipline must deliver. **Impact-if-changed:** If a core skill is treated as nice-to-have, the corresponding gate evidence (e.g., QA security tests, clinical validation, Amharic parity) becomes undeliverable at Gate G2/G3 and must be re-sourced.

---

## 7. Training & Enablement

### 7.1 OR-013 Training Materials by Audience

OR-013 (Must Have) requires training materials for administrators, content managers, support agents, researchers, and healthcare workers. Material set (all Configurable content, versioned and co-located per OR-015):

| Audience | Training Modules | Delivered By / When | Outcome Evidence |
| --- | --- | --- | --- |
| **Administrators** (Program Admin, Super Admin) | Executive dashboard, user management, consent views, campaign manager, audit-log view, MFA/session use, report export (FR-095…FR-106) | Frontend/Product Owner in Phase 7; refresher pre-launch (Phase 9) | Role-based walkthrough signed off; admin UAT scenarios pass (QR-017) |
| **Content Managers** | CMS workflow, versioning/diff/rollback, medical-review tagging, segregation-of-duties rules, knowledge-base lifecycle, content calendar (FR-076…FR-085) | Content Manager + Clinical Reviewer in Phase 2 (as the CMS lands); ongoing | Content-item e2e approval traced; no unapproved medical content published (FR-081) |
| **Support Agents** | Support-agent interface, consent/subject-rights handling, opt-out/deletion procedures, help-desk KB workflow, escalation to Level 3/4 (FR-104, OR-002, §18.4) | Support Lead + Privacy Advisor in Phase 9 pre-launch; live coaching in Phase 10 | Ticket-handling drills; subject-rights SLA simulations (FR-128) |
| **Researchers** | Research governance workflow, governed export, anonymization rules, ethics consent model, theme-review sampling, publication process (FR-113…FR-122, OR-017) | Research Lead + Privacy Advisor in Phase 8; ethics-board sign-off | Governance export test passes; no identifiers in exported datasets (FR-116, NFR-027) |
| **Healthcare Workers** | Provider journey view (FR-040), review of father questions, danger-sign referral protocols, content review participation (US-012) | Healthcare Advisor + Clinical Reviewer in Phase 9 (UAT) | Healthcare-worker UAT scenarios pass (QR-017) |
| **AI Operations Admins** | AI ops dashboard, safety queues, prompt versioning/approval, model registry, emergency escalation (FR-067…FR-072, OR-010) | AI Safety Reviewer in Phase 5; certification before Phase 10 | AI incident-review drill; prompt-change approval trace |
| **On-call/DevOps** | Runbooks (OR-003), incident management (OR-009), DR drills (OR-012), status-page operation (OR-006), AI-failure handling | DevOps Engineer + Security Engineer in Phase 1 (runbooks start), Phase 10 (live) | Alert-to-response drill; quarterly restore drill record (NFR-014) |
| **All staff** | Healthcare safety, privacy-by-design, low-literacy/voice-first empathy, Amharic context, emergency escalation awareness | Program Manager + Security/Privacy at onboarding and annually (OR-026) | Completion register; annual refresher |

### 7.2 Onboarding

- **Standard onboarding (all roles):** repository walkthrough (OR-015 co-located docs), architecture overview (03), data-class handling and privacy rules (§14.8), access-request process with least privilege (§14.7), MFA enrollment (FR-101), tooling and runbook orientation (12).
- **Role-specific onboarding:** hands-on sandbox in the dev/staging environment (NFR-036); scenario-based training for support (subject-rights, opt-out, emergency) and clinical review (segregation-of-duties rules, FR-106).
- **Cadence (Configurable):** onboarding completed within 5 business days of start; documented in the team's knowledge management workflow (OR-016).

### 7.3 Clinical and Content Team Enablement

- Content Manager + Clinical Reviewer work together from Phase 2 (R-04 mitigation, 14 §17) so the authoritative guide (A-04) is chunked, medically reviewed, and ingestion-ready before Phase 5 grounding.
- Clinical Reviewer is enabled on: the CMS approval workflow, WhatsApp template approval gate (FR-108, AR-021), AI evaluation-set scoring (QR-011), and the no-diagnosis boundary (NFR-046).
- Translation Reviewer maintains the EN/AM parity checklist (FR-079) and Amharic emergency-keyword validation set (FR-025).

### 7.4 End-User Guidance (OR-014) and Knowledge Management (OR-016)

- In-app and WhatsApp help flows, FAQ, and the Ayay assistant Level-1 support channel are built and maintained by Content Manager + Support Agents; the help-desk KB follows the review/versioning workflow (OR-016).
- **Source:** OR-013 (Confirmed training mandate), OR-014, OR-015, OR-016; QR-017 (UAT), QR-019 (clinical validation). **Classification:** Confirmed mandate; module list and cadences Configurable. **Confidence:** High. **Reasoning:** OR-013 names the exact audiences; the module set maps each audience to the features and permissions they will actually operate (§14.7). **Impact-if-changed:** Skipping any audience's training removes the evidence base for QR-017 UAT and risks operational errors (opt-out mishandling, unapproved content publish, governance bypass) during the live pilot.

---

## 8. Communication & Cadence

### 8.1 Build-Phase Cadence

| Rhythm | Frequency | Participants | Purpose |
| --- | --- | --- | --- |
| Daily standup | Daily (15 min) | Delivery squads (Engineering, AI & Data, QA) | Unblock delivery; surface dependency and handoff issues |
| Sprint planning & review | Biweekly | Product Owner, Project Manager, Technical Lead, all squads | Prioritize backlog vs. phase deliverables (14 §15 checkpoint cadence); accept sprint outcomes |
| Weekly engineering demo | Weekly | Full team + Product & Leadership | Show working increments; catch integration issues early (14 §15) |
| Phase-exit review | End of each phase 0–10 | Project Manager, Technical Lead, gate owners | Present acceptance evidence; grant/withhold phase exit (14 §3–§13 acceptance criteria) |
| Gate reviews G1/G2/G3 | End of Phases 1, 3, 9–10 | Product & Leadership + Security + QA + Program | Formal gate sign-off against `21-quality-gate-checklist.md` (QR-013) |
| Architecture review | Weekly during P0–P2, then biweekly | Technical Lead + all tech leads | ADR updates, decision-log M-01…M-07 status, cross-cutting-controls conformance (02 §5) |
| Clinical/content sync | Weekly from Phase 2 | Content Manager, Clinical Reviewer, Translation Reviewer, AI/Data | Review queue, medical-approval turnaround, knowledge-gap capture (FR-074) |

### 8.2 Milestone and Reporting Cadence

- Milestones M0–M9 (14 §15) each have an evidence owner and an acceptance gate; Project Manager publishes milestone status to Product & Leadership and Program Manager.
- M&E reporting (OR-018, Configurable): weekly engagement/enrollment metrics to program; monthly KPI report (PD-011, Appendix F); quarterly impact report to funders (US-020); ad-hoc for research publications (OR-017).
- Stakeholder communication plan (OR-029): launch and ongoing communications owned by Program Manager; status page for service health (OR-006).

### 8.3 Incident Communication

| Severity (Configurable) | Example | First Response | Communication |
| --- | --- | --- | --- |
| Sev-1 (Critical) | Emergency escalation failure; WhatsApp/LLM full outage; security breach; data loss | On-call ≤ 15 min | Immediate alert to on-call + AI Safety Reviewer (OR-010); Sev-1 comms to Program Manager; status page update (OR-006); post-incident review ≤ 5 business days (OR-009) |
| Sev-2 (High) | Single-service degradation; template-approval blockage; AI safety-flag spike | On-call ≤ 1 h | Alert to on-call; owner assigned; status page note if user-facing |
| Sev-3 (Medium) | Latency degradation, queue backlog, isolated delivery failures | Next business day | Logged in incident tracker; batched report |
| Sev-4 (Low) | Cosmetic defects, analytics lag | Weekly triage | Backlog grooming |

- Emergency healthcare escalations follow the Level 4 path (§18.4) regardless of severity classification: immediate facility-care guidance, on-call reviewer notification, 5-minute follow-up cadence (§9.6, §15.3).
- **Source:** OR-008, OR-009, OR-010, OR-029, QR-016; §18.3 alerting; §18.4 escalation model; 14 §15 checkpoints. **Classification:** Confirmed cadence requirements; frequencies and severity thresholds Configurable. **Confidence:** High. **Reasoning:** The SRS mandates structured alerting, incident management, and reporting; the cadence operationalizes it with the staffing in sections 3–5. **Impact-if-changed:** Weaker escalation lanes delay Sev-1 containment and post-incident actions, which is an NFR-023/OR-009 audit finding and a pilot-safety risk for emergency handling.

---

## 9. External Dependencies

| Dependency | SRS Anchor | Consumed By (Team) | Nature of Engagement | Timing / Lead Time (Configurable) |
| --- | --- | --- | --- | --- |
| **Clinical Reviewers (medical professionals)** | D-04, OR-021, QR-019, A-04 | Healthcare & Content | Contracted clinical reviewers with maternal-newborn credentials; standing review windows | Engagement from Phase 2; availability constrained — the R-04 bottleneck; secure before Phase 5 grounding |
| **Research Ethics Board** | D-05, NFR-042, OR-017, FR-117 | Research & Community + Program | Ethics-approval protocol for research data use and consent model | Protocol drafted in Phase 0; submission before research pipeline go-live (Phase 8) — R-05 risk |
| **MERQ Program Leadership** | §3.1, OR-018, OR-028 | Product & Leadership (all teams via Program Manager) | Program outcomes, funding, cohort definition (M-05), impact reporting | Continuous; quarterly reporting and go/no-go decisions at Gates G1–G3 |
| **Legal / Data-Protection Counsel** | NFR-041, NFR-029, FR-073/151 | Security & Privacy + Program | Regulatory alignment review before launch; DPA execution with WhatsApp/LLM/cloud; DPIA sign-off | Review before Gate G3; DPA status tracked in the data-processing register (OR-022) |
| **WhatsApp Business API provider** | D-01, M-02, FR-149, NFR-044 | Engineering (WhatsApp) | Account/verification, number registration, template approval, webhook credentials; second provider as fallback | Phase 0 procurement; policy acceptance for Ethiopia is a launch blocker (R-02) |
| **LLM/embedding + transcription providers** | D-02, D-06, M-03, FR-151/018 | AI & Data + Engineering | Model access, embedding, speech-to-text (AssemblyAI/Google); DPA + pseudonymization verification (FR-073) | Phase 0 procurement; cost/compliance negotiation before Phase 5 |
| **Cloud provider** | D-03, ADR-006, M-01, M-06 | Engineering (DevOps) | Compute/database/vector/object storage; KMS; regional availability | Phase 0 procurement; regional availability check for Ethiopia/East Africa |
| **Translation / localization vendors** | D-06, FR-079, NFR-033 | Healthcare & Content | Amharic translation and parity review services | Engage at Phase 4 (templates); sustained through content lifecycle |
| **Penetration-testing provider** | QR-007, NFR-019, FR-130 | Security & Privacy + QA | Independent pen-test before release and annually | Scheduled in Phase 9; findings feed Gate G3 |
| **UAT participant pool** | QR-017 | Research & Community + QA | Representative fathers, partners, healthcare workers, administrators | Recruitment in Phase 8–9; consent-processed per FR-117 |
| **Founding-cohort fathers** | A-05, OR-028, PD-004…PD-008 | Research & Community + Program | Enrollment, participation, feedback | Onboarding begins at Phase 10 after Gate G3 |

**Source:** SRS §1.9 dependencies D-01…D-06, §2.7 program context, §3.1 stakeholder register, Appendix C cost model. **Classification:** Confirmed dependencies (the SRS lists them); engagement model and timing are Recommended/Configurable. **Confidence:** High for dependency existence and risk; Medium for lead times, which depend on external parties outside program control. **Reasoning:** Every external dependency is mapped to the team that consumes it and the phase that triggers engagement, so procurement and approval lead times land before the phase that blocks on them (14 §16.3 effort drivers). **Impact-if-changed:** Delays in clinical reviewer or ethics approval availability directly threaten Gates G2/G3 and the Phase 5 grounding work; the mitigations in section 11 apply.

---

## 10. Effort Estimation

### 10.1 Person-Week Reference Totals by Discipline

The table below allocates the **realistic** phase totals from `14-development-phase-roadmap.md` §16.1 (which sum to **404 person-weeks**) across the seven disciplines of this plan. All figures are **Configurable reference values, not commitments** (SRS §1.11, Appendix C). Best and conservative variants follow the same proportional distribution of the 316/534 pw phase totals.

| Phase (14 reference) | 14 Realistic pw | Engineering | QA & Testing | AI & Data | Security & Privacy | Healthcare & Content | Product & Leadership | Research & Community |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 0 — Planning & Architecture | 16 | 3 | 0 | 0 | 4 | 1 | 8 | 0 |
| 1 — Foundation | 26 | 18 | 8 | 0 | 0 | 0 | 0 | 0 |
| 2 — Backend Core | 62 | 42 | 12 | 0 | 6 | 2 | 0 | 0 |
| 3 — Authentication & Security | 36 | 12 | 8 | 0 | 16 | 0 | 0 | 0 |
| 4 — WhatsApp Platform | 40 | 32 | 5 | 0 | 0 | 3 | 0 | 0 |
| 5 — AI/RAG Platform | 46 | 8 | 6 | 30 | 0 | 2 | 0 | 0 |
| 6 — Mobile Application | 56 | 34 | 14 | 2 | 0 | 6 | 0 | 0 |
| 7 — Admin Dashboard | 34 | 22 | 8 | 0 | 0 | 0 | 4 | 0 |
| 8 — Integration | 20 | 6 | 4 | 8 | 0 | 0 | 0 | 2 |
| 9 — Testing | 42 | 10 | 20 | 0 | 6 | 4 | 2 | 0 |
| 10 — Pilot Deployment | 26 | 4 | 0 | 3 | 0 | 3 | 4 | 12 |
| **Discipline totals** | **404** | **191** | **85** | **43** | **32** | **21** | **18** | **14** |

**Cross-check with 14:** each row's discipline split sums exactly to the 14 §16.1 realistic phase figure; column totals sum to **404 pw**. Best-case total is **316 pw** and conservative **534 pw** (14 §16.1), distributed proportionally. This table is a derived allocation of 14's controlling figures, not an independent estimate.

**Source:** `14-development-phase-roadmap.md` §16.1 (controlling), §4–§13 (per-phase effort notes naming the discipline mixes, e.g., Phase 2 "Backend engineers (2–3), DB engineer, QA, security review slice"; Phase 5 "AI/ML engineer, data engineer, AI safety reviewer, backend"; Phase 9 "QA lead + team, all squads contribute fixes, security consultant, clinical reviewer"). **Classification:** Configurable reference allocation. **Confidence:** Medium-High — the phase totals are Confirmed reference values; the discipline splits are this plan's decomposition and are the least certain part, to be validated by `20-resource-and-delivery-analysis.md`. **Reasoning:** Splitting each phase by the discipline notes 14 already carries keeps this plan aligned with the controlling roadmap and lets hiring target the critical-path roles per phase (section 4). **Impact-if-changed:** If 14's phase totals change (e.g., scope or scope-classification changes), this table must be re-derived from the changed figures; the discipline ratios themselves should be re-baselined only on evidence of actual velocity.

### 10.2 FTE-to-Calendar Derivation (Cross-Check)

- **Realistic:** 404 pw ÷ ~11 FTE average core-equivalent ≈ **37–42 calendar weeks**, consistent with 14 §16.2 realistic scenario (~42 calendar weeks, steady-state ~10–12 FTE with part-time enablers). The extra calendar weeks absorb part-time enablers (clinical, security, program) who are counted in effort but not in the core FTE headcount.
- **Best:** 316 pw ÷ ~12–13 FTE ≈ 32 calendar weeks (14 §16.2 best ≈ 32).
- **Conservative:** 534 pw ÷ ~10 FTE ≈ 58 calendar weeks (14 §16.2 conservative ≈ 58).
- **Source:** 14 §16.2 scenario table. **Classification:** Configurable reference. **Confidence:** Medium. **Reasoning:** The derivation is arithmetic on 14's own figures and serves as a sanity cross-check; it is not a scheduling commitment. **Impact-if-changed:** Hiring fewer FTE than modeled stretches calendar weeks beyond the scenario bounds and delays Gate G3; hiring more compresses phases only where phases are not gated on external dependencies (section 9).

### 10.3 Sustained Operational Effort (Post-Pilot, Configurable Reference)

Ongoing monthly reference for the operational team (section 5): on-call + engineering standby ~2 FTE; support agents 1–2 FTE; content manager 1 FTE; clinical review 0.5 FTE; AI safety 0.5 FTE; translation 0.25–0.5 FTE; research/M&E 0.5 FTE; security/privacy 0.25–0.5 FTE; program 0.5–1 FTE. **Reference: ~7–9 FTE sustained** — aligned with Appendix C.3 ongoing operational costs (content updates, clinical review, translation, support, security monitoring, system administration, AI evaluation, research operations). All figures Configurable, not commitments.

---

## 11. Resource Risks and Mitigations

| # | Risk | Likelihood | Impact | Mitigation / Contingency |
| --- | --- | --- | --- | --- |
| RR-01 | **Clinical reviewer bottleneck** (D-04, OR-021): review throughput limits content and AI grounding | Medium-High | High | Engage from Phase 2 (R-04 mitigation, 14 §17); standing weekly review windows; multi-reviewer backup pool; content authored ahead of Phase 5; QR-019 scheduled early in Phase 9 |
| RR-02 | **Ethics approval delay** (D-05, OR-017) blocks research pipeline and pilot research use | Medium | High | Research consent model designed in Phase 0 (FR-117); pipeline built behind feature flags in Phase 8; ethics protocol submitted before Phase 8; contingency: pilot launches with participation consent while research export gates remain closed |
| RR-03 | **Turnover / availability** (R-12): specialist roles (WhatsApp, Mobile, AI/ML, Security) are hard to replace | Medium | Medium-High | Co-located documentation (OR-015), runbooks (OR-003), monorepo conventions; two-person coverage on every critical-path role; documented handover at every ramp-down (section 4.1); 15–20% staffing buffer in the conservative scenario |
| RR-04 | **Hiring/skill-pool lead times** (M-04, 14 §16.3): mobile framework and specialist hiring lag phases | Medium | Medium-High | Hiring begins two phases before peak need (section 4.1); vendor/consultant bridging for WhatsApp and AI skills; cross-training from backend into WhatsApp abstraction |
| RR-05 | **External dependency lead times** (WhatsApp policy D-01, LLM D-02, cloud D-03) delay gated phases | Medium | High | Phase 0 procurement (M-01…M-07) is a hard gate exit; provider abstraction (FR-149) enables fallback; parallel supplier negotiations with backup options (14 §17 R-02/R-03/R-06) |
| RR-06 | **Part-time enabler capacity** (Clinical, Security, Privacy, Research) understaffed relative to effort table | Medium | Medium | Explicit FTE carve-out in section 10.1 per discipline; gating roles protected from scope reduction; contingency: shift Should-Have scope to Phase 10 backlog (14 §17 R-07) rather than reducing gate roles |
| RR-07 | **On-call burnout / SLA misses** (OR-001, OR-008) in pilot operations | Medium | Medium | Rotation sizing (≤1 week in 4 per person); secondary technical on-call in first 3 months; automated runbook execution where possible; post-incident review action tracking |
| RR-08 | **Scope creep pulling in Could-Have items** (FR-075, FR-090, FR-093, FR-110, FR-121) | Medium | Medium | Phase 10 backlog only; change control through the decision log (02 §6); gate reviewers hold acceptance criteria (QR-013) |
| RR-09 | **Budget/funding changes** (Appendix G Business) forcing FTE reduction mid-build | Medium | High | Phased rollout and configurable scope; cost model in Appendix C; AR-040 cost monitoring; contingency scenario in `20-resource-and-delivery-analysis.md` |
| RR-10 | **Knowledge/Training gaps** for operational roles (OR-013) surface during pilot | Medium | Medium | Role-based training modules certified before live (section 7); scenario drills for support, AI ops, and DR (OR-012); annual refresher (OR-026) |

**Source:** SRS Appendix G risk register, `14-development-phase-roadmap.md` §17 (R-01…R-14), and the staffing-specific risks this plan adds (RR-01…RR-10). **Classification:** Recommended risk register extension (the SRS Appendix G is the Confirmed baseline; detailed ownership is `16-risk-management-plan.md`). **Confidence:** Medium-High. **Reasoning:** The highest-risk resources are the externally gated and scarce ones (clinical, ethics, specialists), consistent with 14 §16.3 effort drivers. **Impact-if-changed:** If a mitigation (e.g., standing clinical review windows) is not implemented, the risk moves from Medium to High and the calendar impact lands on the cheapest-prevention phase (Phase 2/5 grounding, Phase 9 validation).

---

## 12. Verification Approach

This plan is itself verified, not just executed. Its verification approach mirrors the SRS quality framework and the evidence conventions used by sibling plans:

1. **Requirement traceability as the spine (QR-015).** Every role, training module, and communication rhythm maps to named SRS requirements (OR-001…OR-030, QR-013/017/018/019, FR-094…FR-106, Appendix E, Appendix F). The traceability matrix is refreshed at every milestone (M0–M9) and must show that each staffing/operations requirement has an assigned owner and evidence path before Gate G3.

2. **Cross-check against the controlling roadmap (14).** Section 10.1 allocations sum exactly to 14 §16.1 phase totals (404 pw realistic), and section 10.2 reproduces 14 §16.2 calendar scenarios. If 14 is amended, this document's effort table is re-derived in the same change set; the cross-check total is recomputed and verified.

3. **Gate evidence for staffing readiness.** Gate G1 (Phase 0/1) requires: the Appendix E team model instantiated, role owners named for every requirement series in section 2.2, and M-01…M-07 approvers recorded. Gate G2 (Phase 3) requires Security Engineer/Consultant and QA security-test evidence. Gate G3 (Phase 9/10) requires: OR-013 training completion registers for all five OR-013 audiences, UAT sign-off (QR-017), clinical validation sign-off (QR-019), on-call rotation live with runbooks (OR-001/003), support SLAs active (OR-002), and AI ops monitoring verified (OR-010).

4. **Operational proof before cohort onboarding.** Pilot-readiness evidence includes: on-call alert-to-response drill, subject-rights SLA simulation, quarterly restore drill measurement against RPO ≤ 15 min / RTO ≤ 4 h (NFR-012, OR-012), AI incident-review drill, and the QR-018 pilot-evaluation plan with named owners.

5. **Staffing cadence checks.** The Project Manager reviews section 4 headcount against actual FTE at each phase-exit review; hiring lead times (section 9) are tracked against the two-phase-ahead rule (section 4.1); any gap is recorded as a risk with an owner (section 11) and mitigation before it blocks a gate.

6. **Artifact repository.** Evidence (role-owner registers, training completion records, on-call rosters, drill logs, gate sign-offs) is recorded per milestone so a reviewer can audit any staffing or operations claim end-to-end, consistent with the plan-wide evidence convention used in documents 06–13 and the quality-gate checklist `21-quality-gate-checklist.md`.

---

**END OF DOCUMENT — 15. Team and Resource Plan.** Team structure follows SRS Appendix E; roles map to named requirements; staffing follows phases 0–10 of `14-development-phase-roadmap.md`; effort allocations are configurable references cross-checked to 14 §16.1; operational and training obligations are anchored to OR-001…OR-030, QR-013/017/018/019, and Appendix F.
