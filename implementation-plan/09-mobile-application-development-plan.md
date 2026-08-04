# 09. Mobile Application Development Plan

**Document:** FathersNet (Ayay) — Mobile Application Development Plan
**Source of truth:** `docs/FathersNet-Complete-SRS.md` (FN-SRS-001 v2.0)
**Predecessors:** `00-requirement-inventory.md`, `01-current-system-analysis.md`, `02-srs-requirement-analysis.md`, `03-system-architecture-plan.md`, `04-technology-stack-analysis.md`, `05-database-implementation-plan.md`, `06-backend-development-plan.md`
**Scope:** Android-first, iOS-supported cross-platform mobile application: architecture, implementation order (auth → profile → pregnancy journey → weekly engagement → journal → checklist → budget → appointments → offline → synchronization → notifications), offline-first design, localization and accessibility, mobile testing strategy, distribution, dependencies, risks, and verification for the greenfield build.
**Classification convention:** **Confirmed** (SRS-stated) · **Recommended** (engineering decision) · **Configurable** (parameter with default) · **Assumption** (needs human validation). Every recommendation carries **Source**, **Confidence**, **Reasoning**, and **Impact if changed**.

---

## 1. Executive Purpose

### Objective

Define the complete, build-ready implementation plan for the FathersNet (Ayay) mobile application — the primary self-service surface for fathers who prefer an app over WhatsApp. The plan translates the Mobile Application Specification (§8), the mobile architecture requirements (AR-025…AR-029), the mobile-relevant functional requirements (FR-031…FR-037 journey, FR-041…FR-050 reminders, FR-051…FR-058 journal, FR-086…FR-093 birth preparation, FR-133…FR-142 accessibility/offline/localization, FR-146 partner sync), the API contracts (§12), and the quality gates (QR-004, QR-017) into a sequenced, testable, distributable implementation.

The app delivers: the pregnancy journey and timeline, father diary (text/voice/photo), weekly engagement parity with WhatsApp, hospital bag checklist, budget tracker, appointment reminders with ICS export, partner synchronization, and offline-first behavior (§8.1). It is Android-first, iOS-supported, cross-platform, distributed via Google Play and the App Store with APK sideload support (AR-028).

### Components

| Component | Scope | SRS basis |
| --- | --- | --- |
| Mobile app (Android-first, iOS supported) | All self-service surfaces: onboarding, journey, engagement, journal, checklists, budget, reminders, partner sync, offline mode | §8.1; §6.4 UR-001…UR-004 |
| Local-first data layer | SQLite local store, sync queue, conflict-safe merges, encrypted local storage | §8.5; ADR-004; AR-025; AR-027 |
| Sync engine | Offline queued sync + partner synchronization (WebSocket real-time + REST) | §8.4; §8.5; D-04 (`03` §10.2) |
| Push + deep-link layer | Push notifications (primary channel), WhatsApp (secondary), SMS fallback, in-app deep links, ICS calendar export | §8.6; FR-041…FR-050; AR-026 |
| Media pipeline (client side) | Voice-note capture + upload, photo/receipt capture + upload, transcription display | FR-051; FR-055; §12.9; §7.4.2 |
| Localization + accessibility layer | EN/AM, voice-first, low-literacy, TalkBack/VoiceOver, dynamic type, low-bandwidth modes | FR-133…FR-142; NFR-030…NFR-035 |
| Design system | Shared tokens/components consistent with web and WhatsApp visual guidance | AR-029; AR-034; AR-035 |

### Dependencies

| Dependency | Nature | SRS basis |
| --- | --- | --- |
| Backend API platform (auth, users, pregnancy, content, checklists, budget, journal, AI) | Hard — the app is a REST/OpenAPI client of the §12 contracts; readiness per `06-backend-development-plan.md` | §12; FR-159 |
| Backend sync/WebSocket contracts | Hard — offline sync and partner sync require server-side revision semantics and a WebSocket endpoint (engineering addition to §12, per D-04 in `03`) | §8.4; §8.5; D-04 |
| Push provider (FCM; iOS APNs via FCM) | Hard — push is the primary reminder channel (§8.6) and weekly-engagement delivery channel in-app | §8.6; FR-042; D-12 (`03`) |
| OTP SMS delivery in Ethiopia | Hard — phone verification before activation (FR-005); SMS delivery quality in-country is a program dependency | FR-005; §12.2 |
| Voice transcription/translation services (EN/AM) | Hard for voice journaling — transcription display (FR-055) depends on backend ASR pipeline (AssemblyAI primary / Google STT fallback, §9.7) | FR-055; §9.7; D-06 |
| Amharic text-to-speech for audio guidance | Medium — voice-first and low-literacy audio output (FR-133, FR-134, FR-142) require TTS with Amharic support; provider choice open | FR-133; FR-134; FR-142 |
| Clinical/content readiness | Medium — week-by-week content (FR-032) and danger-sign content (FR-092) require approved, localized content from the CMS | FR-032; FR-092; D-04 |
| Budget cap reference amount | Medium — "remaining budget" needs a configurable cap default (program-suggested reference, M-07 in `02`) | §8.3; M-07 |
| Shared design system | Medium — AR-029/AR-034 consistency across app, web, WhatsApp requires tokens defined before mobile screens are built | AR-029; AR-034 |

### APIs consumed

The app consumes the `/v1/` REST/OpenAPI platform (§12.1 conventions: bearer access tokens, standard error codes 400/401/403/404/409/422/429/500, per-user rate limits default 120 req/min, idempotency keys on writes) plus a WebSocket sync channel (engineering addition). Endpoint groups: auth (§12.2), users (§12.3), content (§12.5), checklists (§12.6), budget (§12.7), AI (§12.8), journal (§12.9). Detail per feature in §3.

### Local storage changes

SQLite local database per ADR-004 and §8.5 (100 MB cache budget, configurable, LRU eviction), plus an encrypted keystore/keychain for secrets per AR-027. Tables mirror the canonical model (§13) for the offline-first surface: auth/session, profile/pregnancy snapshot, content cache, checklist items, budget entries, journal entries + media queue, appointment/reminder records, sync queue, and partner-link state. Detailed schema evolution per feature in §3 and §4.

### Tests

Unit, integration, contract, E2E, accessibility, privacy, and performance tests per QR-001; mobile-specific device-matrix, offline, sync-conflict, push, and assistive-technology tests per §17.4; UAT per QR-017. Full detail in §6.

### Verification evidence

The plan's acceptance evidence is the QR-013 release gate (unit + integration + E2E + security + accessibility + performance + clinical review), the §17.4 mobile test matrix results, UAT sign-off (QR-017), and traceability entries in `22-feature-implementation-matrix.md`. Per-step evidence is listed in §3.

---

## 2. Mobile Architecture

### Objective

