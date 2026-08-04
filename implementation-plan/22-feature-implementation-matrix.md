# 22. Feature Implementation Matrix (Traceability)

**Document:** FathersNet (Ayay) — Feature Implementation Matrix / Requirement-to-Implementation Traceability
**Source of truth:** `docs/FathersNet-Complete-SRS.md` (FN-SRS-001 v2.0) — the 349-requirement baseline (170 FR, 50 NFR, 40 AR, 30 OR, 19 QR, 20 US, 5 UC, 4 UR, 11 PD). **QR-015** requires defect/requirement traceability with coverage status; this matrix is the planning-side spine of that obligation, and `implementation-status.md` is its live counterpart.
**Inputs:** `00-requirement-inventory.md` (the authoritative inventory: series, groups, priorities), `02-srs-requirement-analysis.md` (dependency map, cross-cutting controls), `14-development-phase-roadmap.md` (phases and acceptance criteria), `13-testing-and-quality-plan.md` (verification methods), `18-implementation-verification-plan.md` (evidence model), and the domain plans `05`–`12`.
**Sibling documents:** `implementation-status.md` (live per-requirement status), `21-quality-gate-checklist.md` (gate evidence), `19-engineering-handoff-package.md` (agent conventions), `17-final-execution-roadmap.md` (work packages).
**Purpose:** Maps every SRS requirement series to the feature/component that implements it, the plan that specifies it, the verification that proves it, and the phase that delivers it — so that coverage is provable (QR-015) and no requirement is orphaned. This document contains no application code.
**Classification convention:** **Confirmed** (SRS-stated) · **Recommended** (engineering decision) · **Configurable** (parameter with default) · **Assumption** (requires human validation). Matrix rows carry Source / Confidence / Reasoning / Impact-if-changed annotations in summary form.

---

## 1. Executive Purpose

This matrix is the answer to a question every stakeholder will ask: **is every one of the 349 requirements covered by a designed feature, a named plan, a test method, and a delivery phase?** It is the planning-side half of QR-015; the live half is `implementation-status.md`, which carries per-requirement status during the build.

The matrix is **series-level by design**: 349 individual rows live in the inventory (`00`), the CI requirement-to-test linkage, and the live tracker; this document holds the stable mapping of each requirement series to its feature, plan, verification, and phase, so a reviewer can navigate from requirement ID to build evidence without searching 349 rows.

| Property | Value |
| --- | --- |
| Requirements covered | All 349 (verified gap-free in `00` §12) |
| Series-level rows | ~40 (FR 17 groups + NFR 8 groups + AR 6 groups + OR 4 groups + QR 19 + US/UC/UR/PD) |
| Status convention | All rows **Planned** at authoring; live status in `implementation-status.md` |
| Refresh rule | Re-verified at every milestone M0–M9 (`14` §15); must show 100% Must-Have coverage before Gate G3 |

**Source:** `00` §1–§11; QR-015; `14` §18.1. **Classification:** Confirmed (requirement coverage), Recommended (series-level granularity). **Confidence:** High — the inventory is verified gap-free; the mapping transcribes plan ownership from `00` §12 and the domain plans. **Reasoning:** QR-015 cannot be demonstrated at 349-row granularity in a static document; the series matrix plus the live tracker gives both navigability and currency. **Impact-if-changed:** Any SRS requirement change updates `00` first, then the affected series row here and the live tracker, in the same change set.

---

## 2. How to Read the Matrix

Columns: **Requirements** (IDs) · **Feature / Component** · **Primary Plan** (owning section) · **Verification** (QR/test method) · **Phase** (delivery phase from `14`) · **Status** (Planned / live in `implementation-status.md`).

This document has two complementary layers:

- **Feature Implementation Matrix (Section 9)** — one row per feature with the full 15-field implementation view (Feature Name, SRS Requirement, User Journey, Priority, Dependencies, Backend Services, Database Tables, API Endpoints, Mobile Screens, Admin Screens, AI Components, Security Controls, Testing Requirements, Acceptance Criteria, Verification Evidence). This is what an implementer codes against.
- **Traceability Matrices (Sections 3–8 and 11)** — requirement-series rows (FR/NFR/AR/OR/QR/US/UC/UR/PD) linking every requirement ID to its owning plan, verification, and phase; this is what QR-015 coverage proofs use. Section 10 cross-references admin features; Section 12 rolls coverage up.

