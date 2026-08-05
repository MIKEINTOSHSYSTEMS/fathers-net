# 21. Quality Gate Checklist

**Document:** FathersNet (Ayay) — Quality Gate Checklists (QA Lead + Technical Program Management)
**Source of truth:** `docs/FathersNet-Complete-SRS.md` (FN-SRS-001 v2.0) — **QR-013** (release gate), **QR-014** (AI safety regression), **QR-016** (release review), **QR-017** (UAT), **QR-018** (pilot evaluation), **QR-019** (clinical/content validation); **§16.2** (deployment gates: manual approval + canary health-check promotion); **§19** (DR: RPO ≤ 15 min / RTO ≤ 4 h). The three roadmap gates G1/G2/G3 are defined in `14` §1.
**Inputs:** `14-development-phase-roadmap.md` §1 (gate definitions), §4/§6/§13 (phase acceptance criteria and verification evidence), §15 (milestones M0–M9); `18-implementation-verification-plan.md` §2 (evidence model: Produced → Passed → Signed), §7 (QR gate bundles), §10 (approver matrix); `13-testing-and-quality-plan.md` §15 (gates G0–G10); `16-risk-management-plan.md` (gate risk statements); `17-final-execution-roadmap.md` (approvals A-01…A-22, milestone mapping).
**Sibling documents:** `22-feature-implementation-matrix.md` (requirement-level evidence), `implementation-status.md` (live gate state), `decision-log.md` (gate-required approvals M-01…M-07).
**Purpose:** The exhaustive, executable checklist behind each roadmap gate. A gate is **closed only on named evidence artifacts** — never on narrative (QR-013). Each checklist item states the evidence, the pass condition, and the signer. This document contains no application code.
**Classification convention:** **Confirmed** (SRS-stated) · **Recommended** (engineering decision) · **Configurable** (parameter with default) · **Assumption** (requires human validation). Every major item carries **Source / Confidence / Reasoning / Impact-if-changed** annotations.

---

## 1. Executive Purpose

This document is the release-control spine of the program. It operationalizes the rule from `14` §1 and `17` §14: **a gate is not closed on narrative; it is closed on named evidence artifacts.** It converts the three roadmap gates (G1 Planning & Architecture, G2 Core Platform & Security, G3 Release & Pilot Launch) and the four SRS QR release gates (QR-013/016/017/018, plus QR-019 validation) into checklists that a reviewer can execute without interpretation.

| Gate | When Granted | Opens | Controlled By |
| --- | --- | --- | --- |
| **G1** Planning & Architecture | End of Phase 1 (package assembled Phase 0) | Backend build (Phase 2+) | `14` §1; this document §3 |
| **G2** Core Platform & Security | End of Phase 3 | WhatsApp + AI builds (Phase 4+) | `14` §1; this document §4 |
| **G3** Release & Pilot Launch | Phase 10 (go/no-go) | Founding-cohort onboarding | `14` §1; QR-013/016/017/019; this document §5 |

**Source:** `14` §1; SRS QR-013/016/017/018/019; §16.2. **Classification:** Confirmed. **Confidence:** High — the gates and QR obligations are SRS/plan-stated; the checklists transcribe them. **Reasoning:** Without an executable checklist, the QR-013 guarantee is un-auditable; this document is what makes the gate evidence machine-readable. **Impact-if-changed:** Any change to QR-013/016/017/018/019 or to `14` §1 re-derives the affected checklist before the next gate.

---

## 2. How to Use This Checklist

1. **Enter only when the prerequisite gate is closed.** Phase 2 needs G1; Phase 4 needs G2; cohort onboarding needs G3. No gate skipping (`14` §1).
2. **Run the full checklist.** Every item must be marked with an evidence artifact ID (`18` §9 registry path), not a checkmark. A single missing item holds the gate.
3. **Evidence rule:** each item requires **Produced → Passed → Signed** (`18` §2.1). Artifacts carry environment + commit SHA + requirement IDs; artifacts with missing metadata are rejected (`18` §11 V-01).
4. **Sign-off:** the approver matrix in Section 6 lists who signs each item. Sign-off without QA validity review is prohibited (`18` §11 V-10).
5. **On failure:** the gate is In Verification; the failing item routes to its owner with a risk row in `16` and a decision-log note if scope changes (OR-005). Re-run only the affected bundle plus a regression pass; then re-enter the gate.
6. **Record:** gate state, open items, and sign-offs are recorded in `implementation-status.md` at the moment of closure — not retroactively.

