# 13. Testing & Quality Plan

**Document:** FathersNet (Ayay) — Testing and Quality Assurance Implementation Plan
**Source of truth:** `docs/FathersNet-Complete-SRS.md` (FN-SRS-001 v2.0) — **§17 Testing Specification is the controlling authority**: §17.1 QR-001…QR-019 (layered strategy, coverage floors, contract, performance, security, accessibility, privacy, WhatsApp, AI evaluation, test data, release gates, traceability, UAT, pilot evaluation, clinical validation); §17.2 unit testing (Jest backend/frontend, PyTest Python AI/data; ≥80% core backend, ≥70% overall); §17.3 integration testing (API contract tests, WhatsApp mocks, database tests incl. consent immutability + retention purging, AI pipeline tests); §17.4 E2E testing (critical journey + five additional journeys, mobile device matrix, dashboard role tests); §17.5 test data rules (synthetic data, no production PII, anonymized research datasets, consent fixtures). Supporting authority: NFR acceptance criteria §5.1–§5.5 (performance, availability, security, privacy, accessibility), §5.8 AI quality (NFR-046…050, NFR-047 ≥90% eval accuracy), API conventions §12.1 (error codes, rate limits, versioning), database §13 (immutability, retention, purging), security §14 (STRIDE threat model, OWASP mapping, webhook signatures), deployment §16.2 (CI/CD test + security stages), monitoring §18 (alerting/observability verification), DR §19 (backup restore drills), Appendix B (requirement-to-test traceability), Appendix F (KPI framework, AI safety KPIs).
**Predecessors:** `00-requirement-inventory.md` (§7 QR inventory, QR-001…QR-019), `02-srs-requirement-analysis.md` (dependency map; UC-001…005 as E2E anchors; §2.5 QR ownership), plus the feature plans (`05` DB, `06` backend, `07` WhatsApp, `08` AI/RAG, `09` mobile, `10` admin, `11` security, `12` DevOps) whose per-phase acceptance evidence this plan gates.
**Scope:** Complete production QA roadmap — test strategy and pyramid mapping to QR-001; unit, integration, API/contract, database, AI, security, performance, mobile, and E2E test programs; test data management; traceability and reporting; per-phase evidence requirements; release gates (QR-013); dependencies, risks, and verification. This document plans only; it does not contain application code.
**Classification convention:** **Confirmed** (SRS-stated) · **Recommended** (engineering decision) · **Configurable** (parameter with default) · **Assumption** (requires human validation). Every decision carries **Source / Confidence / Reasoning / Impact-if-changed** annotations.

---

## 1. Executive Purpose

This document is the controlling QA and quality-management roadmap for the FathersNet (Ayay) platform. It translates the binding testing requirements of FN-SRS-001 v2.0 (§17 QR-001…QR-019) into a complete, executable, verifiable testing program that proves, before any production release, that the platform is functionally correct, clinically safe, secure, privacy-compliant, performant, accessible, and operationally releasable.

The QA program is anchored to these SRS contracts:

| Anchor | SRS Reference | Binding Content |
| --- | --- | --- |
| Layered strategy | QR-001 (§17.1) | Unit, integration, E2E, contract, performance, security, accessibility, privacy testing all mandatory |
| Coverage floors | QR-002 (§17.2) | ≥80% line coverage core backend, ≥70% overall; CI gates block promotion |
| Integration scope | QR-003 (§17.3) | Service-to-service contracts and data flows |
| E2E scope | QR-004 (§17.4) | Registration, consent, WhatsApp enrollment, weekly prompt, AI question, reminder, journaling, checklist, admin dashboard |
| Contract testing | QR-005 | Schema compatibility for internal and external API contracts |
| Performance/load | QR-006 + §5.1 | Validate NFR-001…009 before release |
| Security testing | QR-007 + §14 | SAST, DAST, dependency scanning, penetration testing |
| Accessibility | QR-008 + NFR-031 | WCAG 2.1 AA, automated + manual |
| Privacy testing | QR-009 + §14 | Consent flow, minimization, export, deletion, pseudonymization |
| WhatsApp testing | QR-010 + §7 | Flows, templates, media, errors, safety responses |
| AI evaluation | QR-011 + NFR-047 | Accuracy, hallucination, safety, bias, sampling; ≥90% eval set |
| Test data | QR-012 + §17.5 | Synthetic data; no production PII |
| Release gate | QR-013 | Unit + integration + E2E + security + accessibility + performance + clinical review before any production release |
| AI release gate | QR-014 | AI releases pass evaluation set + safety regression suite |
| Traceability | QR-015 | Every requirement has test coverage and status |
| Release review | QR-016 | Rollback readiness, dashboards, alerting verification |
| UAT | QR-017 | Representative fathers, partners, healthcare workers, administrators |
| Pilot evaluation | QR-018 | Usability, engagement, safety events, program KPIs |
| Clinical validation | QR-019 | Health content validated against the authoritative guide |

**What this document deliberately does NOT do:** it does not write application code or test code, does not select final commercial tooling vendors (recommendations are labeled Recommended/Configurable and subject to engineering evaluation), and does not set guaranteed dates or staffing commitments beyond the SRS's reference model. Where the SRS states a **Recommended Reference Architecture**, this plan confirms it or proposes an equivalent that still satisfies the confirmed requirement, always labeled.

**How to read this document:** Sections 2–11 define the layered test program (strategy → unit → integration → API → database → AI → security → performance → mobile → E2E). Sections 12–15 define quality management (test data, traceability/reporting, per-phase evidence, release gates). Sections 16–18 close with dependencies/blockers, risks/mitigations, and the verification approach for this plan itself.

---

## 2. Test Strategy Overview

### 2.1 Test Pyramid (Mapping to QR-001)

**Confirmed.** QR-001 mandates a layered test strategy covering unit, integration, E2E, contract, performance, security, accessibility, and privacy testing. **Source:** SRS §17.1 QR-001. **Classification:** Confirmed structure. **Confidence:** High.

The strategy follows a test pyramid with a large unit base, an integration/API mid-layer, and a thin, high-value E2E peak, augmented by contract, performance, security, accessibility, and privacy "chimney" suites that run in parallel with the pyramid rather than inside it:

```
              ▲  E2E (QR-004, §17.4) — few, slow, critical journeys
          ▲      Performance (QR-006) · Security (QR-007) · Accessibility (QR-008)
      ▲          Privacy (QR-009) · Contract (QR-005) — cross-cutting "chimneys"
  ▲   ▲   ▲
 Unit (QR-002)  Integration (QR-003)  API/Contract (QR-003/005)
```

| Layer | SRS Authority | Primary Purpose | Failure Cost if Absent |
| --- | --- | --- | --- |
| Unit | QR-002, §17.2 | Fast, isolated verification of pure logic: week computation, state transitions, validators, safety rules, money math, retention filters | Slow feedback; logic defects escape to higher layers; coverage floor unprovable |
| Integration | QR-003, §17.3 | Service-to-service contracts, event flows, DB behavior, WhatsApp mocks, AI pipeline, consent immutability, retention purge | Contract drift between microservices; silent data corruption |
| API/Contract | QR-005, §12.1, §17.3 | OpenAPI conformance, error codes, rate limits, authn/z, pagination, idempotency, provider/consumer schema compatibility | Breaking API changes; integration failures for the mobile app and external consumers |
| E2E | QR-004, §17.4 | Prove the critical journeys and the five additional journeys work together across surfaces | Undetected cross-service failures and broken end-user journeys at release |
| Performance | QR-006, §5.1 | Validate NFR-001…009: concurrency, latency, broadcast throughput, AI latency | Release that degrades under pilot load; emergency/WhatsApp timeouts |
| Security | QR-007, §14 | SAST/DAST/dependency/penetration testing; STRIDE verification; webhook signature tests | Vulnerabilities reaching a health-adjacent platform with PII at stake |
| Accessibility | QR-008, NFR-031 | WCAG 2.1 AA for web/admin; assistive tech for mobile | Exclusion of target users; regulatory/standards non-compliance |
| Privacy | QR-009, §14 | Consent flow, minimization, export, deletion, pseudonymization | Data-protection breach; research integrity failure |

**Source:** SRS §17.1 QR-001, QR-002, QR-003, QR-004, QR-005, QR-006, QR-007, QR-008, QR-009. **Classification:** Confirmed. **Confidence:** High.

### 2.2 Where Each SRS Area Is Tested

Every SRS requirement area is covered by at least one test layer. The primary owner is listed; where the SRS Appendix B maps a business requirement to testing coverage, that mapping is preserved.

