# FathersNet Implementation Contract

**Status:** FROZEN as part of the Phase 0.5 Architecture Freeze
**Purpose:** Mandatory rules for every implementing agent (human or automated). Violating a rule below invalidates the change and requires correction before merge.
**Controlling input:** `architecture-baseline.md` (canonical reference), `engineering-standards.md`, `repository-bootstrap-order.md`, `implementation-status.md`, `decision-log.md`, SRS `docs/FathersNet-Complete-SRS.md`
**Phase rule:** Phase 1 Foundation (tooling only, per `repository-bootstrap-order.md`) is authorized **subject to the `pre-development-checklist.md` gate**. Phases 2+ require explicit re-authorization after Gate G1 acceptance and closure of the M-decisions they depend on.

---

## 1. Mandatory Reading (before any work)

The implementing agent MUST read, in order, before writing any code:

1. `docs/FathersNet-Complete-SRS.md` — requirements source of truth (FN-SRS-001 v2.0).
2. `implementation-plan/architecture-baseline.md` — canonical engineering reference (frozen).
3. `implementation-plan/engineering-standards.md` — conventions (frozen).
4. `implementation-plan/repository-bootstrap-order.md` — execution order (frozen).
5. `implementation-plan/decision-log.md` — decisions/assumptions/risks, incl. M-01…M-07 status.
6. The owning plan document for the area being changed (`03`…`12` as applicable) and `22-feature-implementation-matrix.md` for traceability.
7. `implementation-status.md` — current live status; never work from stale assumptions.

An agent that has not read these may not begin implementation. Skipping reading is a process violation.

---

## 2. The Agent MUST

| # | Rule | Authority |
| --- | --- | --- |
| 1 | Read the SRS and the baseline before implementing anything | §1 above |
| 2 | Follow `architecture-baseline.md`; treat it as frozen | `implementation-contract.md`; `architecture-baseline.md` §1 |
| 3 | Follow `engineering-standards.md` (naming, error envelope, logging, audit, migrations, commits, PR rules) | `engineering-standards.md` |
| 4 | Build in the exact order of `repository-bootstrap-order.md`; do not skip steps | `repository-bootstrap-order.md` §1 |
| 5 | Never bypass architecture decisions (ADRs, principles P-01…P-20, service boundaries) | SRS §15.2/§15.4; `03` |
| 6 | Never introduce a new technology/library/provider without a `decision-log.md` entry + ADR update first | `04` §18, §1.8.2 |
| 7 | Never weaken security: no secret in code/logs/images; no PII in logs; authz on every endpoint; keep webhook HMAC + idempotency + audit hooks intact | SRS §14; `11`; NFR-016…029 |
| 8 | Never change a database entity without updating the owning documentation in the same change set | SRS §13; `05` §10.1; QR-015 |
| 9 | Never change an API without updating the OpenAPI spec + changelog; breaking changes require `/v2/` + deprecation policy | SRS §12.1; `06` §3.4; QR-005 |
| 10 | Keep the traceability matrix current: every FR/AR/NFR/QR change reflected in `22-feature-implementation-matrix.md` | QR-015 |
| 11 | Call third-party providers only through their abstraction/adapter (WhatsApp, LLM, ASR, storage, notification) | FR-149/072, AR-004, PM-08 |
| 12 | Ship tests + evidence with every feature; safety suites (emergency false-negative, webhook signature, AI eval, privacy) are release-blocking | `13`; QR-011/014 |
| 13 | Complete Step 13 evidence discipline: record environment + commit SHA for every evidence artifact | `18` §2; PM-39 |

---

## 3. The Agent MUST NOT

1. Start Phase 2+ work before Gate G1 acceptance **and** written re-authorization in `implementation-status.md`.
2. Bypass the API gateway, authz middleware, or the audit layer.
3. Write application code outside the authorized phase/work package.
4. Add ad-hoc endpoints, tables, queues, or topics not in the spec/catalog.
5. Commit directly to `main`/`develop`; commit secrets; force-push shared branches.
6. Merge with a failing PR gate, failing safety suite, or open critical/high vulnerability.
7. Change the embedding model after ingestion has begun without a re-embed + eval revalidation plan (`08` §6.2, M-03).
8. Deploy or test against production data in lower environments (AR-009, QR-012).
9. Use `latest` image tags or unpinned dependencies (NFR-036).
10. Ship UI without accessibility (web) or offline behavior (mobile) verification (QR-008, AR-025).

---

## 4. Documentation Obligations

Every completed feature MUST update, in the **same change set**:

1. **`implementation-status.md`** — new status, evidence, env + commit SHA.
2. **`decision-log.md`** — any new/changed decision, assumption, or risk (including new dependencies).
3. **Verification evidence** — test results, scans, evidence records per `18-implementation-verification-plan.md`, linked to the owning plan doc + gate (`21`).

If the change touches a plan document (`03`…`12`, `05` schema, `08` AI, etc.), the plan document is updated in the same change set — plan and code never diverge.

---

## 5. Decision & Change Control

- **Architecture change** (service boundary, technology, data model, API contract): raise a `decision-log.md` entry (and ADR where applicable) → approve → update `architecture-baseline.md` → implement. Order is non-negotiable (change-first, code-second).
- **New external dependency/provider:** ADR-style entry with cost/DPA/region assessment before code (FR-073, NFR-029).
- **Reverting a decision** requires the same control path as making one.

---

## 6. Phase Gates

| Gate | When | Required before | Holder |
| --- | --- | --- | --- |
| G1 | End of Phase 1 (Step 13) | Phase 2 (WP-015+) | DevOps + Backend + QA + Tech Lead (`21` §6) |
| G2 | End of Phase 3 | Phase 4 | Security + QA + Backend |
| G3 | End of Phase 9/10 | Pilot launch | Program + Clinical + QA |

No work package starts before its listed hard prerequisites (`17` tables) and the applicable gate.

---

## 7. Acceptance of the Contract

This contract is adopted when the `implementation-contract.md` is referenced from `implementation-status.md` and the first Phase 1 commit is authorized via `pre-development-checklist.md`. Any agent that receives a task within the FathersNet repository is bound by it.

---

**END OF DOCUMENT — FathersNet Implementation Contract.** When in doubt, the frozen documents win; change-first, code-second.
