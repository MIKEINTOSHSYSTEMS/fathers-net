# 20. Resource and Delivery Analysis

**Document:** FathersNet (Ayay) — Resource, Cost, and Delivery Analysis
**Source of truth:** `docs/FathersNet-Complete-SRS.md` (FN-SRS-001 v2.0) — **Appendix C Reference Cost Model** (C.1 infrastructure, C.2 one-time development, C.3 ongoing operations, C.4 optimization), **Appendix D Reference Implementation Roadmap** (phases 0–7 reference timeline), **Appendix F KPI Framework** (Financial and Technical KPI classes), **§1.11** (reference values are not commitments), and **AR-040** (cost monitoring and control). Also binding: **PD-004** (engagement KPI), **PD-011** (KPI framework ownership).
**Inputs:** `14-development-phase-roadmap.md` §16 (person-week estimates: Best 316 / Realistic 404 / Conservative 534; calendar scenarios ~32/42/58 weeks; effort drivers §16.3), `15-team-and-resource-plan.md` §10 (per-phase allocations summing to 404 pw realistic; sustained operational team ~7–9 FTE §10.3), `12-devops-and-infrastructure-plan.md` §5.9/§8.4 (AI budget, cost alerts), `08-ai-rag-implementation-plan.md` §15 (cost optimization), `04-technology-stack-analysis.md` §19 (cost risks T-16), `16-risk-management-plan.md` §8 (contingency reserves), `17-final-execution-roadmap.md` §5 (milestones) and §11 (rollout).
**Sibling documents:** `15-team-and-resource-plan.md` (people side of this analysis), `16-risk-management-plan.md` (cost risks PM-30/PM-51 and reserve sizing), `21-quality-gate-checklist.md`, `implementation-status.md`.
**Purpose:** Reference analysis of what the build costs, what operations cost, how long delivery takes, and how costs are tracked and controlled — so that the budget decision M-07 can be made with numbers, and so AR-040 cost monitoring has a baseline. All figures are **configurable reference estimates, not commitments** (SRS §1.11, Appendix C). This document contains no application code.
**Classification convention:** **Confirmed** (SRS-stated) · **Recommended** (engineering decision) · **Configurable** (parameter with default) · **Assumption** (requires human validation). Every major item carries **Source / Confidence / Reasoning / Impact-if-changed** annotations.

---

## 1. Executive Purpose

This document converts the SRS cost model and the plan set's effort estimates into a single reference picture: **what the pilot build costs, what the sustained service costs per month, how long delivery takes under each scenario, and how every cost line is tracked back to an SRS control.**

It exists because the SRS Appendix C provides the category structure but not the analysis: no person-week conversion, no scenario range, no tracking method. `14` §16 and `15` §10 provide the effort; `12`, `08`, and `04` provide the controls. This document brings them together and hands the result to decision M-07 (budget cap).

| Question | Answer location |
| --- | --- |
| What does the build cost (one-time)? | Section 4 |
| What do dev / test / prod environments cost? | Section 3.1 |
| What does the service cost per month? | Sections 3 and 5 |
| What team is required, and what does the team cost? | Section 12 |
| How long does delivery take? | Section 6 |
| How is cost kept under control? | Sections 7–9 |
| How does cost connect to KPIs? | Section 10 |
| What if assumptions move? | Section 11 |

**Source:** SRS Appendix C; `14` §16; `15` §10; `12` §5.9/§8.4. **Classification:** Confirmed (structure and obligations), Recommended (analysis method and figures as references). **Confidence:** Medium-High — the category structure and effort totals are anchored; absolute dollar ranges are configurable assumptions requiring market confirmation at Phase 0 (M-01…M-07). **Reasoning:** M-07 cannot be approved on a category list alone; it needs scenario ranges and a tracking method, which is exactly what this document supplies. **Impact-if-changed:** If Appendix C or `14` §16 changes, this document is re-derived in the same change set and M-07 is re-confirmed before Phase 1.

---

## 2. Method and Assumptions (Configurable)