- A row's Status is **Planned** at authoring. During the build, the live tracker replaces it with the QR-015 status ladder (Not Started → In Progress → In Verification → Verified/Closed).
- "Phase" names the primary build phase; cross-cutting rows (security, localization, observability) apply **every phase** per `02` §5 and are flagged **All**.
- Deferred/design-only series (FR-143…148, FR-156…158) carry explicit treatment: Phase 10 backlog or design-only, never silently dropped.

---

## 3. Functional Requirements Matrix (FR-001…FR-170)

| Req IDs | Feature / Component | Primary Plan | Verification | Phase | Status |
| --- | --- | --- | --- | --- | --- |
| FR-001…010 | Onboarding, registration, consent lifecycle (phone, language, consent versioning, withdrawal) | `06` §4.3 (C), `05` §2.4/§9.3 | QR-009 privacy suite; UC-001 E2E | 2, 3 | Planned |
| FR-011…030 | WhatsApp channel: flows, state machine, templates, media, emergency, metrics | `07` §4–§10 | QR-010 conversational suite; webhook signature tests | 4 | Planned |
| FR-031…040 | Pregnancy journey & personalization (weeks, milestones, content mapping) | `06` §4.5 (E), `05` §2.3 | Pregnancy engine tests; UC-002 | 2 | Planned |
| FR-041…050 | Reminders & notifications (scheduling, channels, provider failover) | `06` §4.5 (E); `12` §5.9 | Reminder E2E; NFR-005 broadcast tests | 2, 8 | Planned |
| FR-051…058 | Father diary / journal & voice notes (transcription, privacy) | `06` §4.7 (G); `08` §17; `05` §2.7 | Voice pipeline tests; QR-009 | 2, 5 | Planned |
| FR-059…075 | AI assistant, RAG KB, AI operations (grounding, safety, registry, eval) | `08` §3–§16 | QR-011/QR-014 eval gates; safety regression | 5 | Planned |
| FR-076…085 | Educational content & CMS (review workflow, versioning, localization) | `06` §4.4 (D); `10` CMS; `05` §2.16/§2.17 | CMS review tests; QR-019; EN/AM parity tests | 2, 7 | Planned |
| FR-086…093 | Birth preparation, checklists & budget | `06` §4.6 (F) | Feature tests; UC-004 E2E | 2, 6 | Planned |
| FR-094…106 | Admin portal, dashboards, user management (roles, MFA, audit) | `10` §3–§10; `11` §4 | Role/MFA tests; audit coverage; QR-008 | 7 | Planned |
| FR-107…112 | Campaigns & broadcast management | `06` §4.9 (I); `07` §6/§9 | Broadcast soak; throttling tests (QR-006) | 4 | Planned |
| FR-113…122 | Analytics, research & evidence generation (pseudonymization, export, ethics) | `06` §4.11 (K); `08` §12 | Research pipeline tests; UC-005; QR-009 | 8 | Planned |
| FR-123…132 | Privacy, security & data protection controls | `11` §6–§14; `05` §8 | QR-007/QR-009 suites; STRIDE re-validation | 3, All | Planned |
| FR-133…142 | Accessibility, offline-first & localization | `09` §8/§10; `10` §12; i18n (`06` §5.3) | QR-008; offline E2E; EN/AM tests | 6, All | Planned |
| FR-143…148 | Community & partner features | **Deferred** — Phase 10 backlog only (`14` §17 R-07) | n/a (not built in pilot scope) | 10 backlog | Deferred |
| FR-149…155 | Integration & external services (provider abstraction) | `07` §3; `08` §10.1; `12` §16 | Provider-swap tests (AR-004); contract tests | 1, 4, 5 | Planned |
| FR-156…158 | Financial / payment readiness | **Design-only** — schema/design notes, no live payment | Design review only | 10 | Design-only |
| FR-159…170 | Backend, data, automation & observability | `06` §2–§3; `12` §6/§8/§13 | QR-003/QR-005; observability verification | 1, All | Planned |

---

## 4. Non-Functional Requirements Matrix (NFR-001…NFR-050)