**Source:** `18` §2/§9/§10; `14` §1; OR-005. **Classification:** Confirmed (rules), Recommended (procedure). **Confidence:** High. **Impact-if-changed:** A gate run that skips step 2 or 3 voids the closure and recreates the narrative-closure failure QR-013 forbids.

---

## 3. Gate G1 — Planning & Architecture

**Definition (`14` §1):** the Phase 0 deliverable package plus a demonstrably buildable Phase 1 foundation. **Grants:** backend build (Phase 2).

### 3.1 Entry Conditions
- SRS baseline frozen (version 2.0 / FN-SRS-001, no open requirement ambiguities blocking Phase 2).
- Phase 0 exits completed: decisions, reviews, threat model, procurement initiated.

### 3.2 G1 Checklist

| # | Item | Evidence | Pass Condition | Signer |
| --- | --- | --- | --- | --- |
| G1-01 | SRS baseline freeze | Version-control tag + `00` inventory marked frozen | No open Must-Have ambiguities in scope | Product Owner |
| G1-02 | Decision log created and M-01…M-07 closed | `decision-log.md` with approver + ADR reference per decision | All 7 decisions closed; 0 open | Program Manager |
| G1-03 | Architecture review | `03` §13.1 conformance record | Topology approved; no architecture findings open | Technical Lead |
| G1-04 | Tech-stack sign-off | `04` §18 matrix signed | Required-by-SRS rows locked; configurable rows follow M-01…M-07 | Principal Architect |
| G1-05 | STRIDE threat model | Signed STRIDE document (`11` §14) | All 8 §14.1 threat areas covered; findings triaged | Security |
| G1-06 | DPIA | Signed DPIA (`11` §9.6, FR-132) | High-risk flows mitigated or accepted with owner | Privacy + Program |
| G1-07 | Procurement initiated | Provider contracts in flight: WhatsApp, LLM/embedding, ASR, cloud, object storage | Contract status logged in `implementation-status.md`; no blocking gap | Program Manager |
| G1-08 | Research ethics groundwork | Ethics plan + consent model design (FR-117) | Ethics protocol drafted for D-05 | Research & Community |
| G1-09 | Traceability framework live | `22` stub + `implementation-status.md` created | WP registry operational; QR-015 spine stands | QA Lead |
| G1-10 | CI/CD + IaC baseline | Pipeline green; Terraform modules per env (AR-009) | CI passes; infra code committed; plan-gated applies | DevOps |
| G1-11 | Secrets management live | Secrets in managed store only (NFR-022) | No secrets in repo/logs/images (NFR-037) | DevOps + Security |
| G1-12 | Migration 001 applied | `05` §4.2 migration 001 + test (FR-164) | Migration green in all environments; reversible | Database Engineer |
| G1-13 | Observability foundation | OTel + Grafana wiring; log classes per §18.1 | Dashboards live; no-PII-in-logs verified (NFR-022) | DevOps |
| G1-14 | Cross-cutting controls seeded | Security/privacy/localization/observability/idempotency scaffolding in Phase 1 (`02` §5) | Present in foundation code; not deferred | QA + Engineering |
| G1-15 | Gate evidence package | Evidence registry complete for G1-01…G1-14 | All items Produced → Passed → Signed | QA Lead |

### 3.3 Exit Criteria
All G1-01…G1-15 pass; sign-off recorded; gate state = **Accepted**; Phase 2 may begin.

### 3.4 Governance Approvals Record (2026-08-05 — Project Owner)

Recorded per the Full Phase 2 Authorization governance task (documentation-only). Existing checklist definitions, pass conditions, and evidence columns above are unchanged; draft evidence artifacts at `verification/audits/` are preserved as produced.

| Item | Approval | Approver | Date | Notes |
| --- | --- | --- | --- | --- |
| G1-05 STRIDE threat model | **Approved by Project Owner** | Project Owner | 2026-08-05 | Draft evidence preserved at `verification/audits/threat-model/stride-threat-model-draft.md`; no independent security reviewer sign-off claimed |
| G1-06 DPIA | **Approved by Project Owner** | Project Owner | 2026-08-05 | Draft evidence preserved at `verification/audits/dpa/dpia-draft.md`; no independent privacy reviewer sign-off claimed |
| G1-02 Decision log closure | **M-01 closed (partial)** | Project Owner | 2026-08-05 | M-01 Approved/Closed — GCP initial production provider, cloud-agnostic architecture (`decision-log.md` §1.1); M-02…M-07 still Open, so full G1-02 remains unsatisfied |
| G1-12 Migration 001 | **Authorized for future Milestone 2 implementation only** | Project Owner | 2026-08-05 | Not created and not applied in this task; no schema/tables authorized by this record |
| AGD-002 | **Solo Maintainer Merge Policy approved** | Project Owner | 2026-08-05 | Recorded in `decision-log.md` §7; ruleset `20422621` sole-maintainer bypass verified (actor `MIKEINTOSHSYSTEMS` id `37907891`, `always`); security-sensitive sign-off path documented; does not alter this checklist's evidence or signer rules for contributors |