- **Effort baseline:** person-week totals from `14` §16.1 — **Best 316 pw / Realistic 404 pw / Conservative 534 pw** across Phases 0–10.
- **Team model:** Appendix E integrated team, steady state ~10–12 FTE build equivalent; staffing profiles per `15` §4.
- **Day rate:** configurable blended reference for cost conversion — the SRS does not set rates; use local market rates at Phase 0 (M-07 input). All absolute currency totals below are **illustrative ranges**, not commitments.
- **Pilot scale:** founding cohort **≥500 fathers (default, M-05)**; ~10,000 WhatsApp messages/month; ~5,000 daily AI interactions (Appendix C assumptions).
- **Provider pricing:** current list pricing for cloud, WhatsApp (per-conversation), LLM/embedding, ASR, observability; verified at procurement (M-01…M-03, M-06).
- **Currency:** USD reference throughout; all figures subject to exchange-rate and local-cost adjustment.
- **Reserves:** schedule 10–15%, effort 15–20%, cloud cost contingency 20–25% (`16` §8).

**Source:** `14` §16.1; SRS Appendix C assumptions; `15` §4/§10; `16` §8. **Classification:** Configurable (all numeric assumptions); Confirmed (effort totals as `14` states them). **Confidence:** Medium-High. **Reasoning:** The SRS itself labels Appendix C "reference estimates with configurable assumptions" (§1.11, C.0), so the method preserves that label rather than hardening guesses. **Impact-if-changed:** Each assumption is a Phase 0 confirmation item; an unconfirmed assumption becomes an explicit risk row (PM-51/PM-30) rather than a hidden error.

---

## 3. Infrastructure Cost Analysis (Monthly Reference)

SRS Appendix C.1 baseline, expanded with build-phase commentary from `12`:

| Category | Reference (USD/mo) | Build Phase Live | Key Assumption |
| --- | --- | --- | --- |
| Cloud hosting (compute/storage/DB) | $150–$500 | Phase 1 | Managed DB, multi-zone (NFR-011) |
| WhatsApp Business API | $50–$300 | Phase 4 | Per-conversation; ~10k msgs/mo (NFR-005) |
| AI/LLM API | $50–$300 | Phase 5 | Gemini Flash + fallbacks; ~5k interactions/day |
| Vector database hosting | $30–$150 | Phase 5 | Qdrant managed or self-hosted |
| CDN and bandwidth | $20–$80 | Phase 4 | Media delivery + compression |
| Monitoring and logging | $20–$80 | Phase 1 | Managed observability (SRS §18.3) |
| Backup storage | $10–$40 | Phase 1 | Daily + retention (RPO ≤ 15 min) |
| Security services | $30–$150 | Phase 1/3 | WAF, scanning, secrets, pen-test amortization |
| **Monthly reference total** | **$360–$1,600** | — | Wide range = provider pricing to confirm (M-01…M-06) |

**Source:** SRS Appendix C.1; `12` §5.9 (AI budget line). **Classification:** Confirmed (category structure), Configurable (values). **Confidence:** Medium — pricing varies by provider/region (PM-57). **Reasoning:** The SRS provides this exact structure; the build-phase column tells when each line becomes live so cost ramps predictably. **Impact-if-changed:** Region selection (M-01) is the dominant driver; a non-GCP region or higher-cost provider shifts the range before M-07 closes.

### 3.1 Environment Cost Estimate (Dev / Test / Prod)

The Section 3 monthly total is the **production** baseline. The required dev/test environments add a parallel, typically smaller footprint (SRS §16.1 environment isolation, AR-009 no production data/testing in lower environments; `12` §6.2):

| Environment | Purpose | Configurable Reference (USD/mo) | Build Phase Live | Notes |
| --- | --- | --- | --- | --- |
| Dev | Developer-local + shared dev cluster | $80–$200 | Phase 1 | Ephemeral, autoscaled-down nights/weekends |
| Test / Staging | Integration, contract, E2E, performance, security testing | $150–$350 | Phase 1 | Mirrors prod topology scaled down; QR-006/007 run here (AR-009) |
| Production | Live service baseline | $360–$1,600 (Section 3) | Phase 1 (ramps) | The Section 3 total; grows per-feature as lines come live |
| **Environment total reference** | **Section 3 prod baseline + ~30–50% overhead** | — | — | Exact split confirmed at procurement (M-01, M-06) |

**Source:** SRS §16.1, AR-009; `12` §6.2. **Classification:** Confirmed (three environments are SRS-stated), Configurable (costs). **Confidence:** Medium. **Reasoning:** The SRS mandates environment isolation and forbids testing against production (AR-009), so dev/test capacity is a requirement, not a luxury; sizing it separately from prod keeps the ramp predictable. **Impact-if-changed:** Skipping the test environment to save cost silently re-introduces PM-39 (evidence against wrong environment) and breaks QR-013 evidence.

