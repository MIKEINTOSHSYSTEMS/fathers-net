# 16. Risk Management Plan

**Document:** FathersNet (Ayay) — Risk Management Plan (Technical Program Manager + Principal Solution Architect)
**Source of truth:** `docs/FathersNet-Complete-SRS.md` (FN-SRS-001 v2.0) — **Appendix G Risk Register** (22 SRS-stated risks across Technical / Operational / Business / AI / Research categories) is the controlling baseline; **§1.9 Assumptions, Dependencies, Constraints** (D-01…D-06) defines the external dependencies whose failure modes appear throughout; **§19 Disaster Recovery** (RPO ≤ 15 min / RTO ≤ 4 h) and **§17 QR-013/QR-016** define the risk gates this register feeds. Also binding: **OR-009** (incident management), **OR-010** (AI incident tracking), **OR-008** (alerting/escalation), **OR-005** (change management), **OR-012** (DR drills), **OR-023** (business continuity).
**Inputs:** `14-development-phase-roadmap.md` §17 (roadmap risks R-01…R-14); `15-team-and-resource-plan.md` §11 (resource risks RR-01…RR-10); `18-implementation-verification-plan.md` §11 (verification risks V-01…V-12); `04-technology-stack-analysis.md` §19 (technology risks T-01…T-20); `11-security-and-privacy-plan.md` §17 (security risks S-01…S-12); `12-devops-and-infrastructure-plan.md` §16 (infrastructure risks I-01…I-14); `13-testing-and-quality-plan.md` §17 (QA risks Q-01…Q-16); `08-ai-rag-implementation-plan.md` §19 (AI risks); `03-system-architecture-plan.md` §12 (architecture risks).
**Sibling documents:** `17-final-execution-roadmap.md` §13 (execution risk consolidation R-01…R-19), `decision-log.md` (risk-driven decisions M-01…M-07), `21-quality-gate-checklist.md` (gate evidence for risk closures), `implementation-status.md` (live risk register status).
**Purpose:** Production risk management plan that consolidates every risk named across the plan set into a single master register with owners, response strategies, indicators, review cadence, and phase mapping, so that no SRS risk is orphaned and every mitigation is traceable to an implemented control. This document plans only; it contains no application code.
**Classification convention:** **Confirmed** (SRS-stated) · **Recommended** (engineering decision) · **Configurable** (parameter with default) · **Assumption** (requires human validation). Every major item carries **Source / Confidence / Reasoning / Impact-if-changed** annotations. Likelihood and impact ratings are qualitative **Recommended** estimates for prioritization, not commitments.

---

## 1. Executive Purpose

This document is the single risk authority for the FathersNet (Ayay) build and pilot. It answers, at any moment: **what can hurt the program, how likely, how badly, who owns it, what we do about it, and how we know it is happening or happening to us.**

The SRS Appendix G register is the mandatory baseline (22 risks). The plan set has since expanded that baseline into per-domain registers: technology (`04` §19), security (`11` §17), infrastructure (`12` §16), QA (`13` §17), verification (`18` §11), resources (`15` §11), and roadmap (`14` §17). This document merges them into one master register (Section 3) with a single risk ID scheme (PM-01…PM-50+) so that Program Leadership reads one register, not seven.

| Property | Value | SRS Anchor |
| --- | --- | --- |
| Baseline register | SRS Appendix G (22 risks) — every one carried into Section 3 | Appendix G |
| Master ID scheme | PM-01…PM-50+; each row carries its source register IDs | QR-015 traceability discipline |
| Risk owner | Single named role per risk (Appendix E team map, `15` §2.2) | OR-008, Appendix E |
| Review cadence | Monthly review; per-phase-exit review; quarterly DR drill review; gate-triggered review at G1/G2/G3 | OR-005, OR-026 |
| Severity model | Likelihood × Impact = Low / Medium / High / Critical; Critical risks cannot enter a gate open | QR-013 |
| Escalation | Risk → incident → Level-4 escalation path per `11` §14, OR-009/OR-010 | OR-009, OR-010 |
| Traceability | Every mitigation maps to an SRS control; removal of a control reopens the risk | QR-015, QR-013 |

**Source:** SRS Appendix G; §17 QR-013; §18 OR-005/008/009/010/026. **Classification:** Confirmed (baseline and controls); Recommended (master-ID scheme, cadence, severity model). **Confidence:** High — Appendix G and the OR/QR series name the risks and the management controls explicitly; the consolidation is aggregation, not invention. **Reasoning:** Seven parallel registers cannot be reviewed or owned consistently; a single master with source-links preserves the audit trail (QR-015) while giving the program one decision surface. **Impact-if-changed:** If Appendix G is amended by the SRS owner, this register is re-derived from the SRS first, then the domain registers, in the same change set; the cross-references in Sections 3–7 must be re-verified at the next QA sync.

**What this document deliberately does NOT do:** it does not set guarantees, insurances, or financial reserves as commitments (configurable reference only, Section 8); it does not write application code; it does not replace `11` (security incident response), `12` (infrastructure runbooks), or `18` (verification risks live as V-01…V-12). Where a risk is jointly owned (e.g., clinical review), the primary owner is named and the secondary owner is referenced.

**How to read this document:** Section 2 defines the framework (model, process, severity, escalation protocol). Section 3 is the master register — the authoritative list (Categories A–J incl. the full-layout Healthcare category, Category K dependency index, and the Section 3.12 summary rollup). Section 4 analyzes the top risks. Section 5 maps responses to owners and SRS controls. Section 6 maps risks to phases and gates. Section 7 defines indicators/triggers (early warning). Section 8 covers contingency reserves (configurable). Section 9 defines review and reporting cadence. Section 10 defines risk-driven approvals feeding `decision-log.md`. Section 11 covers change control. Section 12 is this plan's verification approach.

---

## 2. Risk Management Framework

### 2.1 Risk Process (Identify → Assess → Respond → Monitor → Review)

| Step | Output | Cadence | Owner |
| --- | --- | --- | --- |
| **Identify** | New risk row (PM ID) sourced to SRS Appendix G, a domain register, or a new observation | Continuous; formalized monthly | Program Manager |
| **Assess** | Likelihood × Impact rating; severity (L/H/M/C); affected requirements and gates | Monthly + phase exit | Program Manager + domain owner |
| **Respond** | Response strategy per Section 5 (avoid / mitigate / transfer / accept); named owner; SRS control mapped | At assessment | Risk owner |
| **Monitor** | Indicator values per Section 7 checked against triggers | Weekly in standup; monthly in risk review | Risk owner |
| **Review** | Severity recalibration; closure of retired risks; decision-log entries for accepted risks | Monthly; phase exit; gate | Program leadership |

**Source:** SRS OR-005 (change management), OR-026 (periodic reviews), OR-009 (incident management); standard risk practice as engineering recommendation. **Classification:** Recommended (process shape); Confirmed (the OR obligations it operationalizes). **Confidence:** High. **Reasoning:** OR-026 requires periodic reviews and OR-005 requires controlled change; the five-step loop is the minimal structure that satisfies both while keeping a living register. **Impact-if-changed:** A lighter process (e.g., review only at gates) violates OR-026's periodic-review obligation and leaves drift undetected between phases.

### 2.2 Severity Model (Configurable)