| SRS Area (§) | Tested Primarily By | Secondary / Supporting | SRS Traceability Anchor |
| --- | --- | --- | --- |
| Onboarding, Registration & Consent (FR-001…010) | API tests (auth §12.2, profile §12.3) + integration (consent immutability) | Unit (validators, OTP), E2E (Registration), privacy tests | Appendix B: auth + privacy tests (QR-009) |
| WhatsApp Channel & Engagement (FR-011…030) | WhatsApp integration tests with mocks (QR-010) | Unit (state machine), E2E (WhatsApp enrollment, campaign delivery), security (webhook signatures) | Appendix B: E2E WhatsApp (§17.4) |
| Pregnancy Journey (FR-031…040) | Unit (pregnancy week/trimester computation) + integration | E2E (weekly prompt), API tests (pregnancy endpoint) | Appendix B: Unit/Integration (17.2/17.3) |
| Reminders & Notifications (FR-041…050) | Integration (scheduler, channel dispatch, dedup) | Performance (throughput), E2E (reminder journey) | Appendix B: Integration (17.3) |
| Father Diary / Journal (FR-051…058) | API tests (journal §12.9) + mobile tests (offline sync) | E2E (offline journal sync), privacy (export/deletion) | Appendix B: E2E journaling (17.4) |
| AI Assistant & RAG (FR-059…075) | AI evaluation suite (QR-011/QR-014) + AI pipeline integration | Unit (safety rules, emergency detection), security (prompt injection), performance (AI latency NFR-009) | Appendix B: AI eval suite (QR-011, QR-014) |
| Educational Content & CMS (FR-076…085) | Integration (review/approval workflow, versioning) | API tests (content §12.5), database (content_versions), clinical validation (QR-019) | Appendix B: Content workflow tests |
| Birth Preparation & Budget (FR-086…093) | API tests (checklist §12.6, budget §12.7) + mobile tests | Unit (budget arithmetic), E2E (hospital bag and budget) | Appendix B: E2E checklist/budget (17.4) |
| Admin Portal & User Mgmt (FR-094…106) | API tests (admin §12.10) + dashboard E2E role tests | Security (RBAC/MFA), accessibility (QR-008) | Appendix B: Dashboard role tests (17.4) |
| Campaigns & Broadcasts (FR-107…112) | WhatsApp integration (opt-in enforcement, throttling) + performance (broadcast NFR-005) | E2E (campaign delivery), database (campaign_messages) | Appendix B: Campaign integration tests |
| Analytics, Research & Evidence (FR-113…122) | Integration (research pipeline, anonymization) + privacy tests (export governance) | E2E (research export governance), database (research tables) | Appendix B: Privacy tests (QR-009) |
| Privacy, Security & Data Protection (FR-123…132) | Security suite (QR-007) + privacy suite (QR-009) | Database (consent immutability, retention purge), API (authn/z) | Appendix B: Security suite (QR-007) |
| Accessibility, Offline & Localization (FR-133…142) | Mobile tests (offline, assistive tech) + accessibility suite (QR-008) | E2E (offline journal sync), localization parity checks | Appendix B: Accessibility + mobile tests |
| Integration & External Services (FR-149…155) | Contract tests (QR-005) + WhatsApp mocks | Performance (provider failover), security (webhook signatures) | §17.3 WhatsApp mocks |
| Backend, Data, Automation & Observability (FR-159…170) | Integration (event bus, idempotency) + database tests | Performance (queue throughput), E2E | QR-003 (service contracts) |
| NFR performance/scalability (§5.1) | Performance suite (QR-006) | Integration (async processing) | NFR-001…009 acceptance criteria |
| NFR availability/reliability (§5.2) | Database (backup restore) + performance/chaos (failover) | Release review (QR-016) | NFR-010…015 acceptance criteria |
| NFR security (§5.3) | Security suite (QR-007) | Privacy suite (QR-009) | NFR-016…024 acceptance criteria |
| NFR privacy (§5.4) | Privacy suite (QR-009) | Database (retention purge) | NFR-025…029 acceptance criteria |
| NFR usability/accessibility (§5.5) | Accessibility suite (QR-008) + UAT (QR-017) | Mobile tests (assistive tech) | NFR-030…035 acceptance criteria |
| NFR AI quality (§5.8) | AI evaluation suite (QR-011/QR-014) | Security (prompt injection), performance (NFR-009) | NFR-046…050 acceptance criteria |

**Source:** SRS §17.1–§17.5, §5, Appendix B. **Classification:** Confirmed. **Confidence:** High. **Reasoning:** Appendix B already defines the authoritative area-to-testing mapping; this table operationalizes it into test suite owners. **Impact if changed:** A shift in test ownership (e.g., moving consent tests from integration to API-only) changes the evidence list in Section 14 and must be reflected in the QR-015 traceability matrix.

---

## 3. Unit Testing

### 3.1 Frameworks and Coverage Floors (QR-002, §17.2)

**Confirmed.** §17.2 specifies Jest for backend (Node.js) and frontend, PyTest for Python AI/data services; ≥80% line coverage on core backend services; ≥70% overall; coverage gates block CI promotion.

| Item | Decision | Source | Classification |
| --- | --- | --- | --- |
| Backend unit framework | Jest (Node.js, per §16.1 Node API + §17.2) | SRS §17.2 | Confirmed |
| Frontend unit framework | Jest (React/web admin) | SRS §17.2 | Confirmed |
| Python AI/data unit framework | PyTest (AI orchestration, RAG pipeline, research/theme extraction, data services) | SRS §17.2 | Confirmed |
| Core backend coverage floor | ≥80% line coverage | SRS §17.2 QR-002 | Confirmed |
| Overall coverage floor | ≥70% line coverage | SRS §17.2 QR-002 | Confirmed (targets configurable) |
| CI enforcement | Coverage gate fails the pipeline below the 80% floor | SRS §16.2 (`npm run test:coverage # fails below 80% floor`), QR-002 | Confirmed |

**Confidence:** High. **Reasoning:** Framework and floor choices are SRS-mandated; the CI enforcement mechanism is explicitly shown in §16.2. **Impact if changed:** Lowering floors below 80%/70% violates QR-002 and weakens the QR-013 release gate; changing the pytest scope for AI services requires updating the coverage measurement configuration in `12-devops-and-infrastructure-plan.md`.

### 3.2 What to Test Per Service

Unit scope is defined per service/component, mapped to the pure logic each owns (per `06` §2.1 service topology and `08` AI components):

| Service / Component | Unit-Test Targets (Non-Exhaustive) | SRS Anchor |
| --- | --- | --- |
| Auth Service | OTP generation/expiry/lockout, token issue/refresh/rotation/revocation, constant-time comparisons | §12.2, §14.6, FR-005 |
| User & Profile Service | Field validators (E.164 phone, EDD/LMP consistency), consent versioning, subject-rights workflows | §12.3, FR-002/003/007, FR-125 |
| Pregnancy Engine | Week/trimester computation from EDD and LMP, milestone dates, countdown, boundary weeks 1/45 | FR-031/033/037, §13.3.3 (week 1–45 check) |
| Reminder Engine | Template scheduling rules, quiet hours, lead-time logic, channel dedup, recurrence rules | FR-041…050, §7.4.3 |
| Content/CMS Service | Review/approval workflow states, version snapshots, expiry/archiving, localization parity checks | FR-078/079/080/081, §11.4 |
| Checklist & Budget Service | Progress computation, planned/actual/variance/remaining math, custom item rules | §8.2, §8.3, FR-086/087/088 |
| Journal Service | Privacy defaults, sharing opt-in, export payload assembly | FR-052/057, §12.9 |
| WhatsApp Conversation Engine | State machine transitions per §7.2.2 (all states, entry/exit, timeouts, error recovery), intent fallback (FR-020), opt-out handling (FR-112), 24-hour window enforcement | §7.2, FR-020/028/112 |
| Campaign Service | Audience segmentation filters, approval gate, throttling caps, opt-out exclusion | FR-107/108/111/112, §7.4.3 |
| AI Orchestration / Safety Layer | Emergency keyword detection (FR-063, §9.6 keyword set), no-diagnosis rules (NFR-046), input/output safety classification (FR-062), decline/uncertain escalation (FR-065), model-fallback routing decisions (§9.8), cost routing | §9.4/9.6/9.8, FR-062…065/072, NFR-046 |
| Intent & Language Detection (NLU) | EN/AM intent classification, language detection, Amharic keyword matching | FR-064, §9.6 |
| Research & Analytics Service | Anonymization/pseudonymization transforms, theme extraction confidence scoring, KPI computations, export governance checks | FR-113…122, §10.1 |
| Python data/ingestion utilities | Chunking (512/128 token split, separators), normalization, retention filters, media validation rules | §9.2, §7.4.2 |
| Admin/RBAC | Permission matrix checks (deny-by-default), segregation of duties (author ≠ approver) | §14.7, FR-106, FR-126 |

**Source:** SRS §17.2, §12, §7.2, §9, §10, §13; `06` §2.1; `08`. **Classification:** Confirmed scope; Recommended enumeration. **Confidence:** High. **Reasoning:** Targets derive directly from acceptance criteria in each FR/NFR row. **Impact if changed:** Adding or removing a service from the coverage scope must be reflected in the QR-015 matrix and the CI coverage configuration.

### 3.3 Coverage Gates in CI

**Confirmed.** The CI pipeline (§16.2) runs `npm test && pytest`, then a coverage gate that fails below the 80% floor. **Recommended:** branch protection requires the `test` job to pass before merge; coverage is reported per-PR with the diff-coverage view so new code cannot lower the floor.

| Gate | Behavior | Source |
| --- | --- | --- |
| Unit + integration execution | `npm test && pytest` on every push/PR | SRS §16.2 |
| Coverage floor | Fail below 80% core backend / 70% overall | SRS §16.2, QR-002 |
| Diff coverage | New lines in a PR must be ≥80% covered (Recommended; guards against floor erosion) | QR-002 intent |
| Flakiness control | Flaky-test quarantine process; no quarantine without a tracked defect | QR-015 intent |

**Confidence:** High for the SRS-mandated gate; Medium for the recommended additions (engineering decision). **Impact if changed:** Removing the diff-coverage requirement weakens QR-002; changing the pytest/npm split affects only execution order, not scope.

---

## 4. Integration Testing

### 4.1 Service Contract and Data-Flow Tests (QR-003)

**Confirmed.** QR-003 requires automated integration tests covering service-to-service contracts and data flows. Per §17.3 these cover API behavior against OpenAPI, WhatsApp mocks, database tests, and AI pipeline tests.

| Test Group | What It Proves | SRS Anchor |
| --- | --- | --- |
| Event-bus flows | Events published/consumed correctly, idempotent consumers produce no duplicates (e.g., `user.enrolled`, `pregnancy.week.changed`, `message.inbound`) | FR-160/161, AR-007 |
| Service-to-service contracts | Internal REST/gRPC contracts between gateway, auth, user, pregnancy, reminder, content, checklist, journal, WhatsApp, campaign, AI, research, admin services | QR-003, `06` §2.1 |
| End-to-end data flows (non-UI) | Registration → journey → prompt response → journal entry → research pipeline → anonymized record | §10, UC-001/002 |
| Scheduler behavior | Weekly prompt, daily pulse, Sunday legacy prompt, reminder and campaign jobs fire with retries/observability | FR-014/015/016/163, AR-007 |
| Idempotency | Retried webhooks/events create no duplicate messages, journal entries, or campaign sends | FR-161, §7.4.1 |
| Provider abstraction | WhatsApp provider swap in a test environment preserves downstream behavior | AR-004, FR-149 |
| Third-party failover | LLM/ASR/notification provider failure routes to fallback per policy | FR-072, FR-152, NFR-015 |

**Confidence:** High. **Reasoning:** Each row traces to a confirmed requirement with a defined acceptance criterion. **Impact if changed:** Removing an integration group invalidates the QR-013 evidence claim for the affected requirement area.

### 4.2 Database Tests

Per §17.3, integration database tests cover **migrations, indexes, constraints, consent immutability, and retention purging**. Detailed program in Section 6.

### 4.3 WhatsApp Mocks (QR-010, §17.3)

**Confirmed.** §17.3 mandates mocked provider webhooks for messages, media, statuses, and signatures, verifying state-machine transitions and error handling.