---

## 4. One-Time Development Cost Analysis

Conversion of `14` §16.1 person-weeks into a cost picture. All figures reference; rates are the single biggest configurable input.

| Phase | Best pw | Realistic pw | Conservative pw | Effort Driver |
| --- | --- | --- | --- | --- |
| 0 — Planning & Architecture Validation | 12 | 16 | 24 | Decisions M-01…M-07, STRIDE, DPIA |
| 1 — Foundation | 20 | 26 | 34 | IaC, CI/CD, secrets, migration 001, observability |
| 2 — Backend Core | 50 | 62 | 80 | API platform, auth-initial, user/profile, pregnancy, content, journal, checklist/budget, reminders |
| 3 — Authentication & Security | 28 | 36 | 48 | OTP/MFA/token, RBAC, audit, encryption, webhook pattern |
| 4 — WhatsApp Platform | 32 | 40 | 52 | Provider abstraction, state machine, templates, media, emergency, campaigns |
| 5 — AI/RAG Platform | 36 | 46 | 60 | Ingestion, retrieval, safety layer, routing, eval set, AI ops |
| 6 — Mobile Application | 44 | 56 | 72 | Auth, journey, journal, checklist, budget, offline, sync, notifications |
| 7 — Admin Dashboard | 26 | 34 | 44 | User mgmt, CMS, campaigns, analytics, AI ops, research |
| 8 — Integration | 16 | 20 | 28 | Research pipeline, partner sync, E2E flows, feature flags |
| 9 — Testing | 32 | 42 | 56 | Full QA sweep, UAT, Gates 2–3 |
| 10 — Pilot Deployment | 20 | 26 | 36 | Cohort onboarding, monitoring, support, DR, QR-018 |
| **Total (pw)** | **316** | **404** | **534** | Reference only (`14` §16.1) |

**Cost conversion (illustrative, configurable):** apply the Phase 0–confirmed blended day rate to each scenario. With a reference blended rate of $R/day, total build cost ≈ `(Total pw × 5) × $R`; e.g., at a configurable reference of **$300/day blended**, the illustrative totals are ≈ **$474k (best) / $606k (realistic) / $801k (conservative)** — **illustrative only**; the actual number is M-07's input and depends on market rates, local hiring (Addis-based vs. remote mix per `15` §9), and FTE composition.

**Source:** `14` §16.1 (pw totals); `15` §9/§10 (rate and team assumptions). **Classification:** Confirmed (pw totals), Configurable (rates and currency totals). **Confidence:** Medium — totals are as-stated in `14`; the currency figures are illustrative until rates are confirmed. **Reasoning:** Keeping pw totals Confirmed and money totals Configurable preserves the SRS §1.11 discipline and makes M-07 a decision, not a math error. **Impact-if-changed:** A blended rate different from $300/day scales totals linearly; the ratio between scenarios (~1 : 1.28 : 1.69) is rate-independent and is the stable planning fact.

---

## 5. Ongoing Operational Cost Analysis (Monthly Reference)

SRS Appendix C.3 categories, sized by `15` §10.3 sustained team (~7–9 FTE) plus Section 3 infrastructure:

| Category | Reference (USD/mo) | Driver | Source |
| --- | --- | --- | --- |
| Staffing (on-call, support, content, clinical, AI safety, translation, research/M&E, security, program) | Large line item (rate × 7–9 FTE × utilization) | `15` §10.3 | C.3, `15` §5 |
| Infrastructure (Section 3) | $360–$1,600 | usage | C.1 |
| Content updates + translation/localization | Medium | content cadence | C.3 |
| Clinical review / medical validation | Medium | OR-021 cadence | C.3 |
| AI evaluation and monitoring | Medium | eval cadence (QR-011/014) | C.3, NFR-050 |
| Research operations | Medium | cohort activity | C.3 |
| Security monitoring | Low–Medium | continuous | C.3 |
| **Sustained monthly total** | **Reference range set at Phase 0** | — | — |

**Source:** SRS Appendix C.3; `15` §10.3. **Classification:** Confirmed (categories), Configurable (values). **Confidence:** Medium. **Reasoning:** C.3 names the categories but not values; `15` §10.3 names the staffing equivalent; combining them produces the run-rate the budget decision and Appendix F Financial KPIs need. **Impact-if-changed:** The sustained run-rate is a primary input to long-term funding decisions (PM-51); under-sizing it breaks the cost-per-user financial KPIs.

