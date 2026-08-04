# 23. Healthcare Compliance and Safety Plan

**Document:** FathersNet (Ayay) — Healthcare Safety and Compliance Plan
**Source of truth:** `docs/FathersNet-Complete-SRS.md` (FN-SRS-001 v2.0) — **§1.4** (program purpose: catch danger signs, support referrals), **§1.10** (compliance posture: no certification claims; "designed to support alignment"), **§9.6** (emergency response protocol), **§14.10** (disclaimers), **Appendix H** (compliance, governance & regulatory readiness), **Appendix I** (content strategy and governance), and the requirement series: **FR-063/065** (no diagnosis/prescription; medical safety layer), **FR-025/046** (emergency detection and critical-priority delivery), **FR-076/081/092/135** (content library, medical review tagging, danger-sign education, offline emergency content), **NFR-046…050** (AI safety and quality), **NFR-025…029** (privacy), **NFR-041…045** (compliance), **OR-017…026** (governance: clinical review OR-021, audit OR-019, processing register OR-022, BCP OR-023, periodic reviews OR-026), **QR-013** (release includes clinical review), **QR-019** (clinical/content validation vs authoritative guide A-04).
**Inputs:** `08-ai-rag-implementation-plan.md` §11 (medical safety layer), §14/§16 (evaluation and safety testing); `07-whatsapp-platform-implementation-plan.md` §8 (emergency workflow); `11-security-and-privacy-plan.md` §9 (privacy/DPIA), §15.3 (emergency escalation); `16-risk-management-plan.md` (PM-21/PM-26 critical safety risks); `18-implementation-verification-plan.md` §7 (QR-019 bundle); `21-quality-gate-checklist.md` (G3-04 clinical validation).
**Sibling documents:** `16-risk-management-plan.md` (safety risks PM-21/PM-26), `08` (AI safety), `11` (privacy/security), `22-feature-implementation-matrix.md` (requirement mapping), `implementation-status.md`.
**Purpose:** The controlling safety and compliance plan for health-related content, AI outputs, emergency handling, research data, and regulatory alignment. It defines who governs safety, what the safety rules are, how they are enforced in the product, and how they are verified before release and during the pilot. This document contains no application code.
**Classification convention:** **Confirmed** (SRS-stated) · **Recommended** (engineering decision) · **Configurable** (parameter with default) · **Assumption** (requires human validation). Every major item carries **Source / Confidence / Reasoning / Impact-if-changed** annotations.

---

## 1. Executive Purpose

FathersNet is a **safety-critical** product: its whole point includes catching danger signs during pregnancy and steering fathers to facility care. This document is the governance layer that makes "safety-critical" operational — it states the five non-negotiable safety principles and the controls that enforce each one.

| # | Safety Principle | Controlling Requirement | Enforcement |
| --- | --- | --- | --- |
| S-01 | **Never diagnose, prescribe, or replace professional care** | FR-063, NFR-046 | Medical safety layer (AR-006); no-diagnosis policy; disclaimers (§14.10) |
| S-02 | **Emergency language always routes to facility care** | FR-025, FR-063 | Emergency detection; critical-priority delivery (FR-046); emergency workflow (`07` §8) |
| S-03 | **All health content and AI grounding trace to approved sources** | A-04, FR-061, FR-081, QR-019 | Clinical review gate (OR-021); medical review tagging; knowledge lifecycle (AR-015) |
| S-04 | **User and research data protected by consent, privacy, and ethics** | FR-004/125, NFR-025…029, OR-017 | Consent immutability (AR-012); DPIA; research separation (AR-013); ethics approval (D-05) |
| S-05 | **No compliance claim is made without proof** | §1.10, NFR-041, Appendix H | "Designed to support alignment" posture; legal review before launch |

**Source:** SRS §1.10, §9.6, §14.10, Appendix H; FR/NFR/OR/QR series as cited. **Classification:** Confirmed (principles and anchors), Recommended (principle framing). **Confidence:** High — each principle is a quoted SRS rule or requirement. **Reasoning:** The principles are few and non-negotiable so every team decision can be tested against them; the enforcement column points each principle at the plan that implements it. **Impact-if-changed:** Relaxing any principle (e.g., permitting an unflagged diagnosis-adjacent output) is a safety-of-subjects decision requiring leadership approval and a decision-log entry; it reopens PM-21/PM-26.