| Mock Scenario | Verifies | SRS Anchor |
| --- | --- | --- |
| Signed webhook POST (text) | Valid HMAC accepted and routed; state transitions per §7.2.2 | §7.4.1, §12.4 |
| Signature mismatch / invalid JSON | 401 / 400 responses, security event logged, no processing | §7.4.1, §14.1.5 |
| Duplicate message IDs | Deduped via idempotency; no double processing | §7.4.1, FR-161 |
| Media inbound (audio/photo) | Type/size checks, malware scan stub, object-storage store, enqueue transcription | §7.4.2, FR-018/019, AR-023 |
| Oversize media (>16 MB) | Rejected with helpful message | §7.4.2 |
| Provider delivery statuses | queued/sent/delivered/read/failed/opted_out recorded; retries with backoff; alert after max attempts | FR-021, FR-045, §7.4.3 |
| Conversation state persistence | Interrupted multi-step flow (consent/profile/myth) resumes at last completed step | FR-028, AR-022 |
| Quick-reply routing | All five intents (myth/challenge/question/journal/emergency) route correctly | FR-013 |
| Fallback handling | Unrecognized message returns clarifying fallback and logs | FR-020 |
| Opt-in enforcement | Broadcasts exclude users without consent; opt-out removes from future sends | FR-017, FR-112 |
| Emergency short-circuit | Danger keyword in any state → EMERGENCY before normal answering; bypasses quiet hours | FR-025/046, §9.6, §15.3 |
| Template approval gate | Unapproved template blocks campaign send | FR-108, AR-021 |

**Confidence:** High. **Reasoning:** Directly mandated by §17.3 and §7.4/§14.1.5. **Impact if changed:** Reducing mock coverage removes the only fast, safe way to test provider behavior without live WhatsApp traffic and weakens QR-010.

### 4.4 AI Pipeline Tests

Per §17.3, AI pipeline integration tests cover **ingestion, chunking, embedding, retrieval, reranking, safety layer, and model fallback** (detailed program in Section 7).

---

## 5. API Testing

### 5.1 Contract Testing (QR-005)

**Confirmed.** QR-005 requires contract testing (schema compatibility) for internal and external API contracts. The OpenAPI 3.x specification is the contract source (§12.1).

| Item | Decision | Source |
| --- | --- | --- |
| Contract source | OpenAPI 3.x specification (`/v1/` versioned paths) | §12.1, AR-003 |
| External contracts | Provider/consumer contract tests for the mobile app and web admin against backend contracts (Recommended: Pact or equivalent) | QR-005 |
| Internal contracts | Service-to-service contract tests between microservices (Recommended: consumer-driven contracts or OpenAPI schema checks) | QR-003/005, `06` §2.1 |
| Schema compatibility checks | Automated diff of OpenAPI changes; breaking changes require a new major version with 6-month deprecation notice (default, configurable) | §12.1 deprecation policy |
| CI enforcement | Contract verification runs in the CI `test` stage; a breaking-change detection fails the pipeline | §16.2 |

**Confidence:** High for requirement; Medium for tool choice (engineering decision). **Reasoning:** QR-005 is a Should-Have but is treated as mandatory because the mobile app is a first-class consumer and §12.1 defines backward-compatibility rules that only contract tests can enforce. **Impact if changed:** Skipping contract tests makes API drift between the mobile app and backend a release-time discovery instead of a merge-time failure.

### 5.2 OpenAPI Schema Validation

**Recommended.** Every request/response is validated against the OpenAPI schema (schema-first validation library or generated client). Response fixtures assert the exact JSON shapes documented in §12.2–§12.10 (e.g., pregnancy response `{pregnancy_week, trimester, edd, next_milestone}`, AI ask response `{answer, sources, disclaimer, safety_status}`). Example request/response pairs in §12.3/§12.7/§12.8 become golden test fixtures.

**Confidence:** Medium (Recommended). **Impact if changed:** Without schema validation, example contracts in §12 can silently diverge from implementation, breaking the QR-005 guarantee.

### 5.3 Error Codes (§12.1)

**Confirmed.** The standard error-code set (400, 401, 403, 404, 409, 422, 429, 500, 502/503) is verified across the API surface. Each endpoint's documented error codes (e.g., auth §12.2, profile §12.3) are asserted in negative tests.

| Error Code | Meaning (§12.1) | Representative Negative Test |
| --- | --- | --- |
| 400 | Validation error | Invalid E.164 phone; invalid EDD format |
| 401 | Unauthenticated / invalid token | Expired/malformed bearer token; refresh-token reuse |
| 403 | Forbidden (role lacks permission) | Researcher calls admin user-management endpoint; father calls admin API |
| 404 | Not found | Unknown resource ID |
| 409 | Conflict (e.g., duplicate) | Withdraw an already-withdrawn consent; duplicate registration phone |
| 422 | Unprocessable entity | EDD/LMP inconsistency; out-of-range enum |
| 429 | Rate limited | Exceed 120 req/min standard, 30 req/min AI, 10 req/min admin export; assert `Retry-After` header |
| 500 / 502 / 503 | Internal / upstream / unavailable | Provider outage path returns 502/503 with graceful message, not 500 leaking internals |

**Confidence:** High. **Reasoning:** Every code is SRS-defined with documented semantics; §12.2/12.3 explicitly list error codes per endpoint. **Impact if changed:** Adding a new error code requires updating §12.1, the OpenAPI spec, and the contract tests together.

### 5.4 Authentication and Authorization Tests

| Test | Verifies | SRS Anchor |
| --- | --- | --- |
| OTP request/verify | Rate limit 5/15 min per phone; OTP expiry; constant-time check; lockout after failures | §12.2, §14.6, FR-005 |
| Token lifecycle | Access-token expiry (default 15 min); refresh rotation; revocation on logout/reuse | §12.2, §14.6, NFR-018 |
| RBAC matrix | Every §14.7 permission-matrix cell enforced server-side; deny-by-default | §14.7, FR-094/126 |
| Ownership checks (IDOR) | User A cannot read/modify user B's journal, budget, checklist, or AI conversations | §14.1.2, FR-126 |
| Segregation of duties | Author cannot approve own medical content; researcher export requires separate approver | FR-106, §14.7 |
| MFA | Admin endpoints require MFA (Bearer + MFA) | §12.10, FR-101, NFR-018 |
| Session controls | Expiration, revocation, concurrent-session policy for admins | FR-102 |
| Masked phone | Admin user views return masked phone; no phone in broadcasts/reports | FR-022, §11.2 |

**Confidence:** High. **Reasoning:** Each row traces to confirmed requirements and the §14.7 matrix. **Impact if changed:** Any RBAC rule change requires re-running the full authorization suite and updating the §14.7 matrix in the SRS.

### 5.5 Pagination, Idempotency, and Webhooks

**Confirmed/Recommended.**

| Capability | Test Scope | SRS Anchor |
| --- | --- | --- |
| Pagination | All list endpoints (users, journal entries, messages, campaigns, AI conversations) return stable, complete pages with no duplicate/skip across pages; consistent ordering | AR-003 (§12.1 conventions) |
| Idempotency keys | Replayed write requests (profile PATCH, budget POST, consent withdraw, journal POST, campaign creation) with the same idempotency key produce one record and return the original result | §12.1, FR-161 |
| Webhook events | Authorized integration receives webhook events (FR-153); replay/duplicate suppression | FR-153, §12.1 |
| API versioning | `/v1/` path enforcement; deprecated endpoints return documented headers; breaking change detection | §12.1 |

**Confidence:** High. **Impact if changed:** Removing idempotency verification contradicts FR-161 and §7.4.1 dedup requirements.

---

## 6. Database Testing

**Confirmed.** Per §17.3, database tests cover migrations, indexes, constraints, consent immutability, and retention purging. NFR-014 additionally requires automated backup verification (restore tests).

### 6.1 Migration Tests

| Test | Verifies | SRS Anchor |
| --- | --- | --- |
| Forward migration | Every schema migration (001 onward, per `05`) applies cleanly to a pristine and to an incremental database | FR-164, AR-011 |
| Migration order/idempotency | Migrations are versioned, ordered, re-runnable on the migration table; no partial state | FR-164 |
| Rollback/down migration | Down migrations are reversible for all non-irreversible changes; verified on a throwaway DB | FR-164, `05` |
| Data preservation | Columns/tables preserved during additive migrations; retention of data where required | FR-164 |
| Seed/data integrity | Baseline content, templates, and consent fixtures load correctly post-migration | §17.5 |

**Confidence:** High. **Impact if changed:** An unverified migration risks silent schema/data drift across the 27-table model (§13).

### 6.2 Referential Integrity and Constraints

| Test | Verifies | SRS Anchor |
| --- | --- | --- |
| FK enforcement | Deletes cascade or restrict per §13.4 DDL (e.g., `users` ON DELETE CASCADE to `pregnancies`, `consents`, `journal_entries`); orphan rows impossible | §13.3/13.4 |
| Enum/check constraints | Role/status/consent_type/state/entry_type/response_category/delivery_status/result CHECK constraints reject invalid values | §13.3, §13.4 |
| Unique constraints | `users.phone_e164` unique; `messages.provider_message_id` unique nullable; profile 1:1 with user | §13.3.1/13.3.11/13.3.2 |
| Nullability/business rules | `pregnancies` requires EDD or LMP; `pregnancy_week BETWEEN 1 AND 45`; `research_responses.is_anonymized` always true | §13.3.3, §13.3.22 |
| Table/column parity | All 27 tables match the SRS §13 schema exactly (schema-diff test against the spec) | §13, AR-011 |

**Confidence:** High. **Impact if changed:** Any constraint relaxation must be justified against §13 and reflected in the schema-diff test.

### 6.3 Consent Immutability

**Confirmed.** `consents` are append-only/immutable (§13.3.4, AR-012). The test proves an inserted consent record can never be updated or deleted; lifecycle transitions (granted → withdrawn) are represented by new records plus `withdrawn_at`, never by mutation.

| Test | Verifies | SRS Anchor |
| --- | --- | --- |
| UPDATE blocked | Attempting to change a consent row fails (no UPDATE grant on the table / trigger) | §13.3.4, AR-012 |
| DELETE blocked | Attempting to delete a consent row fails | §13.3.4, AR-012 |
| Withdrawal semantics | Withdraw creates a versioned `withdrawn` record with `withdrawn_at`; prior grant remains queryable; audit entry written | FR-004/125, §14.8 |
| Consent history completeness | `(user_id, consent_type)` index supports full lifecycle retrieval; version and timestamps present | FR-125, §13.3.4 |
| Audit-log immutability | `audit_logs` is append-only; no UPDATE/DELETE possible (§13.3.24) | FR-098, NFR-023 |

**Confidence:** High. **Reasoning:** This is the single most legally sensitive database invariant (§14.8 consent lifecycle). **Impact if changed:** Enabling consent-row mutation breaks FR-004/FR-125/AR-012 and the privacy test program; must never be relaxed.