| Req IDs | Feature / Component | Primary Plan | Verification | Phase | Status |
| --- | --- | --- | --- | --- | --- |
| NFR-001…009 | Performance & scalability (500+ concurrent, ≤500 ms/p95 ≤2 s, broadcast windows, graceful degradation) | `12` §11; `08` §10.3 | QR-006 load/soak vs targets | 9 | Planned |
| NFR-010…015 | Availability & reliability (99.9%, RPO ≤15 min / RTO ≤4 h, health checks, backup verification) | `12` §9–§10 | DR drills (OR-012); QR-006 | 1, 9, 10 | Planned |
| NFR-016…024 | Security (OWASP ASVS, defense-in-depth, MFA, STRIDE, encryption, secrets, tamper-evident audit, verifiable deletion) | `11` §3–§7/§14 | QR-007; Gate G2 zero-critical/high | 3, All | Planned |
| NFR-025…029 | Privacy & data protection (minimization, subject rights, pseudonymization, DPIA, DPAs) | `11` §9; `05` §8/§9 | QR-009; subject-rights SLA drill | 3, All | Planned |
| NFR-030…035 | Usability, accessibility, localization (task success ≥80%, WCAG 2.1 AA, EN/AM, plain language, offline-first) | `09` §10; `10` §12; `13` §12 | QR-008; usability study (NFR-030); UAT | 6, 9 | Planned |
| NFR-036…040 | Operability & maintainability (IaC, observability, zero-downtime, lint/test floors, API versioning) | `12` §6/§8; `06` §3.4 | QR-016 release review; CI gates | 1, All | Planned |
| NFR-041…045 | Compliance & standards (regulatory alignment, ethics, accessibility, WhatsApp policy, FHIR future) | `23`*; `11` §14; `07` §6 | Legal review (NFR-041); policy checks | 0, All | Planned |
| NFR-046…050 | AI quality & safety (no-diagnosis, ≥90% eval, citation, governance, monitoring) | `08` §11/§12/§14; `11` §10 | QR-011/QR-014; NFR-050 monitoring | 5, All | Planned |

---

## 5. Architecture Requirements Matrix (AR-001…AR-040)

| Req IDs | Feature / Component | Primary Plan | Verification | Phase | Status |
| --- | --- | --- | --- | --- | --- |
| AR-001…010 | Architecture core (microservices, gateway, event bus, OpenAPI, provider abstraction, safety layer, jobs, scaling, env isolation, adapters) | `03` §3/§5/§7/§8; `04` | Architecture conformance (`03` §13.1); contract tests | 1, All | Planned |
| AR-011…020 | Data & knowledge (canonical model, consent immutability, research separation, retention, knowledge lifecycle, ingestion, citations, fallback, pseudonymization, audit records) | `05` §7–§9; `08` §3/§12 | DB integrity tests; QR-009; audit tests | 1, 2, 5 | Planned |
| AR-021…024 | WhatsApp (template approval, flow builder, media checks, near-real-time analytics) | `07` §6/§7/§10 | QR-010; template approval tests | 4 | Planned |
| AR-025…029 | Mobile (offline-first, push/deep-link, encrypted storage, APK distribution, design system) | `09` §8/§11; `05` §8 | Offline E2E; device-matrix E2E; QR-008 | 6 | Planned |
| AR-030…035 | Web/Admin (role modules, real-time analytics, anonymized research dashboard, MFA, design system, plain language) | `10` §3/§10/§11/§12 | Role tests; QR-008; anonymized-data checks | 7 | Planned |
| AR-036…040 | DevOps & ops (IaC, canary CI/CD, dashboards, DR, cost monitoring) | `12` §6/§8/§10; `20` §8 | QR-016; DR drills; AR-040 budget alerts | 1, All | Planned |

---

## 6. Operational Requirements Matrix (OR-001…OR-030)

| Req IDs | Feature / Component | Primary Plan | Verification | Phase | Status |
| --- | --- | --- | --- | --- | --- |
| OR-001…012 | Operations (on-call, support SLAs, runbooks, maintenance, change mgmt, status page, monitoring, alerting, incidents, AI incidents, API failure monitoring, DR drills) | `12` §8–§10; `15` §5/§8; `18` §7 | Ops readiness at G3; drills; alert tests | 10 | Planned |
| OR-013…016 | People & knowledge (training, user guidance, co-located docs, help-desk KB) | `15` §7; `19` §5 | Training registers (G3-12); doc review | 0, 10 | Planned |
| OR-017…026 | Governance (research structure, M&E, audit, AI governance, clinical review, processing register, BCP, export, retention, periodic reviews) | `08` §12; `15` §5; `11` §14; `16` §9 | Governance evidence at gates; QR-019 | 0, All | Planned |
| OR-027…030 | Rollout (phased rollout/feature flags, pilot ops, stakeholder comms, versioned releases) | `17` §11; `12` §6; `15` §8 | G3 rollout approval; release review | 10 | Planned |