**Source:** `14` §3/§4 (Phase 0–1 acceptance + evidence); `17` WP-001…WP-014; `18` §7. **Classification:** Confirmed (items anchored to SRS/plan obligations), Recommended (checklist granularity). **Confidence:** High. **Reasoning:** Each item resolves to a named Phase 0/1 deliverable from `14` and a signer from `18` §10; the checklist is a transposition, not a new standard. **Impact-if-changed:** Adding/removing an item changes Phase 0/1 scope and must be reflected in `14` §3–§4 and `17` WP-001…WP-014 together.

---

## 4. Gate G2 — Core Platform & Security

**Definition (`14` §1):** backend core, full authentication/token lifecycle, RBAC enforcement, audit logging, encryption, secrets, and webhook security pattern complete and verified. **Grants:** WhatsApp (Phase 4) and AI (Phase 5) builds.

### 4.1 Entry Conditions
- G1 accepted.
- Backend core (Phase 2) acceptance criteria met (`14` §5): UC-001 E2E green; QR-002 coverage floors.
- Auth lifecycle (Phase 3) built to `11` §3/§4.

### 4.2 G2 Checklist

| # | Item | Evidence | Pass Condition | Signer |
| --- | --- | --- | --- | --- |
| G2-01 | Full auth lifecycle verified | Auth tests: OTP (rate limits/expiry/lockout), MFA, token lifecycle (`11` §3, FR-126) | All green; 0 open critical/high | Security |
| G2-02 | RBAC enforcement verified | Role/permission tests per §14.7; negative authorization tests (PM-17) | Deny-by-default proven; segregation of duties (FR-106) | Security |
| G2-03 | Audit logging verified | Audit trail tests (FR-098/127, NFR-023); immutable `audit_logs` | Every privileged action logged; immutability proven | Security + QA |
| G2-04 | Encryption at rest verified | KMS-managed keys; phone E.164 encrypted (FR-123); app-layer checks | Encryption evidence in `11` §7; key rotation tested | Security |
| G2-05 | Secrets management verified | Secret rotation drill; dual-active webhook rotation | Rotation run documented; no secrets in repo/logs | DevOps + Security |
| G2-06 | Webhook security pattern verified | HMAC validation, idempotency, replay dedup tests (`07` §4, `11` §11) | Signature/duplicate tests green (provider-agnostic) | Integration + Security |
| G2-07 | Security scan sweep | SAST + DAST + dependency + secret scans (QR-007, `13` §8) | Zero critical/high findings (NFR-016) | Security |
| G2-08 | STRIDE re-validation | Threat model updated for built surfaces | New surfaces covered; findings closed | Security |
| G2-09 | Privacy controls verified | QR-009 privacy suite: consent immutability (AR-012), pseudonymization (FR-119), no-PII logs | All privacy tests green | Security + QA |
| G2-10 | Idempotency + event integrity | FR-160/161 tests; DLQ handling verified (`12` §16 I-13) | No duplicate/lost events under test | Backend + DevOps |
| G2-11 | Coverage floors met | QR-002 coverage report per service | Floors met; flaky rate acceptable (`13` §15.2) | QA Lead |
| G2-12 | Zero-critical/high rule | Combined scan + code-review register | 0 open critical/high across security and stability | QA Lead |
| G2-13 | Gate evidence package | Evidence registry complete for G2-01…G2-12 | All items Produced → Passed → Signed | QA Lead |

### 4.3 Exit Criteria
All G2-01…G2-13 pass; sign-off recorded; gate state = **Accepted**; Phase 4 (WhatsApp) and Phase 5 (AI) may begin.