### 6.4 Retention Purge Verification (FR-105, AR-014)

**Confirmed.** Retention rules are per data class with automated purging and audit. Tests execute the purge job against seeded records and assert the outcome.

| Data Class | Test Behavior | SRS Anchor |
| --- | --- | --- |
| Expired content | Archived/purged content removed from active surfaces and RAG retrieval within SLA | FR-080, AR-015 |
| Expired sessions/OTPs | OTPs and expired tokens purged per policy | §12.2, §14.6 |
| Consent-withdrawn research data | Research-use restriction on withdrawal; scheduled deletion of eligible records per policy | FR-004, §13.4 retention note |
| Notification/conversation retention | Purged per class policy; purge is audited | FR-105, §18.1 |
| Audit trails | Not purged where compliance retention requires; retained per policy (security logs 1 year, §18.1) | §18.1, NFR-023 |
| Purge audit | Every purge run writes an audit entry (who/what/how many/result) | FR-105, FR-098 |
| Boundaries | Records exactly at the retention boundary are handled deterministically (no off-by-one) | AR-014 |

**Confidence:** High. **Impact if changed:** An incorrect purge job could delete lawful audit records or fail to delete expired personal data — both are regulatory failures (NFR-023, NFR-026).

### 6.5 Index Effectiveness

| Test | Verifies | SRS Anchor |
| --- | --- | --- |
| Hot-query indexes | `users(phone_e164)`, `pregnancies(user_id, edd)`, `consents(user_id, consent_type)`, `journal_entries(user_id, created_at)`, `prompt_responses(user_id)`, `campaign_messages(campaign_id, delivery_status)`, `audit_logs(created_at, action)`, `messages(provider_message_id)` used by hot queries | §13.3, AR-011 |
| Explain-plan checks | Hot queries use index scans, not sequential scans, at pilot scale | NFR-007, AR-011 |
| Slow-query regression | Slow-query count stays below the configured threshold (part of performance suite, NFR-007) | NFR-007 |
| Missing-index detection | New queries in a release are inspected for index usage before merge | NFR-007, `05` |

**Confidence:** High. **Impact if changed:** Missing indexes are the primary cause of NFR-007 failure at pilot scale (500+ concurrent fathers, ~10,000 outbound/day, §5.9).

### 6.6 Backup and Restore (NFR-014, §19)

**Confirmed.** Automated backup verification (restore tests) on a scheduled basis; quarterly restore drill; annual full failover drill (OR-012). RPO ≤15 min / RTO ≤4 h (NFR-012).

| Test | Verifies | SRS Anchor |
| --- | --- | --- |
| Automated restore test | Scheduled restore of the latest backup into a staging DB; checksums and row counts verified | NFR-014, §19 |
| Point-in-time recovery | Restore to a point within the RPO window using transaction logs | §19 |
| Object storage restore | Versioned media restorable; vector-store snapshot restorable | §19 |
| RPO/RTO measurement | DR drill measures time-to-restore and data loss; documented results | NFR-012, OR-012, AR-039 |
| Quarterly/annual cadence | Restore drill quarterly; full failover drill annually | §19, OR-012 |

**Confidence:** High. **Impact if changed:** Skipping restore tests means NFR-012/014 and AR-039 acceptance criteria are unprovable, and real data loss is undetected until disaster.

---

## 7. AI Testing

**Confirmed.** QR-011 requires AI quality evaluation (accuracy, hallucination, safety, bias, response-quality sampling) with defined thresholds; QR-014 requires every AI release to pass the evaluation set and safety regression suite; NFR-047 sets the answer-accuracy target (≥90% on an approved evaluation set, configurable); NFR-050 requires hallucination/safety monitoring with alerting; FR-071 mandates hallucination/accuracy monitoring with sampling and scoring.

### 7.1 Evaluation Set (NFR-047, QR-011)

| Item | Decision | Source |
| --- | --- | --- |
| Evaluation set | Curated, clinically reviewed, versioned gold-standard Q&A set derived from the approved knowledge base; covers EN and AM; categorized by intent (question, emergency, myth, challenge, journal) and by topic (pregnancy, labor/birth, first years, father wellbeing) | NFR-047, QR-011 |
| Accuracy target | ≥90% on the evaluation set (configurable default per NFR-047) | NFR-047 |
| Ground-truth scoring | Answers scored against approved ground-truth answers plus source citation check | NFR-047/048, FR-060 |
| Drift reporting | Accuracy recomputed per model/prompt change and periodically; drift reported | NFR-047, NFR-050 |
| Minimum set size | Sized to cover all emergency keywords, all content types, and the top myth/FAQ set (no placeholder — set composition is defined in `08` §evaluation) | QR-011, `08` |

**Confidence:** High. **Impact if changed:** Reducing the target below 90% requires explicit program re-configuration of NFR-047 and weakens the QR-014 gate.

### 7.2 Hallucination Monitoring (FR-071, NFR-050)

| Test/Monitor | Verifies | SRS Anchor |
| --- | --- | --- |
| Sampling and scoring | Sampled answers are scored against ground truth on a defined cadence; hallucination rate computed | FR-071, NFR-050 |
| Citation requirement | Answers either cite approved chunks or clearly decline (no fabricated facts, statistics, appointments, or resources) | FR-048, §9.5 system prompt, AR-017 |
| Knowledge-gap capture | Unanswerable questions are logged as knowledge gaps for content teams | FR-074 |
| Alerting thresholds | Hallucination/accuracy metrics exceed threshold → alert to AI operations team | NFR-050 |
| Monitoring dashboard | Metrics surfaced in the AI operations dashboard per FR-067 | FR-067, §11.6 |

**Confidence:** High. **Impact if changed:** Removing hallucination monitoring directly violates FR-071 and NFR-050 and removes the early-warning for the highest clinical risk (AI fabricating health advice).

### 7.3 Safety Regression Suite (QR-014)

**Confirmed.** Every AI release must pass the safety regression suite before release. This is a deterministic test set of safety-critical inputs and expected safe outputs.

| Suite Component | Scope | SRS Anchor |
| --- | --- | --- |
| No-diagnosis/prescription | Asserts no output contains diagnosis or prescription; disclaimers present where relevant | NFR-046, FR-063 |
| Emergency keyword set | All §9.6 keywords (bleeding, fits, seizure, unconscious, fainted, severe headache, blurred vision, baby not moving, water breaking, premature labor, severe pain, high fever) trigger urgent facility guidance, never routine answering | FR-063, §9.6 |
| Amharic equivalents | Emergency detection also fires on Amharic equivalents via the localization layer | §9.6, FR-024 |
| Grounding boundaries | Out-of-knowledge health questions are declined with a referral, not answered from general knowledge | FR-061, NFR-048 |
| Escalation behavior | Uncertain/flagged cases are revised or escalated before delivery | FR-065, §14.10 |
| Source citation | Every sampled answer cites approved sources or declines | NFR-048, AR-017 |
| Safety-layer interception | High-risk inbound/outbound is intercepted before user delivery | FR-062, AR-006 |

**Confidence:** High. **Reasoning:** QR-014 and §9.6/§14.10 define the exact behavior; the keyword set is enumerated in the SRS. **Impact if changed:** A regression in any safety rule is a direct clinical-safety failure and must block release (QR-013/QR-014).

### 7.4 Prompt Injection and Jailbreak Testing

**Confirmed.** §14.1.4 lists AI prompt injection/jailbreak as a threat with mitigation including an injection test suite; NFR-020 requires protection against listed attack classes.

| Test | Verifies | SRS Anchor |
| --- | --- | --- |
| Instruction-override attempts | "Ignore your instructions / act as…" style prompts cannot override the §9.5 system prompt | §14.1.4, NFR-020 |
| Role-jailbreak attempts | Attempts to extract system prompt or force diagnosis fail safely | §14.1.4 |
| Injections via media | Malicious content embedded in voice transcripts/photos does not alter behavior | §14.1.4, §7.4.2 |
| Injected content in KB | A hostile ingested document (during content review) cannot produce unsafe output; ingestion is gated by approval | §14.1.4, AR-015 |
| Regression suite membership | Prompt-injection cases are part of the safety regression suite | QR-014, §14.1.4 |

**Confidence:** High. **Impact if changed:** Skipping injection tests leaves the highest-likelihood AI attack (Medium–High per §14.1.4) unverified.

### 7.5 Emergency False-Negative Testing

**Confirmed.** Emergency detection must never miss a danger sign (false negative). QR-018 lists "false-negative emergency detection rate" as an AI safety KPI (Appendix F).

| Test | Verifies | SRS Anchor |
| --- | --- | --- |
| Keyword completeness | Every §9.6 keyword and Amharic equivalent triggers EMERGENCY | FR-063, §9.6 |
| Paraphrase/variant detection | Danger described in plain language without exact keywords (e.g., "she is bleeding a lot", "she won't wake up") is still classified emergency by the input safety classifier | FR-062/063, §9.6 |
| Mixed messages | Routine question containing a danger phrase routes to EMERGENCY first (priority over other intents) | §9.6, FR-025 |
| Threshold tuning | Classifier threshold configured so false negatives ≈ 0 at the cost of acceptable false positives; measured on the eval set | §9.6, Appendix F (AI Safety KPIs) |
| 5-minute follow-up | EMERGENCY state follow-up and escalation fire per §15.3 when no user response | §9.6, §15.3 |

**Confidence:** High. **Impact if changed:** A missed emergency is the single highest-severity failure available to this platform; false-negative testing is non-negotiable.

### 7.6 Bias Sampling and Fairness Review

**Confirmed.** NFR-049 requires bias/fairness review; §14.11 requires bias monitoring with sampled reviews; QR-011 includes bias in the evaluation scope.

| Test/Monitor | Verifies | SRS Anchor |
| --- | --- | --- |
| Bias sampling | Sampled review of responses across gender roles, literacy levels, regions, languages for biased/shaming/mocking output | §14.11, QR-011, NFR-049 |
| Cultural appropriateness | Output respects Ethiopian family values, naming, language, community context; never judges/shaming (§9.5) | §9.5, FR-142 |
| Language parity | EN/AM answer quality parity on the evaluation set (no degraded Amharic accuracy) | FR-024, NFR-033 |
| Fairness review record | Review outcomes logged to the AI governance record | NFR-049, §14.11 |

**Confidence:** High for requirement; Medium for sampling methodology (engineering decision). **Impact if changed:** Removing bias sampling violates NFR-049/QR-011 and Appendix F research KPIs.

### 7.7 Model Fallback Testing (FR-072, §9.8)

