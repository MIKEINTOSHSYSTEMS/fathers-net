# Missing Requirements Analysis (FathersNet / Ayay)

**Document:** Analysis of requirements with no implementation path (QA Lead)
**Source of truth:** `docs/FathersNet-Complete-SRS.md` (FN-SRS-001 v2.0) and `00-requirement-inventory.md` §12 (inventory → implementation mapping).
**Sibling documents:** `22-feature-implementation-matrix.md` (requirement-to-feature mapping, coverage rollup), `14-development-phase-roadmap.md` (phases), `17-final-execution-roadmap.md` (work packages), `decision-log.md` (deferral decisions), `16-risk-management-plan.md` (risk rows for any assumption that could become a gap).
**Purpose:** Verifies that **no SRS requirement is left without an implementation path** and documents the two deliberate exceptions — deferred and design-only requirement classes — with their control rules. This document contains no application code.
**Classification convention:** **Confirmed** (SRS-stated) · **Recommended** (engineering decision) · **Configurable** (parameter with default) · **Assumption** (requires human validation).

---

## 1. Conclusion

**Zero requirements are missing an implementation path.** All 349 requirements extracted in `00` (170 FR, 50 NFR, 40 AR, 30 OR, 19 QR, 20 US, 5 UC, 4 UR, 11 PD) have a defined feature, plan, verification, and phase in `22-feature-implementation-matrix.md`. This confirms the `00` §12 statement: *"No requirements removed or simplified during extraction."*

Two requirement classes receive **deliberate special treatment** — not a gap, but a controlled decision:

| Class | Requirements | Treatment | Control |
| --- | --- | --- | --- |
| **Deferred** | FR-143…FR-148 (Community & Partner features) | Scheduled to the Phase 10 backlog / post-pilot scope; not built in pilot scope | Phase 10 backlog only; change control via decision log; no Must-Have affected (`14` §17 R-07) |
| **Design-only** | FR-156…FR-158 (Financial / payment readiness) | Schema and design notes only; no live payment capability in pilot | Design review only; no payment processing implemented |

**Source:** `22` §10 rollup (339 mapped + 10 deferred/design-only = 349); `00` §8–§9 priorities (no Must-Have deferred). **Classification:** Confirmed. **Confidence:** High — the rollup is arithmetic over the gap-free inventory, and the special-treatment rows are named and gate-controlled. **Reasoning:** "Missing" means a requirement with no path; deferred/design-only requirements have a path by explicit decision, which is a governance choice the SRS and `14` support (phased scope, §1.11 configurable scope). **Impact-if-changed:** If the program decides any deferred requirement must ship in the pilot, it enters the decision log and `14` scope, with the corresponding phase/WP effort re-baselined in `20`.

---

## 2. Verification That No Requirement Is Orphaned

The gap check is performed in three layers:

1. **Inventory completeness (`00`):** all series gap-free (verified: 349 = 170+50+40+30+19+20+5+4+11; no off-by-one, no merged series).
2. **Feature mapping (`22`):** every series maps to a feature/component, an owning plan, a verification (QR anchor), and a phase. Rollup shows 100% coverage (Section 10).
3. **Phase/WP allocation (`14`/`17`):** every mapped feature has a named phase and, where buildable, a work package (WP-001…WP-120). All Must-Have requirements are covered by WPs in Phases 0–9; the pilot phase (10) covers operations and evaluation.

**Result:** no orphan, no unmapped series, no Must-Have without a build WP.

---

## 3. Conditions That Could Create a Gap (Assumptions, Monitored)

A requirement currently mapped could become effectively unimplementable if one of these assumptions fails. Each has a risk row and a trigger in `16` §7; none is a current gap.