Lock the mobile architecture so that every SRS mobile requirement maps to a concrete technology and pattern: cross-platform framework choice (§8.1), offline-first local store (ADR-004), encrypted local storage (AR-027), push + deep linking (AR-026), design system consistency (AR-029/AR-034), and sideload/APK distribution (AR-028). Decisions carry Source, Confidence, Reasoning, and Impact if changed per the classification convention.

### Components

| Architecture element | Decision | SRS basis |
| --- | --- | --- |
| Cross-platform framework | React Native (TypeScript) — see §2.1 evaluation | §8.1 (React Native or Flutter); `04` §4 |
| Local store | SQLite on device; offline-first with queued sync | §8.5; ADR-004; AR-025 |
| Encrypted storage | OS keystore/keychain + encrypted SQLite for sensitive data | AR-027; FR-123 |
| Push + deep links | FCM (APNs via FCM) push; custom URI scheme + App Links/Universal Links deep links | AR-026; §8.6; D-12 |
| Design system | Shared tokens/components consumed by app and web; plain-language/voice-first copy | AR-029; AR-034; AR-035 |
| Distribution | Google Play + App Store; APK sideload path | AR-028; §8.1 |
| HTTP/sync client | OpenAPI-generated typed client; REST for CRUD; WebSocket for partner live sync | §12.1; §8.4; D-04 |

### Dependencies

Framework toolchain and CI (React Native CLI + Metro, ESLint/TypeScript, Jest, Detox/Maestro per §17.2/§17.4); backend OpenAPI spec published before client generation; FCM project and Google Play credentials; Apple Developer Program account for iOS (assumption: secured before Phase 4); design tokens from the shared design system (`03` AR-029/AR-034); signing keys for Play/App Store and a separate APK signing key for sideload builds.

### APIs consumed

Same `/v1/` contract set as §1, exercised through an API client generated from the OpenAPI 3.x contract (§12.1, FR-153). Sync/WebSocket contract is an engineering addition recorded in `decision-log.md` (D-04, `03` §10.2).

### Local storage changes

First-version schema created at app scaffold: `meta` (schema version, cache budget), `credentials` (encrypted: refresh token, device fingerprint), `sync_queue` (monotonic sequence numbers), `revisions` (server revision tokens per entity). Feature tables added per §3 steps.

### Tests

Framework smoke tests on the device matrix; encrypted-storage round-trip tests; deep-link routing tests; push-receipt tests (details in §6).

### Verification evidence

Framework decision gate: scaffold builds and runs on low-end Android + iOS (Phase 4 gate, `04` §20); encrypted storage verified by inspection and red-team test (AR-027); deep links verified to open correct screens (AR-026 acceptance criterion).

### 2.1 Framework choice evaluation — React Native vs Flutter

**Decision: React Native (TypeScript) as the mobile framework.**

| Criterion | React Native (TypeScript) | Flutter |
| --- | --- | --- |
| **Source** | SRS §8.1 lists "React Native or Flutter" as the Recommended Reference Architecture; `04-technology-stack-analysis.md` §4 selects React Native | SRS §8.1 explicitly permits Flutter; `04` §4 records it as the documented fallback |
| **Skill availability** | Largest pool; shares TypeScript/React with the Node.js backend (`03` D-06) and Next.js web portal (`04` §5) — one language across app/web/backend reduces team surface (NFR-039) | Dart is a smaller pool; separate from the rest of the stack |
| **Design-system reuse** | AR-029/AR-034 consistency across app + web satisfied with shared tokens and a component model in the same React ecosystem | Requires a separate Dart design-token bridge; drift risk vs the React web portal |
| **CI/repo alignment** | Matches the npm-native GitHub Actions reference pipeline (§16.2: `npm test`, `npm audit`) | Requires a parallel Dart toolchain in the §16.2 pipeline |
| **Low-end Android performance** | Good with disciplined JS-memory/frame budgets; needs tuning on very low-end devices (`04` §4 risk) | Excellent rendering and JIT/AOT performance on low-end devices |
| **Native-module access** | OTP, push, calendar/ICS, keychain, file compression via mature bridge ecosystem | Equally available via platform channels; smaller library ecosystem |

**Recommendation (Confirmed framework candidates / Recommended selection):** adopt React Native (TypeScript). **Source:** SRS §8.1 (Recommended Reference Architecture) + `04` §4 (engineering recommendation; Confidence High on RN+SQLite, Medium on RN-over-Flutter). **Reasoning:** the SRS's own recommended reference names both frameworks; React Native maximizes skill availability, preserves a single TypeScript/React design-system surface across app, web, and backend tooling (AR-029/AR-034, NFR-039), and matches the npm-native CI conventions of §16.2. Flutter's rendering advantages on low-end devices are real but secondary to team and design-system convergence for this project. **Impact if changed:** switching to Flutter changes the mobile codebase, the design-system bridge to web, and the mobile CI toolchain, but every SRS mobile requirement (offline SQLite, sync, push, sideload) is satisfied equally; the decision is reversible without requirement breakage (configurable per `04` §18).

### 2.2 Offline-first local store — SQLite (ADR-004)

| Attribute | Value |
| --- | --- |
| **Source** | ADR-004 (Offline Mobile Storage); §8.5; AR-025; FR-136; `04` §4 |
| **Classification** | Confirmed (SRS decision record); Recommended (implementation approach) |
| **Confidence** | High |
| **Reasoning** | ADR-004 explicitly selects SQLite ("embedded, robust, supports offline writes and content caching"); AR-025 makes offline-first with conflict-safe merges a Must-Have; FR-136 guarantees queued sync with no loss or duplication. SQLite satisfies ADR-004 and the 100 MB LRU cache budget directly. |
| **Impact if changed** | Replacing SQLite (e.g., with WatermelonDB, which is SQLite under the hood, or a full local replica) is acceptable only while ADR-004's offline guarantees hold; an online-only design violates C-05, FR-089/FR-135/FR-136, and persona assumptions A-02 (intermittent connectivity). |

### 2.3 Encrypted local storage (AR-027)

| Attribute | Value |
| --- | --- |
| **Source** | AR-027 (mobile app shall enforce secure local storage: encrypted keystore/keychain, encrypted database for sensitive data); FR-123 (encryption at rest); §14.2 |
| **Classification** | Confirmed (requirement); Recommended (implementation: OS keystore/keychain + SQLCipher or platform-encrypted DB) |
| **Confidence** | High |
| **Reasoning** | AR-027 is explicit: the app must use encrypted keystore/keychain and an encrypted database for sensitive data. Journal entries, voice transcripts, consents, and the phone-derived identity are Highly Confidential (§14.8). Tokens never persist unencrypted; refresh tokens live in the OS secure storage. |
| **Impact if changed** | Plain local persistence would fail AR-027's acceptance and the STRIDE data-leakage threat (§14.1.3); key handling via the OS keystore (not hard-coded keys) is required to avoid cryptographic failures (§14.4 A02). |