---

## 2. Safety Governance Model

- **Clinical governance owner:** Healthcare & Content team (Appendix E), led by Clinical Reviewer (`15` §3).
- **AI safety governance:** AI & Data team with the AI Safety Reviewer; AI governance process per OR-020, NFR-049 (`08` §12).
- **Segregation of duties (FR-106):** content authors never approve their own medical content; the Clinical Reviewer is a separate role; AI changes are validated by QA before clinical sign-off.
- **Audit function (OR-019):** periodic audits of content review records, AI outputs, emergency handling, and data-processing compliance; findings feed the decision log (OR-005).
- **Data-processing register (OR-022):** maintained from Phase 0; lists every processing activity, legal basis (consent), retention, and third-party processor.
- **Periodic reviews (OR-026):** privacy, security, compliance, and clinical governance reviews on an annual cycle (and at every gate).

**Source:** OR-017…026; FR-106; Appendix E. **Classification:** Confirmed (obligations), Recommended (ownership assignment). **Confidence:** High. **Reasoning:** The OR-017…026 series names the governance structures; this section assigns them to the Appendix E teams that already exist in `15`. **Impact-if-changed:** Moving governance ownership between teams requires updating `15` §2.2 and the gate approver matrix (`18` §10) together.

---

## 3. Healthcare Content Safety

| Control | Requirement | Implementation |
| --- | --- | --- |
| Authoritative guide as knowledge foundation | A-04, FR-076 | All content, reminders, AI grounding, and danger-sign workflows trace to *FathersNet: Your Guide to Supporting Your Family* and subsequently approved content |
| Clinical review before publish | FR-081, OR-021, QR-019 | CMS review/approval workflow (`06` §4.4, `10`); content authored without clinical review stays flagged "pending medical review" and unpublished |
| Medical review tagging | FR-081 | Content lifecycle statuses: draft → medical review → approved → published; versioned (FR-078) |
| Disclaimer management | §14.10 | Every health surface carries the program's disclaimer; emergency responses always advise facility care (FR-063) |
| Content versioning & archive | FR-078, FR-080 | Versioned content with expiry/archive; archived content removed from AI retrieval (AR-015/016) |
| Localization parity | FR-138, NFR-033 | EN/AM parity with translation review (`15` §3 Healthcare & Content); medical accuracy preserved across languages |
| Evidence-source tracking | Appendix I | Sources and review records stored per content item (audit evidence for QR-019) |

**Source:** A-04; FR-061/076/078/080/081; OR-021; QR-019; §14.10; Appendix I. **Classification:** Confirmed. **Confidence:** High. **Reasoning:** Every row transcribes a confirmed SRS requirement; the implementation points to existing plan sections. **Impact-if-changed:** Publishing health content without clinical review (FR-081) is the single most direct safety violation and fails G3-04.

---

## 4. AI Medical Safety Layer

- **Scope (AR-006):** the safety layer inspects both inputs and outputs; applies safety rules; revises or escalates before delivery.
- **Rules (NFR-046):** no diagnosis, no prescription, no substitution for professional care; grounded-only answers from the approved KB (FR-061); source citation or decline (NFR-048); disclaimers where relevant.
- **Emergency interception (FR-062/063):** input classification routes danger signs to the emergency workflow before any normal answering; the emergency path is never flag-disabled (`08` §11.3, `07` §8).
- **Escalation (FR-065):** uncertain or high-risk cases escalate to human review (AI Ops, FR-067) instead of being answered.
- **Gates:** every AI release passes the eval set (≥90%, EN/AM) and the safety regression suite (QR-011/014); any model/prompt change re-runs both (NFR-049). Construction in `08` §11/§14/§16; testing in `13` §7.
- **Output format:** answers carry sources and disclaimer per the response contract (`08` §10.3, SRS §12).

**Source:** FR-061/062/063/065/067; AR-006; NFR-046…050; QR-011/014; §9.6; §14.10. **Classification:** Confirmed. **Confidence:** High. **Reasoning:** The safety layer is a confirmed architecture decision (ADR-004) with mandatory gates; this section binds it to the human and product rules. **Impact-if-changed:** Shortcutting the safety layer (PM-26) or the eval gates (PM-24/PM-25) is a Critical risk and a QR-014 gate failure.

---

## 5. Emergency Response Safety

