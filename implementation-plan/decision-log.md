# Decision Log (FathersNet / Ayay)

**Document:** FathersNet (Ayay) — Architecture/Technology Decisions, Assumptions, Risks, and Trade-offs
**Source of truth:** `docs/FathersNet-Complete-SRS.md` (FN-SRS-001 v2.0) — §15.4 (ADR-001…ADR-006 confirmed architecture decisions), §1.11 (configurable parameters), §16 (deployment), §9.8 (AI model tiers). Input decisions are identified in `02-srs-requirement-analysis.md` §6 (M-01…M-07).
**Sibling documents:** `17-final-execution-roadmap.md` (WP-002 creates this log; M-01…M-07 are a Phase 0 hard exit), `16-risk-management-plan.md` §10 (risk-driven decisions), `21-quality-gate-checklist.md` (G1-02: all M-decisions closed), `implementation-status.md`.
**Purpose:** The single, authoritative record of decisions that must be made by humans before and during implementation. It tracks open decisions (with recommended defaults), confirmed decisions (SRS ADRs), and approved closure records (approver, date, ADR reference). The log is the Phase 0 gate artifact: **no provider-dependent build begins before the relevant M-decision is closed** (WP-002, G1-02).
**Status ladder:** **Open** (requires human decision) → **In Review** (approver nominated; evidence gathered) → **Approved/Closed** (approver signed; recorded below) → **Superseded** (replaced by a later decision; kept for audit).
**Classification convention:** **Confirmed** (SRS-stated) · **Recommended** (engineering decision) · **Configurable** (parameter with default) · **Assumption** (requires human validation).

---

## 1. Open Decisions — M-01…M-07 (Phase 0 Gate Items)

All seven below are **Open** at authoring. Closure of all seven is a Phase 0 hard exit and a G1-02 checklist item (`21` §3). Recommended defaults come from `02` §6; final values are human decisions.

| # | Title | Recommended Default (from `02` §6 / `04`) | Classification | Affected Risks | Approver (to be named) | Status |
| --- | --- | --- | --- | --- | --- | --- |
| M-01 | Cloud provider selection | GCP or AWS single-cloud with multi-zone readiness (ADR-006); region-locked service selection for data residency (`04` §14) | Configurable | PM-57, PM-30, PM-28, PM-60 | Product/Leadership + DevOps | **Open** |
| M-02 | WhatsApp provider | Meta WhatsApp Business Cloud API primary; abstraction supports Twilio/WATI/360Dialog as drop-in alternates (`04` §13, `07` §3) | Configurable | PM-55, PM-12, PM-59, PM-60 | Program + Integration | **Open** |
| M-03 | LLM/embedding provider contract | Gemini Flash primary; GPT-4o-mini and Claude 3 Haiku fallback tiers (SRS §9.8, `04` §12); embedding provider per `04` §12.2; DPAs required (FR-073) | Configurable | PM-56, PM-24, PM-60 | Program + AI | **Open** |
| M-04 | Mobile framework | React Native (larger hiring pool) recommended; Flutter considered (`04` §4) | Configurable | PM-45, PM-03 | Product Engineering | **Open** |
| M-05 | Pilot cohort size | SRS §5.9 default **500+** (configurable) | Configurable | PM-52, PM-61, PM-30 | Program + Research | **Open** |
| M-06 | Object storage + host | Cloud object storage with server-side encryption; deny-by-default buckets, short-lived signed URLs (`04` §10, `11` §12) | Configurable | PM-13, PM-15, PM-57 | DevOps + Security | **Open** |
| M-07 | Budget cap default | Program-suggested reference amount; scenario ranges in `20` §3–§6 | Configurable | PM-51, PM-30 | Program | **Open** |

> **Source:** `02` §6 (decision items and recommended assumptions); `04` (stack evaluation behind each default); SRS §5.9 (M-05 default 500+). **Confidence:** High that these seven are the Phase 0 decisions (they are the dependency-map blockers in `02` §3/§4); Medium on the specific defaults until procurement. **Reasoning:** Each M-item is a named blocker of a dependent phase; closing them is a hard gate exit (WP-002). **Impact if changed:** Executing a dependent phase before its M-decision closes recreates PM-49 and voids the provider-abstraction guarantees (PM-08/PM-55/PM-56).