### 2.4 Push + deep linking (AR-026)

| Attribute | Value |
| --- | --- |
| **Source** | AR-026 (push notifications and deep linking, Must Have); §8.6 (push primary, WhatsApp secondary, SMS fallback); FR-041…FR-050; D-12 (`03` notification abstraction) |
| **Classification** | Confirmed (requirement); Recommended (FCM + APNs via FCM; App Links/Universal Links + custom scheme) |
| **Confidence** | High |
| **Reasoning** | AR-026 requires that tapping a notification opens the relevant in-app screen. The client therefore registers a push token with the backend (behind the notification-provider abstraction, D-12), and each push payload carries a deep-link route (e.g., `ayay://checklist/hospital-bag`, `ayay://journal/entry/<id>`). Deep links must also support WhatsApp→app handoff (FR-082, FR-001 invitation link). |
| **Impact if changed** | A push-less design fails §8.6's primary reminder channel and FR-042; deep links without cold-start/app-install handling would fail AR-026's tap-to-screen acceptance and FR-082's WhatsApp embedding. |

### 2.5 Design system (AR-029/AR-034)

| Attribute | Value |
| --- | --- |
| **Source** | AR-029 (design system consistent across app, web, WhatsApp visual guidance, Should Have); AR-034 (documented design system used by app and web, Should Have); AR-035 (plain-language/voice-first copy, Must Have) |
| **Classification** | Confirmed (AR-035 copy); Recommended (token/component library implementation) |
| **Confidence** | High |
| **Reasoning** | AR-029/AR-034 require a single design system across surfaces. A shared token set (color, typography, spacing, iconography), component library, and plain-language copy guide — consumed by React Native (app), React/web (admin), and reflected in WhatsApp visual guidance — satisfies both. Low-literacy and voice-first rules (AR-035, FR-134) are encoded in the copy guide, not left to individual screens. |
| **Impact if changed** | Divergent app/web design systems fail AR-029/AR-034 and increase rework when the shared component library later unifies; ignoring AR-035 fails the plain-language audit and low-literacy usability targets (NFR-030). |

### 2.6 APK sideload (AR-028)

| Attribute | Value |
| --- | --- |
| **Source** | AR-028 (store distribution + sideload/APK where stores are inaccessible, Should Have); §8.1 (APK sideload support); D-01/D-03 context (Ethiopian market; app-store access may be limited) |
| **Classification** | Confirmed (requirement); Recommended (signed APK build artifact from CI, published to a program-controlled distribution channel) |
| **Confidence** | High |
| **Reasoning** | A meaningful share of the pilot cohort may lack Google Play access; the APK must install and function equivalently (AR-028 acceptance). The same release artifact (signed APK) is uploaded to Play and made available via a controlled, authenticated link for sideload; version parity and update notifications must be managed because sideload users cannot rely on store auto-update. |
| **Impact if changed** | Dropping sideload fails AR-028 and persona assumption A-02 (low/mid Android, store-inaccessible environments); shipping unsigned or side-loaded builds would create a malware/abuse surface (§14.1.8) and undermine update/security patching. |

## 3. Implementation Order

### Objective

Sequence the mobile build so each increment is testable and independently releasable, respecting the dependency map in `02-srs-requirement-analysis.md` §3 and the Phase 4 delivery gate in `04-technology-stack-analysis.md` §20. Steps are ordered exactly as: **1 Authentication → 2 Profile → 3 Pregnancy Journey → 4 Weekly Engagement → 5 Journal → 6 Checklist → 7 Budget → 8 Appointments → 9 Offline Mode → 10 Synchronization → 11 Notifications**. Auth comes first because every other feature and the offline/online sync boundary depend on an authenticated session and consent records; personalization content surfaces follow the journey; write-heavy and media features (journal) precede the resource-boundary features; offline, sync, and notifications are delivered last because they stabilize and wrap the previously built features.

### Components

| Step | Deliverable | SRS basis |
| --- | --- | --- |
| 1 Authentication | OTP verify, token lifecycle, device registration, session bootstrap | §12.2; FR-005; FR-008 |
| 2 Profile | Onboarding wizard, consents center, pregnancy setup, preferences, account data export/delete | §12.3; FR-003/FR-004; FR-006/FR-007; FR-029; FR-057 |
| 3 Pregnancy Journey | Dashboard, week/trimester banner, EDD countdown, milestone timeline, week content | FR-031…FR-037; §12.5 |
| 4 Weekly Engagement | Weekly prompt + daily pulse + Sunday legacy letter, response capture, journal integration | §7.3.3-7.3.5; FR-053; §10.1.1 |
| 5 Journal | Timeline, text/voice/photo entries, private-by-default, transcription status, tags, export | FR-051…FR-058; §12.9; §7.4.2 |
| 6 Checklist | Hospital bag checklist (5 categories, default items), custom items, progress, transport plan | §8.2; FR-086…FR-093; §12.6 |
| 7 Budget | Budget categories, entries, planned/actual/variance, receipt images, export | §8.3; FR-087; §12.7 |
| 8 Appointments | ANC/Vaccination/Postnatal records, lead-time reminders, ICS export | §8.6; FR-041…FR-050 |
| 9 Offline Mode | Offline content cache, queued writes, LRU eviction, offline-first read path | §8.5; FR-135…FR-137; ADR-004 |
| 10 Synchronization | Field-level sync, conflict-free merges, partner sync (WebSocket) | §8.4; §8.5; AR-025; FR-146 |
| 11 Notifications | Push, deep-link routing, quiet hours, critical bypass | AR-026; FR-041…FR-050 |

### Dependencies

Steps 1–3 are sequential (session → profile → journey). Step 4 depends on 3 (week mapping) and 5 (journal write target) for response persistence; steps 5–7 are independent of each other and can be built in parallel once 1–2 land; step 8 depends on the notification-provider abstraction (D-12) and the backend schedule engine (§7.2); step 9 depends on 5–7 (the writes it must queue); step 10 depends on 9 and on the backend sync/WebSocket contract (D-04); step 11 depends on 8's notification wiring and wraps all prior screens with deep-link routes.

### APIs consumed

As in §1 and §2; each step lists its endpoint groups and contracts under "APIs consumed".

### Local storage changes

The app schema grows incrementally per step; each step lists its tables and migrations.

### Tests

Each step ships unit + integration tests and its acceptance evidence (QR-013 gates apply per release).

### Verification evidence

Per-step evidence = automated tests green on CI, E2E pass on the device matrix, and traceability rows in `22-feature-implementation-matrix.md`. Step acceptance criteria are enumerated below.

### 3.1 Authentication

