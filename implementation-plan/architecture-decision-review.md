# FathersNet Architecture Decision Review

**Document:** FathersNet (Ayay) — Review of Architecture Decision Records (ADR) and Implementation Decisions
**Reviewer:** Chief Architect (with Security, AI Safety, Healthcare, and Engineering Management input)
**Controlling reference:** `decision-log.md`, `03-system-architecture-plan.md` §10, `04-technology-stack-analysis.md`, SRS §15.4
**Companion documents:** `phase-0-validation-report.md` · `implementation-readiness-gate.md` · `pre-development-checklist.md`
**Rule:** Review-only. No application code; no SRS modification.

---

## 1. Confirmed SRS Architecture Decisions (ADR-001…ADR-006)

Status classification: **Approved** (confirmed by SRS §15.4, not open items; changing requires SRS change control `03` §10.1).

| Decision ID | Decision | Reason | Current Status | Recommendation |
| --- | --- | --- | --- | --- |
| ADR-001 | WhatsApp-first architecture; app complementary | Maximum reach, voice/photo support, existing behavior (§7.1, FR-011) | **Approved** | Keep. No change recommended. |
| ADR-002 | RAG over approved knowledge base with medical safety layer | Grounded answers; safety in request path (AR-005/006) | **Approved** | Keep. Enforce "safety layer before delivery" as a build invariant. |
| ADR-003 | PostgreSQL system of record; separate vector store (Qdrant recommended); object storage | Relational integrity + JSONB; transactional consent immutability (§13, §9.3, FR-150) | **Approved** | Keep. Fix embedding model before ingestion (see M-03 note). |
| ADR-004 | Local-first mobile: SQLite + queued sync + conflict resolution | Offline-first guarantee (AR-025), no loss/duplication (FR-136), offline emergency content (FR-135) | **Approved** | Keep. Device-matrix E2E is the acceptance evidence (PM-03). |
| ADR-005 | Multi-provider AI abstraction: primary + fallback tiers | Outage continuity + cost control (§9.8, FR-072, AR-018) | **Approved** | Keep. DPAs (FR-073/NFR-029) must precede any data flow (M-03). |
| ADR-006 | Cloud + IaC + containers; single cloud, multi-zone readiness | Deployability, DR RPO ≤15 min/RTO ≤4 h (§16, §19) | **Approved** | Keep. M-01 must include region-locked service selection + multi-zone readiness (PM-57). |

**Note:** ADR-001…006 are recorded in `decision-log.md` §2 and cross-checked against `03` §10.1. No ADR is recommended for change.

---

## 2. Open Phase 0 Gate Decisions (M-01…M-07)

Status classification: **Needs approval** (all Open at authoring; closure of all seven = G1-02 hard exit / WP-002).

| Decision ID | Decision | Reason | Current Status | Recommendation |
| --- | --- | --- | --- | --- |
| M-01 | Cloud provider (GCP or AWS; single cloud, multi-zone, region-locked) | Data-residency expectations in Ethiopia; DR topology; cost (PM-57, PM-30, PM-28) | **Needs approval** | Approve GCP or AWS with region + multi-zone evidence; nominate Program + DevOps approver; close before Phase 1 cloud-dependent IaC. |
| M-02 | WhatsApp provider (Meta Cloud API primary; Twilio/WATI/360Dialog alternates) | D-01 policy/availability in Ethiopia; webhook + template controls | **Needs approval** | Approve primary + confirm fallback contract; early BSP onboarding + template submission; close before Phase 4. Non-blocking for Phase 1. |
| M-03 | LLM/embedding provider contract (Gemini Flash primary; GPT-4o-mini + Claude 3 Haiku fallback; embeddings fixed) | §9.8 tiers; DPAs (FR-073); embedding-model vector-space stability (Contradiction row 3) | **Needs approval** | Approve tiers + DPAs; **fix embedding model before ingestion**; close before Phase 5. |
| M-04 | Mobile framework (React Native recommended; Flutter considered) | Hiring pool (PM-45); offline/sync build order (`09` assumes RN) | **Needs approval** | Approve React Native (or explicitly select Flutter and re-derive `09`/`19` §11); close before Phase 6 and before mobile scaffolding. |
| M-05 | Pilot cohort size (SRS default ≥500) | Engagement (PD-004), cost, research power (PM-52, PM-61) | **Needs approval** | Approve ≥500 default unless research design requires otherwise; close at Phase 0 for `20` capacity baselines. |
| M-06 | Object storage host (S3-compatible; MinIO for compose; GCP/AWS per M-01) | Media security (PM-13/15), DR RPO/RTO (PM-28/29) | **Needs approval** | Approve host with server-side encryption, signed expiring URLs, deny-by-default buckets, cross-region copy; close before Phase 1 media pipeline scaffolding. |
| M-07 | Budget cap (total build + first-year operational ceiling) | Funding reality; scope/timeline trade-offs (PM-51, PM-30) | **Needs approval** | Approve a cap anchored to `20` §3–§6 ranges (illustrative $474k/$606k/$801k build); decisions M-01…M-06 feed it; close before Phase 1. |