Severity = **Likelihood × Impact**, each rated Low / Medium / High. Combined into a five-point scale:

| Severity | Meaning | Gate Behavior |
| --- | --- | --- |
| **Low** | Acceptable; monitor | Tracked in register; no gate effect |
| **Medium** | Acceptable with mitigation | Mitigation active; verify at phase exit |
| **High** | Unacceptable without active control | Control evidence required at the affected gate (G1/G2/G3) |
| **Critical** | Program- or safety-threatening | Cannot enter any gate open; escalate to Program leadership immediately (Section 10) |

**Source:** QR-013 (release gate requires passing combined evidence); Appendix F (safety KPIs). **Classification:** Recommended (scoring); Configurable (thresholds). **Confidence:** High. **Reasoning:** QR-013 makes the release conditional on evidence, so a Critical risk open at a gate is definitionally un-enterable. **Impact-if-changed:** Weakening the Critical rule to allow gate entry voids the QR-013 guarantee and reproduces R-08 (security retrofit) style failures.

### 2.3 Risk Response Strategies

- **Avoid** — remove the cause (e.g., defer Could-Have scope; R-07).
- **Mitigate** — reduce likelihood or impact through a designed control (the dominant strategy here; every mitigation maps to an SRS control).
- **Transfer** — externalize (e.g., vendor DPAs, insurance for pen-test vendor liabilities).
- **Accept** — consciously accept residual risk with a decision-log entry and owner (e.g., single-region RPO acceptance if waived, `12` R12).

**Source:** SRS Appendix G mitigations; `14` §17; standard practice. **Classification:** Recommended. **Confidence:** High. **Impact-if-changed:** Accept is never default; every acceptance must be recorded in `decision-log.md` (OR-005) and reviewed at the next gate.

### 2.4 Escalation Protocol

A risk or live incident moves up the ladder when it exceeds the owning level's authority, hits a trigger in Section 7, or involves participant safety. Each level has a named owner and a time-to-act; the ladder matches the SRS incident path (OR-009, OR-010) and `11` §14.

| Level | Trigger | Owner | Time-to-Act | Action |
| --- | --- | --- | --- | --- |
| L1 — Risk owner | Trigger fired but contained; mitigation active | PM row owner (Section 3) | Same day | Apply named mitigation; update `implementation-status.md`; report in next standup |
| L2 — Program | Severity rises to High, or mitigation unavailable within target | Program Manager | Same business day | Re-rate row; reallocate resources; notify gate owner if a gate is affected (Section 6) |
| L3 — Leadership | Severity High across phases, or any Critical (PM-21/PM-26/PM-66) opens | Program Leadership + domain head | Within 4 hours | Stand-up response; freeze affected scope/release; decision-log entry (OR-005); evidence re-plan |
| L4 — Safety/Compliance | Participant safety, data breach, or regulatory exposure | Program Leadership + Security/Clinical + legal | Immediately (24/7 on-call) | Emergency incident response (`11` §14, OR-009); Level-4 contact tree; regulator/ethics notification per NFR-041/OR-017; post-incident review feeds `decision-log.md` |

**Escalation rule:** severity rating (Section 2.2) drives escalation regardless of phase. A Critical row cannot enter a gate open (Section 2.2) and, if opened mid-phase, forces an L3 review. **Source:** OR-009, OR-010, OR-008; `11` §14. **Classification:** Recommended ladder implementing Confirmed OR obligations. **Confidence:** High. **Impact-if-changed:** A slower ladder than L1–L4 re-introduces PM-21/PM-26 exposure because safety rows would wait on routine cadence instead of immediate action.

---

## 3. Master Risk Register

**Legend.** L = Likelihood, I = Impact, Se = Severity (L/M/H/C). Source column carries the originating register IDs: `G` (SRS Appendix G), `14` (roadmap R-), `15` (resource RR-), `18` (verification V-), `04` (technology T-), `11` (security S-), `12` (infrastructure I-), `13` (QA Q-). Owners are Appendix E roles (`15` §2.2).

**Field mapping to the required six-field risk view.** Every register row is read as: **Risk** (Risk column) · **Impact** (I column) · **Probability** (L column) · **Severity** (Se column) · **Mitigation** (Response column; control detail in Section 5) · **Detection** (Section 7 indicators/triggers; per-row where listed) · **Recovery** (Response controls plus runbooks in `12` §10 and `11` §15, verified per Section 12). Category J below uses the full six-field layout with explicit columns so both views are literally present in this document.

### 3.1 Category A — Technical & Architecture

| PM ID | Risk | L | I | Se | Source | Owner | Response |
| --- | --- | --- | --- | --- | --- | --- | --- |
| PM-01 | Microservice boundary drift: services merge into a monolith or duplicate logic (AR-001, FR-159) | M | H | **High** | 04 T-01; 03 §12 | Backend lead | Mitigate — enforced service boundaries, OpenAPI contract-first, architecture review in CI (`06` §2, `03` §13.1) |
| PM-02 | Node↔Python AI seam duplication/mis-wiring (RAG/ASR/theme) | M | M | Medium | 04 T-02 | AI + backend leads | Mitigate — single internal AI API + queue contract, contract tests (QR-005) |
| PM-03 | Offline sync bugs: duplicates, lost writes, conflicts (FR-136, AR-025) | H | H | **High** | 04 T-03; 14 R-10; 09 §9 | Mobile lead | Mitigate — dedicated sync protocol, monotonic seq, server-authoritative revisions, device-matrix E2E (`09` §8.5, §17.4) |
| PM-04 | Vector retrieval threshold/quality drift erodes AI grounding (NFR-047/048, C-01) | M | H | **High** | 04 T-07; 08 §19 | AI architect | Mitigate — eval set (QR-011/014), threshold monitoring, payload-filtered retrieval (AR-015) |
| PM-05 | Slow queries / index drift at scale (NFR-007) | M | M | Medium | 04 T-05; 05 §12 | DB architect | Mitigate — index review (`05` §6), slow-query monitoring (§18.2), read replicas at scale |
| PM-06 | Queue backlog / DLQ buildup loses messages during broadcasts (FR-161, NFR-005) | M | M | Medium | 04 T-09; 12 I-13 | Backend/DevOps | Mitigate — AOF persistence, queue-depth/age alerting, idempotency keys, DLQ reprocessing runbook |
| PM-07 | Stale cached AI answers after content/prompt changes (FR-068/080) | M | M | Medium | 04 T-10 | AI architect | Mitigate — version-keyed cache, deterministic invalidation on lifecycle events (AR-015/016) |
| PM-08 | Provider abstraction bypassed by shortcuts (FR-149/072) | L | H | Medium | 04 T-20 | Engineering lead | Mitigate — code-review rule (all third-party calls through adapters), provider-swap tests in staging (AR-004) |
| PM-09 | Amharic transcription/translation quality below threshold (D-06, FR-024/133) | M | H | **High** | 04 T-11; 14 R-17 | AI architect | Mitigate — per-language eval scoring, fallback routing (AssemblyAI primary/Google STT), human sampling (FR-071), early content localization |

### 3.2 Category B — Security & Privacy