---

## 7. Quality/Testing Requirements Matrix (QR-001…QR-019)

| Req ID | Requirement | Owning Plan | Gate / Evidence | Phase | Status |
| --- | --- | --- | --- | --- | --- |
| QR-001 | Layered test strategy | `13` §3–§11 | `18` §2.2 layers L1–L4 | All | Planned |
| QR-002 | Coverage floors (≥80% core / ≥70% overall) | `13` §4 | CI coverage reports | All | Planned |
| QR-003 | Integration tests (contracts, data flows) | `13` §4 | CI integration reports | All | Planned |
| QR-004 | E2E critical journeys | `13` §6 | E2E reports | 2, 6, 9 | Planned |
| QR-005 | Contract testing | `06` §3; `13` §4 | Contract reports | 1, All | Planned |
| QR-006 | Performance/load testing | `13` §9 | QR-006 report vs NFR-001…009 | 9 | Planned |
| QR-007 | Security testing (SAST/DAST/pen) | `11` §15; `13` §8 | G2-07/G3-06 zero critical/high | 3, 9 | Planned |
| QR-008 | Accessibility (WCAG 2.1 AA) | `13` §8; `10` §12 | axe-core + manual audit | 6, 9 | Planned |
| QR-009 | Privacy testing | `11` §9; `13` §8 | G2-09 privacy suite | 3, All | Planned |
| QR-010 | WhatsApp conversational testing | `07` §11 | QR-010 suite | 4 | Planned |
| QR-011 | AI quality evaluation | `08` §14/§16; `13` §7 | Eval report | 5, All | Planned |
| QR-012 | Test data management | `13` §12 | Hygiene checks in CI | All | Planned |
| QR-013 | Release gate | `18` §7; `21` §5 | G3-01 combined bundle | 9, 10 | Planned |
| QR-014 | AI eval + safety regression | `08` §16; `18` §7 | G3-02 | 5, All | Planned |
| QR-015 | Traceability with coverage status | This doc + `implementation-status.md` | Coverage report at each milestone | All | Planned |
| QR-016 | Release review (rollback, dashboards, alerting) | `12` §8; `18` §7 | G3-05 | 9, 10 | Planned |
| QR-017 | UAT | `13` §15; `18` §7 | G3-03 sign-off | 9 | Planned |
| QR-018 | Pilot evaluation | `13` §15; `18` §7 | G3-16; M9 report vs Appendix F | 10 | Planned |
| QR-019 | Clinical/content validation | `08` §18; `18` §7 | G3-04 vs A-04 | 2, 5, 9 | Planned |

---

## 8. User Stories, Use Cases, User Requirements, Project Definition Matrix

| Req IDs | Feature / Component | Primary Plan | Verification | Phase | Status |
| --- | --- | --- | --- | --- | --- |
| US-001…010 (Must) | Registration, personalization, prompts, voice journal, AI questions, reminders, bag/budget, myth reporting, offline emergency, Amharic | `06` §4; `09`; `07`; `08` | E2E journey tests; QR-008/009/010 | 2, 4, 5, 6 | Planned |
| US-011, 012, 017, 019, 020 (Should) | Partner sync, healthcare worker review, AI ops review, support KB, impact reports | `06` §4.11; `10`; `15` §5 | Feature tests; UAT | 7, 8 | Planned |
| UC-001…005 (Must) | Registration & consent; weekly prompt; AI Q&A with safety; checklist & budget; research export | `06` §4; `07` §8; `08` §11 | UC E2E suite (`13` §6; `14` milestones) | 2, 5, 8 | Planned |
| UR-001…004 | Simple onboarding; easy weekly engagement; trusted AI; clear consent/privacy | `02` §2.6; `09`; `11` | Usability study (NFR-030); UAT | 6, 9 | Planned |
| PD-001…011 | Program definition, KPIs (PD-004 engagement, PD-011 KPI framework) | `17`; `20` §10; `15` §8 | QR-018 evaluation vs Appendix F | 0, All | Planned |