- **Detection (FR-025/063):** danger language — bleeding, severe pain, fits/seizure, unconsciousness, danger signs — detected in WhatsApp text and AI questions; detection tested with keyword + paraphrase + Amharic coverage (PM-21 mitigation, `13` §7, `08` §16.4).
- **Response (FR-063):** immediate urgent facility-care guidance; facility recommendation; never diagnosis or prescription.
- **Priority delivery (FR-046):** critical/emergency notifications bypass quiet hours and are delivered immediately.
- **Offline (FR-135, US-009):** core emergency and danger-sign content is pre-cached on mobile and works without connectivity.
- **Education (FR-092):** danger-sign education with an emergency action card in the birth-preparation module, plain language and audio.
- **Escalation (OR-010, `11` §15.3):** emergency detection failures alert admin/on-call; Level-4 escalation path; AI incident tracking (OR-010).
- **False-negative prevention:** emergency false-negative suite is a permanent safety regression (PM-21); any failure freezes AI release.

**Source:** FR-025/046/063/092/135; US-009; §9.6; OR-010; `11` §15.3; `07` §8. **Classification:** Confirmed. **Confidence:** High. **Reasoning:** The emergency path is the product's reason for existence; each control traces to a Must-Have requirement and a named test. **Impact-if-changed:** Removing any emergency control — especially offline content (FR-135) or false-negative monitoring — elevates PM-21 to its Critical ceiling.

---

## 6. Consent, Privacy & Data Protection

- **Consent lifecycle (FR-001…010, FR-004/125):** versioned, immutable consent events (AR-012); withdrawal is a new event triggering restricted processing and purge (`05` §9.3); subject-rights SLAs (NFR-026).
- **Minimization (NFR-025):** collect only what the journey requires; phone as the minimal identifier with at-rest encryption (FR-123).
- **Pseudonymization (FR-119, NFR-027):** research data separated (AR-013) and pseudonymized at collection; no direct identifiers in research stores (`05` §8).
- **DPIA (FR-132, NFR-041):** signed at Phase 0; maintained on any data-flow change (`11` §9.6).
- **Processing register (OR-022):** all processing activities and third parties with executed DPAs (NFR-029); no data flow without a DPA (PM-60).
- **Verifiable deletion (NFR-024):** automated purge with audit; retention per class (FR-105, AR-014).

**Source:** FR-001…010/004/105/119/123/125/132; NFR-024…029; AR-012/013/014; OR-022; §14.8. **Classification:** Confirmed. **Confidence:** High. **Reasoning:** Privacy controls are cross-cutting (`02` §5) and gated at G2/G3; every row maps to a named requirement with a test in QR-009. **Impact-if-changed:** A consent or retention defect is both a legal and a research-integrity failure (PM-62) and fails QR-009/QR-013.

---

## 7. Research Ethics & Participant Safety

- **Ethics approval (D-05, OR-017):** research governance structure established; ethics protocol submitted before Phase 8; research data collection gated on approval (FR-117 consent model, FR-122 export governance).
- **Informed consent (FR-117):** participation consent separate from service consent; withdrawal honored with restricted processing.
- **Anonymized research (FR-113…122):** collection, export, and dashboards operate on pseudonymized/anonymized data only (AR-013, `10` research dashboard).
- **Engagement design (Appendix G Research):** incentives compliant with ethics rules; low-participation risk mitigated (PM-61).
- **Publication governance (FR-122, OR-017):** research outputs and impact reports approved by the research governance structure; transparency in methodology (PM-64).

**Source:** FR-113…122; OR-017; D-05; Appendix G Research; Appendix H (research governance). **Classification:** Confirmed. **Confidence:** High. **Reasoning:** The SRS makes research ethics a gate (D-05) and names the governance structure (OR-017); this section sequences the obligations so the pilot's research use never precedes approval. **Impact-if-changed:** Launching research collection before ethics approval is a PM-43/PM-64 event and invalidates the study.

---

## 8. Regulatory Compliance Posture