**Objective:** Register and verify the father's phone number (OTP), create the session, and bootstrap identity — including cross-linking with WhatsApp so the same father recognizes the app and WhatsApp experiences as one account (FR-008).

**Components:**
- OTP request/verify screens (FR-005) with device fingerprint submission (§12.2)
- Session store: access + refresh tokens with rotation and revocation semantics (§14.6)
- Device registration for push (placeholder channel until step 11)
- WhatsApp identity-linking handshake (FR-008; account uniqueness A-03)

**Dependencies:** OTP SMS delivery (in-country program dependency); backend auth endpoints live (`06`); OpenAPI client generated from published contract (FR-153).

**APIs consumed:** `POST /v1/auth/otp/request` (rate limit 5/15 min per phone), `POST /v1/auth/otp/verify` (returns access_token/refresh_token, expires_in 900s default), `POST /v1/auth/refresh`, `POST /v1/auth/logout`, `GET /v1/auth/device` (§12.2; error codes 401/403/422/429).

**Local storage changes:** `credentials` (encrypted: access token TTL 15 min, refresh token in keystore, device fingerprint, token version); `device` (push token, platform); `session` (auth status, user id, current OTP pending state).

**Tests:** OTP flow unit + contract tests (rate-limit 429 handling, wrong-code 422); token refresh/rotation integration tests (401 → refresh → retry); revoked-token tests (§14.6); encrypted-storage round-trip for tokens (AR-027); WhatsApp-link conflict test (account already registered to another channel, A-03).

**Verification evidence:** E2E: fresh install → OTP verify → session active → refresh survives kill/restart; traceability rows FR-005, FR-008; STRIDE spoofing mitigation verified (rate limiting + fingerprint).

### 3.2 Profile

**Objective:** Complete the onboarding wizard, record consents, set up the pregnancy, and manage preferences and personal data rights (FR-003, FR-004, FR-006, FR-007, FR-029, FR-057).

**Components:**
- Onboarding wizard: name, relation, consent to data handling (privacy-first, C-03)
- Pregnancy setup: EDD and/or LMP, trimester/week calculation (week 1–45 check)
- Preferences: language (EN/AM), quiet hours, notification channels, content categories (§13 user_preferences)
- Data rights: export my data (FR-057), delete account (FR-007)
- Consents center (withdraw consent flow)

**Dependencies:** Steps 1 session; consents and preferences endpoints live; localization strings ready for wizard (step 5 groundwork can proceed in parallel).

**APIs consumed:** `GET/PATCH /v1/users/me`, `PUT /v1/users/me/pregnancy`, `PUT /v1/users/me/preferences`, `GET /v1/users/me/consents`, `POST /v1/users/me/consents/:id/withdraw`, `POST /v1/users/me/export` (§12.3).

**Local storage changes:** `user` (name, relation, language, timezone); `pregnancy` (EDD, LMP, calculated week/trimester, CHECK constraint mirror of §13); `consents` (id, status, withdrawn_at); `preferences` (quiet_hours JSON, notification_channels JSON, content_categories JSON).

**Tests:** Wizard unit + E2E (all field validations, week calculation boundaries 1 and 45); consents E2E (withdraw updates server + local); export flow (file download + journal included, FR-057); delete flow (server + local wipe, FR-007).

**Verification evidence:** E2E: onboarding → pregnancy set → consents recorded → export produced → account deleted; traceability FR-003, FR-004, FR-006, FR-007, FR-029, FR-057; privacy review (§14.7) passed.

### 3.3 Pregnancy Journey

**Objective:** Render the father's pregnancy journey: personalized dashboard, week/trimester indicator, EDD countdown, milestone timeline, and week-by-week content (FR-031…FR-037).

**Components:**
- Dashboard: current week + trimester banner (FR-031), EDD countdown (FR-037)
- Milestone timeline (FR-033) and support actions (FR-035)
- Week-by-week content reader (FR-032) with content cache foundation (extends into step 9)
- Milestone notification triggers (data for step 11)

**Dependencies:** Step 2 pregnancy data; content endpoints and localized content live (FR-032, content readiness); design tokens available (AR-029).

**APIs consumed:** `GET /v1/content?week=&lang=` and `GET /v1/content/:id` (§12.5).

**Local storage changes:** `content_cache` (entity_id, week, lang, payload, size_bytes, last_access) sized against the 100 MB budget with LRU marking (step 9 hardens eviction).

**Tests:** Week/trimester/EDD calculations (boundary tests weeks 1/12/13/27/28/45); timeline rendering (empty → full); content reader offline-lite (cached content renders with no network); localization switch EN/AM re-renders (FR-138).

**Verification evidence:** E2E journey for a sample pregnancy yields correct banner/countdown; content renders for EN and AM; traceability FR-031…FR-037; QR-017 UAT walkthrough of the journey.

### 3.4 Weekly Engagement

**Objective:** Match the WhatsApp weekly-engagement cadence in-app: weekly prompt (weeks 1–40), daily pulse, and Sunday legacy letter, with responses persisted as journal entries (FR-053) so the app and WhatsApp experiences stay in sync.

**Components:**
- Weekly prompt delivery (day-aligned with WhatsApp cadence §7.3.3) with 7-day answer window / 48 h reminder (escape table)
- Daily pulse categories: Financial & Logistics / Myth Collection / Clinic Experience / Support Actions (§10.1.1) with 24 h answer window
- Sunday legacy letter to the future child (§7.3.5)
- Response capture → private journal entry auto-creation (FR-053) with category tags
- WhatsApp parity check: same prompt available regardless of channel

**Dependencies:** Step 3 week mapping; journal backend (§12.9) and content/prompt endpoints live; notification abstraction (D-12) wired enough for in-app prompts (full push in step 11).

**APIs consumed:** prompt and pulse delivery endpoints (§12 content group); journal entry creation (`POST /v1/journal/entries`) for response persistence.

**Local storage changes:** `engagement` (prompt_id, type, window, answered_at, reminder_sent_at); responses written through the same journal path as step 5 (single write queue).

**Tests:** Cadence unit tests against escape table (7-day window, 48 h reminder, 24 h pulse window); response → journal entry E2E with category tags; duplicate-answer prevention (FR-136 no-loss/no-dup); WhatsApp parity scenario test (prompt answered in WhatsApp reflects in-app, FR-008).

**Verification evidence:** E2E: simulated week-1 father receives prompt, answers, entry appears private-by-default in journal; traceability FR-053, §10.1.1; cross-channel parity evidence for FR-008.

### 3.5 Journal

**Objective:** Full father diary: timeline of entries (FR-051), text/voice/photo capture (FR-051, FR-055), private-by-default (FR-052, FR-054), transcription status lifecycle, AI-supported tags/suggestions (FR-056), export (FR-057).