**Source:** `14` §6 (Phase 3 acceptance); `11` §3–§7/§15; `13` §8; `18` §7 (QR-007/009 bundles). **Classification:** Confirmed (items anchored to NFR-016…024, FR-098/106/123/126/127, AR-012), Recommended (checklist granularity). **Confidence:** High. **Reasoning:** G2 is the security guarantee of the program; every item maps to a named security requirement with a test suite in `11`/`13`, so the zero-critical/high rule is provable. **Impact-if-changed:** A single relaxation in G2-07/G2-12 reopens PM-18 (security retrofit) and voids the G3 evidence chain.

---

## 5. Gate G3 — Release & Pilot Launch

**Definition (`14` §1):** verified during the Phase 9 full QA pass ("Gates 2–3"), granted at Phase 10 as the pilot go/no-go after QR-017 UAT, QR-019 clinical/content validation, QR-016 release review, and rollback readiness. **Grants:** founding-cohort onboarding.

### 5.1 Entry Conditions
- G2 accepted.
- Phase 9 full-system sweeps complete (`14` §13): performance (QR-006), security (QR-007), accessibility (QR-008), privacy (QR-009), WhatsApp (QR-010), AI evaluation (QR-011), test data hygiene (QR-012).
- All 11 phases' acceptance criteria met (`14` §3–§13) with evidence.

### 5.2 G3 Checklist

| # | Item | Evidence | Pass Condition | Signer |
| --- | --- | --- | --- | --- |
| G3-01 | Combined release gate (QR-013) | Unit + integration + E2E + security + accessibility + performance + clinical review bundle (`18` §7) | All pass per bundle pass conditions | QA Lead |
| G3-02 | AI eval + safety regression (QR-014) | Eval set ≥90% EN/AM + safety regression report (`08` §16, `13` §7) | ≥90% accuracy; safety battery green; 0 unsafe outputs | AI + QA |
| G3-03 | UAT completed (QR-017) | UAT sign-off with representative users | Acceptance criteria met; defects triaged to closure | Program |
| G3-04 | Clinical/content validation (QR-019) | Clinical validation record vs authoritative guide (A-04, OR-021) | All health content + AI grounding clinically approved | Healthcare & Content |
| G3-05 | Release review (QR-016) | Rollback readiness, dashboards, alerting verified | Rollback script tested; dashboards/alerts live | DevOps |
| G3-06 | Security release sweep | Pen-test report + final SAST/DAST (QR-007, `13` §8) | 0 open critical/high; pen-test findings closed | Security |
| G3-07 | Performance sign-off | QR-006 measurements vs NFR-001…009 | Targets met at pilot load model (`12` §5.9) | QA + DevOps |
| G3-08 | Accessibility sign-off | axe-core + manual audit (QR-008) | WCAG 2.1 AA met on mobile + admin (AR-030/033) | QA |
| G3-09 | DR readiness | Restore/failover drill measurements (RPO ≤ 15 min / RTO ≤ 4 h) | Drills pass; missed-drill alert absent (OR-012, §19) | DevOps |
| G3-10 | Operations readiness | On-call roster + runbooks (OR-001/003); support channels + SLAs (OR-002); alerting live (OR-008) | Drills run; SLAs active; severity/escalation live | Ops lead |
| G3-11 | AI ops monitoring verified | AI dashboards + incident tracking (OR-010, NFR-050) | AI latency/token/cost + safety metrics live | AI + Ops |
| G3-12 | Training completed (OR-013) | Training registers for admins, content managers, support, researchers, healthcare workers | All 5 audiences certified before cohort | Program |
| G3-13 | Consent + subject-rights readiness | Consent lifecycle tests (FR-004/125); subject-rights SLA drill | Withdrawal/erasure/export within SLA | Security + Research |
| G3-14 | Rollout plan approved | `17` §11 rollout + Phase 10 runbook approved | Go/no-go decision recorded (manual approval, §16.2) | Program + leadership |
| G3-15 | Deployment promotion approved | SRS §16.2 manual approval + canary health-check record | Canary healthy; promotion logged | DevOps + Program |
| G3-16 | Pilot evaluation plan live (QR-018) | Evaluation plan with named owners vs Appendix F KPIs | KPI baselines set; data collection ready | Research + M&E |
| G3-17 | Gate evidence package | Evidence registry complete for G3-01…G3-16 | All items Produced → Passed → Signed | QA Lead |

### 5.3 Exit Criteria
All G3-01…G3-17 pass; go/no-go signed; gate state = **Granted**; founding cohort onboarding may begin (Phase 10).