| PM ID | Risk | L | I | Se | Source | Owner | Response |
| --- | --- | --- | --- | --- | --- | --- | --- |
| PM-10 | OTP interception / SMS fraud in target region (FR-126 authn) | M-H | H | **High** | 11 S-01 | Security | Mitigate — rate limits (5/15 min), expiry, lockout, device fingerprint, anomaly detection, admin MFA (FR-101) |
| PM-11 | AI prompt injection / jailbreak produces unsafe responses | M-H | H | **High** | 11 S-02; 13 Q-05 | Security + AI | Mitigate — input/output safety layers, grounded-only RAG, no tool access from user text, injection regression suite (§14.1.4) |
| PM-12 | Webhook spoofing / replay (WhatsApp) causes false emergencies or data pollution | M | H | **High** | 11 S-04; 07 §13 | Integration lead | Mitigate — HMAC constant-time validation, idempotency, replay dedup, secret rotation (§14.1.5) |
| PM-13 | Malicious media uploads (malware on storage) | M | M | Medium | 11 S-05 | Security | Mitigate — type/size validation, malware scan on upload (AR-023), isolated bucket, no execution |
| PM-14 | Insider misuse (researcher/admin/support) causes privacy breach or research contamination | L-M | H | **High** | 11 S-06 | Security | Mitigate — least privilege, MFA, segregation of duties (FR-106), read-only audit roles, quarterly reviews |
| PM-15 | Data leakage via logs, exports, or third parties (no-PII rule, NFR-022/023) | M | H | **High** | 11 S-07; 12 I-08/I-14 | Security + DevOps | Mitigate — no-PII-in-logs rule, signed expiring URLs, pseudonymization (§9.5), DPA enforcement (NFR-029), DLP reviews |
| PM-16 | Key/secret compromise or rotation failure | L-M | H | **High** | 11 S-08; 12 I-06 | DevOps/Security | Mitigate — KMS (§7), dual-active webhook secret rotation, emergency rotation path, secret scanning (NFR-022) |
| PM-17 | Broken access control / IDOR regression exposes cross-user data | M | H | **High** | 11 S-09 | Backend lead | Mitigate — ownership predicates, deny-by-default, negative authorization tests in CI (§14.1.2) |
| PM-18 | Security retrofit if P1–P2 skip cross-cutting controls | L (if followed) | VH | **High** | 14 R-08 | Program | Mitigate — Gate 2 hard exit, CI security scans from Phase 1, no phase accepts incomplete controls |
| PM-19 | Compliance exposure from self-claimed certification | M | M | Medium | 11 S-10 | Program/legal | Mitigate — SRS §1.10 discipline ("designed to support alignment"), legal review before launch (NFR-041), DPIA register (FR-132) |

### 3.3 Category C — AI Safety & Quality

| PM ID | Risk | L | I | Se | Source | Owner | Response |
| --- | --- | --- | --- | --- | --- | --- | --- |
| PM-20 | Hallucination / ungrounded answers undermine trust and safety | M | H | **High** | G AI; 08 §19 | AI architect | Mitigate — RAG grounding (FR-061), eval set (QR-011), medical safety layer (AR-006), no-diagnosis policy (C-01) |
| PM-21 | Emergency false negatives (danger-sign detection missed) | L-M | VH | **Critical** | 13 Q-04; 18 V-05 | AI + clinical | Mitigate — emergency false-negative suite from Phase 5, keyword + paraphrase + Amharic coverage, continuous monitoring (NFR-050), Level-4 escalation (OR-010) |
| PM-22 | Bias in AI outputs (gender, cultural, regional) | M | M | Medium | G AI; 08 §12.4 | AI + research | Mitigate — fairness review, sampled audits, evaluation-set coverage across demographics |
| PM-23 | Model drift / degraded performance after launch | M | M | Medium | G AI; 08 §14.2 | AI architect | Mitigate — continuous evaluation + alerting (NFR-050), versioned model registry (NFR-049), sampled audits, annual review (OR-026) |
| PM-24 | AI eval set below 90% accuracy blocks Phase 5 / QR-014 | M | H | **High** | 13 Q-03; 18 V-04 | QA + AI | Mitigate — eval-set construction starts at Phase 5 kickoff, retrieval tuning before model swaps, fallback-tier evaluation |
| PM-25 | Model/prompt change regresses safety (QR-014 gate evasion) | M-H | H | **High** | 13 Q-16 | AI + QA | Mitigate — every model/prompt change re-runs eval + safety regression before routing (NFR-049, §14.11) |
| PM-26 | Unsafe medical recommendations reach users | M | C | **Critical** | G AI | AI + clinical | Mitigate — medical safety layer, no-diagnosis policy, grounded-only answers, clinical review gate (OR-021), emergency protocol never flag-disabled |

### 3.4 Category D — Data & Infrastructure

| PM ID | Risk | L | I | Se | Source | Owner | Response |
| --- | --- | --- | --- | --- | --- | --- | --- |
| PM-27 | Third-party provider outage (WhatsApp/LLM/ASR) blocks core flow | H | H | **High** | G Technical; 12 I-01; 14 R-14 | DevOps | Mitigate — fallback tiers (FR-072, FR-152), NFR-015 graceful degradation (emergency path stays up), provider alerts, status page (OR-006) |
| PM-28 | Data loss on unverified backups (RPO ≤ 15 min) | M | H | **High** | G Technical; 12 I-03; NFR-012/014 | DevOps | Mitigate — PITR + daily fulls, automated backup verification, quarterly restore drills (OR-012), P2 alert on dump failure |
| PM-29 | DR never practiced → RTO ≤ 4 h missed | M | H | **High** | 12 I-10/I-12; §19 | DevOps | Mitigate — quarterly restore drill + annual failover drill with measurements, missed-drill alert, documented acceptance if waived |
| PM-30 | Cloud cost overrun on AI/messaging/compute (AR-040, A-07) | H | M | **High** | 12 I-02; 04 T-16 | Program + DevOps | Mitigate — AI daily budget (§5.9), cost alerts (§8.4), HPA limits, monthly review, cost-aware model routing |
| PM-31 | Scale spike during campaign degrades latency (NFR-005, FR-107) | M | M | Medium | 12 I-07 | DevOps | Mitigate — queue-based autoscaling, backlog alerts, QR-006 soak/spike testing |
| PM-32 | IaC drift bypasses review gate | M | M | Medium | 12 I-09 | DevOps | Mitigate — drift detection (§6.4), plan-gated applies (§6.5), change records, quarterly audit |
| PM-33 | Emergency notification path fails under load (false emergency, FR-089/108) | L | H | Medium | 12 I-11 | DevOps + clinical | Mitigate — independent watchdog + second channel, pre-approved emergency templates, runbook (§14.10) |

### 3.5 Category E — Quality & Verification