**Components:**
- Timeline view with date grouping and photo/video thumbnails (FR-051)
- Entry composer: text; voice recorder → upload for transcription (FR-055); photo capture; location optional
- Privacy toggle with private-by-default enforced in UI and sync (FR-052, FR-054)
- Transcription status: pending → done/failed (mirrors §13 journal schema), retry path
- AI tags/suggestions display (FR-056, §12.8) with explicit attribution
- Export PDF/JSON (FR-057); delete with confirmation

**Dependencies:** Step 2 identity; media + journal endpoints live (§12.9, `POST /v1/journal/media`); ASR pipeline available for transcription display (D-06, §9.7); AI endpoint available for tags (FR-056).

**APIs consumed:** `GET/POST /v1/journal/entries`, `GET/PATCH/DELETE /v1/journal/entries/:id`, `POST /v1/journal/entries/:id/share` (partner, step 10), `POST /v1/journal/media` (§12.9).

**Local storage changes:** `journal_entries` (id, content, privacy, entry_type, created_at, revision, server_id, sync_state); `media` (local_uri, server_uri, mime, bytes, upload_state, transcription_status); media sizes accounted against the 100 MB budget; journal records marked never-LRU-evict (metadata preserved even if media cached out).

**Tests:** Entry CRUD + privacy E2E (private entries never sync-shared); voice upload + transcription status transitions (incl. failed retry); media upload resume (FR-136); export includes journal (FR-057); AI tag display with attribution; large-media LRU behavior (media evicts, metadata persists).

**Verification evidence:** E2E: create text/voice/photo entries → transcribe → tag → export → delete; privacy audit (no private content in shared sync); traceability FR-051…FR-058; memory/disk profile within budget on device matrix.

### 3.6 Checklist

**Objective:** Hospital bag checklist (FR-086, FR-088) with the exact default categories and items from §8.2, per-item progress, custom items, transport plan + emergency contacts (FR-093), and linkage to budget (FR-087).

**Components:**
- Checklist grouped by category: **Documents** (ID Card, ANC Card, Birth Plan, Insurance Card, Hospital Registration Form, Test Results); **Mother** (Nightgown, Slippers, Underwear, Robe, Nursing Bra, Breast Pads, Maternity Pads); **Baby** (Onesies, Swaddle blankets, Diapers, Baby hat, Socks, Baby blanket); **Hygiene** (Soap, Towels, Washcloth, Toothbrush, Toothpaste, Comb); **Extras** (Phone charger, Power bank, Snacks, Water bottle, Cash)
- Check/uncheck with per-category and overall progress (FR-088)
- Custom items (add/edit/delete) — sync-scope decision: custom items sync per §8.4 shared checklist when linked
- Transport plan + emergency contacts (FR-086, FR-093)
- Link items to budget estimates (FR-087 → step 7)

**Dependencies:** Step 2 identity; checklist endpoints live (§12.6); default checklist template shipped from content (DB seed per §13 checklist catalog).

**APIs consumed:** checklist catalog and user-checklist endpoints (§12.6).

**Local storage changes:** `checklist_items` (id, category, name, is_default, checked, custom, order, revision, sync_state); `checklist_links` (item ↔ budget estimate, FR-087).

**Tests:** Default-catalog integrity test (exact §8.2 categories/items); progress math (0→100%, per-category); custom item CRUD + offline queue (step 9/10); emergency contacts validation (FR-086); budget-link reconciliation (item estimate shows in step 7).

**Verification evidence:** E2E: default checklist loads exactly per §8.2 → check items → progress updates → add custom item → transport plan saved; traceability FR-086…FR-088, FR-093; content seed diff-check against §8.2.

### 3.7 Budget

**Objective:** Budget tracker per §8.3: categorized expenses, planned vs actual vs variance, remaining budget against a configurable cap default, receipt capture (FR-087), and CSV export.

**Components:**
- Categories: Transport, Medical, Baby Items, Food, Clothing, Equipment, Emergency Fund, Other (defaults, user-extensible)
- Entry fields: category, item_name, planned_amount, actual_amount, date, notes, receipt_image (§8.3)
- Calculations: total planned, total actual, variance per category and overall, remaining budget (cap configurable; M-07 program reference default)
- Receipt image capture → media pipeline (same as step 5)
- CSV export for offline budgeting

**Dependencies:** Step 2 identity; budget endpoints live (§12.7); receipt image upload via media endpoints; cap configurable value agreed (M-07).

**APIs consumed:** budget category and entry endpoints (§12.7); media upload for receipt_image (§12.9 media).

**Local storage changes:** `budget_categories` (id, name, is_default, order); `budget_entries` (id, category_id, item_name, planned_amount, actual_amount, date, notes, receipt_media_id, revision, sync_state); aggregate cache (totals per category).

**Tests:** Calculation unit tests (planned/actual/variance/remaining, zero and negative cases); entry CRUD + category defaults; receipt upload + retry (FR-136); export correctness; offline entry queued then synced without duplication (FR-136).

**Verification evidence:** E2E: add planned + actual entries across 2 categories → totals/variance correct → attach receipt → export CSV → offline add → online reconcile; traceability FR-087, §8.3; UAT spot-check (QR-017).

### 3.8 Appointments

**Objective:** Appointment management for ANC, vaccination, and postnatal schedules: add/remind/snooze/complete, lead-time reminders at 1 week / 3 days / 1 day / 2 hours (§8.6), channel escalation (push → WhatsApp → SMS), and ICS calendar export.

**Components:**
- Appointment records: type (ANC/Vaccination/Postnatal), date/time, provider, notes, status
- Reminder engine client-side with lead times 1wk/3d/1d/2h (§8.6) as the in-app schedule; server schedules push (step 11)
- Channel escalation: push primary, WhatsApp secondary, SMS fallback (§8.6, D-12)
- ICS export to device calendar (and file share)
- Quiet-hours awareness (FR-043) with critical-appointment bypass (FR-046)

**Dependencies:** Step 2 preferences (channels, quiet hours); backend reminder/scheduler (§7.2, FR-163) and notification abstraction (D-12); ICS/calendar library on device.

**APIs consumed:** appointment CRUD endpoints (§12.4/§12.6 groups where applicable per `06` mapping); notification-token registration (push, step 11).

**Local storage changes:** `appointments` (id, type, scheduled_at, lead_times JSON, status, revision, sync_state); `reminder_queue` (local due reminders derived from lead times); exported-ICS record (avoid duplicate calendar imports).

**Tests:** Lead-time derivation unit tests (1wk/3d/1d/2h from scheduled_at); escalation logic (push fail → WhatsApp → SMS) with provider stubs (D-12); ICS export parse-back test; quiet-hours suppression vs critical bypass (FR-043, FR-046); duplicate-reminder prevention (FR-136).