---

## 2. Confirmed SRS Decisions (Reference — ADR-001…ADR-006)

These are **already confirmed by the SRS** (§15.4) and are not open items. Recorded here for audit; changing any requires SRS change control (`03` §10.1).

| ADR | Decision | SRS Source | Classification | Confidence |
| --- | --- | --- | --- | --- |
| ADR-001 | WhatsApp-first architecture; app complementary | §15.4, §7.1, FR-011 | Confirmed | High |
| ADR-002 | RAG over approved knowledge base with medical safety layer | §15.4, §9, AR-005/006 | Confirmed | High |
| ADR-003 | PostgreSQL system of record; separate vector store (Qdrant recommended); object storage | §15.4, §13, §9.3 | Confirmed | High |
| ADR-004 | Local-first mobile with SQLite + queued sync + conflict resolution | §15.4, §8.5, AR-025 | Confirmed | High |
| ADR-005 | Multi-provider AI abstraction with primary + fallback tiers | §15.4, §9.8 | Confirmed | High |
| ADR-006 | Cloud + IaC + containers; single cloud, multi-zone readiness | §15.4, §16 | Confirmed | High |

**Source:** `03` §10.1. **Confidence:** High. **Impact if changed:** any ADR change invalidates the corresponding AR acceptance criteria and requires SRS change control; none are recommended for change.

---

## 3. Recommended Implementation Decisions (Engineering; awaiting approval or implicit adoption)

These are **Recommended** decisions authored in the plan set. They are approved by adoption at Phase 0 (or by explicit override in Section 5). They do not block a gate individually, but reversal after build starts is expensive.

| # | Decision | Owning Plan | Recommendation | Confidence | Impact if Reversed |
| --- | --- | --- | --- | --- | --- |
| D-01 | Pilot deployable-unit consolidation (6 units, 11 logical boundaries preserved) | `03` §10.2 | Consolidate packaging, keep contracts | High | Higher infra/ops cost; or monolithic → fails FR-159 |
| D-02 | Kafka-compatible managed event bus behind adapter | `03` §10.2, `04` §8 | Managed bus; adapter-isolated | Medium | Bus-adapter swap only (code isolated) |
| D-03 | Outbox pattern for event publishing | `03` §10.2 | Producers write domain + outbox in one transaction; relay publishes | High | Duplicate/lost events (PM-06) |
| D-04 | Node.js + TypeScript backend; Python AI/data services | `04` §3 | Per-language strengths | High | Rework of scaffolding and CI |
| D-05 | React Native mobile (pending M-04) | `04` §4 | Larger hiring pool | Medium | Framework swap cost |
| D-06 | Qdrant vector store (pending M-01 host) | `04` §7, `05` §11 | SRS-aligned; pgvector alternative noted | Medium | Reindexing and eval re-run |
| D-07 | GitHub Actions CI/CD + OTel/Grafana observability | `04` §15/§16, `12` | Managed, SRS §16-aligned | High | Pipeline/tooling rework |
| D-08 | `node-pg-migrate` migration tooling | `05` §4.1 | Versioned/reversible/audited (FR-164) | Medium | Migration-file syntax and CI change |

**Source:** `03` §10.2; `04` §3–§16; `05` §4. **Classification:** Recommended. **Confidence:** as listed. **Reasoning:** These resolve the "how" beneath the confirmed "what" (ADRs) and the configurable "which" (M-decisions); recording them keeps the adoption explicit. **Impact if changed:** reversal is recorded in Section 5 with a decision-log entry and re-verified against the affected AR/NFR acceptance criteria.

---

## 4. Open Assumptions Requiring Human Validation

| # | Assumption | Source | Validation Point | Status |
| --- | --- | --- | --- | --- |
| A-01 | App-store distribution (Apple Developer Program + Play Console accounts available) | `09` D-10 | Phase 4/6 | Open |
| A-02 | Field connectivity/device assumptions (low-end Android, intermittent connectivity) hold in the pilot region | SRS §1.9 | Phase 6 device-matrix E2E; Phase 9 usability study (NFR-030) | Open |
| A-03 | In-country OTP SMS reliability in Ethiopia | `09` D-04, `11` D-2 | Phase 3 auth testing | Open |
| A-04 | Authoritative guide (A-04) exists and is clinician-reviewed before content/AI work | `08` DB-01 | Phase 0/2 | Open |
| A-05 | Amharic TTS provider availability | `09` D-06 | Phase 5/6 | Open |
| A-06 | WhatsApp Business API policy acceptance in Ethiopia (D-01) | SRS §1.9 | Phase 0 procurement (M-02) | Open |