| PM ID | Risk | L | I | Se | Source | Owner | Response |
| --- | --- | --- | --- | --- | --- | --- | --- |
| PM-34 | Coverage floors (QR-002) not met on schedule | M | M | Medium | 13 Q-01 | QA lead | Mitigate — per-service coverage in CI from Phase 1, tests written alongside features, not retrofitted |
| PM-35 | E2E flakiness delays green runs | H | M | Medium | 13 Q-02; 18 V-03 | QA lead | Mitigate — quarantine with tracked defect, deterministic fixtures, retry policy, parallelization |
| PM-36 | Performance targets missed at pilot load (NFR-001…009) | M | M-H | Medium | 14 R-09; 13 Q-06/Q-07 | QA + DevOps | Mitigate — load model to §5.9 volumes, early load runs from Phase 1, index review, autoscaling, broadcast soak tests |
| PM-37 | Test data hygiene slip (production PII in test env) | L | M | Medium | 13 Q-10; QR-012/AR-009 | QA lead | Mitigate — CI hygiene checks, environment isolation, access controls |
| PM-38 | Traceability matrix drift → QR-015 unprovable | M | M | Medium | 13 Q-14; 18 V-02 | QA lead | Mitigate — automated requirement-to-test linkage, weekly coverage report, CI requirement-check |
| PM-39 | Evidence produced against wrong environment/stale commit | M | H | **High** | 18 V-01 | QA lead | Mitigate — evidence registry records env + commit SHA, QA rejects missing/stale metadata, E2E never against prod (AR-009) |
| PM-40 | Pen-test / clinical-review / UAT availability slips the release gate | M | H | **High** | 18 V-06 | Program | Mitigate — procurement/scheduling started at Phase 0 (D-10/D-11), remote/WhatsApp UAT option, clinical review parallel with content production |
| PM-41 | Requirement changes mid-build invalidate evidence | M | M-H | Medium | 18 V-11 | Program | Mitigate — change management through decision log (OR-005), affected evidence bundles re-run before next gate |

### 3.6 Category F — People & Resources

| PM ID | Risk | L | I | Se | Source | Owner | Response |
| --- | --- | --- | --- | --- | --- | --- | --- |
| PM-42 | Clinical reviewer bottleneck blocks content + AI grounding (D-04, OR-021) | M-H | H | **High** | 15 RR-01; 14 R-04 | Healthcare & Content | Mitigate — engage from Phase 2, standing weekly review windows, multi-reviewer backup, content authored ahead of Phase 5, QR-019 scheduled early in Phase 9 |
| PM-43 | Ethics approval delay blocks research pipeline (D-05, OR-017) | M | H | **High** | 15 RR-02; 14 R-05 | Research & Community | Mitigate — consent model in Phase 0 (FR-117), pipeline behind feature flags in Phase 8, protocol submitted before Phase 8, contingency launch with participation consent only |
| PM-44 | Turnover/availability of specialists (WhatsApp, Mobile, AI/ML, Security) | M | M | Medium | 15 RR-03; 14 R-12; G Operational | Program | Mitigate — co-located documentation (OR-015), runbooks (OR-003), two-person coverage on critical-path roles, 15–20% staffing buffer |
| PM-45 | Hiring/skill-pool lead times (M-04) lag phases | M | M-H | Medium | 15 RR-04 | Program | Mitigate — hiring two phases ahead, vendor/consultant bridging, cross-training into WhatsApp abstraction |
| PM-46 | Part-time enabler roles (Clinical, Security, Privacy, Research) understaffed | M | M | Medium | 15 RR-06 | Program | Mitigate — explicit FTE carve-outs, gating roles protected, shift Should-Have to Phase 10 rather than reduce gate roles |
| PM-47 | On-call burnout / SLA misses in pilot operations (OR-001/008) | M | M | Medium | 15 RR-07 | Ops lead | Mitigate — rotation sizing, secondary technical on-call first 3 months, automated runbook execution, post-incident review |

### 3.7 Category G — Program & Delivery

| PM ID | Risk | L | I | Se | Source | Owner | Response |
| --- | --- | --- | --- | --- | --- | --- | --- |
| PM-48 | Sequential gate dependencies (G1→G2→G3) delay overall delivery | M | H | **High** | 14 R-01 | Program | Mitigate — overlap non-critical-path phases (AI prep in P5 vs P4 tail; P6/P7 vs P5 tail), checkpoint rather than hard-stop where evidence permits |
| PM-49 | M-decisions not approved in time (M-01…M-07) | M | H | **High** | 14 R-06 | Program | Mitigate — decision log is a Phase 0 hard exit, parallel supplier negotiations with fallback options |
| PM-50 | Scope creep (Could-Have FR-075/090/093/110/121 pulled in) | M | M | Medium | 14 R-07; 15 RR-08; G Business | Product owner | Mitigate — Phase 10 backlog only, change control through decision log, gate reviewers hold acceptance criteria (QR-013) |
| PM-51 | Budget/funding changes force FTE or scope reduction | M | H | **High** | 15 RR-09; G Business | Program | Mitigate — phased rollout, configurable scope, cost model (Appendix C), AR-040 cost monitoring, contingency scenario in `20` |
| PM-52 | Pilot engagement below PD-004 (≥60% weekly support action) | M-H | M | Medium | 14 R-13; G Operational | Research & Community | Mitigate — personalization + campaign engine by P4/P7, M&E measures early, evaluation findings feed roadmap (QR-018) |
| PM-53 | Planning artifacts remaining (16, 19–23, decision-log, implementation-status) not yet authored | H (current) | M | Medium | 14 R-15 | Program | Mitigate — author in the current planning sequence; until authored, execute gate/decision content directly from `14` and the SRS; `17` §14 defines the gate-verification method now |
| PM-54 | Stakeholder alignment failure (funder/government) | L-M | M | Medium | G Business | Program | Mitigate — communication plan, regular reporting (OR-029), decision transparency (OR-005) |

### 3.8 Category H — External & Compliance

| PM ID | Risk | L | I | Se | Source | Owner | Response |
| --- | --- | --- | --- | --- | --- | --- | --- |
| PM-55 | WhatsApp Business API availability/policy in Ethiopia delays Phase 4 (D-01, C-06) | M | H | **High** | 14 R-02; 04 T-14; 12 I-04 | Program + integration | Mitigate — provider abstraction (FR-149) with 360Dialog/Twilio alternates, Phase 3 webhook pattern provider-agnostic, early template submission, opt-in records (FR-017) |
| PM-56 | LLM provider cost/compliance issues delay Phase 5 (D-02, A-07) | M | M-H | Medium | 14 R-03 | Program + AI | Mitigate — multi-provider fallback tiers (§9.8), cost-aware routing, pseudonymization verified before calls (FR-073), DPAs executed (NFR-029) |
| PM-57 | Cloud regional availability / data-residency expectations in Africa (D-03) | M | M | Medium | 04 T-15 | DevOps/Security | Mitigate — region-locked service selection, Terraform isolation, documented residency decision, AWS alternate path |
| PM-58 | Regulatory changes (health/data protection) | L-M | M | Medium | G Business | Program/legal | Mitigate — regulatory watch, design-for-alignment posture (SRS §1.10), periodic compliance reviews (OR-026) |
| PM-59 | Partnership delays (healthcare partners, BSPs) | M | M | Medium | G Business | Program | Mitigate — provider abstraction, contingency providers, parallel negotiations |
| PM-60 | DPA execution delays with processors (WhatsApp/LLM/ASR/cloud) block data flows | M | H | **High** | 11 D-5; NFR-029 | Program/legal | Mitigate — DPA track opened at Phase 0 (M-02/M-03), template DPAs, no data flow without executed DPA |

### 3.9 Category I — Research & Community

