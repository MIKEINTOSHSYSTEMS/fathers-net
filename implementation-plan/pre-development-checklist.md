# FathersNet Pre-Development Checklist

**Document:** Checklist that must be completed **before the first code commit** (Phase 1 Foundation)
**Controlling reference:** `implementation-readiness-gate.md` (Gate G1 = PASS WITH CONDITIONS) · `architecture-decision-review.md` · `21-quality-gate-checklist.md` §3 · `decision-log.md`
**Owner:** Engineering Manager; each item lists its signing role
**Rule:** This checklist gates the first commit. Items marked **GATE** are hard requirements; unchecking any GATE item blocks authorization.

---

## Architecture

- [ ] **GATE — Architecture approved** — `03` §13.1 conformance record signed; topology (6 units / 11 boundaries) accepted. *Sign: Chief Architect* · Evidence: `03`, gate G1-03
- [ ] **GATE — ADRs approved** — ADR-001…006 confirmed (SRS §15.4); D-01…D-08 adopted; D-02 wording aligned between `03` §10.2 and `04` §8. *Sign: Chief Architect* · Evidence: `architecture-decision-review.md` §1/§3
- [ ] **GATE — Dependencies identified** — external dependencies D-01…D-06 logged with owners; unit→logical-service mapping table drafted. *Sign: Chief Architect + Program* · Evidence: `16` §3.11, `03` §11
- [ ] Service boundaries + OpenAPI contract-first convention confirmed (AR-001/002/003). *Sign: Backend Lead*

## Infrastructure

- [ ] **GATE — Cloud decision completed (M-01)** — provider + region selected, multi-zone readiness, data-residency justification recorded in `decision-log.md`. *Sign: Program + DevOps*
- [ ] **GATE — Environment strategy approved** — dev / test / prod isolation (AR-009), no production data in lower environments. *Sign: DevOps* · Evidence: `12` §6.2, `20` §3.1
- [ ] **GATE — Secrets strategy approved** — managed secrets store + KMS, no secrets in repo/logs/images (NFR-022/037). *Sign: Security + DevOps* · Evidence: `11` §7, `12` §7
- [ ] IaC tooling chosen (Terraform), plan-gated applies, drift detection configured. *Sign: DevOps*
- [ ] CI/CD baseline green on an empty repo (GitHub Actions, SRS §16.2 reference). *Sign: DevOps*

## Security

- [ ] **GATE — Threat model approved** — STRIDE document signed, all 8 §14.1 threat areas covered, findings triaged (G1-05). *Sign: Security*
- [ ] **GATE — Privacy controls approved** — DPIA signed, processing register seeded (FR-132, OR-022), DPAs for confirmed processors in flight (G1-06). *Sign: Privacy + Program*
- [ ] RBAC role matrix (6 roles, §14.7) agreed; segregation of duties enforced (FR-106). *Sign: Security + Product*
- [ ] Webhook security pattern defined (HMAC constant-time, replay dedup, rotation) — provider-agnostic (FR-149). *Sign: Security + Integration*
- [ ] OTP controls defined (rate limit, expiry, lockout, admin MFA FR-101). *Sign: Security*

## Database

- [ ] **GATE — Schema approved** — `05` 27-table canonical schema reviewed; consent immutability (AR-012) and research separation (AR-013) confirmed in the model. *Sign: Database Architect + Chief Architect* · Evidence: `05` §2
- [ ] **GATE — Migration strategy approved** — `node-pg-migrate` (D-08), 17-step order starting at 001, reversible + audited (FR-164). *Sign: Database Architect* · Evidence: `05` §4
- [ ] Migration 001 applied and tested green in dev/test/prod (G1-12). *Sign: Database Engineer*
- [ ] Backup + PITR strategy validated against RPO ≤15 min / RTO ≤4 h (§19). *Sign: Database Engineer + DevOps*

## AI

- [ ] **GATE — Safety rules approved** — no-diagnosis boundary (NFR-046), safety layer in request path (AR-006), decline-or-cite (FR-061). *Sign: AI Safety Reviewer + Clinical* · Evidence: `08` §11, `23` §4
- [ ] **GATE — Evaluation dataset prepared** — eval set scoped (QR-011/014), ≥90% accuracy target, emergency false-negative + safety regression suites defined. *Sign: AI + QA* · Evidence: `08` §14/§16
- [ ] Embedding model fixed before ingestion (M-03 condition). *Sign: AI + Chief Architect*
- [ ] Authoritative guide (A-04) confirmed clinician-reviewed before grounding. *Sign: Clinical* · Evidence: `23` §3
- [ ] Model routing + fallback tiers designed (ADR-005); cost-aware routing config defined. *Sign: AI*

## WhatsApp

- [ ] **GATE — Provider confirmed (M-02)** — primary + fallback contracted; D-01 policy acceptance checked. *Sign: Program + Integration* · Evidence: `decision-log.md` M-02
- [ ] **GATE — Webhook strategy confirmed** — X-Hub-Signature-256 validation, idempotency, replay dedup, secret rotation, provider-agnostic abstraction (FR-149). *Sign: Integration + Security* · Evidence: `07` §13, `11` §11
- [ ] Template governance + clinical review of templates (AR-021, QR-019) agreed. *Sign: Content + Clinical*
- [ ] Emergency flow (FR-025/063) + offline emergency content (FR-135) confirmed in design. *Sign: Product + Clinical*

## Mobile

- [ ] **GATE — Framework selected (M-04)** — React Native selected (or Flutter with `09`/`19` §11 re-derivation). *Sign: Product Engineering* · Evidence: `decision-log.md` M-04
- [ ] **GATE — Offline strategy confirmed** — SQLite local-first + queued sync + conflict resolution (ADR-004, AR-025), no loss/duplication (FR-136). *Sign: Mobile Lead* · Evidence: `09` §8.5
- [ ] Encrypted local storage (AR-027) and offline-first emergency access (FR-135) in design. *Sign: Mobile + Security*

---

## Final Commit Authorization

- [ ] **GATE — All GATE items above complete** with evidence linked in `implementation-status.md`.
- [ ] **GATE — Gate G1 evidence package assembled** (G1-01…G1-15) and signed per `21` §6 approver matrix.
- [ ] **GATE — Written authorization recorded** (Engineering Manager + Chief Architect) in `implementation-status.md`.

> **When the Final Commit Authorization block is complete, Phase 1 Foundation may commit.**
> **Rule (non-negotiable):** no feature-phase code (Phases 2+), no third-party SDK call outside an adapter, and no secret in the repository, ever (PM-08, PM-16, PM-18).

---

**END OF DOCUMENT — Pre-Development Checklist.** GATE items: Architecture (3), Infrastructure (3), Security (2), Database (2), AI (2), WhatsApp (2), Mobile (2), Final authorization (3). Phase 0 executes first (decisions M-01…M-07, STRIDE, DPIA, procurement, ethics); then this checklist gates the first Phase 1 commit.