---

## 9. Feature Implementation Matrix

One row per feature with the full implementation view — the contract an implementer codes against. Table names reference `05` §2; services/phases reference `06`/`07`/`08`/`09`/`10`; verification references `13`/`18`/`21`. "Priority" follows `02`/`14` (P0 = Must-Have build, P1 = Should-Have build, Deferred/Design-only = gate-controlled per Section 12).

| Feature Name | SRS Requirement | User Journey | Priority | Dependencies | Backend Services | Database Tables | API Endpoints | Mobile Screens | Admin Screens | AI Components | Security Controls | Testing Requirements | Acceptance Criteria | Verification Evidence |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Onboarding, registration & consent | FR-001…010 | UC-001: register → choose language → consent → profile | P0 | migration 001; OTP (Phase 3); M-02 | auth-service, user-service (`06` §4.3) | users, user_languages, consent_events, otp_codes | POST /auth/otp/request, /auth/otp/verify, /users, /users/{id}/consent | onboarding, consent, language selection (`09` §8) | user detail, consent history (`10` §5) | none (rule-based) | OTP rate limits (FR-126); immutable consent (AR-012); RBAC | QR-009 privacy suite; UC-001 E2E | consent lifecycle incl. withdrawal works; UC-001 E2E green | QR-009 + UC-001 E2E reports |
| WhatsApp channel & flows | FR-011…030 | Messages via WhatsApp menu; emergency flow | P0 | backend core; auth; M-02 provider; webhook pattern | whatsapp-gateway, conversation state machine (`07` §4–§10) | conversations, messages, templates, media_assets, flow_sessions | POST /whatsapp/webhook, /whatsapp/templates, /whatsapp/messages | none (channel is WhatsApp) | conversation viewer, template manager, flow builder (`10` §8) | intent classification routing | HMAC signature (FR-011, §14.1.5); idempotency; replay dedup | QR-010 suite; webhook signature tests; template approval | all 11 states navigable; HMAC rejects spoofs | QR-010 + webhook reports |
| Pregnancy journey & personalization | FR-031…040 | Weekly prompt/tip matched to gestation week | P0 | content library; journey engine | journey-service (`06` §4.5E) | journey_progress, content_items, content_mappings | GET /journey/{userId}/week, POST /journey/advance | journey home, week detail | journey configuration | none (rule-based content mapping) | RBAC; data minimization | pregnancy engine tests; UC-002 | week-accurate milestones; UC-002 green | feature + UC-002 reports |
| Reminders & notifications | FR-041…050 | Scheduled prompt via configured channel | P1 | journey; scheduler; NFR-005 broadcast | reminder-service, scheduler, outbox (`06` §4.5E; `03` §5) | reminders, notification_logs, outbox_events | POST /reminders, GET /reminders, PUT /reminders/{id} | reminder settings, push handling | reminder templates | none | channel failover; idempotency (FR-161) | reminder E2E; NFR-005 broadcast/soak | on-time delivery at volume; failover works | E2E + soak reports |
| Father diary & voice notes | FR-051…058 | Voice journal → transcription → private journal | P1 | AI pipeline (ASR); object storage (M-06) | journal-service (`06` §4.7G), transcription worker | journal_entries, voice_notes, transcriptions | POST /journals, POST /journals/{id}/voice, GET /journals | journal, voice recorder | none (private) | ASR transcription, theme extraction | encryption at rest (AR-027); QR-009; pseudonymization | voice pipeline tests; QR-009 | Amharic voice transcribed correctly; privacy preserved | voice + privacy reports |
| AI assistant, RAG & AI ops | FR-059…075 | UC-003: ask a question → grounded answer with citation | P0 | knowledge base; eval set; M-03 LLM | ai-orchestrator, safety-layer (`08` §10–§16) | knowledge_chunks, ai_answers, citations, ai_eval_results, ai_models | POST /ai/ask, GET /ai/answers/{id}, POST /ai/eval | AI chat | AI ops dashboard, model registry | RAG retrieval, MMR, grounding, safety layer, routing | no-diagnosis boundary (C-01); injection defenses; PII scrub | QR-011/014 eval ≥ 90%; safety regression | grounded-only answers; eval ≥ 90%; no-diagnosis held | eval + safety reports |
| Educational content & CMS | FR-076…085 | Browse content; clinical-reviewed articles | P1 | content service; clinical review | content-service (`06` §4.4D), CMS backend | content_items, content_reviews, content_versions, content_tags | GET /content, POST /content, PUT /content/{id}/review | article view | CMS editor, review workflow | none (human review) | clinical review gate (OR-021); approval roles (FR-106) | CMS review tests; QR-019; EN/AM parity | review workflow enforced; EN/AM parity | CMS + QR-019 reports |
| Birth preparation, checklists & budget | FR-086…093 | UC-004: checklists and birth budget | P1 | content; journey | checklist-service, budget-service (`06` §4.6F) | checklists, checklist_items, budget_items, budget_categories | GET/POST /checklists, GET/POST /budgets | checklist, budget | none | none | RBAC | feature tests; UC-004 | checklist/budget flow complete | feature + UC-004 reports |
| Admin portal & user management | FR-094…106 | Admin manages users, roles, audit | P0 | RBAC; MFA | admin-api, auth-admin (`10` §3–§10) | users, user_roles, refresh_tokens, audit_logs | GET /admin/users, POST /admin/users/{id}/roles, GET /admin/audit | none | user mgmt, dashboards, role modules, audit view | none | RBAC 6 roles (FR-106); MFA (FR-101); audit (FR-098/127); segregation of duties | role/MFA tests; audit coverage; QR-008 | permissions enforced per §14.7 role matrix | role + audit reports |
| Campaigns & broadcast | FR-107…112 | One-to-many WhatsApp campaign | P1 | whatsapp; messaging queue | campaign-service (`06` §4.9I; `07` §6/§9) | campaigns, campaign_runs, messages | POST /campaigns, POST /campaigns/{id}/run | none | campaign manager | none (personalization hooks) | throttling; opt-out honored (FR-017) | broadcast soak; QR-006 throttling | broadcast within window at volume; opt-outs honored | QR-006 report |
| Analytics, research & evidence | FR-113…122 | Pseudonymized research export | P0 | event pipeline; ethics (M/D-05) | analytics-service, research-pipeline (`06` §4.11K; `08` §12) | analytics_events, research_analytics, exports | GET /analytics/summary, POST /research/export, GET /research/datasets | none | executive dashboard, research dashboard (anonymized) | theme/sentiment extraction | pseudonymization (FR-119); governed export (FR-116/122); ethics gate (OR-017) | research pipeline tests; UC-005; QR-009 | pseudonymized export; ethics-compliant | research + privacy reports |
| Privacy, security & data protection | FR-123…132 | Platform control layer | P0 | all features | security controls (`11` §6–§14) | audit_logs, processing_register, dpia_records | /auth/*, /admin/security, subject-rights endpoints | consent/privacy screens | privacy dashboard | none | encryption, MFA, STRIDE, DPIA, retention (NFR-024) | QR-007/009 suites; STRIDE re-validation | STRIDE findings closed; privacy suite green | QR-007/009 reports |
| Accessibility, offline & localization | FR-133…142 | Offline use; EN/AM throughout | P1 | mobile framework (M-04); i18n | i18n-service (`06` §5.3) | translations, locale_strings | GET /i18n/{locale} | all screens (offline-first) | translation manager | none | offline encrypted storage (AR-027) | QR-008; offline E2E; EN/AM parity | WCAG 2.1 AA; offline sync correct | QR-008 + E2E reports |
| Community & partner features | FR-143…148 | Partner sync (deferred) | Deferred | none (Phase 10 backlog) | n/a | partner sync schema (design notes) | design only | partner sync (deferred) | n/a | none | n/a | n/a | Phase 10 backlog per `14` §17 R-07 | n/a |
| Integration & external services | FR-149…155 | Provider abstraction for WhatsApp/LLM/ASR | P0 | M-02/M-03/M-06; DPAs (NFR-029) | provider adapters (`07` §3; `08` §10.1) | provider_configs | adapter interface (internal) | n/a | provider status | provider routing | PII scrub before calls (FR-073); DPAs | provider-swap tests (AR-004); contract tests | swap providers without rebuild | contract + swap reports |
| Financial / payment readiness | FR-156…158 | n/a (no live payment) | Design-only | n/a | schema/design notes only | payment schemas (design notes) | none live | n/a | n/a | none | design review only | design review | design review sign-off | design review record |
| Backend, data, automation & observability | FR-159…170 | Platform layer (health, events, metrics) | P0 | all features | platform conventions (`06` §2–§3; `12`) | outbox_events, idempotency_keys, dashboards | health, metrics, admin ops | n/a | ops dashboard | n/a | NFR-036…040; secrets (NFR-022) | QR-003/005; observability verification | health/observability thresholds met | CI + observability reports |

**Source:** `00` (series inventory), `02` (dependencies/priorities), `05` (tables), `06`–`12` (services/screens/controls), `13`/`18`/`21` (tests/evidence). **Classification:** Confirmed (requirement grouping and plan anchors), Recommended (field-by-field wording). **Confidence:** Medium-High — every field is traceable to a named plan section; individual table/endpoint names are the plans' own. **Impact-if-changed:** Any change to a plan's service/table/endpoint name re-derives the affected row in the same change set as the owning plan.

---

## 10. Cross-Reference: Admin Features

Admin portal modules (FR-094…112, FR-113…122) mapped to screens, roles, and gate evidence. Roles follow SRS §14.7 (Administrator, Super Administrator, Researcher, Content Manager, Healthcare Partner, Support Agent) with segregation of duties (FR-106).

| Admin Module | Feature / SRS Requirement | Screens (`10`) | Permitted Roles | QR/Gate Evidence |
| --- | --- | --- | --- | --- |
| User management | FR-094…099, FR-102…106 | user list/detail, consent history, role assignment, account actions | Administrator, Super Administrator | role/MFA tests; audit coverage (G2-03) |
| Authentication & sessions | FR-100/101, NFR-016…019 | MFA enrollment, session/device list, lockout view | Super Administrator, Security | QR-007; MFA tests (G2-08) |
| Content management (CMS) | FR-076…085 | CMS editor, review/approval workflow, version history, publish | Content Manager, Clinical Reviewer (approve), Super Administrator | QR-019; CMS review tests |
| Clinical validation | OR-021, QR-019, FR-081 | medical-review queue, clinical sign-off | Clinical Reviewer, Healthcare Partner (view) | QR-019; G3-04 |
| Campaign manager | FR-107…112 | campaign builder, schedule, audience, run history | Administrator, Content Manager | QR-006 soak; broadcast tests |
| Executive & ops dashboards | FR-113…118, AR-030/031 | KPI dashboards, availability, cost (AR-040) | Administrator, Super Administrator, Program | QR-016; AR-040 budget alerts |
| Research dashboard & export | FR-116…122, OR-017 | anonymized research views, governed export, dataset registry | Researcher, Super Administrator (approve export) | UC-005; QR-009; G3-16 |
| AI ops | FR-059…075, NFR-046…050 | model registry, eval results, routing/fallback status, AI incident log (OR-010) | AI Ops Admin, Super Administrator | QR-011/014; OR-010 |
| Privacy & audit | FR-123…132, NFR-022…029 | audit log viewer, processing register (OR-022), DPIA records, subject-rights queue | Super Administrator, Privacy Advisor, Security | QR-007/009; G2-09 |
| Translation management | FR-138, NFR-033 | string editor, EN/AM parity status | Content Manager, Translation Reviewer | EN/AM parity tests; QR-008 |

**Source:** `10` §3–§10; SRS §14.7 role matrix; QR-016/017/018/019. **Classification:** Confirmed (modules from `10`), Recommended (role mapping). **Confidence:** High. **Impact-if-changed:** Role-permission changes must re-validate FR-106 segregation of duties and the QR-008 role tests in the same change set.

---

## 11. Cross-Cutting Controls Matrix (Apply Every Phase)

Per `02` §5, these controls are delivered **as part of every phase**, never retrofitted:

| Control | Requirement Anchors | Verified By |
| --- | --- | --- |
| Security & privacy | FR-123…132, NFR-016…029, AR-013 | QR-007/QR-009; G2 |
| Auditability | FR-098/127, NFR-023 | Audit trail tests; G2-03 |
| Localization (EN/AM from first string) | FR-138, NFR-033 | EN/AM parity tests; QR-008 |
| Observability | FR-166, NFR-036, §18.3 | Dashboards/alerts live; G3-05/11 |
| Idempotency & event integrity | FR-160/161 | Idempotency tests; G2-10 |
| Testing discipline | QR-001…005, QR-012 | CI gates from Phase 1 |
| Consent immutability | AR-012, FR-004/125 | QR-009; `05` §7.3 |

**Source:** `02` §5. **Classification:** Confirmed. **Confidence:** High. **Impact-if-changed:** Deferring any cross-cutting control from a phase voids `14`'s no-retrofit rule and reopens PM-18.

---

## 12. Requirement-to-Feature Rollup (Coverage)

| Series | Count | Mapped | Deferred/Design-Only | Status |
| --- | --- | --- | --- | --- |
| FR | 170 | 160 | 10 (FR-143…148 deferred; FR-156…158 design-only) | 100% mapped |
| NFR | 50 | 50 | 0 | 100% mapped |
| AR | 40 | 40 | 0 | 100% mapped |
| OR | 30 | 30 | 0 | 100% mapped |
| QR | 19 | 19 | 0 | 100% mapped |
| US | 20 | 20 | 0 | 100% mapped |
| UC | 5 | 5 | 0 | 100% mapped |
| UR | 4 | 4 | 0 | 100% mapped |
| PD | 11 | 11 | 0 | 100% mapped |
| **Total** | **349** | **339** | **10** | **100% covered** |

Deferred/design-only rows are Must-Have-safe: no Must-Have requirement is deferred (`00` §8–§9 priorities). Re-classifying any deferred item requires a decision-log entry and a Gate review (change control, OR-005).

---

## 13. Live Status Convention

- `implementation-status.md` carries the per-requirement QR-015 status ladder and the WP registry; this matrix carries the stable mapping.
- Refresh rule: the matrix is re-verified at every milestone (M0–M9) and must show **100% of Must-Have requirements covered with test/verification status before Gate G3** (`14` §18.1).
- CI enforces requirement-to-test linkage (`13` §17 R14): a test referencing a requirement ID that is missing from `00` fails the build.

**Source:** QR-015; `14` §18.1; `13` §17. **Classification:** Confirmed. **Confidence:** High. **Impact-if-changed:** A stale matrix at a milestone is a QR-015 failure and holds the gate.

---

## 14. Verification Approach

This matrix is itself verified:

1. **Gap-free coverage** — the rollup (Section 12) matches `00` §1 counts (349 = 170+50+40+30+19+20+5+4+11); re-verified at each milestone.
2. **Series boundaries** — every ID range matches `00` §3–§7 exactly; no off-by-one or merged series.
3. **Plan ownership** — each row's Primary Plan matches `00` §12 mapping and the domain plans' own scoping.
4. **Verification anchoring** — each row's Verification cites QR anchors from `13`/`18`/`21`; no unverifiable row.
5. **Deferred discipline** — deferred/design-only rows are named and gate-controlled (Section 12).
6. **Feature-matrix fields** — every Section 9 row carries all 15 fields with no empty cells; field content traces to `05`–`12`.
7. **Admin cross-reference** — Section 10 modules map to `10` screens, §14.7 roles, and QR evidence; no orphaned module.
8. **No placeholders** — scan for "TBD", "TODO", "to be defined", empty cells at authoring.
9. **Classification labels present** — every major item carries Source / Confidence / Reasoning / Impact-if-changed.

**Source:** QR-015; `00` §12; `14` §18. **Classification:** Confirmed (obligations), Recommended (method). **Confidence:** High. **Reasoning:** A traceability matrix that cannot prove gap-free coverage and plan ownership is decoration; these checks keep it operative. **Impact-if-changed:** Any SRS change re-runs checks 1–3 in the same change set as the `00` inventory update.

---

**END OF DOCUMENT — 22. Feature Implementation Matrix.** 17-feature implementation matrix with the full 15-field view (Section 9) plus admin cross-reference (Section 10); all 349 requirements mapped to features, plans, verification, and phases via the traceability matrices (Sections 3–8) and rollup (Section 12); deferred/design-only rows gate-controlled; QR-015 coverage provable at each milestone; live status carried by `implementation-status.md`.