---

## 6. Delivery Timeline Analysis

From `14` §16.2 (calendar scenarios, assuming ~10–12 FTE steady state and phase overlap where the dependency map permits):

| Scenario | Phases 0–5 (Build to Channels+AI) | Phases 6–8 (App/Admin/Integration) | Phases 9–10 (QA + Pilot) | Total calendar weeks | Effort (pw) |
| --- | --- | --- | --- | --- | --- |
| **Best** | 14 | 10 | 8 | ~32 | 316 |
| **Realistic** | 18 | 13 | 11 | ~42 | 404 |
| **Conservative** | 24 | 18 | 16 | ~58 | 534 |

- **Reference alignment:** the realistic scenario corresponds approximately to SRS Appendix D (Weeks 1–28 for phases equivalent to 0–7, pilot thereafter), extended by the explicit Integration phase and formal Gates 2–3 (`14` §16.2).
- **Critical path:** reference ~42 weeks realistic, ~314 person-weeks build on the critical path per `17` §10; calendar is gate-bound (G1 → G2 → G3).
- **Milestones:** M0 (Phase 0) → M1 (Phase 1/G1) → M3 (Phase 3/G2) → M8 (Phase 10/G3) → M9 (pilot evaluated) per `17` §5.

**Source:** `14` §16.2; SRS Appendix D; `17` §5/§10. **Classification:** Confirmed (scenario structure from `14`), Configurable (weeks as references). **Confidence:** Medium-High. **Reasoning:** The scenario range is `14`'s own output and is deliberately wider than Appendix D to absorb the added Integration phase and formal gates. **Impact-if-changed:** Team size below ~10–12 FTE extends calendar weeks beyond the conservative range and raises the same cost lines as more calendar time (PM-45).

---

## 7. Cost Optimization Strategy

Implements SRS Appendix C.4 with the plan set's specifics:

| Strategy | Implementation | Source |
| --- | --- | --- |
| Intent-based model routing | Simple intents → cheap tier; safety-sensitive → high tier (`08` §15.1) | C.4, §9.8 |
| Fallback tiers as cost control | Cost/quality routing table; degradation caps spend during outages (`08` §15.3) | C.4, FR-072 |
| Caching | Version-keyed answer/embedding cache in Redis to cut LLM calls (`08` §15.2) | C.4 |
| Offline-first | Bandwidth/media savings via caching + compression + offline content (`09`) | C.4, AR-025 |
| Infrastructure rightsizing | Autoscaling, reserved capacity, HPA limits (`12` §11) | C.4 |
| Open-source alternatives | Self-hosted Qdrant/n8n options; pgvector as alternative (`04` §7) | C.4 |
| AI daily budget + alerts | Hard daily AI budget cap (`12` §5.9); budget alarms (AR-040) | AR-040, `12` §8.4 |
| Provider abstraction for pricing | Swap tiers/providers without rebuild (FR-149, AR-004) | FR-149, `04` |

**Source:** SRS Appendix C.4; `08` §15; `12` §5.9/§8.4; `04` §19. **Classification:** Confirmed (C.4 list), Recommended (plan specifics). **Confidence:** High. **Reasoning:** Each strategy maps to a designed control that is itself a requirement (AR-040, FR-072, FR-149), so optimization never trades compliance for cost. **Impact-if-changed:** Dropping a strategy raises the relevant cost line and its risk (PM-30) at the same time; both must be re-rated.

---

## 8. Cost Tracking and Controls

- **Budget alerts:** cost dashboards with alerts per `12` §8.4; run-rate > 100% of monthly budget triggers the PM-30 response (cost review, routing change, Program approval).
- **AI daily budget:** hard per-day AI budget enforced in the orchestration layer (`12` §5.9); exceeded → tier downgrade or throttling, never silent.
- **AR-040 monitoring:** cost metrics in the SRS-mandated dashboards (AI latency/token/cost, queue depth) per SRS §18.3.
- **Monthly financial review:** actual vs. baseline per Section 3/5 tables; variance recorded in `implementation-status.md`; reserves drawn only with decision-log entry (OR-005).
- **Financial KPIs:** cost per enrolled father, cost per active user, cost per engagement, infrastructure cost efficiency (Appendix F) tracked from Phase 10; fed to QR-018 evaluation.