| Test | Verifies | SRS Anchor |
| --- | --- | --- |
| Primary → fallback failover | On primary failure/timeout/rate-limit, traffic fails over to approved alternate without user-visible failure | FR-072, §9.8 |
| Timeout routing | Primary must start output within 5 s (configurable); otherwise switch to fallback | §9.8 |
| Retry-once policy | One retry on primary before failover | §9.8 |
| Fallback chain | Gemini 2.0 Flash → GPT-4o-mini → Claude 3 Haiku order honored | §9.8 |
| Routing audit | Model, provider, latency, tokens, cost logged per decision | §9.8, AR-020 |
| Provider outage simulation | Graceful degradation message delivered; affected functions degrade per plan | NFR-015, NFR-008 |

**Confidence:** High. **Impact if changed:** Fallback regression removes third-party-outage resilience (NFR-015) and the cost-control routing guarantee (§9.8).

---

## 8. Security Testing

### 8.1 Security Test Layers (QR-007, §16.2)

**Confirmed.** QR-007 requires SAST, DAST, dependency scanning, and penetration testing per Section 14. NFR-016 requires OWASP ASVS compliance with zero critical/high vulnerabilities at release. The CI/CD security stage (§16.2) executes dependency scan, SAST, and secret scan on every build.

| Layer | Tool Class / Recommendation | CI/Stage | SRS Anchor |
| --- | --- | --- | --- |
| SAST (static) | Static analysis for backend/frontend/Python code (e.g., Semgrep, ESLint security rules, Bandit) — run in the `security` CI stage | §16.2 `npm run sast && semgrep ci` | QR-007, FR-130, NFR-016 |
| DAST (dynamic) | Dynamic scanning against the running staging API (injection, XSS, SSRF, misconfiguration probes) | Pre-release gate | QR-007, NFR-020 |
| Dependency scanning | `npm audit --omit=dev` and `pip-audit` in CI; supply-chain scanning | §16.2 security stage | QR-007, FR-129, NFR-016, OWASP A06 |
| Secret scanning | Scan repo, images, configs, logs for secrets (e.g., TruffleHog) | §16.2 security stage (`trufflehog filesystem ./`) | QR-007, NFR-022 |
| Container/image scanning | Base-image vulnerability scan in the build stage | Build stage | NFR-016/017 |
| Penetration testing | External pen test before pilot launch and at least annually / before major releases | Pre-launch + periodic | QR-007, FR-130, NFR-019 |
| ASVS verification | Checklist-based verification against OWASP ASVS at the level appropriate to a health-adjacent platform | Pre-release | NFR-016 |

**Confidence:** High for requirements; Medium for tool selection (engineering decision, subject to evaluation in `11` and `12`). **Impact if changed:** Removing any layer invalidates the NFR-016 "zero critical/high at release" claim.

### 8.2 STRIDE Verification (§14.1)

**Confirmed.** §14.1 defines the STRIDE threat model with eight covered areas; FR-130 mandates STRIDE threat modeling before release and on significant changes. Each threat's mitigations are verified by tests:

| §14.1 Threat Area | Threat | Verification Test | SRS Mitigation Source |
| --- | --- | --- | --- |
| Authentication attacks | OTP interception, token theft, credential stuffing | OTP lockout/expiry tests, refresh-token rotation/reuse tests, MFA enforcement, rate-limit tests (§5.4) | §14.1.1 |
| Authorization failures | IDOR, role escalation | Ownership checks, RBAC matrix, deny-by-default (§5.4) | §14.1.2 |
| Data leakage | PII/health-data disclosure via logs, storage, exports, processors | No-PII-in-logs assertion, masked-phone tests, export-scope tests, media signed-URL expiry tests | §14.1.3 |
| AI prompt injection | Jailbreak, instruction override | Prompt-injection suite (§7.4) | §14.1.4 |
| Webhook attacks | Spoofed/replayed messages, forged signatures | Webhook signature tests (§8.3) | §14.1.5 |
| API abuse | DoS, scraping, brute force, cost spikes | Rate-limit and quota tests, WAF/abuse-detection verification | §14.1.6 |
| Insider access | Staff privilege misuse | Least-privilege RBAC tests, segregation-of-duties tests, audit-log completeness | §14.1.7 |
| Malware uploads | Malicious media files | File type/size validation, malware-scan-stub integration, quarantine handling | §14.1.8 |

**Confidence:** High. **Reasoning:** Each verification maps 1:1 to the mitigations the SRS itself lists per threat. **Impact if changed:** A new threat model change (OR-026 reviews) requires new verification tests in this matrix.

### 8.3 Webhook Signature Tests (§7.4.1, §12.4, §14.1.5)

**Confirmed.** The WhatsApp webhook validates `X-Hub-Signature-256` (HMAC-SHA256, constant-time) and rejects mismatches with 401, acknowledging valid payloads with 200 before async processing. GET verification handshake echoes the challenge token or returns 403.

| Test | Verifies |
| --- | --- |
| Valid signature | HMAC recomputed correctly → 200, payload queued |
| Invalid signature | 401, security event logged, no processing |
| Replay | Duplicate message ID deduped |
| Constant-time comparison | Timing behavior (unit-level) |
| GET handshake | Correct `hub.challenge` echoed; wrong verify token → 403 |
| Malformed JSON | 400 |

**Source:** SRS §7.4.1, §12.4, §14.1.5. **Confidence:** High. **Impact if changed:** Any weakening of signature validation reopens the webhook-attack threat (Medium likelihood, §14.1.5).

### 8.4 Attack-Class Coverage (NFR-020)

| Attack Class (NFR-020) | Test Approach |
| --- | --- |
| Injection (SQL/NoSQL/LLM) | Parameterized-query verification via DAST + AI injection suite |
| Cross-site scripting (XSS) | DAST against admin portal; output-encoding assertions |
| CSRF | CSRF-token enforcement tests on state-changing endpoints |
| SSRF | Egress allow-list verification; SSRF probe tests (OWASP A10) |
| Insecure deserialization | Dependency/advisory scanning; rejection of unexpected payload types |
| Abuse/rate-limit bypass | Rate-limit tests across gateway and per-endpoint; header-spoofing attempts |

**Source:** SRS §14.4 OWASP Top 10 mapping, NFR-020. **Confidence:** High.

---

## 9. Performance Testing

### 9.1 Scope and Targets (QR-006, §5.1)

**Confirmed.** QR-006 mandates performance/load testing before release to validate Section 5.1 targets. Configurable reference capacity targets are defined in §5.9 (500+ cohort, 500 concurrent conversations, 5,000 AI interactions/day, ~10,000 outbound messages/day).

| Target | SRS Reference | Acceptance Criterion |
| --- | --- | --- |
| 500+ concurrent active fathers | NFR-001 | Load test at configured concurrency: response-time targets met, no errors |
| API median ≤500 ms, p95 ≤2 s (interactive) | NFR-002 | Measured over test window |
| WhatsApp ack within provider timeout; processing ≤5 s median (excl. AI/transcription) | NFR-003 | Ack timely; processing meets median |
| Async processing (transcription, AI, themes, research ingestion) | NFR-004 | Queued response immediate; completion asynchronous |
| Batch broadcast of full pilot cohort within delivery windows | NFR-005 | All succeed within campaign window; platform rate limits respected |
| Horizontal scaling | NFR-006 | Throughput increases when consumers scaled out; no inconsistency |
| Predictable DB query performance; slow-query threshold | NFR-007 | Slow-query count below threshold; hot queries meet latency |
| Graceful degradation under overload | NFR-008 | Throttling/queueing/reduced AI usage; operator visibility |
| AI generation ≤10 s typical; queued/async long generations | NFR-009 | Median completion within 10 s; progress communicated |

**Confidence:** High. **Impact if changed:** Any target change requires reconfiguring the load model and re-running QR-006 before release; §5.1 targets are binding acceptance criteria.

### 9.2 Load and Concurrency Model (Recommended)

| Test | Design | Source |
| --- | --- | --- |
| Baseline smoke load | Ramp to 500 concurrent virtual fathers on staging with representative API mix (auth, profile, journey, content, journal, checklist, budget) | NFR-001/002 |
| WhatsApp throughput | Simulate 500 concurrent inbound conversations with webhook mocks; assert ack + ≤5 s median processing; burst of ~10,000 outbound/day | NFR-003, NFR-005, §5.9 |
| Broadcast soak | Full-cohort broadcast within configured window; assert rate-limit compliance and queue depth | NFR-005, FR-111 |
| AI latency | Measure `/v1/ai/ask` median ≤10 s (excluding long generations) at 5,000 interactions/day volume; async path for long jobs | NFR-009, NFR-004 |
| DB query profile | Generate pilot-scale data (500 users, ~50 research records/father/month) and profile hot queries; verify index usage, no sequential scans | NFR-007, §5.9 |
| Queue/consumer scaling | Increase consumer replicas; assert throughput scales and queue depth drains (Redis) | NFR-006 |
| Degradation drill | Overload the gateway beyond configured limits; assert throttling/queueing and no wholesale failure; operator alerts fire | NFR-008 |
| Endurance | Sustained mixed load for a defined window to catch leaks (memory, connections, queue backlog) | NFR-002/007, §18.2 |
| Failover test | Kill one instance/provider stub; assert failover within RTO and graceful messages | NFR-011/015, §5.2 |

**Confidence:** High for targets; Medium for test design specifics (engineering decision). **Impact if changed:** Reducing the concurrency model below 500 invalidates the NFR-001 acceptance claim.

### 9.3 Tooling Recommendation

**Recommended:** `k6` or `Artillery` for load generation (scriptable, CI-friendly), `Locust` where Python is preferred, JMeter as a fallback; Prometheus/Grafana or the platform's central observability (§18.2) for metrics capture; AWS/cloud Load Testing or self-hosted runner for distributed generation. Tool selection is subject to evaluation in `12-devops-and-infrastructure-plan.md`; the SRS does not mandate a tool.

**Confidence:** Medium (Recommended). **Impact if changed:** Any load tool with equivalent HTTP-level load generation satisfies QR-006; the evidence artifact (Section 14) is the same regardless of tool.

---

## 10. Mobile Testing

**Confirmed.** §17.4 requires a mobile device matrix (low-end Android, iOS), offline mode, push notifications, and assistive technology (TalkBack/VoiceOver). NFR-035 requires offline-first verification; NFR-032 requires assistive-technology support with dynamic type.

### 10.1 Device Matrix