- **No certification claim (SRS §1.10):** the program claims **"designed to support alignment"** with applicable regulations; no HIPAA/GDPR/national-certification claim unless explicitly confirmed by the governing program.
- **Legal review before launch (NFR-041):** privacy/DPIA and breach-notification scope legally reviewed pre-release (`11` D-4).
- **Healthcare governance (Appendix H):** clinical review for all health content; medical accuracy validation; emergency response protocols; professional review workflow (OR-021).
- **Data protection governance (Appendix H, §14.8):** privacy policy, consent management, data access controls, deletion/export, breach response (FR-131).
- **Platform governance (Appendix H):** WhatsApp Business policy (opt-in, templates, 24-hour window), app-store requirements, WCAG 2.1 AA, localization.
- **Regulatory watch (PM-58):** monitoring of health/data-protection regulatory changes; design-for-alignment posture; periodic compliance reviews (OR-026).
- **Future alignment (NFR-045):** FHIR/HL7-aligned data modeling where applicable, designed for future healthcare-system integration.

**Source:** §1.10; Appendix H; NFR-041/044/045; FR-131/132; OR-026. **Classification:** Confirmed. **Confidence:** High. **Reasoning:** The SRS is explicit that it claims no certification; this section preserves that discipline and names the reviews that keep the posture honest. **Impact-if-changed:** Any claim of certification requires explicit program confirmation and a legal review; it must never be inferred from implementation.

---

## 9. Advertising and Marketing Safety (WhatsApp)

- **Templates (FR-011…030, NFR-044):** health-related templates are subject to clinical review; all templates require WhatsApp approval before first send (AR-021).
- **Campaign compliance (FR-107…112):** campaigns respect opt-in (FR-017), messaging caps (NFR-044), quiet hours except critical/emergency (FR-046), and WhatsApp policy.
- **Myth reporting (US-008):** myth reports are handled carefully — the response corrects misinformation against the approved KB, never amplifies the myth, and flags it for the content team.

**Source:** FR-011…030/046/107…112; NFR-044; AR-021; US-008. **Classification:** Confirmed. **Confidence:** High. **Reasoning:** WhatsApp is the primary channel, so template and campaign safety is a direct user-safety surface with platform-policy obligations. **Impact-if-changed:** A non-reviewed health template or a policy-violating campaign risks both user harm (PM-26) and platform suspension (PM-55).

---

## 10. Healthcare Partner Integration Safety

- **Partner sync (US-011):** healthcare-worker partner view operates on consent-based, minimal data; partner features respect the same consent lifecycle (FR-004/125).
- **Healthcare worker role (US-012, §3 personas):** review capability is role-gated and audited (FR-106, `10`); no worker role bypasses consent or exposes unauthorized data.
- **Referral support (FR-025, §1.4):** facility recommendations come from the approved knowledge base; emergency referrals are never withheld behind paywalls or campaigns.

**Source:** US-011/012; FR-004/106/125; §3. **Classification:** Confirmed (role and consent anchors), Recommended (partnership design pending M-decisions and partner scope). **Confidence:** Medium-High — partner features are Should-Have and their exact scope is a Phase 8/10 decision. **Reasoning:** Even Should-Have features must respect the consent and safety floor; this section applies the floor before scope is settled. **Impact-if-changed:** Expanding partner scope beyond the SRS requires a decision-log entry and re-validation of the consent/audit controls.

---

## 11. Adverse Event and Incident Handling

- **Incident management (OR-009):** severities, response owners, and escalation per `11` §14; AI incidents tracked separately (OR-010).
- **Safety incidents:** a user-safety incident (emergency false-negative, unsafe AI output reaching a user, content error reaching users) triggers the incident process immediately, with post-incident review feeding the eval set and content fixes (PM-21/26 loop).
- **Breach response (FR-131):** notification scope legally reviewed (NFR-041); processed per the privacy policy and the processing register (OR-022).
- **Business continuity (OR-023, §19):** RPO ≤ 15 min / RTO ≤ 4 h; emergency content and messaging continuity are part of the DR design (`12` §10).
- **Runbooks (OR-003):** safety-specific runbooks (emergency path failure, AI incident, clinical content error) maintained and drilled (`15` §7).

**Source:** OR-003/009/010/022/023; FR-131; §19; `11` §14. **Classification:** Confirmed. **Confidence:** High. **Reasoning:** OR-009/010 name the incident obligations; this section binds them to the safety principles so a safety incident is handled as such, not as a routine bug. **Impact-if-changed:** A safety incident handled as a routine ticket is the difference between a contained event and PM-21 at its worst.

---

## 12. Safety Monitoring and KPIs

From Appendix F **AI Safety KPI class**, with measurement start points:

| KPI | Target (Configurable) | Measured From | Control |
| --- | --- | --- | --- |
| Unsafe response rate | Baseline at Phase 5; monitored continuously | Phase 5 | NFR-050 monitoring; human review queue (FR-067) |
| Emergency escalation success rate | Baseline at Phase 4/5; drilled | Phase 10 | `07` §8; `11` §15.3 |
| False-negative emergency detection rate | 0 missed on mandated cases (PM-21) | Phase 5 | Emergency false-negative suite (QR-014) |
| Human review findings | Reviewed; fed back to eval set | Phase 5 | FR-067/071 sampling loop |
| Clinical review cycle time | Baseline at Phase 2; tracked | Phase 2 | OR-021; `15` RR-01 |

**Source:** Appendix F (AI Safety KPIs); NFR-050; OR-010; QR-014; FR-067/071. **Classification:** Confirmed (KPI class), Configurable (targets). **Confidence:** High. **Reasoning:** The SRS Appendix F names the AI Safety KPI class; the targets are configurable defaults with named measuring controls. **Impact-if-changed:** KPI target changes are decision-log entries and update the QR-018 evaluation criteria before Phase 10.

---

## 13. Clinical Governance Cadence

| Cadence | Activity | Evidence |
| --- | --- | --- |
| Continuous | Content items enter medical review; review tagging enforced (FR-081) | CMS review records |
| Weekly | Clinical reviewer standing window; oldest-item age tracked (PM-42) | Review queue metrics |
| Per AI release | Eval set + safety regression + clinical review of prompt/grounding changes (QR-011/014, NFR-049) | Release evidence (G3-02) |
| Gate G3 | QR-019 clinical/content validation vs authoritative guide | G3-04 sign-off |
| Quarterly | Content audit (OR-019); clinical governance review | Audit records |
| Annual (OR-026) | Privacy, security, compliance, AI governance reviews | Review records |

**Source:** OR-019/021/026; QR-013/019; NFR-049; `21` §5. **Classification:** Confirmed (obligations), Recommended (cadence). **Confidence:** High. **Reasoning:** The cadence transcribes the OR review obligations and the QR gates; the weekly clinical window is the PM-42 mitigation. **Impact-if-changed:** Reducing cadence below the OR-mandated minimum violates OR-026 and lets content/AI drift past their review gates.

---

## 14. Verification Approach

This plan is itself verified:

1. **Principle coverage** — the five safety principles (Section 1) each map to confirmed SRS requirements and an owning plan; no principle is decorative.
2. **Requirement linkage** — every control row cites SRS anchors (FR/NFR/AR/OR/QR/PD); cross-checked against `00` and `22` at each gate.
3. **Gate binding** — QR-013 (clinical review in release gate), QR-019 (clinical validation), and QR-014 (AI safety) are bound to G3 checklist items (`21` §5: G3-02/03/04).
4. **Safety-floor discipline** — PM-21/PM-26 treatment (emergency false negatives, unsafe recommendations) is explicit and never downgraded below High severity (`16` §3/§4).
5. **Compliance honesty** — no certification claim appears anywhere; posture is "designed to support alignment" per SRS §1.10 (Section 8).
6. **No placeholders** — scan for "TBD", "TODO", "to be defined", empty cells at authoring.
7. **Classification labels present** — every major item carries Source / Confidence / Reasoning / Impact-if-changed.

**Source:** QR-015; §1.10; `14` §18; `18` §12 pattern. **Classification:** Confirmed (obligations), Recommended (method). **Confidence:** High. **Reasoning:** A safety plan is only as strong as its traceability to the SRS and its binding to gates; the seven checks make both explicit. **Impact-if-changed:** Any change to §9.6, §14.10, the QR series, or Appendix H re-runs checks 1–4 before the next gate.

---

**END OF DOCUMENT — 23. Healthcare Compliance and Safety Plan.** Five safety principles bound to confirmed SRS requirements; clinical content governance (A-04, OR-021, QR-019); AI medical safety layer (AR-006, NFR-046…050, QR-011/014); emergency response safety (FR-025/046/063/092/135); consent/privacy/DPIA (FR-004/105/119/123/125/132, NFR-025…029); research ethics (FR-113…122, OR-017); compliance posture per §1.10/Appendix H; safety KPIs per Appendix F; verification bound to gates G3 and QR-013/014/019.