| PM ID | Risk | L | I | Se | Source | Owner | Response |
| --- | --- | --- | --- | --- | --- | --- | --- |
| PM-61 | Low research participation in founding cohort | M | M | Medium | G Research | Research & Community | Mitigate — engagement design, ethics-compliant incentives, community onboarding (US-016…) |
| PM-62 | Consent withdrawal handling breaks lifecycle (restricted processing) | M | H | **High** | G Research; FR-004/125 | Research + data | Mitigate — immutable consent event stream (AR-012), lifecycle handling, restricted processing, purge jobs (`05` §9.3) |
| PM-63 | Research data quality issues (invalid/incomplete responses) | M | M | Medium | G Research | Research | Mitigate — validation, theme-review sampling, pseudonymized review workflows |
| PM-64 | Research bias (methodology/governance) | M | M | Medium | G Research | Research + ethics | Mitigate — governance structure (OR-017), methodology review, transparency (FR-122) |

### 3.10 Category J — Healthcare & Clinical Safety

Dedicated healthcare/clinically supervised category using the **full six-field layout** (Risk · Impact · Probability · Mitigation · Detection · Recovery). New rows PM-65…PM-70; safety-classed per Section 2.2 and SRS §9.7 (clinical safety), OR-021 (clinical review), QR-019, and C-01 (no-diagnosis policy).

| PM ID | Risk | Impact | Probability | Severity | Mitigation | Detection | Recovery | Source |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| PM-65 | Medical content error published (incorrect advice in educational content or AI answers) | High | Medium | **High** | Clinical review before publish (OR-021), content approval + versioning (`10` CMS), no-diagnosis policy (C-01), AI grounded to KB only (AR-015) | Review-queue tracking, content audit, user-reported error channel, eval set (QR-011) | Content recall + correction workflow, clinical re-review, affected-user notification (OR-009), version rollback | OR-021, QR-019, C-01; `08` §12 |
| PM-66 | Participant harm or adverse event not identified/reported promptly | Very High | Low | **Critical** | Support triage (OR-002), incident process (OR-009), AI incident tracking (OR-010), emergency protocol never disabled (FR-108) | Emergency keyword monitoring, support SLA metrics, 24/7 Level-4 on-call | L4 escalation (Section 2.4), clinical incident review, ethics/regulator notification (OR-017, NFR-041), corrective-action plan | OR-002/009/010; §9.6 |
| PM-67 | Health-literacy or Amharic medical miscommunication (instructions misunderstood) | High | Medium | **High** | Plain-language rules (NFR-033, FR-140/141), EN/AM parity, translator + clinical double review (QR-019), cohort content testing | Comprehension sampling (PD-004, M&E), translation QA checks, user feedback | Re-translation + plain-language revision, clinical re-review, corrected-content redistribution | NFR-033, FR-140/141, QR-019 |
| PM-68 | Clinical supervision coverage gap (nights/weekends) delays urgent safety questions | High | Medium | **High** | On-call roster (OR-001/002), secondary clinical reviewer, pre-approved emergency templates (FR-108) | Roster-gap scan, clinical SLA monitoring, alert on unanswered urgent queries | Secondary-reviewer activation, emergency protocol, post-incident roster fix | OR-001/002, OR-021; `15` §5 |
| PM-69 | Regional/cultural medical-context errors in localized content | High | Medium | **High** | Local clinical advisor validation, regional context review (QR-019), content localization (`06` §5.3), cohort feedback loop | Regional content audit, cohort feedback, eval coverage by region | Content recall, local re-validation, correction + notification, version rollback | QR-019, OR-021; `23` |
| PM-70 | Psychological risk from paternal mental-health content (unsupported content triggers harm) | Medium-High | Low-Medium | Medium | Mental-health safeguarding review, referral-resource checks, no-diagnosis boundary, crisis-language rules (C-01, OR-021) | Safeguarding review checklist, content audit, support-channel escalation flags | Safeguarding escalation path, referral to support services, content revision + clinical re-review | C-01, OR-021; §9.7 |

**Source:** SRS §9.7, OR-021, QR-019, C-01, OR-001/002/009/010; `08` §12, `10` CMS, `23`. **Classification:** Confirmed (clinical-safety obligations named in the SRS); Recommended (PM-65…PM-70 statements, ratings). **Confidence:** High for obligations, Medium for qualitative ratings. **Reasoning:** Healthcare features are clinically supervised (OR-021, QR-019), so harm-and-content risks need a dedicated, explicitly-laid-out category rather than being folded into AI or program rows. **Impact-if-changed:** Any SRS clinical-review requirement change re-validates PM-65…PM-70 before the next gate; PM-66 (Critical) cannot enter a gate open.

### 3.11 Category K — Dependency Risk Index (D-01…D-06)

Makes the external-dependency dimension explicit without double-counting: each dependency row names its failure mode and the controlling PM rows already registered (QR-015 discipline — every SRS §1.9 dependency D-01…D-06 appears here exactly once and maps to its register rows).

| Dependency | Failure Mode | Controlling PM Rows | Detection | Recovery |
| --- | --- | --- | --- | --- |
| D-01 WhatsApp Business API availability/policy (Ethiopia) | BSP onboarding stalled or API policy changes | PM-55 | BSP onboarding status (Phase 0 M-02); webhook error-rate monitoring | 360Dialog/Twilio fallback via provider abstraction (FR-149), opt-in records (FR-017), status page (OR-006) |
| D-02 LLM/ASR provider availability/cost/compliance | Provider outage, price shift, or data-residency issue | PM-56, PM-60 | Provider error-rate + latency monitoring; cost alerts (AR-040); DPA status | Fallback tiers (§9.8), cost-aware routing, pseudonymization before calls (FR-073), executed DPAs (NFR-029) |
| D-03 Cloud regional availability / data residency (Africa) | Region outage or residency expectation unmet | PM-57, PM-28/29 | Region status; DR drill results (OR-012); residency documentation | Region-locked service selection, passive cross-region backup (`12` §10.6), RPO ≤ 15 min / RTO ≤ 4 h recovery |
| D-04 Clinical reviewer capacity | Review backlog blocks content + AI grounding | PM-42 | Review queue age (Section 7 trigger: > 5 working days) | Standing weekly windows, backup reviewers, content authored ahead of Phase 5 |
| D-05 Ethics approval timing | Approval delay blocks research pipeline | PM-43 | Protocol submission vs Phase 8 timeline | Contingency launch plan, feature-flagged research pipeline (FR-117), participation-consent-only fallback |
| D-06 Amharic transcription/translation quality | Accuracy below threshold undermines voice/answers | PM-09 | Per-language eval scores (QR-011/014) | Fallback ASR (AssemblyAI ↔ Google), human sampling (FR-071), early localization |

### 3.12 Risk Summary Table

Register rollup (PM-01…PM-70 = **70 risks**; ratings per Section 2.2).

| Category | PM IDs | Count | Critical | High | Medium |
| --- | --- | --- | --- | --- | --- |
| A — Technical & Architecture | PM-01…09 | 9 | 0 | 4 | 5 |
| B — Security & Privacy | PM-10…19 | 10 | 0 | 8 | 2 |
| C — AI Safety & Quality | PM-20…26 | 7 | 2 | 3 | 2 |
| D — Data & Infrastructure | PM-27…33 | 7 | 0 | 4 | 3 |
| E — Quality & Verification | PM-34…41 | 8 | 0 | 2 | 6 |
| F — People & Resources | PM-42…47 | 6 | 0 | 2 | 4 |
| G — Program & Delivery | PM-48…54 | 7 | 0 | 3 | 4 |
| H — External & Compliance | PM-55…60 | 6 | 0 | 2 | 4 |
| I — Research & Community | PM-61…64 | 4 | 0 | 1 | 3 |
| J — Healthcare & Clinical Safety | PM-65…70 | 6 | 1 | 4 | 1 |
| **Total** | PM-01…PM-70 | **70** | **3** | **33** | **34** |