| Tier | Devices (Recommended) | Rationale |
| --- | --- | --- |
| Low-end Android | Representative low- to mid-range Android devices (the SRS persona: shared or personal low/mid-range Android; A-02) | A-02, Persona 1 (low/mid-range Android, intermittent connectivity) |
| Mid-range Android | Mid-range devices covering current Android API levels | AR-028, §8 |
| Flagship Android + iOS | Flagship Android and iOS devices | NFR-032 (TalkBack/VoiceOver), §17.4 |
| API-level coverage | Android API floor to current; iOS supported versions | AR-028, §8.1 |
| APK sideload | Verify APK build installs and functions equivalently on a device without app store | AR-028 |

**Confidence:** High. **Impact if changed:** Omitting low-end Android devices contradicts A-02 (meaningful share of fathers use low/mid-range Android) and invalidates usability claims (NFR-030).

### 10.2 Offline and Sync Tests (FR-136, AR-025, NFR-035)

| Test | Verifies | SRS Anchor |
| --- | --- | --- |
| Offline journaling/checklist | Journal entries and checklist changes created offline are queued locally | FR-136, AR-025 |
| Queued sync on reconnect | Queued writes sync without data loss or duplication | FR-136, AR-025, §8.5 |
| Conflict-safe merges | Per-field last-write-wins with timestamps; server revision authoritative; no lost writes | §8.5, AR-025 |
| No duplicate records | Sync reconnects/retries produce no duplicates | §8.5 (offline guarantees) |
| Offline emergency content | Emergency and danger-sign content always available offline (pre-cached) | FR-135, UR-004.3 |
| Offline birth-prep module | Hospital preparation checklists and emergency guidance usable offline; sync on reconnect | FR-089, UC-004 |
| Cache budget/LRU | 100 MB cache budget (configurable) with LRU eviction; user content never auto-deleted | §8.5 |
| Kill-switch scenarios | App killed mid-sync, network loss mid-upload — no loss/corruption | §8.5 guarantees |

**Confidence:** High. **Impact if changed:** These tests are the only verification of the offline-first constraint (C-05) and A-02 (intermittent connectivity).

### 10.3 Push Notification Tests

| Test | Verifies | SRS Anchor |
| --- | --- | --- |
| Push delivery | Reminders/notifications delivered on chosen channel with delivery status recorded | FR-042, FR-045 |
| Deep linking | Tapping a notification opens the relevant in-app screen | AR-026 |
| Permission flow | Notification permission requested and handled (granted/denied) | §8.6 |
| Critical bypass | Critical/emergency notifications delivered immediately, bypassing quiet hours | FR-046 |
| Calendar integration | Appointment export/sync to device calendar (ICS) with permission | §8.6 |

**Confidence:** High. **Impact if changed:** Deep-link and critical-bypass regressions directly break FR-046 and AR-026.

### 10.4 Assistive Technology (TalkBack/VoiceOver) (NFR-032, FR-141)

| Test | Verifies | SRS Anchor |
| --- | --- | --- |
| TalkBack/VoiceOver | Core flows (registration, journaling, checklist, emergency guidance) fully operable with screen readers | FR-141, NFR-032, §17.4 |
| Dynamic type | App layout renders correctly at scaled text sizes | NFR-032, FR-141 |
| Content descriptions | Icons/images carry accessible labels | FR-134 (low-literacy, icon-driven UX) |
| Voice-first parity | Voice-note input and audio guidance work (FR-133) | FR-133, UR-004.1 |

**Confidence:** High. **Impact if changed:** Removing assistive-tech testing contradicts NFR-032 and §17.4's explicit mobile-testing requirement.

### 10.5 Low-Bandwidth Tests

| Test | Verifies | SRS Anchor |
| --- | --- | --- |
| Compressed media | Voice/photo delivered compressed within size targets (§5.9: ~5 MB voice / ~2 MB photo post-compression) | FR-137, §7.4.2 |
| Progressive loading/data-saving | Content loads acceptably on constrained/throttled networks | FR-137, A-02 |
| Offline caching effectiveness | Defined content cached and served without network | NFR-035, §8.5 |

**Confidence:** High. **Impact if changed:** Low-bandwidth behavior is core to A-02 (intermittent connectivity) and FR-137.

---

## 11. End-to-End Testing

### 11.1 Critical Journey (Confirmed, §17.4)

**Confirmed.** The critical journey under test is **Registration → Opt-in → Weekly prompt → AI question → Response.** This maps to UC-001/002/003.

| Step | Asserted Behavior | SRS Anchor |
| --- | --- | --- |
| Registration | WhatsApp invitation/QR or app signup; OTP verification; profile capture; consent acceptance recorded (version + timestamp) | FR-001/002/003/005, UC-001 |
| Opt-in | Explicit WhatsApp opt-in recorded; broadcast eligibility established | FR-017, FR-012 |
| Weekly prompt | Correct templated prompt for the father's pregnancy week delivered | FR-014, UC-002 |
| AI question | Grounded answer referencing approved sources; safety classification run; emergency handled if present | FR-059/060/062, UC-003 |
| Response | Response captured, categorized, stored as journal entry; research pipeline receives anonymized record | FR-053, FR-114, UC-002 |

**Confidence:** High. **Reasoning:** The journey steps are literally enumerated in §17.4 and the acceptance criteria in the FR table. **Impact if changed:** This journey is the platform's core value loop (PD-008); its E2E test is mandatory for QR-004/QR-013.

### 11.2 Five Additional Journeys (§17.4)

Per §17.4: **emergency detection and escalation; hospital bag and budget; offline journal sync; campaign delivery; research export governance.**

| Journey | Key Steps Under Test | SRS Anchor |
| --- | --- | --- |
| Emergency detection and escalation | User sends danger-sign message in any state → EMERGENCY response with facility guidance → admin notification → 5-minute follow-up/escalation per §15.3 | FR-025/046/063, §9.6, §15.3 |
| Hospital bag and budget | Open Hospital Preparation at week 34+; toggle checklist items; add shopping item + planned/actual costs; totals/variance/remaining correct; progress reflected in journey; offline availability | FR-086/087/088/089, UC-004, §8.2/8.3 |
| Offline journal sync | Create journal entry/voice note offline; reconnect; queued sync without loss or duplication; entry visible in timeline | FR-051/136, §8.5 |
| Campaign delivery | Admin creates campaign targeting consented segment; template approved; broadcast delivered within window; metrics (delivered/read/reply/opt-out) recorded; opted-out user excluded | FR-107/108/109/112, US-014 |
| Research export governance | Researcher requests dataset → ethics/approval gate → de-identification/aggregation → audited export with no identifiers | FR-116/122, UC-005, §10 |

**Confidence:** High. **Reasoning:** All five journeys are named in §17.4. **Impact if changed:** Removing any journey removes QR-004 coverage for its FR group and weakens QR-013 evidence.

### 11.3 Dashboard Role Tests (§17.4)

| Test | Verifies | SRS Anchor |
| --- | --- | --- |
| Role-based views | Each §14.7 role sees only permitted modules (admin, content, campaign, research, AI ops, support) | FR-094, AR-030, §14.7 |
| Export (role-limited) | Operational report exports (CSV/PDF) respect role scope; research dashboard shows no identifiers | FR-099, AR-032 |
| Campaign scheduling | Campaign creation/scheduling reflects on dashboard; approval status tracked | FR-107/108, US-014 |
| AI ops review queue | Safety alerts and flagged answers appear in the review queue; review actions recorded | FR-067/097, §11.6 |
| Consent-management views | Consent status, version, withdrawal history visible to authorized staff | FR-100, §11.2 |
| Audit-log view | Admin actions appear in the immutable audit view | FR-098 |

**Confidence:** High. **Impact if changed:** Dashboard role tests are the QR-004 anchor for the admin FR groups (FR-094…112).

### 11.4 E2E Tooling and Environment

**Recommended:** Playwright or Cypress for web/admin E2E; Appium or Maestro for native mobile E2E; a real-device cloud or on-premises low/mid-range Android devices for the device matrix. Tests run against a dedicated staging environment provisioned from IaC (`12`), never against production.

| Environment Item | Decision | Source |
| --- | --- | --- |
| E2E environment | Dedicated staging environment with seeded synthetic data, WhatsApp mocks, LLM/ASR stubs or approved test providers | §17.5, QR-012 |
| WhatsApp E2E | Test against mocked provider in CI; optional live sandbox provider for a smoke subset | §17.3, D-01 |
| Data reset | Environment reseeded to a known state before each E2E run (synthetic fixtures) | §17.5 |
| Parallelization | Web E2E parallelized in CI; mobile E2E on device farm/real devices | QR-004 |

**Confidence:** Medium for tools (engineering decision); High for environment isolation (AR-009). **Impact if changed:** Running E2E against production violates AR-009 (environment isolation) and QR-012 (no production data in tests).

---

## 12. Test Data Management

### 12.1 Synthetic Data (QR-012, §17.5)

**Confirmed.** QR-012 mandates synthetic/realistic data with no production personal information in test environments; §17.5 requires synthetic, realistic data generated for all environments, anonymized datasets for research tests, and consent fixtures with realistic consent versions.

| Rule | Decision | Source |
| --- | --- | --- |
| Generation | Synthetic, realistic data generators for profiles, pregnancies (EDD/LMP → week), journals, prompts/responses, checklists, budgets, conversations, campaigns | §17.5, QR-012 |
| Realism | Names, phones (E.164-valid but fake ranges), regions, and Amharic/English text that exercise validators realistically | QR-012, §17.5 |
| No production PII | Dev/staging never contain production personal or health data; enforced by environment isolation (AR-009) and CI data-hygiene checks | QR-012, AR-009 |
| Volume | Pilot-scale volumes (§5.9: 500+ users, ~50 research records/father/month, ~10,000 messages/day) to make performance/DB tests representative | NFR-007, §5.9 |
| Determinism | Seed sets versioned and reproducible so E2E assertions are stable | QR-015 |

**Confidence:** High. **Impact if changed:** Introducing production PII into test environments is a direct QR-012/AR-009 violation and a data-protection incident.

### 12.2 Consent Fixtures

| Fixture | Purpose | Source |
| --- | --- | --- |
| Consent versions | Realistic consent template versions (e.g., `participation.v1`, `research.v1`, `media.v1`, `whatsapp_opt_in.v1`) for grant/withdraw/re-consent flows | §17.5, FR-003/125 |
| Lifecycle states | Granted, withdrawn, re-granted users to exercise consent views and research exclusion | FR-004/125, §13.3.4 |
| Withdrawal effects | Withdrawn users present in fixtures so research/purge and broadcast-exclusion logic is tested with real states | FR-004/017, AR-013 |

**Confidence:** High. **Impact if changed:** Consent fixtures are the only realistic way to test the legally sensitive lifecycle (§14.8) without real consents.

### 12.3 Anonymized Research Datasets