---

## 3. Recommended Implementation Decisions (D-01…D-08)

Status classification: **Approved by adoption at Phase 0** — engineering recommendations recorded in `decision-log.md` §3; explicit override is a new decision-log entry (Section 5).

| Decision ID | Decision | Reason | Current Status | Recommendation |
| --- | --- | --- | --- | --- |
| D-01 | 6 deployable units / 11 logical boundaries | Ops simplicity without monolith risk (FR-159) | Approved by adoption | Adopt; record unit→service mapping table as Phase 1 artifact. |
| D-02 | Bus adapter — BullMQ/Redis pilot; Kafka-compatible managed bus at scale | SRS compose has Redis; scale path (§16.3) | Approved by adoption | Adopt with amended wording to remove the `03`/`04` tension (Contradiction row 1). |
| D-03 | Outbox pattern for event publishing | No duplicate/lost events (PM-06, FR-161) | Approved by adoption | Adopt; enforce in Phase 2 event flows. |
| D-04 | Node.js + TypeScript backend; Python AI/data | Language strengths; SRS ref arch | Approved by adoption | Adopt. |
| D-05 | React Native mobile (pending M-04) | Hiring pool | Approved by adoption (contingent on M-04) | Adopt if M-04 = React Native. |
| D-06 | Qdrant vector store (pending M-01 host) | SRS-aligned; eval re-run on change | Approved by adoption (contingent on M-01) | Adopt; re-index + re-eval if host changes. |
| D-07 | GitHub Actions CI/CD + OTel/Grafana observability | SRS §16-aligned | Approved by adoption | Adopt. |
| D-08 | `node-pg-migrate` migration tooling | Versioned/reversible/audited (FR-164) | Approved by adoption | Adopt. |

---

## 4. Open Assumptions (A-01…A-06)

Status classification: **Open — validation required on a named schedule** (`decision-log.md` §4). An invalidated assumption becomes a risk row in `16`.

| # | Assumption | Validation Point | Current Status |
| --- | --- | --- | --- |
| A-01 | App-store accounts available (Apple/Play) | Phase 4/6 | Open |
| A-02 | Field connectivity / low-end device reality holds | Phase 6 device-matrix E2E; Phase 9 usability study | Open |
| A-03 | In-country OTP SMS reliability | Phase 3 auth testing | Open |
| A-04 | Authoritative guide exists and is clinician-reviewed | Phase 0/2 (before content + AI grounding) | Open — **highest-priority content dependency** |
| A-05 | Amharic TTS provider availability | Phase 5/6 | Open |
| A-06 | WhatsApp Business API policy acceptance in Ethiopia | Phase 0 procurement (M-02) | Open |

---

## 5. Decision Approval Sequence (Phase 0)

1. **Phase 0 kickoff:** nominate approvers for M-01…M-07 (decision-log closure template §6).
2. **A-04 first:** confirm the clinician-reviewed authoritative guide before content authoring (unblocks content, AI grounding, QR-019).
3. **M-07 then M-01/M-06/M-02/M-03/M-04/M-05:** budget cap sets the frame; provider/host decisions populate it; cohort size anchors capacity.
4. **Record every closure** with approver, date, ADR/reference, affected PM risks, and unlocked phase (OR-005, OR-019). Closure is immutable; reversals are new entries.
5. **Gate G1 evidence:** all seven M-decisions closed + STRIDE + DPIA signed before G1 acceptance (`21` G1-02/05/06).

---

**END OF DOCUMENT — Architecture Decision Review.** ADR-001…006 Approved (SRS-confirmed). M-01…M-07 **Needs approval** (Phase 0 hard exit, G1-02). D-01…D-08 Approved by adoption (with the D-02 wording alignment). A-01…A-06 Open for validation (A-04 first). No decision is recommended for rejection.