**Verification evidence:** E2E: create appointment → verify four lead-time reminders at correct offsets → ICS file exports and re-imports cleanly → critical appointment fires during quiet hours; traceability §8.6, FR-041…FR-050.

### 3.9 Offline Mode

**Objective:** Full offline-first behavior per §8.5 and ADR-004: cached content and data readable offline, writes queued with monotonic sequence numbers, per-field last-write-wins conflict resolution, no loss or duplication (FR-136), low-bandwidth mode (FR-137), offline emergency content (FR-135).

**Components:**
- 100 MB configurable cache budget with LRU eviction (media first, journal metadata never evicted)
- Offline emergency content pinned (FR-135): danger signs, hotline, essential birth info
- Write path: all mutations append to sync queue with monotonic sequence numbers before network
- Read path: reads served from SQLite; network only when cache misses and online
- Low-bandwidth mode: image compression, deferred media, text-first (FR-137)
- Conflict-safe merge: per-field last-write-wins with server revision tokens (AR-025)

**Dependencies:** Steps 1–8 data model complete (the offline layer wraps them); sync/WebSocket backend contract (D-04); cache budget configuration exposed in settings.

**APIs consumed:** standard CRUD reads (cache-refresh) and the sync endpoint for batch queue flush (engineering addition, D-04).

**Local storage changes:** `sync_queue` (local_seq monotonic, entity, entity_id, operation, payload, status, attempt, last_error); `revisions` (entity_id, server_revision, local_revision); `cache_meta` (budget_bytes, current_bytes, eviction policy counters); `pinned_emergency` (FR-135 content pinned and LRU-exempt).

**Tests:** Airplane-mode E2E (all reads work from cache; writes queue; re-connect flush with no dup/no loss, FR-136); LRU eviction unit tests (budget respected, journal metadata survives, FR-135 pinned survives); sequence monotonicity invariant test; per-field LWW conflict matrix tests (both directions); low-bandwidth mode toggle behavior (FR-137).

**Verification evidence:** Full offline walkthrough on device matrix (start offline → use journey/journal/checklist/budget → online → clean sync); traceability §8.5, FR-135…FR-137, AR-025; QR-013 performance/device review passes.

### 3.10 Synchronization

**Objective:** Bidirectional, conflict-safe synchronization of all user data, plus partner synchronization (shared journal opt-in, shared checklists, shared milestones) per §8.4 with mutual-accept linking and WebSocket live sync.

**Components:**
- Field-level sync engine (per-field last-write-wins) with monotonic sequence flush (from step 9)
- Partner linking: mutual-accept invite flow (§8.4), unlink flow, consent records
- Shared journal entries (opt-in only, FR-146) and shared checklists/milestones (§8.4)
- WebSocket live updates when both partners online; queued fallback when offline
- Sync status UI (last synced, pending count, per-entity errors)

**Dependencies:** Step 9 queue and revisions; backend sync/WebSocket contract live (D-04); partner-link endpoints live (FR-146); privacy consent design approved (C-03).

**APIs consumed:** sync flush endpoints; partner link endpoints (`POST /v1/users/me/partner/link`, accept/unlink per §12.3 extension); shared-journal/share endpoints (`POST /v1/journal/entries/:id/share`, FR-146); WebSocket channel for live updates.

**Local storage changes:** `partner` (linked_partner_id, state: pending/accepted/revoked, accepted_at, revoked_at); `shared_journal` (entry_id, share_state, shared_with); `ws_state` (connection state, last cursor); revision store extended for shared entities.

**Tests:** Sync convergence tests (same entity edited offline by both devices → per-field LWW converges to expected value, AR-025); partner link lifecycle (invite → accept → share → unlink → consent revoked); WebSocket live-update test + offline fallback; no-loss/no-dup invariant across reconnect storms (FR-136).

**Verification evidence:** Two-device E2E (partner A offline edits shared checklist item, partner B edits different field online → both converge without data loss); link/unlink consent trail audit (C-03, §14.7); traceability §8.4, FR-146, AR-025.

### 3.11 Notifications

**Objective:** Final notification layer wrapping all features: push registration and delivery (primary), WhatsApp and SMS fallback (secondary, via backend D-12), in-app notification center, deep-link routing to the correct screen (AR-026), quiet hours (FR-043) with critical bypass (FR-046).

**Components:**
- Push token registration + refresh (FCM; APNs via FCM)
- Deep-link router: `ayay://` scheme + App Links/Universal Links for every routable screen (AR-026); cold-start and background handling
- Notification center (read/unread history) and per-type settings (content categories)
- Quiet hours honored; critical appointment/danger notifications bypass (FR-046, FR-092)
- Weekly engagement delivery through this layer (final parity with WhatsApp cadence, step 4)

**Dependencies:** Steps 8 schedule + 4 engagement feed; FCM project and store credentials; backend notification abstraction (D-12) and push templates; iOS APNs entitlement (assumption).

**APIs consumed:** push token registration endpoint; notification history endpoint; backend push/WhatsApp/SMS dispatch via D-12 (app receives, not sends).

**Local storage changes:** `notifications` (id, type, title, body, deep_link, received_at, read_at); `push_token` (token, platform, updated_at, rotation); quiet-hours cached from preferences.

**Tests:** Push receipt E2E (foreground/background/terminated) with deep-link routing assertions (AR-026 acceptance: tap → correct screen); quiet-hours suppression vs critical bypass (FR-046); notification-center read/unread; token rotation on expiry/revocation; fallback escalation (push down → WhatsApp → SMS) via provider stubs.

**Verification evidence:** E2E across all notification types (appointment reminder, weekly prompt, milestone, danger, partner-shared update) with tap-to-screen verified; traceability AR-026, FR-041…FR-050, FR-092, FR-046; QR-013 release review + QR-017 UAT sign-off.

## 4. Offline-First Design

### Objective

Define the offline-first architecture that satisfies §8.5 and ADR-004 in production: the device is the source of truth while offline, the server converges on reconnect without loss or duplication (FR-136), and the 100 MB cache with LRU eviction never starves the features that matter (journal metadata, FR-135 emergency content).

### Components

| Component | Design | SRS basis |
| --- | --- | --- |
| Local store | SQLite (ADR-004) with schema mirroring §13 canonical tables; single write path via repository layer | §8.5; ADR-004 |
| Cache budget | 100 MB, configurable in settings; byte-accounted media and content cache; LRU eviction | §8.5 |
| Write path | All mutations → `sync_queue` with monotonic sequence numbers (per-device) before network; idempotent replay by server | §8.5; FR-136 |
| Read path | Reads served from SQLite; network refresh only for missing entities while online; optimistic UI with rollback | §8.5; FR-137 |
| Conflict resolution | Per-field last-write-wins using server revision tokens and per-field timestamps; server is merge authority on tie | AR-025; §8.5 |
| Low-bandwidth | Text-first mode, media deferred/compressed, batch sync flushing | FR-137 |
| Emergency content | FR-135 danger-sign/hotline content pinned; LRU-exempt | FR-135 |