| Rule | Decision | Source |
| --- | --- | --- |
| Research test data | Anonymized/pseudonymized records only, conforming to `research_responses`/`research_users` schema | §10.1.3, §17.5 |
| No identifiers | No names, phones, or direct identifiers in research test tables; `is_anonymized` always true | §10.1.3, FR-119, NFR-027 |
| Export-scope fixtures | Datasets sized for export-governance E2E (UC-005) proving de-identification and audit | FR-116, UC-005 |
| Theme/sentiment seeds | Pre-labeled records for theme-extraction accuracy sampling (§10.1.2) | QR-011, FR-114 |

**Confidence:** High. **Impact if changed:** Research test data containing identifiers would invalidate the privacy suite's proof of pseudonymization (NFR-027).

### 12.4 Data Hygiene in CI

**Recommended:** CI checks assert (a) no PII-pattern fixtures sourced from production, (b) seeded databases are freshly generated per run, (c) exported test dumps contain no real phone/E.164 numbers from production ranges, (d) secrets are never committed (secret scan, §8.1). **Source:** QR-012, NFR-022, §17.5. **Confidence:** Medium (Recommended). **Impact if changed:** Without hygiene checks, the QR-012 guarantee erodes silently over time.

---

## 13. Traceability & Reporting

### 13.1 Requirement-to-Test Traceability (QR-015)

**Confirmed.** QR-015 requires defect and requirement traceability so every requirement has test coverage and status.

| Mechanism | Decision | Source |
| --- | --- | --- |
| Traceability matrix | Requirement-to-test matrix covering every FR/NFR/AR/OR/QR/US/UC (349 requirements per `00`); each requirement links to its test(s) and status | QR-015, `00` §1 |
| Baseline | Start from SRS Appendix B (business requirement → FR → API → DB → security → testing coverage) and extend to all requirement rows | Appendix B, QR-015 |
| Automated linkage | Test IDs reference requirement IDs (e.g., test names/annotations carry `FR-063`); coverage computed from execution results | QR-015 |
| Status per requirement | Each requirement carries test status: Not Started / In Progress / Pass / Fail / Blocked / N/A | QR-015 |
| Verification of completeness | A requirement with no linked test, or a test with no requirement, is flagged in the weekly QA report | QR-015 |

**Confidence:** High. **Impact if changed:** Losing traceability makes the QR-013 gate unprovable and the defect triage (priority vs. requirement) unreliable.

### 13.2 Defect Management

| Process | Decision | Source |
| --- | --- | --- |
| Defect lifecycle | New → Triage → Assigned → Fixed → Verify → Closed (with reopen path); severity (blocker/critical/major/minor/trivial) and priority mapped to QR-013 gate | QR-015, §18.3 (severity/escalation) |
| Blocking classification | Blocker/critical defects block release; major defects reviewed at the QA gate | QR-013, NFR-016 |
| AI-specific defects | Safety events, harmful outputs, hallucination reports tracked in a dedicated AI incident/review queue | OR-010, §18.3 |
| Emergency defects | Any emergency-escalation failure is treated as blocker and paged per §18.3 | §18.3, §15.3 |
| Defect-to-requirement linkage | Every defect references the requirement it violates | QR-015 |
| Flaky-test handling | Flaky tests quarantined with a tracked defect; re-enabled only when stable | QR-015, QR-002 intent |

**Confidence:** High. **Impact if changed:** Weakening defect severity rules undermines the "zero critical/high at release" security claim (NFR-016) and the clinical-safety posture.

### 13.3 Coverage Reporting

| Report | Cadence | Content |
| --- | --- | --- |
| Code coverage | Per PR + nightly | Line/branch coverage per service vs. the 80%/70% floors (QR-002); trend |
| Requirement coverage | Weekly | Requirement-to-test status table (QR-015); % requirements with passing tests |
| Suite health | Weekly | Pass/fail counts, flakiness rate, defect backlog, AI eval score |
| QA gate summary | Per release | Full evidence pack against Section 14 checklist |
| Pilot evaluation report | Post-pilot (QR-018) | Usability, engagement, safety events, program KPIs per Appendix F |

**Source:** SRS QR-002, QR-015, QR-018, Appendix F, §16.2. **Confidence:** High. **Impact if changed:** The reporting cadence is the mechanism by which QA status reaches the QR-013 release decision.

---

## 14. Evidence Required Before Accepting Each Phase

Per SRS Appendix D phases (Phase 0 Planning → Phase 1 Platform Foundation → Phase 2 WhatsApp → Phase 3 AI → Phase 4 Mobile → Phase 5 Admin → Phase 6 Testing & Validation → Phase 7 Pilot) and the backend plan's phased slices (`06`), each phase exits only with its evidence pack. "Evidence" means stored, reviewable artifacts — not verbal assertions.

### Phase 0 — Planning and Design
- SRS validation sign-off and approved requirement inventory (`00`).
- Approved test strategy (this document) and quality-gate checklist (`21`).
- Threat model (STRIDE §14.1) reviewed and documented; DPIA artifacts listed (FR-132).
- Test-data policy (QR-012) and synthetic-data generator plan approved.

### Phase 1 — Platform Foundation
- Unit tests for auth, user/profile, pregnancy, consent services with coverage ≥80% core backend (QR-002) — CI coverage report.
- Integration tests for DB migrations, constraints, consent immutability, retention purge (§17.3) — test results + schema-diff output.
- OpenAPI spec published; contract tests for auth/profile endpoints pass (QR-005).
- SAST + dependency + secret scans clean (or triaged with no critical/high open) — scan reports (QR-007, NFR-016, §16.2).
- API behavior tests pass: OTP flow, error codes §12.1, rate limits, RBAC (QR-003).
- Backup/restore automation in place; first automated restore test passed (NFR-014).

### Phase 2 — WhatsApp Platform
- WhatsApp unit tests for the §7.2 state machine (all states, timeouts, error recovery) — coverage report.
- WhatsApp mock integration suite passes (QR-010, §17.3): signatures, media, statuses, opt-in enforcement, emergency short-circuit — recorded results.
- Webhook signature tests pass (valid/invalid/replay/handshake) (§7.4.1).
- Template approval-gate tests pass (FR-108, AR-021).
- E2E for WhatsApp enrollment portion of the critical journey passes in staging (QR-004).

### Phase 3 — AI Assistant Platform
- AI evaluation-set score ≥90% on the approved eval set (NFR-047) — scored eval report.
- Safety regression suite passes (QR-014): emergency keywords EN/AM, no-diagnosis, grounding boundaries, decline/referral — suite results.
- Prompt-injection suite passes (§14.1.4).
- AI pipeline integration tests pass: ingestion, chunking, embedding, retrieval, reranking, safety layer, model fallback (§17.3) — results.
- Hallucination/accuracy monitoring configured with alerting (FR-071, NFR-050) — dashboard/alert config evidence.
- Bias sampling review recorded (NFR-049, §14.11).
- AI audit records verified (FR-069, AR-020).

### Phase 4 — Mobile Application
- Mobile unit tests pass (Jest frontend) with overall ≥70% floor (QR-002).
- Offline/sync test suite passes: queued sync, conflict-safe merges, no duplicates, offline emergency content (FR-136, AR-025, NFR-035).
- Device-matrix results recorded on low/mid/high Android + iOS (§17.4).
- Push notification and deep-link tests pass (AR-026).
- Assistive-technology tests pass (TalkBack/VoiceOver, dynamic type) (NFR-032).
- Accessibility audit (automated + manual) for app surfaces initiated (QR-008).

### Phase 5 — Administration Platform
- Admin API tests pass: RBAC matrix (§14.7), MFA, session controls, segregation of duties (§5.4) — results.
- Dashboard E2E role tests pass: role views, exports, campaign scheduling, AI ops queue (§17.4).
- Accessibility audit for admin portal completes with WCAG 2.1 AA pass (QR-008, NFR-031) — audit report.
- Campaign integration tests pass: opt-in exclusion, throttling, metrics (FR-109/111/112).
- Research export-governance E2E passes: approval gate, de-identification, audit (UC-005).

### Phase 6 — Testing & Validation (pre-pilot)
- Full unit + integration + E2E suite green across all services — CI report (QR-003/004).
- Coverage ≥80% core backend / ≥70% overall — coverage report (QR-002).
- Security suite green: SAST/DAST/dependency/secret/pen test with zero critical/high open (QR-007, NFR-016) — scan reports + pen-test summary.
- Performance/load results meet §5.1 targets (QR-006, NFR-001…009) — load-test report with measured latencies/throughput.
- Accessibility audit complete (QR-008).
- Privacy test suite green: consent, minimization, export, deletion, pseudonymization (QR-009) — results.
- AI eval ≥90% + safety regression green (QR-014, NFR-047).
- Clinical/content validation of all health content against the authoritative guide complete (QR-019) — review record.
- UAT completed with representative fathers, partners, healthcare workers, administrators (QR-017) — UAT sign-off.
- Release review evidence: rollback readiness, monitoring dashboards, alerting verification (QR-016).

### Phase 7 — Pilot
- Pilot evaluation baseline: usability (task success ≥80%, NFR-030), engagement, safety-event counts, program KPIs (QR-018, Appendix F).
- Emergency false-negative KPI and escalation success rate measured (Appendix F AI Safety KPIs).
- Alerting for emergency escalation failures verified in production monitoring (§18.3).

**Confidence:** High (each evidence item traces to a QR/NFR requirement). **Impact if changed:** Moving a phase boundary changes the required evidence for that phase; this table must be kept in sync with `14-development-phase-roadmap.md` and `21-quality-gate-checklist.md`.

---

## 15. QA Gates

### 15.1 Release Gate (QR-013)

**Confirmed.** QR-013: no production release without unit + integration + E2E tests, security scans, accessibility checks, performance validation, and clinical review of content changes. QR-016 adds release review (rollback readiness, dashboards, alerting). QR-014 adds the AI gate for AI releases.