**Source:** AR-040; SRS §18.3; Appendix F Financial KPIs; `12` §8.4/§5.9. **Classification:** Confirmed (AR-040, Appendix F), Recommended (review cadence). **Confidence:** High. **Reasoning:** AR-040 and §18.3 make cost a monitored, alerted control; the monthly review is the OR-026-compliant reuse of that data. **Impact-if-changed:** Absent AR-040 enforcement, PM-30 (cost overrun) is the highest-likelihood financial risk and remains unmitigated.

---

## 9. Budget Cap (Decision M-07) and Reserve Drawdown

- **Budget cap (M-07):** the total build + first-year operational ceiling, approved at Phase 0. This document supplies the ranges (Sections 3–5) and the sensitivity (Section 11) for that decision.
- **Reserve policy (`16` §8):** schedule 10–15%, effort 15–20%, cloud cost 20–25% above baseline. Reserves are not contingency spending — drawdown requires a decision-log entry naming the risk (PM row) being covered (OR-005).
- **Cap breach rule:** any projection over the approved cap routes to the escalation path (`17` §9) and re-opens PM-51 (funding) with a re-baselining decision.

**Source:** `16` §8; `02` §6 (M-07); `17` §9. **Classification:** Confirmed (decision exists), Configurable (cap value). **Confidence:** High for structure; the cap value is M-07's output, not this document's. **Reasoning:** M-07 is a named Phase 0 approval; this document's job is to make it well-informed and its drawdown rules explicit. **Impact-if-changed:** A cap below the conservative build range forces scope or timeline decisions (PM-51) that must be made before Phase 1, not discovered at Phase 9.

---

## 10. Financial and Delivery KPIs

From SRS Appendix F (Financial and Technical classes), with owners:

| KPI | Target (Configurable) | Owner | Measured From |
| --- | --- | --- | --- |
| Cost per enrolled father | Baseline set at Phase 10 | Program + Finance | Phase 10 |
| Cost per active user | Baseline set at Phase 10 | Program + Finance | Phase 10 |
| Cost per engagement | Baseline set at Phase 10 | Program + Finance | Phase 10 |
| Infrastructure cost efficiency | % of budget, alert at 100% (AR-040) | DevOps | Phase 1 |
| System availability | 99.9% (NFR-010) | DevOps | Phase 10 |
| API p95 latency | NFR-001…009 targets | Backend/QA | Phase 9 |
| AI answer accuracy | ≥ 90% eval set (NFR-047) | AI | Phase 5 |
| WhatsApp delivery performance | NFR-005 targets | Integration | Phase 10 |
| Mobile stability | crash-free session target (NFR-035) | Mobile | Phase 10 |
| Pilot engagement | ≥ 60% weekly support action (PD-004) | Research & Community | Phase 10 |

**Source:** SRS Appendix F; PD-004; NFR-001…010/035/047; AR-040. **Classification:** Confirmed (KPI classes and anchors), Configurable (target values). **Confidence:** High. **Reasoning:** Every KPI traces to a named SRS class or NFR so the QR-018 evaluation can cite measurement against a fixed framework (PD-011). **Impact-if-changed:** KPI target changes are decision-log entries and feed the QR-018 evaluation criteria before Phase 10.

---

## 11. Sensitivity Analysis (Configurable)

| Assumption Moved | Effect on Cost | Effect on Timeline | Notes |
| --- | --- | --- | --- |
| Blended day rate +20% | +20% on development cost | none | Dominant input; confirm at Phase 0 |
| Team < 10 FTE | Lower burn rate, higher total | Extends beyond conservative (~58 wk) | PM-45 trade-off |
| Cohort > 1,000 fathers | +usage-driven infrastructure/AI lines | Phase 10 evaluation window grows | M-05 input; per-user cost drops |
| WhatsApp per-conversation price up | +WhatsApp line | none | Provider comparison at M-02 |
| LLM usage > 5k interactions/day | +AI/LLM line; AI daily budget enforced | none | `12` §5.9 cap limits exposure |
| Region data-residency premium | +hosting line | none | M-01 decision |
| Reserve not funded | — | risk of overrun at gate | PM-51 re-opens |