### Dependencies

Sync/WebSocket backend contract (D-04, `03`); OpenAPI client generation for the sync endpoint; cache-budget configuration UI; SQLCipher/encrypted DB integration (AR-027) before sensitive offline writes ship.

### APIs consumed

Standard CRUD (cache refresh + mutation sync) plus the batch sync endpoint and WebSocket cursor (D-04 engineering addition). All writes carry idempotency keys (§12.1).

### Local storage changes

`sync_queue`, `revisions`, `cache_meta`, `pinned_emergency` tables (schema in §3.9); per-entity `sync_state` columns on journal/checklist/budget/appointment tables; migration framework with schema version (per FR-164 mobile-side parity).

### Tests

Airplane-mode full workflow; LRU budget invariants; sequence monotonicity; per-field LWW matrix; reconnect-storm no-loss/no-dup; encryption-at-rest on offline queue (AR-027); see §3.9 and §6.

### Verification evidence

Offline walkthrough evidence (recorded on low-end + mid Android and iOS), QR-013 performance review, traceability rows §8.5, FR-135…FR-137, AR-025, FR-136.

---

## 5. Localization & Accessibility

### Objective

Ship EN and AM localizations (FR-138) with a voice-first, low-literacy experience (FR-133, FR-134) that is fully operable through TalkBack/VoiceOver and dynamic type (FR-140, FR-141), including low-bandwidth fallbacks (FR-137).

### Components

| Capability | Design | SRS basis |
| --- | --- | --- |
| Localization | EN + AM (fr-FR/Arabic marker: AM = Amharic per §10 localization); full string extraction, RTL-aware layout if applicable, server content bilingual (FR-032) | FR-138; §10.5 |
| Voice-first | Voice capture everywhere text is input-heavy (journal FR-055); audio guidance for low-literacy (FR-133, FR-142 TTS with Amharic support) | FR-133; FR-142; FR-055 |
| Low-literacy | Plain-language copy per AR-035, iconography + illustration-first UI, minimal text walls, speakable confirmations | FR-134; AR-035; NFR-030 |
| Screen readers | Full TalkBack (Android) and VoiceOver (iOS) labels, correct roles/state announcements, order | FR-140; FR-141 |
| Dynamic type / touch | Text scaling to 200%, minimum 44pt touch targets, contrast AA | FR-141; NFR-032 |
| Low-bandwidth | Text-first default under constraint, TTS instead of video, compressed media (FR-137) | FR-137 |

### Dependencies

Amharic translation quality review (program), Amharic TTS provider selection (open — assumption), content team localization of week-by-week and emergency content, design-system tokens for accessibility states (AR-029/AR-034).

### APIs consumed

`GET /v1/content?...lang=am` (FR-032); AI endpoint for plain-language simplification if adopted; media transcription for voice (D-06).

### Local storage changes

Locale preference in `preferences`; downloaded-language content partitions in `content_cache`; pinned emergency content in both locales (FR-135).

### Tests

TalkBack/VoiceOver walkthroughs of every step-3.1–3.11 flow; dynamic-type scaling test; AM string completeness test (no missing keys, no truncation); contrast/AA audit; low-literacy usability testing (QR-017 UAT participants); low-bandwidth behavior tests (FR-137).

### Verification evidence

Accessibility E2E scripts recorded per device, WCAG AA audit report (NFR-030/032), localization completeness report (FR-138), usability-test findings with UAT (QR-017).

---

## 6. Mobile Testing Strategy

### Objective

Deliver QR-001-aligned quality with mobile-specific rigor per §17.4: a device matrix, offline and sync-conflict tests, push and deep-link tests, assistive-technology tests, plus the QR-013 release gate and QR-017 UAT for the mobile surfaces.

### Components

| Layer | Tooling / scope | SRS basis |
| --- | --- | --- |
| Unit | Jest for RN components/utilities (calculations, sync, LWW, lead times) | §17.2; QR-001 |
| Integration/contract | API-client contract tests against the OpenAPI spec (§12.1); DB migration tests | FR-153; FR-164 |
| E2E | Detox/Maestro scenarios for every step 3.1–3.11 journey | §17.4; QR-001 |
| Device matrix | Low-end Android (e.g., Android 8/2GB) + mid Android + current iOS; landscape, dark mode, 200% text | §17.4; NFR-032 |
| Offline/sync | Airplane-mode journeys, reconnect storms, two-device partner convergence | §8.5; FR-136; AR-025 |
| Push/deep-link | FCM + APNs sandbox, foreground/background/terminated, tap-to-screen | AR-026; FR-041…FR-050 |
| Accessibility | TalkBack/VoiceOver automation + manual, WCAG AA audit | FR-140/141; NFR-030 |
| Privacy/security | Encrypted storage inspection, token rotation, red-team STRIDE walkthrough | AR-027; §14.1 |

### Dependencies

CI runners with Android emulators + iOS simulators (GitHub Actions per §16.2), FCM/APNs test credentials, device lab for physical-device smoke, UAT cohort access (QR-017).

### APIs consumed

Same app contracts under test; test-double provider stubs for push/WhatsApp/SMS dispatch (D-12).

### Local storage changes

None (test-only build config: test seeds, cleared DB between suites).

### Tests

As tabulated above; gate = unit + integration + E2E + security + accessibility + performance green, plus clinical review for content surfaces (QR-013).

### Verification evidence

CI test reports retained per release, device-matrix matrix report, accessibility audit, QR-017 UAT sign-off, QR-013 release-gate checklist for mobile artifacts.

## 7. Distribution

### Objective

Ship the app through Google Play and the App Store with a sideload/APK path (AR-028), version parity across channels, and store-review readiness per the QR-013 gate.

### Components

| Channel | Approach | SRS basis |
| --- | --- | --- |
| Google Play | Internal/closed testing → production; same signed release artifact as sideload | AR-028; §8.1 |
| Apple App Store | TestFlight → App Review; iOS entitlement + privacy nutrition labels (§14.7) | §8.1; NFR-037 |
| APK sideload | Signed APK artifact from CI, published to program-controlled authenticated link; update notifications for sideload users | AR-028 |
| Versioning | semantic version; artifact metadata matches store listing; parity enforced between Play, TestFlight, sideload | NFR-037; QR-013 |
| Release notes / screenshots | Localized EN/AM store assets; screenshots on device matrix | QR-013 |

### Dependencies

Play Console + Apple Developer Program accounts (assumption), signing keys + APK signing key, FCM project live, privacy-policy URL and consent text approved (§14.7), store screenshots from design system.

### APIs consumed

None additional (release metadata via CI secrets).