**Source:** `14` §13 (Phase 9) and §12 (Phase 10) acceptance; `18` §7 (QR-013/016/017/018 bundles); SRS QR-013/014/016/017/018/019, §16.2, §19; `13` §15. **Classification:** Confirmed (items anchored to the QR series and §16.2/§19), Recommended (checklist granularity). **Confidence:** High — every item is a named SRS gate obligation with a defined bundle in `18` §7. **Reasoning:** G3 is the go/no-go for human subjects; it transcribes the QR series without dilution so the founding cohort is only onboarded on complete, signed evidence. **Impact-if-changed:** Relaxing G3-02/03/04/09 (AI safety, UAT, clinical validation, DR) is a safety-of-subjects decision that requires leadership approval and a decision-log entry — never a silent waiver.

---

## 6. Approver Matrix

| Gate | Primary Approver | Co-Approvers | Hold-Item Authority |
| --- | --- | --- | --- |
| G1 | Program Manager | Product Owner, Technical Lead, Security | QA Lead may hold on G1-09/10/15 |
| G2 | Security | QA Lead, Backend lead, DevOps | QA Lead may hold on any G2 item |
| G3 | Program + leadership (go/no-go) | QA Lead, Security, Healthcare & Content, DevOps | QA Lead, Security, or Healthcare & Content may hold |
| M0…M9 milestones | Per `14` §15 owner | Program Manager | Per milestone |

Sign-off rule: a gate is not closed without the required signatures; QA validity review precedes every signature (`18` §10.1, V-10). Segregation of duties (FR-106): no signer signs the evidence they produced alone. **Solo-maintainer exception (AGD-002, `decision-log.md` §7):** while only one account exists, the sole maintainer may sign their own gate evidence under the documented governance exception; segregation of duties resumes when a second account exists.

**Source:** `18` §10; `14` §15; FR-106. **Classification:** Confirmed (matrix structure), Recommended (named roles from `15` §2.2). **Confidence:** High. **Impact-if-changed:** Re-assigning a signer changes the accountability map in `18` §10; both documents update together.

---

## 7. Gate Evidence Registry Requirements

- Every checklist item's artifact is registered per `18` §9: fixed path/naming, environment + commit SHA, requirement IDs, retention class.
- Evidence is a registry row with an artifact ID — not a pasted report (V-09).
- The registry is inspected at gate entry (all items present) and at closure (all items signed).
- `implementation-status.md` reflects gate state: **Not Started → In Progress → In Verification → Accepted/Granted → In Review (post-pilot)**.

**Source:** `18` §9; QR-015. **Classification:** Confirmed. **Confidence:** High. **Impact-if-changed:** Evidence outside the registry is not evidence; a gate closed on unregistered artifacts is void (V-02/V-09).

---

## 8. Verification Approach

This checklist document is itself verified:

1. **Gate completeness** — G1/G2/G3 checklists cover every acceptance criterion and Verification Evidence item in `14` §4/§6/§13 and every QR bundle in `18` §7; no orphaned criterion.
2. **Requirement linkage** — every checklist item cites its SRS anchors (FR/NFR/AR/QR numbers); cross-checked against `00` and `22` at each gate.
3. **Signer coverage** — every item has a signer in the approver matrix (Section 6) consistent with `18` §10 and FR-106 segregation of duties.
4. **No placeholders** — scan for "TBD", "TODO", "to be defined", empty cells at authoring.
5. **Classification labels present** — every major item carries Source / Confidence / Reasoning / Impact-if-changed.
6. **Cross-plan consistency** — gate definitions match `14` §1; milestone mapping matches `17` §5; evidence bundles match `18` §7; QA sub-gates G0–G10 (`13` §15) remain the internal phase gates beneath these three.

**Source:** QR-015; `14` §18; `18` §12 pattern. **Classification:** Confirmed (obligations), Recommended (method). **Confidence:** High. **Reasoning:** A checklist that cannot be traced to `14` and the QR series is a governance artifact with no force; these six checks keep it bound to the plan set. **Impact-if-changed:** Any change to `14` §1, the QR series, or `18` §7 re-runs checks 1–2 before the next gate.

---

**END OF DOCUMENT — 21. Quality Gate Checklist.** Gates G1 (Planning & Architecture, end of Phase 1), G2 (Core Platform & Security, end of Phase 3), G3 (Release & Pilot Launch, Phase 10 go/no-go); checklists transcribe `14` §1 gates and SRS QR-013/014/016/017/018/019 with §16.2 and §19 controls; evidence follows `18` §2/§7/§9/§10.