**Source:** Section 3–6 ranges; `16` §8; `14` §16.3. **Classification:** Configurable. **Confidence:** Medium. **Reasoning:** The two stable facts are the scenario ratio (~1 : 1.28 : 1.69 on effort) and the gate sequence; everything else is a configurable input with a named decision or risk attached. **Impact-if-changed:** Sensitivity rows double as the Phase 0 confirmation checklist for M-01…M-07.

---

## 12. Development Team Requirements and Team Cost Estimate

The people-side counterpart to Section 4. Roles, responsibilities, and FTE references are owned by `15-team-and-resource-plan.md` §2/§3; this section consolidates them for the M-07 decision. All figures are **Configurable references**, not commitments (SRS §1.11, Appendix C).

### 12.1 Team Requirements (roles, number, duration, responsibilities)

The 23-role reference team from `15` §2/§3 (Appendix E integrated model). "Peak FTE" is the configurable headcount during the role's busiest phase; "Phases" is the build-phase need (`15` §3).

| Team | Role | Peak FTE (Configurable) | Phases | Core Responsibilities (anchor) |
| --- | --- | --- | --- | --- |
| Product & Leadership | Project Manager / Delivery Lead | 1.0 | 0–10 | Milestones M0–M9; gate evidence G1/G2/G3; effort vs `14` §16.1 |
| Product & Leadership | Technical Lead / Solutions Architect | 1.0 | 0–9 | ADR-001…006, M-01…M-07; AR-001…040 compliance |
| Product & Leadership | Program Manager (MERQ) | 1.0 (build), 0.5–1.0 (pilot) | 0, 10+ | OR-028/029; funder coordination; ethics/partnerships |
| Engineering | Backend Developer (API/services) | 2–3 | 1–8 (peak 2–5) | FR-001…170 server scope; idempotency (FR-161), RBAC (FR-126) |
| Engineering | WhatsApp Platform Engineer | 1–2 | 4 (+Phase 8 slice) | FR-011…030; provider abstraction (FR-149), HMAC (FR-011) |
| Engineering | Mobile Developer | 2 | 6 (+8–10 slices) | FR-133…142; offline/sync (FR-136, AR-025) |
| Engineering | Frontend/Admin Developer | 2 | 7 (+8–10 slices) | FR-094…112; WCAG 2.1 AA (NFR-031) |
| Engineering | DevOps Engineer | 1.0 | 1, 3, continuous | AR-036…040; on-call owner from Phase 10 (OR-001) |
| Engineering | Database Engineer | 1.0 | 1–2 (+8–10 support) | Migrations, consent immutability (AR-012), vector store |
| Engineering | QA Engineer | 2 (lead + analyst) | 1 (ramp), 2–9, 10 | QR-001…016; UAT (QR-017), traceability (QR-015) |
| AI & Data | AI/ML Engineer | 1–2 | 5 (+6/8 slices) | FR-059…075; eval set ≥ 90% (QR-011/014) |
| AI & Data | Data Engineer | 1.0 | 5, 8 (+10 support) | FR-113…122; pseudonymization (FR-119) |
| AI & Data | AI Safety Reviewer | 0.5 | 5, All | Safety regression, prompt/boundary review (AR-006) |
| Healthcare & Content | Clinical Reviewer | 0.5 | 2 (first cycle), continuous | OR-021/QR-019 medical gate; sole medical approver (FR-106) |
| Healthcare & Content | Content Manager | 1.0 | 2, continuous | Content library, CMS workflow (FR-076…085) |
| Healthcare & Content | Healthcare Advisor | 0.25–0.5 | 0, 2+, 9, 10+ | Referral/danger-sign validation; UAT (QR-017) |
| Healthcare & Content | Translation Reviewer | 0.25–0.5 | 2, continuous | EN/AM parity, plain-language check (NFR-033) |
| Research & Community | Research Lead | 0.5–1.0 | 0, 8, 10, post-pilot | Ethics (OR-017), QR-018 evaluation, export gate (FR-116) |
| Research & Community | Community Manager | 0.5 | 10, post-pilot | Cohort onboarding (OR-028), PD-004 engagement |
| Research & Community | Support Team | 1–2 (L1–L2) | 10, post-pilot | Support SLAs (OR-002), help-desk KB (OR-016) |
| Security & Privacy | Security Engineer/Consultant | 0.5–1.0 | 0, 3, 9, post-pilot | STRIDE, SAST/DAST/pen (QR-007), incident response (OR-009) |
| Security & Privacy | Privacy Advisor | 0.25 | 0, 3, 8, post-pilot | DPIA (FR-132), DPAs (NFR-029), OR-026 reviews |