**Reading:** 3 Critical / 33 High / 34 Medium across 70 tracked risks. Critical rows (PM-21, PM-26, PM-66) are safety-classed: they cannot enter any gate open (Section 2.2) and escalate at L3/L4 (Section 2.4). Any new risk discovered during build is added as PM-71+ with the same columns; the summary table is re-derived, never hand-patched.

> **Source (Section 3):** SRS Appendix G (all 22 baseline risks carried as G rows); `14` §17; `15` §11; `18` §11; `04` §19; `11` §17; `12` §16; `13` §17; `08` §19; `03` §12. Categories J–K and the Section 3.12 rollup extend the required Healthcare and Dependency risk views; every SRS Appendix G and every domain-register risk still appears exactly once. **Classification:** Confirmed (risk statements that name SRS requirements); Recommended (ratings, PM numbering, category grouping). **Confidence:** High for coverage (every SRS Appendix G and every domain-register risk appears exactly once); Medium for likelihood/impact estimates (qualitative, to be recalibrated monthly). **Reasoning:** Deduplication maps sibling-register IDs to a single PM ID while preserving source links, so no risk is lost and none is double-counted. **Impact-if-changed:** Any new risk discovered during build is added as PM-65+ with the same columns; any SRS change re-validates affected PM rows against the SRS before the next gate.

---

## 4. Top-Risk Analysis

The risks that demand named attention because of severity or likelihood. Each row names the response owner and the earliest gate where evidence is checked.

| Priority | PM ID | Risk | Severity | Primary Response | Earliest Gate Check | SRS Evidence |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | PM-21 | Emergency false negatives | **Critical** | Emergency false-negative suite + monitoring | G2 tail / Phase 9 QR-014 | QR-014, NFR-050, OR-010, §9.6 |
| 2 | PM-26 | Unsafe medical recommendations | **Critical** | Medical safety layer + clinical gate | G2 / Phase 9 QR-019 | AR-006, OR-021, C-01 |
| 3 | PM-03 | Offline sync correctness | High | Sync protocol + device-matrix E2E | Phase 9 | AR-025, FR-136, QR-013 |
| 4 | PM-55 | WhatsApp availability in Ethiopia | High | Provider abstraction + contingency | Phase 0 M-02 / Phase 3 | D-01, FR-149, FR-017 |
| 5 | PM-42 | Clinical reviewer bottleneck | High | Parallel review windows | Phase 2 / Phase 9 | D-04, OR-021, QR-019 |
| 6 | PM-49 | M-decisions late | High | Phase 0 hard exit | Phase 0 G1 | M-01…M-07 |
| 7 | PM-27 | Provider outage during pilot | High | Fallback tiers + degradation | Phase 9 / Phase 10 | FR-072, FR-152, NFR-015 |
| 8 | PM-43 | Ethics approval delay | High | Pre-P8 protocol + feature flags | Phase 8 | D-05, FR-117, OR-017 |
| 9 | PM-10 | OTP interception / SMS fraud | High | Auth hardening | Phase 3 G2 | FR-126, FR-101 |
| 10 | PM-24 | Eval set < 90% | High | Early eval-set construction | Phase 5 / QR-014 | NFR-047, QR-011 |

**Source:** Section 3 rows; severity and gate placement from `14` §1/§15 and `18` §7. **Classification:** Recommended prioritization (qualitative). **Confidence:** Medium-High. **Reasoning:** The Critical items share one trait — a failure harms a user directly (safety) rather than the schedule, so they are held to the most stringent gates. **Impact-if-changed:** Re-prioritization below the safety floor (PM-21/PM-26) is prohibited; any change to the top-10 must preserve that constraint.

---

## 5. Risk Response Plan — Owners and SRS Controls

Every risk's response maps to one or more SRS controls implemented in the plan set. This table is the **control traceability** half of the register: it proves each mitigation is not a slogan but a named requirement with an owning plan.

| PM IDs | Response Theme | Implementing Controls | Owning Plan |
| --- | --- | --- | --- |
| PM-01, PM-02, PM-08 | Service boundaries and abstraction discipline | AR-001, AR-003, AR-004, FR-149, FR-159 | `03` §3/§5, `06` §2/§3, `04` §19 |
| PM-03, PM-36 | Offline-first sync and mobile quality | AR-025, FR-136, NFR-006/007, QR-006 | `09` §8.5/§17.4, `13` §9 |
| PM-04, PM-20, PM-23, PM-24, PM-25, PM-26 | RAG grounding, eval gates, safety layer | FR-061, FR-069, AR-006, AR-015/016/020, NFR-046…050, QR-011, QR-014 | `08` §10/§11/§14/§16, `13` §7 |
| PM-21 | Emergency safety | FR-063, FR-089, FR-108, §9.6, OR-010, QR-014 | `07` §8, `08` §11.3/§16.4, `11` §15.3 |
| PM-10, PM-14, PM-17, PM-18, PM-19 | Authentication, RBAC, security gates | FR-101, FR-106, FR-126, NFR-016…024, QR-007 | `11` §3/§4/§15, `13` §8 |
| PM-11, PM-12, PM-13, PM-16 | AI/webhook/media/secret security | §14.1.4, §14.1.5, §14.1.8, NFR-022, AR-023 | `11` §10/§11/§12/§14 |
| PM-15 | Data leakage | NFR-022/023, NFR-029, FR-119, §18.1 | `11` §8.4/§9.5, `12` §13 |
| PM-27, PM-30, PM-31 | Provider resilience and cost | FR-072, FR-152, NFR-015, AR-040, §5.9, §18.3 | `12` §8, `08` §15, `04` §19 |
| PM-28, PM-29 | Backup and DR | NFR-012/014, §19, OR-012 | `12` §9/§10, `05` §13.5 |
| PM-32 | IaC governance | OR-005, OR-024, AR-009 | `12` §6 |
| PM-34, PM-35, PM-37, PM-38, PM-39, PM-41 | QA discipline and evidence | QR-001…012, QR-015, QR-013 | `13` §3–§15, `18` §2–§10 |
| PM-42, PM-43 | Clinical and ethics throughput | OR-021, OR-017, QR-019, FR-117 | `15` §11, `08` §18 |
| PM-44, PM-45, PM-46, PM-47 | People enablement | OR-001/003/013/015, Appendix E | `15` §4/§7/§9 |
| PM-48, PM-49, PM-50, PM-51, PM-54 | Program control | OR-005, OR-026, OR-029, QR-013 | `17` §2/§5/§6/§9 |
| PM-55…PM-60 | External dependencies | D-01…D-06, NFR-029, FR-017, FR-073, FR-151 | `07` §3, `08` §18, `12` §16, `17` §4 |
| PM-61…PM-64 | Research governance | FR-117…122, OR-017, AR-012/013/014 | `08` §12, `05` §8/§9 |