| # | Condition | Requirements At Risk | Risk Row | Prevention / Fallback |
| --- | --- | --- | --- | --- |
| A-04 | Authoritative guide (A-04) not clinician-reviewed in time | FR-061, FR-076…085, FR-092, NFR-046…048, QR-019 | PM-42 (clinical bottleneck) | Content team runs ahead of Phase 2; clinical review windows; QR-019 scheduled early in Phase 9 |
| D-05 | Ethics approval delayed | FR-113…122, OR-017, NFR-042 | PM-43 (ethics delay) | Consent model in Phase 0; pipeline behind feature flags; contingency launch with participation consent only |
| D-01 | WhatsApp Business API unavailable in Ethiopia | FR-011…030 (whole channel), FR-107…112 | PM-55 | Provider abstraction (FR-149); alternate providers; pre-approved templates |
| D-06 | Amharic transcription/translation quality below threshold | FR-018, FR-024, FR-055, FR-114, FR-133, NFR-033 | PM-09 | Per-language eval scoring; fallback ASR; human review sampling; early localization |
| A-05 | Amharic TTS provider unavailable | FR-134 (audio/voice-first surfaces) | tracked in `16` | Alternative TTS providers; audio content strategy per Appendix I |
| A-02 | Field connectivity/device assumptions fail in pilot | FR-089, FR-135, FR-136, AR-025 | PM-03, PM-18 | Offline-first from first sprint; device-matrix E2E; Phase 9 usability study (NFR-030) |
| M-05 | Cohort size decision changes capacity assumptions | NFR-001…009, NFR-005 | PM-30/PM-52 | Load model to §5.9 volumes; autoscaling; graceful degradation (NFR-008) |

**Source:** SRS §1.9 (A-series, D-series); `16` §7 (triggers); `08` §18 (DB-01…DB-08); `09` §12. **Classification:** Assumption. **Confidence:** Medium-High. **Reasoning:** Each condition is a named dependency with a named fallback; the risks are tracked, so a failure converts to an incident, not an orphaned requirement. **Impact-if-changed:** A failed assumption triggers its risk mitigation; if the fallback cannot restore the path, the requirement enters the decision log for re-scoping (OR-005) before a gate.

---

## 4. Deferred and Design-Only Detail

### 4.1 Deferred — Community & Partner Features (FR-143…FR-148)

These are SRS-scoped features (partner community, partner sync surface) whose build is intentionally **after the pilot**. Partner *sync* foundations are still partially built as Should-Have (US-011: WP-067/WP-089) so the deferred items have a landing point. Re-classifying any of FR-143…148 into pilot scope requires: decision-log entry, `14` phase amendment, `20` re-baselining, and gate review (OR-005, `14` §17 R-07).

### 4.2 Design-Only — Financial/Payment Readiness (FR-156…FR-158)

The SRS defines payment as **design-only readiness** (no live transactions in the pilot). The plan honors this: schema/design notes exist, no payment processing is built, no payment provider is procured, no payment data is collected. The decision log must record the same scope if the program later changes its mind (payment is a separate compliance surface not claimed by this plan).

**Source:** SRS FR-156…158 scope; `00` §3.16; `14` §17 R-07. **Classification:** Confirmed. **Confidence:** High. **Impact-if-changed:** Introducing live payment is a new feature class with its own compliance, security, and data-processing obligations; it cannot be added silently.

---

## 5. Verification Approach

This analysis is itself verified:

1. **Arithmetic check** — 349 = 170+50+40+30+19+20+5+4+11; the `22` rollup (339 mapped + 10 special) reconciles to 349.
2. **Priority check** — no Must-Have requirement is deferred or design-only (`00` §8–§9).
3. **Orphan scan** — every series has a Primary Plan in `22`; no series maps to "none".
4. **Assumption monitoring** — Section 3 conditions have risk rows and triggers in `16` §7; re-verified at each milestone.
5. **No placeholders** — scan for "TBD", "TODO", "to be defined", empty cells at authoring.

**Source:** QR-015; `00` §12; `22` §10/§12. **Classification:** Confirmed (obligations), Recommended (method). **Confidence:** High. **Reasoning:** The conclusion "zero missing" is only credible if the arithmetic, priority, and orphan checks pass; this section makes that verifiable rather than asserted. **Impact-if-changed:** Any SRS change re-runs checks 1–3 in the same change set as the `00` inventory update.

---

**END OF DOCUMENT — Missing Requirements Analysis.** Conclusion: **zero requirements without an implementation path**; two controlled exceptions (FR-143…148 deferred to Phase 10/post-pilot; FR-156…158 design-only) governed by the decision log; assumption-based gap risks monitored in `16` with named fallbacks. Reconciles with `00` §12 and `22` §10.