| Gate | Check | Owner/Evidence | Source |
| --- | --- | --- | --- |
| G0 — Unit | ≥80% core backend / ≥70% overall; no failing unit tests | CI coverage report | QR-002 |
| G1 — Integration | Service contracts + data-flow suites green (incl. consent immutability, retention purge, WhatsApp mocks, AI pipeline) | CI report | QR-003, §17.3 |
| G2 — E2E | Critical journey + five additional journeys + dashboard role tests green on staging | E2E report | QR-004, §17.4 |
| G3 — Security | SAST/DAST/dependency/secret/pen test with zero critical/high open | Scan reports | QR-007, NFR-016 |
| G4 — Accessibility | WCAG 2.1 AA automated + manual pass for web/admin | Audit report | QR-008, NFR-031 |
| G5 — Performance | §5.1 targets met at pilot concurrency | Load-test report | QR-006, NFR-001…009 |
| G6 — Clinical review | Health/content changes validated against authoritative guide | Review record | QR-013, QR-019 |
| G7 — AI gate (AI releases only) | Eval set ≥90% + safety regression suite green | Eval + suite report | QR-014, NFR-047 |
| G8 — Privacy | Consent, minimization, export, deletion, pseudonymization tests green | Suite report | QR-009 |
| G9 — Release review | Rollback readiness, monitoring dashboards, alerting verified; canary health checks pass per §16.2 | Release checklist | QR-016, §16.2 |
| G10 — UAT (pre-pilot) | Representative-user UAT sign-off | UAT sign-off | QR-017 |

**Confidence:** High. **Reasoning:** G0–G10 directly transcribe QR-013's enumerated gate components plus QR-014/016/017. **Impact if changed:** Any gate bypass voids the QR-013 release authorization and must be escalated to program leadership.

### 15.2 Definition of Done for Testing (per item)

A test/check is "done" only when all of these hold:
1. It exists in the automated suite and runs in CI (or is a scheduled/manual check with recorded evidence, e.g., pen test, UAT, clinical review).
2. It passes on the target environment with versioned fixtures.
3. It links to its requirement(s) in the QR-015 matrix.
4. It has no open blocker/critical defects associated.
5. Its evidence artifact (report, log, sign-off) is stored and referenced in the phase evidence pack (Section 14).
6. Flaky tests are quarantined with a tracked defect, not silently skipped.

**Source:** QR-013/015, §16.2. **Confidence:** High. **Impact if changed:** Loosening DoD makes gates pass without the evidence QR-013 requires.

---

## 16. Dependencies and Blockers

| # | Dependency | Blocking Effect If Absent | Resolution |
| --- | --- | --- | --- |
| D1 | Environments (dev/staging) provisioned per `12` (IaC, AR-036) | No place to run integration/E2E/performance/DAST | Deliver staging from `12` before Phase 1 exit |
| D2 | Database schema + migrations (`05`) | DB tests (migrations, constraints, immutability, retention) cannot run | Migration 001 at Phase 1 |
| D3 | OpenAPI contract for all service groups (`06`) | Contract tests (QR-005) and schema validation cannot run | Spec published at each service phase |
| D4 | WhatsApp provider abstraction + webhook (`07`) | WhatsApp mock suite (QR-010) and webhook signature tests blocked | Phase 2 |
| D5 | AI/RAG pipeline + safety layer (`08`) | AI eval, safety regression, prompt-injection, fallback tests blocked | Phase 3 |
| D6 | Mobile app build (`09`) | Device-matrix, offline, push, assistive-tech tests blocked | Phase 4 |
| D7 | Admin portal (`10`) | Dashboard role tests and accessibility audit blocked | Phase 5 |
| D8 | Security tools/licensing (`11`) | SAST/DAST/dependency/secret scans unavailable | Acquire at Phase 1 |
| D9 | Load-generation tooling + monitoring (`12`) | Performance suite (QR-006) cannot be measured | Configure with observability at Phase 1 |
| D10 | Clinical review capacity (QR-019, D-04) | G6 gate cannot pass; content validation blocked | Program + medical reviewer scheduling |
| D11 | UAT participant recruitment (QR-017) | G10 gate cannot pass | Program recruitment before Phase 6 |
| D12 | Research ethics approval for evaluation/test fixtures using anonymized research patterns (D-05) | Research export-governance E2E and anonymization fixtures blocked | Ethics review early |
| D13 | WhatsApp sandbox/test provider access (D-01) | Live smoke subset of WhatsApp E2E blocked | Provider onboarding in Phase 2 |
| D14 | LLM/ASR provider access for eval and transcription tests (D-02) | AI eval and media-processing integration tests blocked | Provider contracts per `02` §6 M-02/M-03 |
| D15 | Test data generator and fixtures (QR-012) | All suites lack deterministic data | Build at Phase 0/1 |

**Confidence:** High. **Impact if changed:** Each dependency maps to a gate in Section 15; late resolution pushes the corresponding evidence into the next phase.

---

## 17. Risks and Mitigations

| # | Risk | Likelihood | Impact | Mitigation |
| --- | --- | --- | --- | --- |
| R1 | Coverage floors (QR-002) not met on schedule | Medium | G0 fails; release blocked | Track per-service coverage in CI from Phase 1; write tests alongside features (TDD), not retrofitted |
| R2 | E2E flakiness delays green runs | High | G2 unreliable; release slips | Quarantine flaky tests with tracked defects; deterministic fixtures; retry policy; parallelization |
| R3 | AI eval accuracy below 90% (NFR-047) | Medium | G7 fails; AI not releasable | Early eval-set construction (Phase 3 start); retrieval-quality tuning; fallback-tier evaluation; iterate before Phase 6 |
| R4 | Emergency false negatives surface late | Low-Medium | Clinical-safety incident | Emergency false-negative suite from Phase 3; keyword + paraphrase coverage; continuous monitoring (NFR-050) |
| R5 | Prompt-injection/jailbreak evades regression set | Medium | Unsafe AI output | Red-team injection cases updated each release; §14.1.4 test suite; human review queue (FR-067) |
| R6 | Performance targets missed under pilot load (NFR-001/002) | Medium | G5 fails | Load model built to §5.9 volumes; early load runs from Phase 1; index review (NFR-007); autoscaling |
| R7 | Broadcast throughput/latency of ~10,000 messages/day (NFR-005) | Medium | Campaign failures, provider rate-limit penalties | Broadcast soak tests; throttling verification (FR-111); provider rate-limit modeling |
| R8 | Security scan findings above zero critical/high (NFR-016) | Medium | G3 fails | Continuous scanning in CI; fix-forward before release; pen test scheduled with buffer |
| R9 | Privacy/consent defect discovered at UAT | Medium | QR-009/QR-013 fail; legal risk | Consent immutability + privacy suite from Phase 1; early privacy review (FR-132) |
| R10 | Test data hygiene slip (production PII in test env) | Low | QR-012/AR-009 violation | CI hygiene checks; environment isolation; access controls |
| R11 | Clinical review bottleneck (QR-019) | Medium | G6 blocks release | Parallel medical review workflow; content review scheduled with content production |
| R12 | UAT participant availability (QR-017) | Medium | G10 blocks pilot | Recruitment plan with program team; remote/WhatsApp-based UAT options |
| R13 | Third-party test provider (WhatsApp/LLM) unavailable | Medium | Integration/E2E smoke blocked | Mock-first strategy (§17.3) so mocks are the CI default; live smoke is optional subset |
| R14 | Traceability matrix drift | Medium | QR-015 unprovable; gate bypass risk | Automated requirement-to-test linkage; weekly coverage report; add requirement-check in CI |
| R15 | Mobile device-matrix access (low-end Android scarcity) | Medium | §17.4 matrix incomplete | Real-device cloud; low/mid-range device procurement from Phase 4 |
| R16 | AI model/prompt change regresses safety | Medium-High | QR-014 gate evasion | Every model/prompt change re-runs eval + safety regression before routing (NFR-049, §14.11) |

**Confidence:** High for R1–R16 source alignment; likelihood/impact ratings are Recommended estimates for prioritization. **Impact if changed:** This register is an input to `16-risk-management-plan.md`; changes to gates or requirements must be reflected in both.

---

## 18. Verification Approach

This section verifies that this plan itself is complete and executable against the SRS. It is not the application test plan; it is the QA-of-the-QA-plan checklist.

| # | Verification | How to Confirm | Status |
| --- | --- | --- | --- |
| V1 | All 19 QR requirements (QR-001…019) have an owning section | Scan this document for QR-001…QR-019 references; each must appear in Sections 2–15 | Performed in §1 table and §2.1 |
| V2 | All §17.2/17.3/17.4/17.5 testing mandates addressed | Check §17 unit frameworks/floors, §17.3 four integration groups, §17.4 critical + five journeys + mobile/dashboard, §17.5 four test-data rules appear | Sections 3, 4, 6, 7, 10, 11, 12 |
| V3 | All §5.1 performance targets have a test owner | NFR-001…009 each mapped in Section 9.1 | Section 9.1 |
| V4 | All §5.2 availability/reliability criteria covered | NFR-010…015 mapped to backup/restore (§6.6), failover (§9.2), release review (§15) | Sections 6.6, 9.2, 15 |
| V5 | All §5.3 security and §14 STRIDE areas covered | NFR-016…024 + all eight §14.1 threat areas mapped in Section 8 | Section 8 |
| V6 | All §5.4 privacy criteria covered | NFR-025…029 mapped to privacy suite (§5.4, §8.2, §12.3) and consent immutability (§6.3) | Sections 5.4, 6.3, 12.3 |
| V7 | All §5.5 usability/accessibility criteria covered | NFR-030…035 mapped to accessibility (§8 of 13 = §QR-008 coverage, Section 8 top-level), mobile (§10), UAT (§15 G10) | Sections 10, 15 |
| V8 | All §5.8 AI quality criteria covered | NFR-046…050 mapped in Section 7 | Section 7 |
| V9 | API §12.1 conventions covered | Error codes, rate limits, versioning, idempotency, authn/z in Section 5 | Section 5 |
| V10 | Database §13 invariants covered | Immutability, constraints, indexes, retention, backup/restore in Section 6 | Section 6 |
| V11 | Evidence checklist is phase-complete | Section 14 covers Appendix D Phases 0–7 with stored artifacts | Section 14 |
| V12 | Gate checklist is requirement-complete | Section 15 gates G0–G10 transcribe QR-013/014/016/017 | Section 15 |
| V13 | No placeholders | Scan for "TBD", "to be defined", "TODO", empty cells | Performed at authoring |
| V14 | Cross-plan consistency | `00` §7 QR inventory, `02` §2.5 QR ownership, `21` gate checklist, `14` roadmap phases align with this plan | To be re-checked at Phase 0 QA sync |
| V15 | Classification labels present | Every decision carries Source / Confidence / Reasoning / Impact-if-changed | Performed at authoring |

**Confidence:** High. **Impact if changed:** The SRS is the controlling authority; if any requirement changes (e.g., a target in §5.1 or a QR), the owning section of this plan must be revised and V1–V12 re-verified in the next QA sync.

---

**END OF DOCUMENT — 13. Testing & Quality Plan (FathersNet / Ayay). Authoring date: 2026-08-05. Controls: SRS §17 QR-001…QR-019, §5 NFRs, §12 API, §13 Database, §14 Security, §16 CI/CD.**