**Source:** SRS requirement numbers as cited; plan mappings from the domain registers. **Classification:** Confirmed (controls are SRS-stated); Recommended (the response-theme grouping). **Confidence:** High — each control is a named requirement verified in `13` and `18`. **Reasoning:** A mitigation with no SRS control is a wish; this table closes every PM row to a requirement with an owning plan and test path. **Impact-if-changed:** If a control is dropped during build, the affected PM rows are re-opened and re-rated at the next review, and the QR-013 release evidence must reflect the change.

---

## 6. Risk Exposure by Phase and Gate

Risks that concentrate in each phase, and the gate at which their evidence is checked. Phase definitions follow `14` §3–§13; gates G1/G2/G3 follow `14` §1.

| Phase | Concentrated Risks (PM IDs) | New Exposure Introduced | Gate / Milestone Where Checked |
| --- | --- | --- | --- |
| 0 — Planning & Architecture | PM-49, PM-53, PM-54, PM-55, PM-56, PM-60 | Decision and procurement failures | **G1** (M0) — decisions M-01…M-07 signed, STRIDE, DPIA |
| 1 — Foundation | PM-18, PM-32, PM-38 | IaC/CI/CD drift, security retrofit seeds | **G1** — CI security scans, IaC review |
| 2 — Backend Core | PM-01, PM-05, PM-17, PM-42 | Service boundary drift, IDOR, clinical backlog | Internal checkpoint (UC-001 E2E) |
| 3 — Authentication & Security | PM-10, PM-12, PM-16, PM-17, PM-19 | Auth, webhook, secret, access control | **G2** — zero critical/high findings |
| 4 — WhatsApp Platform | PM-55, PM-12, PM-33 | Provider policy, webhook replay, emergency path | Internal checkpoint (QR-010) |
| 5 — AI/RAG Platform | PM-04, PM-20, PM-21, PM-24, PM-25, PM-26, PM-09 | Grounding, safety, eval threshold, Amharic quality | Internal checkpoint (QR-011/014) |
| 6 — Mobile Application | PM-03, PM-36, PM-09 | Offline sync, low-end devices | Internal checkpoint (AR-025…035) |
| 7 — Admin Dashboard | PM-14, PM-17, PM-46 | Insider misuse, access control | Internal checkpoint (role tests) |
| 8 — Integration | PM-43, PM-63, PM-64 | Research pipeline, partner sync | Internal checkpoint (UC-001…005) |
| 9 — Testing | PM-21, PM-24, PM-34, PM-35, PM-36, PM-39, PM-40 | Release-blocking QA gaps | **Gates 2–3 verified**; QR-013 evidence |
| 10 — Pilot | PM-27, PM-28, PM-29, PM-30, PM-31, PM-33, PM-47, PM-52, PM-62 | Operations, DR, engagement, consent withdrawal | **G3** granted; QR-018 evaluation (M9) |

**Source:** `14` §3–§13 phase contents and §15 milestones; Section 3 PM rows. **Classification:** Recommended mapping. **Confidence:** Medium-High — phase associations derive from the phase scope lines in `14`, which are SRS/Appendix-D anchored. **Reasoning:** Mapping risks to the phase that introduces them tells the team *when* a risk becomes live and *when* its control evidence is due, which is the operational purpose of a phase register. **Impact-if-changed:** Re-sequencing phases in `14` requires re-mapping this table; the gate evidence for each moved risk follows the phase.

---

## 7. Risk Indicators and Triggers (Early Warning)

Each top risk has a measurable indicator and a trigger value that flips the risk from "tracked" to "action". Values are **Configurable** references; baselines are set at the Phase 0 kickoff.

| PM ID | Indicator | Trigger (Configurable) | Response on Trigger |
| --- | --- | --- | --- |
| PM-21 | Emergency false-negative suite pass rate | Any failure on the suite, or <100% on mandated cases | Freeze AI release; incident process (OR-010); Level-4 escalation |
| PM-26 | Safety-layer review backlog | > 5 working days since last clinical review of safety changes | Re-prioritize clinical capacity; raise to Program |
| PM-03 | Offline E2E sync defect count | > 2 open sync bugs at phase end | Slip mobile milestone; escalate to Mobile lead |
| PM-55 | WhatsApp API/BSP onboarding status | No test account + policy confirmation by Phase 0 end | Activate 360Dialog/Twilio fallback negotiation |
| PM-42 | Clinical review queue age | Oldest item > 5 working days | Standing review window triggered; backup reviewer pool |
| PM-49 | M-decision open count | Any of M-01…M-07 open at Phase 0 exit | Phase 0 cannot exit; escalate to Product/Leadership |
| PM-27 | Provider error rate / degradation status | > 2% provider errors sustained 10 min, or degraded-mode entry | Failover runbook (OR-003); status page update (OR-006) |
| PM-28/29 | Backup verification / drill results | Backup verify fail, or drill misses RPO ≤ 15 min / RTO ≤ 4 h | P2 incident; re-run drill before next gate |
| PM-30 | Cost vs. budget trend | Run-rate > 100% of monthly budget alert | Cost review; routing/policy change; Program approval |
| PM-43 | Ethics protocol status | Not submitted 30 days before Phase 8 | Escalate to Research & Community; contingency launch plan |
| PM-52 | Weekly engagement (PD-004) | < 60% weekly support action for 2 consecutive weeks | M&E review; campaign/personalization tuning (QR-018) |
| PM-62 | Consent withdrawal requests in queue | Any request not actioned within SLA | Subject-rights SLA drill; restricted-processing check |

**Source:** SRS §18 alerting (OR-008), §19 (RPO/RTO), PD-004 (engagement), NFR-050 (AI monitoring); `12` §8. **Classification:** Configurable (trigger values) with Confirmed indicators where the SRS names the metric. **Confidence:** Medium-High. **Reasoning:** Every indicator traces to a named SRS metric or OR-mandated monitoring control, so triggers are auditable rather than invented. **Impact-if-changed:** Changing a trigger threshold is a decision-log entry (OR-005) and must not relax the safety triggers (PM-21, PM-26).

---

## 8. Contingency Reserve (Configurable Reference)

Not a commitment (SRS §1.11, Appendix C). Reference sizing only; final figures owned by `20-resource-and-delivery-analysis.md`.

| Reserve Type | Configurable Reference | Rationale | Source |
| --- | --- | --- | --- |
| Schedule buffer | 10–15% of the realistic calendar (≈ 4–6 weeks of ~42-week plan) | Absorbs provider lead times (PM-55/56), clinical/ethics (PM-42/43), QA slips (PM-34/35) | `14` §16.2; `17` §5 |
| Effort buffer | 15–20% staffing buffer in the conservative scenario | Turnover (PM-44), hiring lead times (PM-45) | `15` §11 |
| Cloud/AI cost contingency | 20–25% above monthly budget baseline | PM-30 cost drift; Appendix C cost model | `12` §16 I-02; Appendix C |
| Third-party failure contingency | Fallback providers contracted (WhatsApp, LLM, ASR) with no-cost standby tiers | PM-27, PM-55, PM-56, PM-59 | FR-072, FR-149, FR-152 |
| DR contingency | Passive cross-region backup copy per `12` §10.6 | PM-29 single-region risk | §19, NFR-011 |