**Duration:** the team is engaged over the `14` §16.2 calendar scenarios (~32 / ~42 / ~58 weeks best / realistic / conservative), with part-time roles (Clinical, Security, Privacy, Research, Translation, Healthcare) engaged in defined windows rather than full duration. Peak core headcount ~10–12 FTE equivalent (`14` §16.2).

**Source:** `15` §2/§3; SRS Appendix E; `14` §16.2. **Classification:** Confirmed (Appendix E role model), Configurable (FTE figures). **Confidence:** High for roles/responsibilities, Medium for FTE. **Impact-if-changed:** Cutting any gating role (Clinical Reviewer, Security, QA, Research Lead) lengthens gate G2/G3 evidence windows (PM-46); team below ~10–12 FTE extends the calendar beyond conservative (~58 weeks, PM-45).

### 12.2 Team Cost Estimate

- **Build cost:** Section 4 converts effort to cost at the Phase 0-confirmed blended day rate — illustrative totals ≈ **$474k (best) / $606k (realistic) / $801k (conservative)** at a reference $300/day blended.
- **Blended-rate drivers:** market rates, Addis-based vs remote mix (`15` §9), FTE composition. A +20% rate moves totals +20% (Section 11); the ratio between scenarios (~1 : 1.28 : 1.69) is rate-independent.
- **Sustained operational team (post-pilot):** ~7–9 FTE (`15` §10.3) — on-call, support, content, clinical, AI safety, translation, research/M&E, security, program — whose cost is the dominant monthly line in Section 5. The exact run-rate is set at Phase 0 and tracked via AR-040 (Section 8).

**Source:** Section 4; `15` §9/§10; SRS Appendix C.2/C.3. **Classification:** Configurable. **Confidence:** Medium. **Reasoning:** Team cost is the product of two configurable inputs (FTE plan and blended rate); fixing the FTE plan (`15`) makes cost a rate decision only, which is the correct shape for M-07. **Impact-if-changed:** Any FTE change must re-derive `15` §10 totals and Section 4 in the same change set, then re-confirm M-07.

---

## 13. Verification Approach

This analysis is itself verified:

1. **Effort traceability** — Section 4 pw totals reproduce `14` §16.1 exactly (Best 316 / Realistic 404 / Conservative 534); any `14` amendment re-derives Section 4 in the same change set.
2. **Cost-structure traceability** — Section 3/5 categories reproduce SRS Appendix C.1/C.3 one-for-one; no category invented or dropped.
3. **Control traceability** — every optimization (Section 7) and tracking control (Section 8) maps to a named SRS control (AR-040, FR-072/149, §18.3, Appendix F); removal re-opens PM-30/PM-51.
4. **KPI traceability** — Section 10 rows map to Appendix F classes and named NFRs/PD rows; checked against `00` at the Phase 0 QA sync.
5. **No placeholders** — scan for "TBD", "TODO", "to be defined", empty cells at authoring.
6. **Classification discipline** — Confirmed/Recommended/Configurable labels present on every major figure; no reference value presented as a commitment (SRS §1.11).

**Source:** QR-015; `14` §18; `13` §18 pattern. **Classification:** Confirmed (obligations), Recommended (method). **Confidence:** High. **Reasoning:** An analysis that cannot be traced to `14` or Appendix C is not analysis — it is an unverified estimate presented as fact, which is the one failure M-07 must not inherit. **Impact-if-changed:** Any change to `14` §16 or Appendix C re-runs checks 1–2 and re-confirms M-07 before Phase 1.

---

**END OF DOCUMENT — 20. Resource and Delivery Analysis.** Effort from `14` §16.1 (316/404/534 pw); infrastructure and operations categories from SRS Appendix C.1/C.3; dev/test/prod environment breakdown in §3.1; timeline scenarios from `14` §16.2 (~32/42/58 weeks); team requirements and team cost in §12 (23 roles from `15`, ~10–12 FTE peak core, ~7–9 FTE sustained); controls from AR-040, `12` §5.9/§8.4, `08` §15; financial KPIs from Appendix F; reserves from `16` §8; budget cap decision M-07 and cost tracking to `implementation-status.md`.