**Source:** SRS §1.9; `08` §18; `09` §12; `11` §16. **Classification:** Assumption. **Confidence:** Medium — each is a named dependency needing validation. **Reasoning:** Assumptions are tracked here so they are validated on a schedule rather than discovered at a gate. **Impact if changed:** an invalidated assumption becomes a risk row in `16` with its PM ID.

---

## 5. Change Control and Closure Rules

1. **Closure record:** each M-decision closure appends: approver, date, decision, ADR/reference, affected PM risks, and confirmation that the dependent phase can open.
2. **Change management (OR-005):** any later reversal of an approved decision is a new decision-log entry (Superseded + replacement), never a silent edit.
3. **Gate binding:** `21` G1-02 requires all of M-01…M-07 closed; `implementation-status.md` mirrors decision status.
4. **Auditability (OR-019):** the log is immutable once approved; amendments are new entries. Entries are preserved for the program audit trail.
5. **Escalation:** a decision blocked at the named approver escalates via `17` §9 rather than being deferred; the log records the blocker.

---

## 6. Closure Template (for Phase 0 use)

```
| M-0X | <Title> |
| --- | --- |
| **Status** | Approved/Closed (date) |
| **Decision** | <final value; provider/parameter chosen> |
| **Approver** | <role/name> |
| **Evidence** | <ADR/contract/reference> |
| **Affected risks closed/reduced** | <PM IDs> |
| **Dependent phase unlocked** | <Phase N> |
| **Co-approvers** | <Security/DevOps/etc. as applicable> |
```

---

## 7. Architecture Governance Decisions (AGD)

Closed governance decisions adopted during Phase 1 (Milestone 1) via the **Repository Governance Resolution**. These alter prior `.gitignore`/document-versioning choices and are recorded per OR-005 (Superseded + replacement, never silent edits).

| AGD | Decision | Classification | Supersedes | Affected Risks | Approver | Status |
| --- | --- | --- | --- | --- | --- | --- |
| AGD-001 | **Repository governance: permanent engineering documentation is versioned; working/runtime artifacts are ignored.** Track in Git: `docs/FathersNet-Complete-SRS.md`, `implementation-plan/` (all 30 plan docs + decision-log + implementation-status), `README.md`, `LICENSE`. Ignore: `Z/`, `docs/tasks/`, `docs/sessions/`, `node_modules/`, `dist/`, `build/`, `coverage/`, `.cache/`, `.tmp/`, `logs/`, `*.log`, `.env`/`.env.*` (except `.env.example`), `.DS_Store`, `Thumbs.db`, `.vscode/`, `.idea/`. No commit/push without human review. | Governance | Earlier `.gitignore` rule ignoring `implementation-plan/` (and the initial-commit rule ignoring `docs/`) | PM-39 (strengthened — evidence traceability via FR-170/QR-015) | Program (human review) | **Approved/Closed (2026-08-05)** |

**Source:** Repository Governance Resolution; `architecture-baseline.md` §16; `engineering-standards.md` §1/§16. **Reasoning:** the frozen baseline requires the plan set + SRS to live in the repo (FR-170, OR-015); working artifacts (sessions/tasks) and generated artifacts must never be committed. **Impact if changed:** any reversal requires a new AGD entry; the `.gitignore` must stay in lock-step with this decision.

---

**END OF DOCUMENT — Decision Log (FathersNet / Ayay).** Seven Phase 0 gate decisions M-01…M-07 recorded Open with recommended defaults; ADR-001…006 confirmed as SRS-stated; recommended implementation decisions D-01…D-08 tracked; assumptions A-01…A-06 listed for validation; closure and change-control rules per OR-005/OR-019. Created as WP-002 of `17-final-execution-roadmap.md`.