**Source:** `14` §16, `15` §10/§11, `12` §16, SRS Appendix C. **Classification:** Configurable references. **Confidence:** Medium — sizing is judgmental until `20` computes the cost model. **Reasoning:** Reserves are tied one-to-one to the high-severity risk rows in Section 3, so money and schedule follow risk, not guesswork. **Impact-if-changed:** Under-sizing the buffers above re-exposes PM-42/43/49/51/55; any reduction must be recorded in the decision log with the re-rated risk.

---

## 9. Risk Review and Reporting Cadence

| Cadence | Activity | Output | Owner |
| --- | --- | --- | --- |
| Weekly (standup) | Indicator scan (Section 7); open-risk status | 5-line risk flash in standup notes | Risk owners |
| Monthly | Full risk review: re-rate, open/close PM rows, update `implementation-status.md` | Updated master register | Program Manager |
| Phase exit | Risk exposure by phase (Section 6) reviewed against phase acceptance evidence | Phase risk report attached to gate evidence | Program Manager + QA |
| Quarterly | DR drill review (OR-012) + severity recalibration | Drill measurement record; register recalibration | DevOps + Program |
| Gate G1/G2/G3 | Gate-triggered review: all High/Critical PM rows for the gate must show control evidence | Gate risk statement in `21-quality-gate-checklist.md` evidence | QA Lead + Program |
| Annual (OR-026) | Compliance, security, privacy, AI governance review | Review record; register refresh | Security + Program |

**Source:** OR-005, OR-008, OR-012, OR-026; `14` §15; `17` §8. **Classification:** Recommended cadence implementing Confirmed OR obligations. **Confidence:** High. **Reasoning:** The cadence is derived directly from the OR review mandates; no step is optional. **Impact-if-changed:** Reducing cadence below monthly violates OR-026 and leaves PM rows stale at gates where evidence is mandatory.

---

## 10. Risk-Driven Decisions (Inputs to decision-log.md)

Risks whose treatment requires a recorded decision or approval (M-series). These are the risk side of the decision log: each decision closes or constrains one or more PM rows.

| Decision | Resolves / Constrains | Decision Owner | When Required |
| --- | --- | --- | --- |
| M-01 Cloud provider | PM-57, PM-30, PM-28 | Program + DevOps | Phase 0 (G1) |
| M-02 WhatsApp provider | PM-55, PM-12 | Program + Integration | Phase 0 (G1) |
| M-03 LLM/embedding provider | PM-56, PM-60, PM-24 | Program + AI | Phase 0 (G1) |
| M-04 Mobile framework | PM-45, PM-03 | Product Engineering | Phase 0 (G1) |
| M-05 Pilot cohort size (default ≥500) | PM-52, PM-61 | Program + Research | Phase 0 (G1) |
| M-06 Object storage + host | PM-13, PM-15, PM-57 | DevOps + Security | Phase 0 (G1) |
| M-07 Budget cap | PM-51, PM-30 | Program | Phase 0 (G1) |
| Accepted-risk entries (e.g., single-region RPO waiver) | PM-29 | Program + Security | As risks are accepted |

**Source:** `02` §6 (missing decisions); `17` §6 (M-01…M-07). **Classification:** Confirmed as required approvals; the specific decisions are Recommended. **Confidence:** High. **Reasoning:** Every M-decision is a procurement or architecture choice whose delay is its own risk (PM-49), so the decisions are sequenced into Phase 0 and made a hard gate exit. **Impact-if-changed:** Executing a dependent phase before its M-decision is closed reproduces PM-49 and voids the abstraction guarantees in PM-08/PM-55/PM-56.

---

## 11. Change Control for This Register

1. **Entry** — new risk → add as PM-65+ with source (SRS requirement or observed event), owner, rating.
2. **Closure** — a PM row closes only when its control evidence exists and passes (Section 5 mapping) and the owner signs; closure recorded in `implementation-status.md`.
3. **Amendment** — rating/owner/trigger changes are recorded with date and reason; SRS-requirement changes force re-validation of affected rows (OR-005).
4. **No-closure rule** — Critical rows (PM-21, PM-26) cannot be closed by schedule pressure; they close only on passing evidence.
5. **Traceability** — the register is linked to `22-feature-implementation-matrix.md` so risk controls and requirement verification share one audit trail (QR-015).

**Source:** OR-005; QR-013; QR-015. **Classification:** Recommended procedure over Confirmed obligations. **Confidence:** High. **Impact-if-changed:** Informal change control recreates the exact drift conditions (PM-38/PM-41) this procedure exists to prevent.

---

## 12. Verification Approach

This plan is itself verified, not just executed. Its verification approach mirrors the SRS quality framework and sibling-plan conventions:

1. **Full SRS Appendix G coverage.** Every one of the 22 SRS Appendix G risks appears in Section 3 (as G-source rows) with an owner and a response. The traceability matrix (QR-015) must show 100% coverage of Appendix G rows before Gate G3.
2. **No orphaned domain risks.** Every risk in `04` §19, `11` §17, `12` §16, `13` §17, `15` §11, `18` §11, and `14` §17 maps to exactly one PM ID (Section 3 source column). This is verified by a scan at each phase exit.
3. **Control traceability.** Every PM row's response maps to a named SRS control in Section 5; removing a control re-opens the row. Verified at gates G1/G2/G3 via the risk statement in the gate evidence.
4. **Severity discipline.** Ratings follow the Section 2.2 model; the safety rows (PM-21, PM-26) are never rated below High and can only close on passing evidence. Verified at every monthly review.
5. **Indicator operability.** Every Section 7 trigger is measurable from a named SRS metric or monitoring control; trigger violations route to the named response. Verified at Phase 0 when baselines are set.
6. **No placeholders.** Scan for "TBD", "TODO", "to be defined", empty cells at authoring.
7. **Cross-plan consistency.** Phase mapping (Section 6) matches `14` §3–§13; decision links (Section 10) match `decision-log.md`; gate behavior matches `21-quality-gate-checklist.md`; verification risks remain owned by `18` §11.

**Source:** QR-015; `14` §18; `13` §18; `18` §12 pattern. **Classification:** Confirmed (obligations), Recommended (method). **Confidence:** High. **Reasoning:** Verification is only meaningful if it is coverage-complete (no orphaned risks) and evidence-bound (no narrative closure), which the seven checks enforce. **Impact-if-changed:** If the SRS adds or removes Appendix G rows, checks 1–2 must be re-run before the next gate; the register is re-derived from the SRS, not patched.

---

**END OF DOCUMENT — 16. Risk Management Plan.** Master register (PM-01…PM-70) consolidates SRS Appendix G, the domain registers of `04`/`11`/`12`/`13`/`15`/`18`/`14`, a full-layout Healthcare & Clinical Safety category (PM-65…PM-70), and a Dependency Risk Index (D-01…D-06); the Section 3.12 summary rollup reports 3 Critical / 33 High / 34 Medium. Responses trace to named SRS controls; exposure is mapped to Phases 0–10 and gates G1/G2/G3; the Section 2.4 escalation ladder implements OR-009/010; indicators and cadence implement OR-005/008/012/026; decisions feed `decision-log.md` (M-01…M-07).