### Local storage changes

None; app version stored in `meta` for update checks.

### Tests

Store-submission checklist (QR-013), signed-APK verification (signature check on install), sideload install E2E on storeless device (AR-028), version-downgrade guard test, update-notification smoke.

### Verification evidence

Published store listings (or TestFlight/closed-track), sideload install evidence per AR-028 acceptance, QR-013 release review passed, QR-017 UAT on distributed builds.

---

## 8. Dependencies and Blockers

### Objective

Enumerate external and internal dependencies with owner, status, and unblock path so mobile delivery is not stalled by a hidden party.

| # | Dependency | Blocking | Owner | Status / Notes |
| --- | --- | --- | --- | --- |
| D-01 | Backend §12 endpoints live (auth, users, content, checklist, budget, journal) | Steps 1–8 | `06` | Must precede each step's contract tests (FR-159) |
| D-02 | Sync/WebSocket backend contract (D-04) | Steps 9–10 | `03`/`06` | Engineering addition to §12; gate for offline flush + partner sync |
| D-03 | Notification abstraction + push provider (D-12) | Steps 8, 11 | `03`/`06` | FCM project; APNs entitlement assumption |
| D-04 | OTP SMS delivery in Ethiopia | Step 1 | Program | In-country SMS reliability; fallback window/timing per §12.2 |
| D-05 | ASR for Amharic voice (D-06) | Step 5 | `06` | AssemblyAI primary, Google STT fallback (§9.7) |
| D-06 | Amharic TTS provider | Step 5/§5 | Program | Open selection — assumption to validate |
| D-07 | Localized content (week-by-week, emergency, store copy) | Steps 3, 4, 7 | Content team | EN/AM complete before content-surface releases |
| D-08 | Design tokens / shared design system (AR-029/AR-034) | All UI | `03`/Design | Consumed before screen build |
| D-09 | Budget cap reference value (M-07) | Step 7 | Program | Configurable default; not a hard blocker |
| D-10 | Apple Developer Program + Play Console accounts | §7 | Program | Assumption — secure before Phase 4 |
| D-11 | Encryption/keystore design sign-off (AR-027) | §2, steps 5/9 | `03` | SQLCipher choice validated by security review |
| D-12 | Clinical review of content surfaces | Steps 3, 4, §3.9 | Clinical | QR-013 gate input |

### Dependencies

Tracking in `version.md` and the feature matrix (`22-feature-implementation-matrix.md`); each blocker has an owner column above.

### APIs consumed

n/a (external-dependency registry).

### Local storage changes

n/a.

### Tests

Blocker unblocks verified by the step-level contract tests they gate.

### Verification evidence

Blocker status report updated each sprint; QR-013 gate evidence.

---

## 9. Risks and Mitigations

### Objective

Register the mobile-specific risks and their mitigations so they are tracked, not discovered at release.

| # | Risk | Likelihood / Impact | Mitigation |
| --- | --- | --- | --- |
| R-01 | Low-end Android performance (RN overhead) | Medium / High | Early device-matrix benchmarks, frame/memory budgets, text-first mode (FR-137), Flutter fallback documented (`04` §4) |
| R-02 | Offline sync data loss or duplication | Medium / Critical | Monotonic sequence + idempotent replay (FR-136), per-field LWW (AR-025), reconnect-storm tests |
| R-03 | Ethiopian SMS/OTP reliability | Medium / High | Resend/retry UX, SMS fallback for reminder escalation (D-12), delivery telemetry |
| R-04 | Amharic ASR/TTS quality | Medium / Medium | Provider fallback ladder (D-06), manual transcription fallback UI, TTS assumption validated early |
| R-05 | Store accessibility / sideload ecosystem | Medium / Medium | Signed artifacts (AR-028), signature verification, controlled distribution link |
| R-06 | Quiet-hours bypass over-notifies | Low / Medium | Critical-only bypass list (FR-046) code-reviewed; per-type toggles |
| R-07 | Content not clinically approved at release | Medium / High | Content gating behind QR-013 clinical review; pin only approved emergency content (FR-135) |
| R-08 | Encrypted storage key handling flaw | Low / Critical | OS keystore only (AR-027), red-team STRIDE walkthrough (§14.1), no hard-coded keys (§14.4) |
| R-09 | Partner sync consent misuse | Medium / High | Mutual-accept linking, explicit share opt-in (FR-146), withdraw/unlink trail (C-03, §14.7) |
| R-10 | Localization drift (EN/AM) | Medium / Medium | String-completeness CI check (FR-138), content language partitions |
| R-11 | WebSocket live sync scale | Low / Medium | Fallback to queued sync on degrade (D-04); cursor-based resume |

### Dependencies

Risk register owner (program), re-scored each sprint; mitigations land in the owning step.

### APIs consumed

n/a.

### Local storage changes

n/a.

### Tests

Each mitigation has an automated test (see §3 step tests and §6).

### Verification evidence

Risk register reviewed at QR-013/QR-016 release reviews.

---

## 10. Verification Approach

### Objective

Define how the completed mobile build proves it satisfies the SRS before release, aligning mobile evidence with the program-level gates.

### Components

| Gate | Mobile evidence | SRS basis |
| --- | --- | --- |
| QR-013 release gate | Unit + integration + E2E + security + accessibility + performance green on device matrix; signed-artifact checks; clinical review of content surfaces | QR-013 |
| QR-015 traceability | Every FR/AR/QR mobile requirement mapped to a step + test in `22-feature-implementation-matrix.md` | QR-015 |
| QR-017 UAT | UAT cohort walkthroughs (fathers incl. low-literacy + AM speakers) of steps 1–11, offline and accessibility flows | QR-017 |
| QR-004 critical journeys | Mobile critical journeys pass (auth → journey → journal → offline → sync → reminders) | QR-004 |
| QR-010 WhatsApp cross-check | App/WhatsApp parity: same week data, prompt answers reflect across channels (FR-008, FR-053) | QR-010 |
| Release review (QR-016) | Risk register + blocker status + distribution readiness reviewed | QR-016 |

### Dependencies

UAT cohort and clinical reviewer availability; device lab; feature-matrix maintenance.

### APIs consumed

Same app contracts; test reports from CI.

### Local storage changes

n/a (evidence only).

### Tests

The verification approach IS the aggregated test + audit + review execution across §3 step evidence and §6 strategy.

### Verification evidence

Release evidence bundle: CI reports, device-matrix matrix, accessibility audit, UAT sign-off, signed artifact signature logs, feature-matrix traceability export, and QR-013/QR-016 review records — retained per release in the program's release evidence store.

---

*End of 09-mobile-application-development-plan.md (v1.0). Updated against FN-SRS-001 v2.0; companion to `00`–`08` plans and `22-feature-implementation-matrix.md`.*




