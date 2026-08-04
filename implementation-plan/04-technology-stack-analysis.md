# 04. Technology Stack Analysis

**Source:** `docs/FathersNet-Complete-SRS.md` (FN-SRS-001, Version 2.0) + `00-requirement-inventory.md`
**Purpose:** Evaluate and recommend a concrete technology for every SRS-defined capability area, honoring the SRS **Recommended Reference Architecture** (§1.8.2) and its Architecture Decision Records (§15.4), and classify every choice into **Required-by-SRS**, **Recommended**, or **Configurable**.
**Outputs consumed by:** `03-system-architecture-plan.md`, `05-database-implementation-plan.md`, `06-backend-development-plan.md`, `07-whatsapp-platform-implementation-plan.md`, `08-ai-rag-implementation-plan.md`, `09-mobile-application-development-plan.md`, `10-admin-dashboard-development-plan.md`, `12-devops-and-infrastructure-plan.md`, `16-risk-management-plan.md`.
**Classification convention:** **Required-by-SRS** (Confirmed capability — binding) · **Recommended** (SRS-recommended reference architecture OR engineering recommendation — replaceable only with an equivalent that still satisfies the confirmed requirement per §1.8.2) · **Configurable** (environment/parameter-dependent value with a pilot default per §1.8.3).

---

## 1. Executive Purpose

The FathersNet (Ayay) platform is a greenfield digital-fatherhood and family-health ecosystem (SRS §2.1). It must serve five surfaces — mobile app (Android-first), WhatsApp bot, web admin/research portal, AI assistant with RAG, and a research/evidence platform — under hard constraints: Ethiopia-first operation with English and Amharic (A-01), intermittent low-bandwidth connectivity (A-02), low-literacy and voice-first users (A-06, C-04, C-05), healthcare safety (C-01), privacy-by-design (C-02), and aggressive cost control on AI tokens and messaging volume (A-07, C-03).

This document converts the SRS's Recommended Reference Architecture into a definitive, buildable technology stack. The SRS deliberately classifies its technical statements as Confirmed, Recommended, or Configurable (§1.8); this document preserves those semantics. Where the SRS names a technology (Node.js, PostgreSQL, Qdrant, Redis, AssemblyAI, Gemini 2.0 Flash, GitHub Actions, n8n, nginx, Docker Compose, WhatsApp provider abstraction, React Native/Flutter + SQLite), that technology is adopted as the baseline and the analysis below explains why, how, and with what risk. Where the SRS leaves the choice open (frontend framework, specific cloud provider/region, specific WhatsApp vendor, observability tooling, queue implementation), this document makes an engineering recommendation and records the alternatives.

Every decision below is independently scored against the five criteria in Section 2 and carries a confidence level and an explicit "impact if changed" statement so a future engineer or an ADR review can re-open a single decision without re-litigating the whole stack.

---

## 2. Decision Framework

Five weighted criteria govern every technology evaluation. They are derived directly from the SRS and repeated here so all decisions are auditable.

| # | Criterion | SRS Basis | How It Is Applied |
| --- | --- | --- | --- |
| 1 | **Cost** | A-07 (cost control priority), C-03, AR-040 (budget alerts), Appendix C (reference cost model), C.4 (cost optimization strategies) | Prefer open-source/self-hostable options where operational effort is acceptable; prefer cost-efficient AI tiers (Gemini Flash primary); prefer pay-as-you-go cloud with budget alarms. Reference envelope: $150–$500/mo infrastructure, $50–$300/mo AI, $50–$300/mo WhatsApp (Appendix C.1). |
| 2 | **Skill availability** | NFR-039 (maintainable codebases), Appendix E (operating team: backend, mobile, frontend, DevOps, AI/data engineers), Appendix C.2 (full-stack team is the largest line item) | Choose mainstream technologies with large talent pools (Node.js/TypeScript, React, Python, PostgreSQL) and avoid niche or single-maintainer tooling for core runtime paths. |
| 3 | **Health-data constraints** | C-01/C-02, FR-073/AR-019 (pseudonymization to AI providers), NFR-029 (DPAs), FR-123/NFR-021 (encryption), AR-013 (research separation), D-03 (regional availability), FR-105 (retention/purge) | All providers must support DPAs, encryption at rest/in transit, regional deployment, and auditable deletion. Data-residency reachable from Ethiopia (or nearest regional cloud) is a gating criterion. |
| 4 | **Low-connectivity context** | A-02, C-05, NFR-035 (offline-first), AR-025 (offline-first + queued sync), ADR-004 (SQLite local store), NFR-034 (low-bandwidth messaging) | Mobile must be offline-first with encrypted local SQLite and queued sync; media must be compressed (FR-137); emergency content pre-cached (FR-135). |
| 5 | **Provider abstraction** | FR-149/AR-004 (WhatsApp abstraction), FR-072/AR-018 (AI model fallback), ADR-005 (multi-provider AI), FR-152 (notification failover), AR-010 (pluggable adapters) | Any third-party dependency must sit behind an internal interface so the provider can be swapped without downstream change. This is non-negotiable for WhatsApp, AI/LLM, ASR, and notifications. |

**Decision rule:** If the SRS marks a technology **(Recommended)**, it is adopted as the pilot baseline and the burden of proof falls on anyone proposing a replacement. If the SRS leaves the choice open, the engineering recommendation below selects the option that best satisfies the five criteria jointly, and the runner-up is recorded as a viable alternative.

---

## 3. Backend Framework

The SRS mandates a **Node.js backend** with **Python for AI/data services** (§16.1 Docker reference builds `./backend`; §17.2 recommends Jest for the Node.js/frontend test stack and PyTest for Python AI/data services; FR-159 defines the microservices set; AR-001 requires containerized, independently deployable services).

### 3.1 Application backend — Node.js with TypeScript

- **Decision:** Node.js (LTS, v20+/v22) with TypeScript, structured as the microservices defined in FR-159 (API gateway, auth, user/profile, pregnancy engine, reminder engine, WhatsApp/conversation, content/CMS, campaign, research, AI orchestration) using Express/Fastify on the HTTP layer and the SRS-defined REST/OpenAPI contracts (§12.1).
- **Reason:** The SRS Docker Compose reference and CI/CD pipeline (§16.1, §16.2) are built around a Node.js API (`build: ./backend`, `npm test`, `npm run sast`); Jest guidance (§17.2) assumes a Node test stack; Node.js/TypeScript has the widest skill pool for a full-stack team (NFR-039), excellent WhatsApp/HTTP ecosystem maturity, and aligns with the event-driven/async model required by NFR-004 and FR-160.
- **Alternatives:** Python (FastAPI) for the entire backend; Go (REST + queue consumers); Java/Spring Boot; .NET. All would satisfy the confirmed requirements but would diverge from the SRS reference topology and its documented CI/CD.
- **Advantages:** Matches the SRS reference implementation end-to-end (compose file, CI pipeline, Jest coverage gates); TypeScript gives static typing for a 9-service, 27-table, JSONB-heavy domain (§13); non-blocking I/O suits WhatsApp webhook ack-then-queue (NFR-003) and high-concurrency prompt/reminder fan-out; one language across API, web, and mobile-adjacent tooling reduces team surface.
- **Disadvantages:** CPU-bound work (embeddings, heavy JSON transform, media) needs worker isolation — mitigated by queueing to Python services; Node's microservice discipline requires deliberate boundaries to avoid a monolith drift (AR-001); asynchronous event semantics require idempotency from day one (FR-161).
- **Risk:** Medium. A Node monolith masquerading as microservices would violate AR-001/FR-159; uncontrolled callback/queue concurrency can cause duplicate sends without idempotency keys (FR-161). Mitigation: enforced service boundaries, queue contracts, idempotency-first design (see `06-backend-development-plan.md`).
- **Recommendation:** Adopt Node.js + TypeScript as the primary application backend, per SRS §16.1/§17.2. Do not split services prematurely (see `01-current-system-analysis.md` §10); start with the SRS service set and merge where sensible.
- **Source:** SRS §16.1 (Docker Compose reference `api` service), §17.2 (Jest/Node test stack), §12 (API platform), FR-159, AR-001, AR-003 (Recommended reference architecture).
- **Confidence:** High.
- **Impact if changed:** If the backend moved to Python/FastAPI or Go, the reference Docker Compose, the GitHub Actions pipeline (npm test/sast steps, §16.2), and the Jest coverage-gate design (§17.2, QR-002) would all need rework, and the WhatsApp/AI orchestration services would need a new language-appropriate queue stack. No confirmed requirement would break, but §16.1/§16.2 reference artifacts and the coverage gate would diverge.

### 3.2 AI/data services — Python

- **Decision:** Python (3.12) for the AI orchestration, RAG ingestion/embedding, theme extraction, research aggregation, and evaluation services, tested with PyTest (§17.2).
- **Reason:** The SRS explicitly pairs Python with AI/data services in its testing guidance (§17.2: "PyTest (Python AI/data services)") and its CI pipeline runs `pytest` alongside `npm test` (§16.2). The AI stack it prescribes — LangChain-style chunking (RecursiveCharacterTextSplitter, §9.2), Qdrant clients, cross-encoder reranking, and embedding APIs (§9.2/§9.4) — has first-class Python support, and the research/theme pipelines (§10.1.2) benefit from the Python data ecosystem.
- **Alternatives:** Node.js for the same AI services; standalone Rust inference; calling the LLM/embedding providers directly from the Node API. These reduce language count but lose the Python ML ecosystem that §9.2/§9.4 reference implementations assume.
- **Advantages:** Direct, idiomatic support for the SRS-recommended ingestion/retrieval parameters (§9.2 chunking, §9.4 reranking/MMR); PyTest alignment with QR-002 coverage gates; strong fit for the research analytics and AI evaluation-set tooling (§17.2, QR-011); clean separation of CPU-bound AI work from the Node request path (NFR-004).
- **Disadvantages:** Second language to staff, lint, and test (Appendix E already budgets AI/data engineers); cross-service HTTP/queue boundaries between Node and Python add latency unless colocated (mitigated by internal queue contracts); dependency/security posture for Python packages must be scanned (pip-audit is already in the SRS CI, §16.2).
- **Risk:** Low–Medium. Boundary ambiguity ("where does AI orchestration live?") can produce duplicate logic. Mitigation: define the Node ↔ Python seam as a single internal RAG/ASR/theme API + queue contract (see `08-ai-rag-implementation-plan.md`).
- **Recommendation:** Adopt Python for AI/data/ingestion/evaluation services; keep the WhatsApp, user, reminder, campaign, and admin request paths in Node. Version-pin dependencies and run pip-audit in CI per §16.2.
- **Source:** SRS §17.2 (PyTest for Python AI/data services), §16.2 CI (`npm test && pytest`), §9.2/§9.4 (recommended ingestion/retrieval parameters), FR-114, AR-005 (Recommended reference architecture + engineering recommendation on service split).
- **Confidence:** High.
- **Impact if changed:** Consolidating AI into Node would require re-implementing chunking, reranking, and evaluation logic against weaker ecosystem support and abandoning the §17.2 PyTest reference; moving everything to Python would break the §16.1/§16.2 Node reference. The bilingual split is the lowest-risk reading of the SRS.

---

## 4. Mobile Framework

- **Decision:** **React Native (with TypeScript)** for the Android-first, iOS-supported mobile app, using **SQLite** for encrypted on-device local storage, an offline-first sync engine with queued writes and field-level last-write-wins conflict resolution (SRS §8.4, §8.5, ADR-004), push notifications and deep linking (AR-026), and signed-expiring-URL media delivery. Store distribution via Google Play/App Store plus APK sideload support (AR-028).
- **Reason:** The SRS's Recommended Reference Architecture names "React Native or Flutter" (§8.1) and mandates SQLite local storage (ADR-004, §8.5). React Native is selected over Flutter because it shares TypeScript and a component/design-token model with the Node/React backend and web admin portal (AR-029, AR-034 design-system consistency across app, web, and WhatsApp visual guidance), and because the SRS's CI/repo conventions (§16.2) are npm-native. SQLite satisfies ADR-004 (embedded, robust, offline writes, content caching) and the 100 MB LRU cache budget (§8.5).
- **Alternatives:** Flutter (excellent rendering and low-end-device performance, Dart ecosystem); native Kotlin + Swift (two codebases, highest quality, highest cost — rejected for pilot cost/skill envelope); Capacitor/hybrid web (weaker offline/sync control — rejected against ADR-004/AR-025).
- **Advantages:** Meets every mobile requirement: offline-first with queued sync and per-field conflict merges (§8.4/§8.5), encrypted local storage (AR-027), push + deep links (AR-026), APK sideload (AR-028), assistive-technology compatibility (FR-141/NFR-032 via platform accessibility APIs), low-bandwidth compression modes (FR-137), and design-system sharing with the web portal (AR-029/AR-034); TypeScript across app and backend reduces cognitive load for a single mobile/web/backend team.
- **Disadvantages:** React Native performance tuning on very low-end Android devices requires discipline (frame-rate and memory budgets); the offline sync/conflict engine is bespoke and must be tested rigorously (AR-025, FR-136); native modules for OTP/push/calendar (ICS export, §8.6) add platform-specific code.
- **Risk:** Medium. Offline sync correctness (no data loss, no duplicates, field-level merges) is the highest-complexity mobile risk (see `01-current-system-analysis.md` §10 and `09-mobile-application-development-plan.md`). Mitigation: dedicated sync protocol, monotonic sequence numbers, server-authoritative revisions (§8.5), and E2E offline journeys in the test matrix (§17.4).
- **Recommendation:** Adopt React Native (TypeScript) + SQLite with a local-first sync engine exactly as specified in §8.4/§8.5/ADR-004. Keep Flutter as the documented fallback if device-matrix testing shows RN performance unacceptable on the pilot's low-end Android devices.
- **Source:** SRS §8.1 (Recommended Reference Architecture: React Native or Flutter), §8.4/§8.5 + ADR-004 (SQLite local store, queued sync, conflict resolution), AR-025/026/027/028 (Recommended reference architecture).
- **Confidence:** High (React Native + SQLite); Medium on RN-over-Flutter (an engineering preference; SRS treats both as acceptable).
- **Impact if changed:** Switching to Flutter changes the mobile codebase, the design-system bridge to web (AR-029/034), and the mobile CI toolchain, but all SRS mobile requirements (offline SQLite, sync, push, sideload) are satisfied equally. Replacing SQLite (e.g., with WatermelonDB/SQLite under the hood) is fine as long as ADR-004's offline guarantees hold.

---

## 5. Frontend/Web Framework

- **Decision:** **Next.js (React 18+, TypeScript)** as the web/admin/research portal framework, with a WCAG 2.1 AA-compliant component library, role-based modules (FR-094/AR-030), real-time analytics views (AR-031), charting for the research dashboards (§11.5, §11.7), and the shared design system (AR-034). OpenAPI-generated client for typed API consumption (§12.1, FR-153).
- **Reason:** The SRS does not mandate a web framework; it requires an admin portal (§11), WCAG 2.1 AA (FR-140, NFR-031), role-based modules (AR-030), real-time dashboards (AR-031), research-only-anonymized views (AR-032), and MFA + session controls (AR-033). Next.js/React is chosen because it shares TypeScript, hooks, and the design system with the React Native mobile app (AR-029/034), has the largest frontend talent pool (NFR-039), ships production-grade accessibility tooling, and the SRS's Jest frontend-testing guidance (§17.2) is React-native.
- **Alternatives:** Vue 3 + Nuxt (excellent, slightly smaller pool); Angular (strong enterprise structure, heavier); Svelte (smaller pool); plain React + Vite SPA (viable lighter-weight option; Next.js adds SSR/file-based routing/ISR that helps future public content surfaces such as educational pages). Any of these satisfy the SRS web requirements.
- **Advantages:** Reuse of the TypeScript/React design system across app and web (AR-029/034); strong WCAG 2.1 AA ecosystem (Radix/shadcn or MUI + axe-core testing for QR-008); real-time dashboards via websockets/polling against the analytics pipeline (AR-031); SSG/ISR headroom for future public-facing content; Jest + Testing Library matches §17.2.
- **Disadvantages:** SSR and app-router complexity is unnecessary for a strictly internal admin portal; real-time dashboard wiring must be deliberate (polling vs websocket) to meet AR-031 latency; accessibility is an ongoing discipline, not a framework feature (FR-140, QR-008).
- **Risk:** Low. The main risk is accessibility regression and role-gating errors (AR-030/033) rather than framework failure. Mitigation: axe-core in CI (QR-008), role-based route guards backed by server-side RBAC (FR-126).
- **Recommendation:** Adopt Next.js (React + TypeScript) for the web/admin/research portal; keep the data-fetching layer thin and the role/permission model server-authoritative (FR-126, NFR-018).
- **Source:** Engineering recommendation (SRS leaves the web framework open; web requirements are FR-094/140, AR-030–034, §11, §17.2).
- **Confidence:** Medium (framework is engineering-chosen; requirements are SRS-confirmed).
- **Impact if changed:** Moving to Vue/Nuxt or Angular would not break any SRS requirement but would break the shared React/TypeScript design system with the mobile app (AR-029/034) and require a parallel frontend talent track. Low blast radius on backend/database decisions.

---

## 6. Relational Database

- **Decision:** **PostgreSQL 16** as the system of record for the full 27-table canonical schema (§13), with JSONB for flexible payloads (`themes`, `audience_filter`, `reminder_channels`), versioned migrations (FR-164), append-only `consents` and `audit_logs` immutability (§13.3.4, §13.3.24, AR-012, NFR-023), encryption at rest via managed keys (FR-123/NFR-021), research tables physically/logically separated with restricted access (AR-013, §10.1.3), and point-in-time recovery for RPO ≤ 15 min (NFR-012, §19).
- **Reason:** ADR-003 records PostgreSQL as the SRS decision (relational integrity, JSONB flexibility, ecosystem), §13.1 confirms a relational system of record, §16.1 pins the reference image to `postgres:16-alpine`, and the backup service (§16.1, §19) is a pg_dump-based job. The schema in §13 is written in PostgreSQL DDL (gen_random_uuid, timestamptz, jsonb, INET).
- **Alternatives:** MySQL/MariaDB (no native JSONB-with-indexes ergonomics matching §13; weaker for `jsonb` theme/payload queries); MongoDB (document store — rejected by ADR-003 because transactional integrity and consent immutability are required); SQL Server/Oracle (cost/licensing outside pilot budget).
- **Advantages:** Exactly matches the SRS DDL and reference deployment; JSONB for research/theme payloads with GIN indexing (NFR-007); ACID transactions for multi-table flows (consent + journal + research writes, FR-161); mature tooling for migrations (Node `pg` + migration runner), backups (pg_dump/PITR, §19), and managed offerings in the recommended cloud; strong skill availability (NFR-039).
- **Disadvantages:** Requires schema/index discipline at scale (ADR-003 trade-off, NFR-007); single-writer scaling needs read replicas and careful partitioning when cohorts grow to thousands/millions (§16.3); full-text + vector search is explicitly delegated to Qdrant, so Postgres is not used for embeddings.
- **Risk:** Low–Medium. Risks are operational: slow queries at scale (NFR-007), and PITR/RPO misconfiguration (NFR-012). Mitigation: indexing review in `05-database-implementation-plan.md`, slow-query monitoring (§18.2), automated restore drills (§19, OR-012).
- **Recommendation:** Adopt PostgreSQL 16, managed (cloud) in production with self-hosted Postgres allowed for the Docker Compose reference topology; use a versioned migration runner; implement research-schema separation (AR-013) and append-only consent/audit tables from the first migration.
- **Source:** SRS §13.1 + ADR-003 (Decision), §16.1 (`postgres:16-alpine`), AR-002, FR-162, NFR-012/021 (Recommended reference architecture).
- **Confidence:** High.
- **Impact if changed:** Replacing PostgreSQL (e.g., with MySQL) would require rewriting §13 DDL (UUID default, jsonb, gen_random_uuid, interval), altering the §16.1 backup job, and losing JSONB semantics — high cost, zero benefit. Using a different major version than 16 changes compose and managed-DB compatibility but not architecture.

---

## 7. Vector Database

- **Decision:** **Qdrant** for the RAG knowledge store, collection `fathersnet_knowledge`, cosine distance, HNSW index (m=16, ef_construct=200), Top-K 5, similarity threshold 0.75, cross-encoder rerank + MMR (λ 0.5) per §9.3/§9.4, with nightly vector-store snapshots for DR (§19) and incremental chunk activation/retirement on content lifecycle changes (AR-016).
- **Reason:** §9.3 names Qdrant as the Recommended Reference Architecture (configurable HNSW indexing, payload filtering, self-host or managed for cost/data-residency control) and lists it explicitly as an alternative to Pinecone/Weaviate/pgvector; ADR-003 pairs "separate vector store (recommended Qdrant)" with Postgres; §16.1 pins `qdrant/qdrant:v1.9` and the SRS CI/architecture diagrams reference `Qdrant (fathersnet_knowledge)` throughout.
- **Alternatives:** Pinecone (managed-only, higher cost — weaker for pilot cost control); Weaviate (capable, smaller operator pool); pgvector (removes a component but merges embeddings into Postgres, diverging from §9.3's "separate vector store" and §13.1's separation of concerns); Milvus (heavier operational footprint).
- **Advantages:** SRS-specified parameters map 1:1 to Qdrant config (HNSW m/ef_construct, cosine, payload filters for language/week/document-version metadata — §9.3); self-hostable in the compose reference for zero marginal cost (Appendix C.4); payload filtering supports content lifecycle gating (AR-015) and language filters (§9.2 metadata); managed Qdrant Cloud available later without rearchitecting (ADR-003 trade-off honored).
- **Disadvantages:** A second data store to back up, monitor, and migrate (§19 snapshots); retrieval quality depends on ingestion discipline (chunking 512/128, §9.2) and threshold tuning (0.75, §9.4); operators must learn Qdrant-specific operations (Appendix E DevOps/AI roles).
- **Risk:** Medium. Retrieval quality directly drives AI accuracy (NFR-047) and safety (grounding, C-01). Risks: threshold drift (too-low threshold admits ungrounded chunks), HNSW parameter mis-tuning, and snapshot gaps for DR. Mitigation: evaluation set scoring (QR-011/QR-014), threshold monitoring, nightly snapshots (§19), and query-level payload filters.
- **Recommendation:** Adopt Qdrant (self-hosted for pilot via compose; managed Qdrant when scale requires) with the exact §9.3/§9.4 configuration; the AI evaluation set is the acceptance gate for retrieval quality.
- **Source:** SRS §9.3 + ADR-003 (Recommended Reference Architecture), §9.4 (retrieval parameters), §16.1 (`qdrant/qdrant:v1.9`), AR-005, AR-015/016 (Recommended).
- **Confidence:** High.
- **Impact if changed:** Moving to pgvector would reduce component count and DR surface but violate the SRS-recommended separation of vector vs relational stores and require rewriting ingestion/retrieval code and the §16.1 compose. Moving to Pinecone would raise cost (C-03) and reduce self-hosting/DR control. Both are viable ADR-level changes but carry non-trivial rework.

---

## 8. Queue & Message Bus

- **Decision:** **Redis-backed queue (BullMQ on Node.js) as the message bus** for event-driven decoupling, with outbound/inbound WhatsApp processing, notifications, reminder/campaign fan-out, transcription jobs, AI generations, and research ingestion all as asynchronous consumers (NFR-004, FR-160, AR-007). Redis streams/queues are the pilot bus; Kafka/cloud-native queues are the documented scale path (FR-160, §16.3).
- **Reason:** §15.1 places "Message Bus / Queue" in the data plane and §16.1 provisions **only** Redis in the compose reference (Redis as "Cache / Queue"); the architecture mandates event-driven, idempotent, retried, observable jobs (FR-160/161, AR-007); the Node backend (§16.1) pairs naturally with BullMQ, which gives durable queues, retries with exponential backoff + jitter (§7.4.3), rate limiting, and observability hooks.
- **Alternatives:** Apache Kafka (superior at very high throughput and long-term event streaming — the recommended scale path at thousands+ users, §16.3); RabbitMQ (mature AMQP, but an extra component vs the Redis already in §16.1); AWS SQS/SNS or GCP Pub/Sub (managed, but lock into the cloud choice and add cost); NATS (lighter but smaller pool).
- **Advantages:** Zero new infrastructure at pilot — the SRS already provisions Redis (§16.1); BullMQ gives the required retries/idempotency/backpressure for the WhatsApp and AI flows (NFR-003, NFR-008); one store serves cache + queue + rate limiting (AR-008, §14.1.6); dead-letter queues map to operator alerting (§18.3).
- **Disadvantages:** Redis-as-queue has no long-term event log; replay/audit of historical events must come from Postgres (messages, audit_logs — §13.3.11/24), not the bus; at very large scale a dedicated broker (Kafka) will be needed (NFR-001, §16.3).
- **Risk:** Medium. Risks: queue backlog during broadcasts (NFR-005) and lost messages if Redis persistence is misconfigured. Mitigation: AOF persistence enabled in §16.1 (`--appendonly yes`), queue-depth/age alerting (§18.2/§18.3), idempotency keys on all consumers (FR-161), and a documented Kafka migration path.
- **Recommendation:** Adopt Redis + BullMQ for the pilot message bus, keeping queue names, payload schemas, and consumer contracts broker-agnostic so a Kafka/Pub/Sub swap is a config-level change (provider abstraction per criterion 5).
- **Source:** SRS §15.1 (Message Bus / Queue), §16.1 (Redis in compose), FR-160/161, AR-007/008 (Recommended reference architecture + engineering recommendation on the bus implementation).
- **Confidence:** Medium-High (bus requirement is SRS-confirmed; BullMQ is an engineering recommendation consistent with §16.1).
- **Impact if changed:** Swapping to Kafka or RabbitMQ adds an operational component and changes consumer code but not the confirmed event-driven architecture; moving to a managed bus (SQS/Pub/Sub) ties the bus to the cloud decision (Section 14) and changes cost. Low-to-moderate blast radius if contracts stay abstracted.

---

## 9. Cache

- **Decision:** **Redis 7** as the shared cache/session/data-acceleration layer: token/session externalization (AR-008, §14.6), rate-limit counters and quotas (FR-169, §14.1.6), OTP attempt counters (FR-005), cached frequent AI answers and embeddings to cut LLM calls (Appendix C.4), and short-lived cached content/media metadata (NFR-002 latency targets).
- **Reason:** §15.1 diagrams Redis as `CACHE[(Redis)]` in the data plane; §16.1 provisions `redis:7-alpine` with appendonly persistence; AR-008 requires session state externalized (Redis/token-based) for stateless horizontal scaling; Appendix C.4 explicitly recommends caching frequent answers/embeddings in Redis to reduce LLM cost (A-07, C-03).
- **Alternatives:** Memcached (cache-only, no queue/session/rate-limit primitives — loses the multi-use value); in-memory per-instance caches (violate AR-008 stateless scaling); managed equivalents (ElastiCache/Memorystore) when moving to managed cloud (Section 14).
- **Advantages:** One component serves cache + queue + rate limiting + sessions (AR-008, FR-169), matching the SRS compose exactly; TTL-based invalidation keeps cost-cached AI answers fresh under prompt/content versioning (FR-068, FR-070); Lua-scripted atomic counters for OTP/rate limiting (§14.1.6, §12.2) avoid TOCTOU races.
- **Disadvantages:** Cached AI answers must be invalidated on content/prompt version changes or they erode grounding accuracy (NFR-047/048); cache warming cost at boot; a cache-failure mode must be designed (NFR-008 graceful degradation) so cold-cache falls back to origin without failure.
- **Risk:** Low–Medium. Cache poisoning (serving stale AI answers after knowledge update, FR-080 archive removal) is the top risk. Mitigation: version-keyed cache entries, deterministic invalidation on content lifecycle events (AR-015/016), TTL caps, and cache-aside with origin fallback.
- **Recommendation:** Adopt Redis 7 for cache/session/rate-limit (and, per Section 8, the pilot queue), shared across all services, with the §16.1 persistence settings and clear key namespaces per service.
- **Source:** SRS §15.1 (Redis cache), §16.1 (`redis:7-alpine`), AR-008, FR-169, Appendix C.4 (Recommended reference architecture).
- **Confidence:** High.
- **Impact if changed:** Moving to a managed Redis (Memorystore/ElastiCache) is a deployment detail, not an architecture change; dropping Redis for Memcached would lose session/queue/rate-limit convergence and require new infrastructure for those functions.

---

## 10. Object Storage

- **Decision:** **S3-compatible object storage** for all media (voice notes, photos, documents) and backups, with the exact SRS path scheme `s3://<bucket>/media/voice/<anonymized_user_id>/<message_id>.<ext>` and `/media/photo/…` (§7.4.2), server-side encryption at rest (FR-123/NFR-021), signed expiring URLs for app/web delivery (§7.4.2), retention/expiry lifecycle policies (FR-105, FR-150), and versioning for DR (§19). Implementation: GCP Cloud Storage (recommended cloud, Section 14) or AWS S3; **MinIO** as the self-hosted S3-compatible option for the Docker Compose reference topology.
- **Reason:** FR-150 and AR-002 confirm cloud object storage as a first-class data plane element; §7.4.2 hard-codes `s3://` storage paths and signed, expiring URLs; §13.1 places object storage beside Postgres and the vector store; §16.1's backup service writes to object storage; §19 requires versioned object storage for RPO ≤ 15 min.
- **Alternatives:** Cloud-native equivalents of S3 (GCS, Azure Blob) — all expose S3-compatible or near-equivalent APIs; on-box filesystem storage (rejected: violates FR-150 access control/retention, AR-002, and the `s3://` path contract); a NAS (unscalable, poor access control).
- **Advantages:** Matches the SRS storage-path and access-control contract exactly (signed URLs, role-based object ACLs, FR-019/150); lifecycle policies implement retention/purge (FR-105) and versioning implements DR (NFR-012); MinIO in the compose reference gives a fully reproducible local/dev experience with the same `s3://` contract.
- **Disadvantages:** Object-storage access control is coarse and must be enforced by signed URLs + server-side authorization (FR-126), not by raw bucket grants; media egress cost and bandwidth must be controlled via compression (§7.4.2, FR-137) and CDN at scale (Appendix C.1); malware scanning of uploads is a separate service (AR-023, §14.1.8).
- **Risk:** Low–Medium. Misconfigured bucket permissions or over-long signed URLs are the main exposure (FR-126, §14.1.3). Mitigation: deny-by-default buckets, short-lived signed URLs, malware scan on ingest (AR-023), retention lifecycle rules, and egress budget alarms (AR-040).
- **Recommendation:** Adopt an S3-compatible object store (GCS/S3 in production; MinIO in the compose reference), with the §7.4.2 path scheme, server-side encryption, signed expiring URLs, and lifecycle retention policies from day one.
- **Source:** SRS §7.4.2 (storage paths, signed URLs, encryption), §13.1, FR-150, AR-002/023, §19 (Recommended reference architecture; the specific S3-compatible implementation is an engineering recommendation).
- **Confidence:** High (S3-compatible + path contract are SRS-confirmed); Medium on MinIO specifically (engineering choice).
- **Impact if changed:** Any S3-compatible store is a drop-in replacement (GCS/S3/MinIO/Backblaze all keep the same path and URL contract); abandoning S3-compatibility would break the §7.4.2 contract, the backup job, and future CDN/media tooling.

---

## 11. Speech-to-Text

- **Decision:** **AssemblyAI as primary ASR** with **Google Speech-to-Text as automatic fallback**, for English and Amharic voice notes (AAC/OGG/MP3 per §7.4.2), producing timestamped transcripts for journaling, AI answering, and theme extraction (§9.7), all behind an ASR provider abstraction (criterion 5). AssemblyAI call failures/timeouts trigger Google STT; per-language routing may prefer Google STT for Amharic if eval-set quality requires it (configurable).
- **Reason:** §7.4.2 step 5 and §9.7 specify AssemblyAI as primary and Google Speech-to-Text as fallback for English and Amharic; FR-018/FR-055 require transcription of inbound voice and searchable transcripts; D-06 notes transcription availability for EN/AM is a dependency. Google STT has production-grade Amharic (am-ET) support, making it the correct resilience pair for the Amharic voice-first path (FR-133).
- **Alternatives:** Whisper (self-hosted, open-source — viable as a tertiary offline fallback and for cost control, but adds GPU/CPU inference ops not in §16.1); Azure Speech; AWS Transcribe (Amharic support varies; managed-cost trade-offs). All can plug into the same abstraction.
- **Advantages:** Matches the SRS exactly (§7.4.2/§9.7); dual-provider gives outage resilience (NFR-015) and Amharic coverage; async queue processing keeps interactive flows non-blocking (NFR-004); per-language routing keeps cost/quality tunable (A-07).
- **Disadvantages:** Per-minute/per-hour cost scales with voice usage (A-07) — mitigated by size caps (16 MB, §7.4.2) and compression; transcription quality on low-end-device audio and Amharic dialects requires evaluation against the eval set (QR-011); transcripts are personal data and must be pseudonymized before AI/research use (FR-073, AR-019).
- **Risk:** Medium. Amharic transcription accuracy is the key quality risk (it feeds journaling search FR-055, AI grounding, and research themes FR-114). Mitigation: eval-set scoring per language, fallback routing, human review sampling (FR-071), and transcript-status state machine (`transcript_status` in `journal_media`, §13.3.7).
- **Recommendation:** Adopt AssemblyAI primary / Google STT fallback per §9.7, behind an ASR abstraction, with eval-gated Amharic routing and cost caps; document Whisper as a self-hosted tertiary option if cost control (C-03) demands it.
- **Source:** SRS §7.4.2 step 5, §9.7 (Recommended Reference Architecture), FR-018/055/133, D-06.
- **Confidence:** High.
- **Impact if changed:** Any ASR provider satisfying EN/AM with a DPA can replace either tier inside the abstraction (FR-151, NFR-029). Dropping Amharic-capable fallback would violate FR-024/FR-133 and D-06; dropping the abstraction would violate criterion 5 and FR-149-by-analogy.

---

## 12. LLM & Embeddings

### 12.1 LLM provider and fallback tiers

- **Decision:** **Google Gemini 2.0 Flash as the primary generation model**, with **GPT-4o-mini as Fallback 1** and **Claude 3 Haiku as Fallback 2**, behind a model/provider abstraction with cost-aware routing, 5 s first-token timeout, single-retry-then-failover, and per-intent model routing (simple/high-volume intents → cheapest capable model; complex/safety-sensitive intents → upgraded model) per §9.8 and ADR-005. All routing decisions logged (model, provider, latency, tokens, cost) (§9.8, FR-069).
- **Reason:** §9.8's Recommended Reference Architecture table names exactly this tier set; ADR-005 decides multi-provider abstraction with a fast primary and fallback tiers to guarantee continuity and cost optimization; FR-072/AR-018 require model fallback on outage or cost limits; A-07/C-03 make cost the primary routing concern; NFR-009 caps generation at 10 s.
- **Alternatives:** Single-vendor lock-in (explicitly rejected by ADR-005); self-hosted open-weights models (viable later for cost control per Appendix C.4, but add inference infrastructure and quality/safety risk at pilot); Gemini Pro/other upgraded tiers as the "complex intent" route instead of GPT-4o-mini.
- **Advantages:** Matches §9.8 exactly; three independent providers give strong outage resilience (NFR-015) and negotiated-cost flexibility; cost-aware routing directly serves A-07/C-03 (e.g., 5,000 daily interactions at §5.9 scale); all providers required to support DPAs and pseudonymized input (FR-073, NFR-029).
- **Disadvantages:** Multiple DPAs and billing relationships (ADR-005 trade-off); answer quality varies across tiers, so eval-set scores must be tracked per model (NFR-047); routing complexity needs a maintained cost/quality routing table (§9.8).
- **Risk:** Medium. Cross-tier quality drift and provider outages are the risks; the medical safety layer (AR-006) and eval set (QR-011/014) gate every output regardless of tier. Model name/version is a **configurable** value (SRS model names may be superseded; §1.8.3).
- **Recommendation:** Adopt the §9.8 tier architecture verbatim, implement the model abstraction as a routing table (config-driven), log every call for governance (FR-069), and gate all tiers through the medical safety layer and evaluation set before any output reaches a user.
- **Source:** SRS §9.8 + ADR-005 (Recommended Reference Architecture), FR-072, AR-018/019/020, NFR-047/049.
- **Confidence:** High (architecture); Medium on the specific model names, which are configurable and may be superseded by provider releases.
- **Impact if changed:** Swapping any tier for another provider model is a config-level change inside the abstraction (FR-072) as long as a DPA and Amharic/English capability are maintained; removing fallback tiers would violate FR-072/AR-018/NFR-015.

### 12.2 Embedding provider

- **Decision:** **OpenAI `text-embedding-3-small` (dimension 1536) as the primary embedding model**, with **Google Gemini embeddings as the fallback**, per §9.2's embedding options; embeddings generated in the Python ingestion service, stored in Qdrant with document/version metadata, dimension fixed at 1536 for index stability.
- **Reason:** §9.2 explicitly offers "OpenAI text-embedding-3-small or Google Gemini embeddings" at dimension 1536; the primary LLM is Gemini (§9.8) but embeddings are a separate, lower-cost concern where OpenAI's 1536-dim model matches the SRS dimension exactly and pairs with the Qdrant collection configuration (§9.3).
- **Alternatives:** Google Gemini embeddings (fallback; dimension support must match 1536 for a single collection); local embedding models (Sentence-BERT) as a cost-control/offline option (Appendix C.4, self-hosting); larger OpenAI/Gemini embedding models (higher cost, not needed at pilot scale).
- **Advantages:** Matches the §9.2 dimension and provider guidance; small/dimension-fixed model keeps storage and query cost low at §5.9 scale; provider abstraction allows Gemini fallback on outage (NFR-015); embeddings are pseudonymized before transmission (FR-073/AR-019).
- **Disadvantages:** A second provider relationship beyond the LLM tiers (mitigated by the shared AI-provider abstraction and DPA register, NFR-029); dimension must not change mid-collection (reindex on change, AR-016); embedding quality directly bounds retrieval quality (NFR-047).
- **Risk:** Low–Medium. Embedding/LLM mismatch (Gemini LLM + OpenAI embeddings) is fine in RAG practice but must be validated by the retrieval eval set; dimension drift requires a full reindex. Mitigation: eval-gated retrieval scores, immutable embedding dimension per collection, versioned re-embedding on content changes (AR-016).
- **Recommendation:** Adopt OpenAI `text-embedding-3-small` (1536) primary with Gemini embeddings fallback, per §9.2; keep the embedding model choice configurable in the ingestion pipeline.
- **Source:** SRS §9.2 (Recommended Reference Architecture: embedding options, dimension 1536), §9.3 (Qdrant cosine/HNSW), AR-016/019.
- **Confidence:** High on the provider set; Medium on primary-vs-fallback ordering (engineering call; both are SRS-listed options).
- **Impact if changed:** Switching the primary embedding model is config-level and requires only a versioned re-embedding run (AR-016); changing the dimension would change the Qdrant collection configuration (§9.3) and force a full reindex.

---

## 13. WhatsApp Provider

- **Decision:** **Meta WhatsApp Business Cloud API as the primary provider**, integrated behind the SRS-mandated provider-abstraction layer (FR-149, AR-004, ADR-001), with the SRS webhook contract (`X-Hub-Signature-256` HMAC validation, verification handshake, async ack-then-process — §7.4.1/§12.4), template approval workflow (§7.4.3, AR-021), 24-hour messaging-window enforcement, media retrieval via provider media API (§7.4.2), and opt-in/opt-out compliance (FR-017/112, C-06). **360Dialog (Africa-focused BSP) and Twilio are documented alternates** selectable at config time through the same abstraction.
- **Reason:** §7.1 lists Meta Cloud API first among candidates (first-party provider, strong template/policy tooling, per-conversation pricing) and ADR-001 decides WhatsApp-first architecture; FR-149/AR-004 make provider switching a confirmed capability; the webhook and media specifications in §7.4 are written in Meta-Cloud-API style (hub.challenge, X-Hub-Signature-256), so Meta minimizes integration friction. 360Dialog's African-market focus and Twilio's developer experience are retained as the fallback/alternate positions required by D-01 (WhatsApp BSP availability and policy acceptance in Ethiopia).
- **Alternatives:** Twilio WhatsApp API (developer-friendly, good observability); WATI (low-code campaign tooling); 360Dialog (Africa-focused local support); BSPs via the WhatsApp BSP program. All plug into the same abstraction (FR-149).
- **Advantages:** First-party access to templates, business verification, number health, and quality ratings (§7.4.3 Meta Business Manager workflow); the §7.4.1/§12.4 webhook contract matches Meta's signature scheme; per-conversation pricing scales predictably at ~10 k messages/month reference volume (Appendix C.1); the abstraction protects all downstream services from a vendor change (AR-004).
- **Disadvantages:** Template approval latency and policy risk in the Ethiopian market (D-01, C-06); 24-hour-window and per-message economics constrain free-form flows (ADR-001 trade-off); per-conversation pricing can spike with interactive AI conversations unless throttled (FR-111, §7.4.3).
- **Risk:** Medium. Primary risks: WhatsApp Business API availability/policy acceptance in Ethiopia (D-01) and template-approval delays (C-06, NFR-044). Mitigation: abstraction with 360Dialog/Twilio as drop-in alternates, template library pre-approval workflow (§7.4.3), per-user messaging caps (§7.4.3), and opt-in records retained (FR-017).
- **Recommendation:** Adopt Meta Cloud API behind the abstraction for pilot; run a provider-swap test in staging (AR-004 acceptance criterion) before launch to prove 360Dialog/Twilio failover; treat provider selection as a config value, not a code decision.
- **Source:** SRS §7.1 + ADR-001 (Recommended Reference Architecture), FR-149, AR-004/021, §7.4.1/§7.4.3 (Recommended), D-01, C-06.
- **Confidence:** High on abstraction (SRS-confirmed); Medium on Meta-as-primary (engineering selection among §7.1 candidates).
- **Impact if changed:** Selecting 360Dialog or Twilio at config time is exactly what the abstraction is for (FR-149) and would not change downstream services; only the provider-specific adapter, credentials, and template-approval workflow would differ.

---

## 14. Cloud Hosting

- **Decision:** **Google Cloud Platform (GCP) as the primary single cloud**, multi-zone architecture (minimally two zones in one region), African region **`africa-south1` (Johannesburg)** as the pilot region for data residency and latency to Ethiopia (D-03), containerized microservices per ADR-006, **Terraform IaC** for reproducible dev/staging/prod environments (NFR-036, AR-036), **Docker Compose as the reference topology** (§16.1) including **nginx reverse proxy** for TLS termination (FR-123/NFR-021, §16.1), and a documented upgrade path to **GKE** or managed services (Cloud SQL for PostgreSQL, Memorystore for Redis) as cohort scale exceeds the pilot (NFR-001, §16.3).
- **Reason:** ADR-006 decides single-cloud, multi-zone, IaC, containerized hosting with reproducibility and portability; §16.1 fixes the reference topology (Node API, Postgres, Qdrant, Redis, n8n, nginx, backup) as Docker Compose and permits managed/orchestrated equivalents at production; §16.3 requires horizontal scaling of stateless services; D-03 makes regional availability a dependency. GCP is chosen over AWS because the AI stack is Google-aligned (Gemini primary §9.8, Google STT fallback §9.7, Gemini embeddings option §9.2), GCP offers the nearest African region with first-class managed Postgres/Redis/Kubernetes, and its observability (Cloud Monitoring/Logging/Trace) complements the open-source stack in Section 16.
- **Alternatives:** AWS (`af-south-1` Cape Town; S3, RDS Postgres, ElastiCache, EKS — fully valid; Appendix C references both AWS KMS and GCP KMS); Azure (weaker African region coverage and weaker alignment with the Google AI stack); on-premise hosting (rejected by ADR-006; no DR/scale headroom); multi-cloud (rejected by ADR-006 as an early complexity).
- **Advantages:** Meets ADR-006 and §16.3 (multi-zone, IaC, containerized, stateless scale-out); Google AI alignment reduces cross-cloud egress and integration friction for the §9.7/§9.8 providers; Terraform + Docker Compose keeps the §16.1 reference topology reproducible (NFR-036); nginx as TLS-terminating reverse proxy matches §16.1 and enforces HSTS (§14.2); GKE/managed services absorb the thousands-to-millions growth path without rearchitecture.
- **Disadvantages:** No Ethiopian data center exists — Johannesburg (or Cape Town) is the nearest option, so a regional-latency and data-residency decision must be documented (D-03); single-cloud is a vendor dependency that ADR-006 explicitly accepts for the pilot; managed-service pricing must be budget-alarmed (AR-040).
- **Risk:** Medium. Risks: regional availability/cost of GCP services in Africa (D-03), data-residency review expectations for Ethiopian health data, and cost drift (AR-040). Mitigation: region-locked service selection, Terraform-module isolation per environment (AR-009), budget alerts with a cost dashboard (§18.3, AR-040), and the compose-reference portability that preserves an AWS migration path.
- **Recommendation:** Adopt GCP, `africa-south1`, multi-zone, with Terraform and the §16.1 Docker Compose reference topology (nginx → Node API → Postgres/Redis/Qdrant/n8n), piloting on managed services where cost allows and moving to GKE at scale. Record AWS `af-south-1` as the documented alternate to preserve portability (ADR-006 trade-off).
- **Source:** SRS ADR-006 (Recommended), §16.1 (Docker Compose + nginx reference), §16.3 (scalability), NFR-036, AR-036/039/040, D-03 (Recommended + engineering recommendation on the specific provider/region).
- **Confidence:** Medium (provider/region is an engineering recommendation consistent with ADR-006; the hosting *approach* is SRS-recommended).
- **Impact if changed:** Moving to AWS is an IaC-and-managed-service migration, not an application change, because everything is containerized and the compose topology is provider-neutral (ADR-006 portability). Changing region affects latency and data-residency posture and must be decided before pilot enrollment. Dropping nginx or containerization would violate §16.1 and NFR-036.

---

## 15. CI/CD

- **Decision:** **GitHub Actions** for the CI/CD pipeline exactly per §16.2: Build → Test → Security scan → Deploy → Rollback → Health checks → Approval gates, with `npm test && pytest`, coverage gates (QR-002 floor), `npm audit --omit=dev` + `pip-audit` dependency scanning, SAST (npm sast + Semgrep), TruffleHog secret scanning, staging deploy on `develop`, and production deploy on `main` behind an environment approval gate with canary deploy, health-check promotion, and automated rollback on failure.
- **Reason:** §16.2 provides the GitHub Actions YAML as the SRS reference CI/CD pipeline, including the exact stages, security tools, and canary/rollback logic; FR-167/AR-037 confirm the CI/CD capability; QR-013 makes passing unit+integration+E2E+security+accessibility+performance+clinical-review a release gate.
- **Alternatives:** GitLab CI (equivalent capability, different YAML); Jenkins (legacy ops overhead, weaker GitHub-native integration); CircleCI (viable, smaller free tier); AWS CodePipeline/Azure DevOps (tie CI/CD to a cloud decision). GitHub Actions matches the SRS reference with zero migration.
- **Advantages:** §16.2 is already written in GitHub Actions — adoption is literal; tight GitHub integration for PR checks, approvals, environments, and secrets (NFR-022); canary + automated rollback satisfies FR-168/NFR-038; secret scanning and dependency scanning are first-class steps in the reference pipeline (FR-129, QR-007).
- **Disadvantages:** GitHub-hosted runners introduce a third-party supply-chain surface (mitigated by pinned actions/versions and secret scanning); long-running AI eval jobs (QR-011/014) need runner sizing or self-hosted runners for cost control.
- **Risk:** Low–Medium. Risks: supply-chain compromise of Actions, secrets leakage, and pipeline drift. Mitigation: action pinning, `secrets.DEPLOY_APPROVAL` environment gate (§16.2), TruffleHog + `npm audit`/`pip-audit` in the security stage, and DR for the pipeline via IaC-managed secrets (NFR-022).
- **Recommendation:** Adopt GitHub Actions per §16.2 verbatim as the release vehicle for all environments, with the QR-013 release gate enforced in the pipeline and a documented rollback runbook for each service (OR-003).
- **Source:** SRS §16.2 (GitHub Actions reference pipeline), FR-167/168, AR-036/037, QR-013/014, NFR-022 (Recommended reference architecture).
- **Confidence:** High.
- **Impact if changed:** Migrating to GitLab CI or a managed pipeline preserves all confirmed requirements but requires rewriting the §16.2 workflow, re-wiring environment approvals/canary/rollback, and re-proving QR-013 gates — medium effort, no requirement breakage.

---

## 16. Monitoring & Observability

- **Decision:** **OpenTelemetry instrumentation** (metrics, logs, traces) emitted by all services, shipped to a **Grafana stack (Prometheus + Loki + Tempo + Alertmanager) with Grafana dashboards**, plus **Sentry** for error tracking and **synthetic uptime checks** for SLA reporting (§18.2); alert routing to the on-call/incident process with severity levels and escalation (§18.3, OR-007/008/009). GCP Cloud Monitoring/Logging/Trace are the managed alternatives in the recommended cloud (Section 14).
- **Reason:** FR-155/AR-038 confirm centralized logging, tracing, metrics, and alerting; §18.2 specifies the exact monitoring surface (API uptime, database, queue depth, AI latency/token/cost, error tracking); §18.3 specifies alert classes including emergency-escalation failures and cost-threshold breaches; Appendix C.4 explicitly recommends open-source observability for cost control; NFR-037 requires centralized observability with defined alert rules.
- **Alternatives:** Datadog/New Relic (excellent but add recurring cost contrary to C.4's open-source preference); ELK (logs only — no metric/trace convergence); GCP Cloud Observability (managed, no self-hosting ops; the natural fallback on GCP); Grafana Cloud (managed OSS stack, good middle ground).
- **Advantages:** One open-source plane for logs (Loki), metrics (Prometheus), traces (Tempo), and dashboards (Grafana) satisfying §18.2/OR-007 at near-zero marginal cost (C.4); OpenTelemetry keeps instrumentation portable across any backend (criterion 5); Sentry's no-PII error aggregation matches §18.2; alerting covers the SRS's mandatory classes (queue backlog, AI latency/cost, emergency failures, security events, §18.3).
- **Disadvantages:** Self-hosted Grafana stack needs operator effort (Appendix E DevOps role); trace sampling must be tuned to control volume; AI-specific metrics (generation latency, token usage, cost, safety events, FR-069/071) require custom exporters and dashboards beyond stock tooling.
- **Risk:** Low–Medium. Risks: alert fatigue (mitigated by severity levels/escalation per §18.3/OR-008), log volume/cost (retention windows per §18.1), and observability gaps in the AI pipeline (mitigated by AI-specific dashboards and eval-set monitoring, NFR-050). No PII in logs is a hard requirement (NFR-022, §18.1).
- **Recommendation:** Adopt OTel + Grafana stack (Prometheus/Loki/Tempo/Alertmanager) + Sentry + synthetic checks; build SRS-mandated dashboards (§18.2/OR-007) including AI latency/token/cost and queue depth from day one; keep retention windows exactly per §18.1.
- **Source:** SRS §18.1–18.3, FR-155, AR-038, NFR-037, OR-007/008, Appendix C.4 (Recommended capabilities; tooling is an engineering recommendation consistent with C.4's open-source preference).
- **Confidence:** Medium (tooling is engineering-chosen; the observability *capability* is SRS-confirmed).
- **Impact if changed:** Swapping to Datadog or GCP Cloud Observability changes exporters and dashboards but not the OTel instrumentation or the SRS-mandated metrics/logs/traces/alert classes; the capability requirement (FR-155, AR-038) is tool-agnostic.

---

## 17. Workflow Automation

- **Decision:** **n8n** as the workflow-automation layer for scheduled/operational workflows — campaign and reminder orchestration, content/campaign approval gates, recurring data jobs, and cross-service integrations — per §16.1 (`n8nio/n8n` with basic auth), complementing the BullMQ/Redis queue (Section 8) which handles high-volume, low-latency event processing (AR-007, FR-163).
- **Reason:** §16.1 provisions n8n in the reference Docker Compose ("n8n (workflow automation)") and the §16.1 architecture diagram wires n8n into WhatsApp campaigns/reminders and the database; AR-007 requires scheduled/queued jobs with retries, idempotency, and observability; FR-163 requires a background scheduler for prompts, reminders, campaigns, and data jobs; n8n's visual workflow engine gives non-technical program operators (Appendix E: program/ops roles) safe access to template-driven automation.
- **Alternatives:** Airflow/Prefect (Python-native DAG orchestration — heavier, for data pipelines only); cron + BullMQ only (handles §FR-163 technically but removes the visual automation surface and the §16.1 n8n provision); Zapier/Make (SaaS lock-in, weak for health-data constraints); Azure Logic Apps/AWS Step Functions (cloud-locked).
- **Advantages:** Matches §16.1 exactly (zero extra components); visual workflows with versioning and retries fit the campaign/reminder approval gates (§7.4.3, FR-108) and phased-rollout feature flags (FR-168, OR-027); self-hosted keeps data in-region and auditable (AR-009, NFR-029); the BullMQ queue beneath n8n carries the high-throughput, latency-sensitive event path (NFR-003/005).
- **Disadvantages:** n8n is not built for very high-volume event streams — it is orchestration, not a bus (that is BullMQ's role, Section 8); workflows must be treated as code (exported/versioned) to remain auditable (FR-068-by-analogy, OR-005); operator access needs RBAC/basic-auth hardening (§16.1 sets basic auth).
- **Risk:** Low–Medium. Risks: workflow sprawl and unversioned logic (mitigated by exporting workflows to the repo and treating them as IaC, OR-005/OR-024), and n8n availability as a single point for scheduled jobs (mitigated by BullMQ for critical retries and by runbook fallbacks, OR-003).
- **Recommendation:** Adopt n8n per §16.1 for operational/scheduled workflows; keep all time-critical, high-volume paths (webhook ack, prompt/reminder fan-out, transcription/AI jobs) on BullMQ; version n8n workflow definitions in the repository.
- **Source:** SRS §16.1 (n8n in compose reference), AR-007, FR-163, FR-108, OR-005 (Recommended reference architecture + engineering boundary definition).
- **Confidence:** High on n8n presence (SRS-recommended); Medium on the n8n-vs-BullMQ boundary (engineering split).
- **Impact if changed:** Replacing n8n with Airflow/Python schedulers keeps every confirmed requirement but loses the §16.1 reference component and the operator-facing automation surface; removing n8n entirely and using BullMQ cron alone is technically sufficient for FR-163 but diverges from §16.1 and reduces non-technical operator autonomy.

---

## 18. Required-by-SRS vs Recommended vs Configurable

The table classifies every technology decision into the three SRS classes (§1.8). **Required-by-SRS** = the capability is a Confirmed requirement; **Recommended** = the specific technology is the SRS Recommended Reference Architecture or a documented engineering recommendation; **Configurable** = a value/choice that may change per environment, cost, or provider terms.

| Technology Area | Decision | Class |
| --- | --- | --- |
| Backend — application | Node.js + TypeScript microservices | **Recommended** (SRS §16.1/§17.2; FR-159/AR-001 capability is Required) |
| Backend — AI/data | Python (PyTest) AI/data/ingestion/evaluation services | **Recommended** (SRS §17.2; FR-114/AR-005 capability is Required) |
| Mobile | React Native (TypeScript) | **Recommended** (SRS §8.1 lists RN or Flutter; engineering picks RN); **Configurable** RN-vs-Flutter |
| Mobile — offline storage | SQLite local store + queued sync + field-level conflict merge | **Recommended** (SRS §8.5, ADR-004); offline-first capability is Required (AR-025, C-05) |
| Web/admin portal | Next.js (React 18, TypeScript), WCAG 2.1 AA | **Recommended** (engineering; web requirements FR-094/140, AR-030–034 are Required) |
| Relational database | PostgreSQL 16 | **Recommended** (SRS §13.1, ADR-003, §16.1); relational system-of-record is Required (AR-002, FR-162) |
| Vector database | Qdrant (`fathersnet_knowledge`, cosine, HNSW) | **Recommended** (SRS §9.3, ADR-003, §16.1); vector store is Required (AR-002) |
| Queue / message bus | Redis + BullMQ | **Recommended** (SRS §15.1/§16.1 provision Redis; BullMQ is engineering); event-driven bus is Required (FR-160, AR-007) |
| Cache | Redis 7 (shared cache/session/rate-limit) | **Recommended** (SRS §15.1/§16.1, AR-008, Appendix C.4) |
| Object storage | S3-compatible (GCS/S3; MinIO self-hosted) | **Recommended** (SRS §7.4.2 path/URL contract, FR-150; vendor is engineering) |
| Speech-to-text | AssemblyAI primary / Google STT fallback (EN + AM) | **Recommended** (SRS §7.4.2, §9.7); ASR capability is Required (FR-018/055/133) |
| LLM | Gemini 2.0 Flash → GPT-4o-mini → Claude 3 Haiku tiers | **Recommended** (SRS §9.8, ADR-005); fallback abstraction is Required (FR-072, AR-018); model names are **Configurable** |
| Embeddings | OpenAI text-embedding-3-small (1536) primary / Gemini fallback | **Recommended** (SRS §9.2 lists both; ordering is engineering); dimension 1536 **Configurable** at reindex time |
| WhatsApp | Meta Cloud API behind abstraction (360Dialog/Twilio alternates) | **Recommended** (SRS §7.1 candidates, engineering primary); provider abstraction is Required (FR-149, AR-004); provider is **Configurable** |
| Cloud hosting | GCP `africa-south1`, multi-zone, Terraform, Docker Compose reference + nginx, GKE path | **Recommended** (SRS ADR-006 approach, §16.1 topology); provider/region are **Configurable** engineering choices |
| CI/CD | GitHub Actions (§16.2 stages, canary, rollback, approval gates) | **Recommended** (SRS §16.2); CI/CD capability is Required (FR-167, AR-037) |
| Monitoring | OTel + Grafana stack (Prometheus/Loki/Tempo/Alertmanager) + Sentry + synthetic checks | **Recommended** (engineering, per Appendix C.4 open-source preference); observability capability is Required (FR-155, AR-038, NFR-037) |
| Workflow automation | n8n (per §16.1) + BullMQ for time-critical jobs | **Recommended** (SRS §16.1); scheduler/job capability is Required (FR-163, AR-007) |
| Deployment topology | nginx reverse proxy (TLS), Docker Compose reference, managed/orchestrated production equivalent | **Recommended** (SRS §16.1); containerized, reproducible, IaC-managed deployment is Required (NFR-036, AR-036) |

**Classification notes:**
- **Required-by-SRS** rows are the Confirmed capabilities (event-driven bus, relational+vector+object data plane, WhatsApp/AI provider abstraction, offline-first, observability, CI/CD, encryption) — these can never be dropped.
- **Recommended** rows are the named reference technologies; §1.8.2 permits replacement only with an engineering-evaluated equivalent that still satisfies the Confirmed requirement, and any replacement must be recorded as an ADR change in `decision-log.md`.
- **Configurable** rows are values (model names, dimensions, thresholds, regions, provider selection, RN-vs-Flutter) with pilot defaults; each has a documented default in the relevant plan document.

---

## 19. Technology Risk Register

Risks specific to technology choices; cross-cutting program risks live in `16-risk-management-plan.md` (SRS Appendix G).

| # | Technology | Risk | Likelihood | Impact | Mitigation | Owner |
| --- | --- | --- | --- | --- | --- | --- |
| R-01 | Node.js microservices | Services merge into a monolith or duplicate logic across services (AR-001, FR-159) | Medium | High (violates architecture; hard to scale NFR-006) | Enforced service boundaries, OpenAPI contract-first design, architecture review gate in CI (`03-system-architecture-plan.md`, `06-backend-development-plan.md`) | Backend lead |
| R-02 | Node ↔ Python seam | RAG/ASR/theme logic duplicated or mis-wired across the seam | Medium | Medium | Single internal AI API + queue contract, contract tests (QR-005) | AI + backend leads |
| R-03 | React Native | Offline sync bugs (duplicates, lost writes) or poor low-end-device performance | High | High (AR-025/FR-136, US-009) | Dedicated sync protocol, monotonic seq, server-authoritative revisions (§8.5), device matrix E2E (§17.4) | Mobile lead |
| R-04 | React Native | Design-system drift vs web portal (AR-029/034) | Medium | Medium | Shared tokens/component library, design audits | Product eng |
| R-05 | PostgreSQL | Slow queries / index drift at scale (NFR-007) | Medium | Medium | Index review (`05`), slow-query monitoring (§18.2), read replicas at scale (§16.3) | DB architect |
| R-06 | PostgreSQL | PITR/RPO misconfiguration causes data loss (NFR-012) | Low | Critical | PITR + daily fulls (§19), quarterly restore drills (OR-012) | DevOps |
| R-07 | Qdrant | Retrieval threshold/quality drift erodes AI grounding (NFR-047/048, C-01) | Medium | High | Eval set (QR-011/014), threshold monitoring, payload-filtered retrieval (AR-015) | AI architect |
| R-08 | Qdrant | Snapshot gaps for DR (§19) | Low | High | Nightly snapshots, restore verification in drills | DevOps |
| R-09 | Redis/BullMQ | Queue backlog during broadcasts or lost events (NFR-005, FR-161) | Medium | Medium | AOF persistence (§16.1), queue-depth/age alerting (§18.2), idempotency keys, dead-letter handling | Backend/DevOps |
| R-10 | Redis cache | Stale cached AI answers after content/prompt changes (FR-068/080) | Medium | Medium | Version-keyed cache entries, deterministic invalidation on lifecycle events (AR-015/016) | AI architect |
| R-11 | AssemblyAI/Google STT | Amharic transcription accuracy below eval threshold (FR-024/133, D-06) | Medium | High (journaling search FR-055, research themes FR-114) | Per-language eval scoring, fallback routing, human sampling (FR-071) | AI architect |
| R-12 | LLM tiers | Cross-tier quality drift or provider outage (FR-072, NFR-015) | Medium | Medium | Safety layer (AR-006), eval-set gates per tier, cost/quality routing table (§9.8) | AI architect |
| R-13 | Embeddings | Dimension/version change forces reindex; provider availability (AR-016) | Low | Medium | Versioned re-embedding, dimension immutable per collection | AI/Data eng |
| R-14 | Meta WhatsApp API | BSP availability/policy or template approval in Ethiopia (D-01, C-06) | Medium | High (WhatsApp-first channel, ADR-001) | Provider abstraction with 360Dialog/Twilio alternates, early template submission, opt-in records (FR-017) | Program + integration lead |
| R-15 | GCP region | Regional service availability/cost or data-residency expectations in Africa (D-03) | Medium | Medium | Region-locked service selection, Terraform isolation, documented residency decision, AWS alternate path | DevOps/security |
| R-16 | Cloud cost | AI/messaging/compute cost drift (A-07, C-03, AR-040) | High | Medium | Budget alerts, cost dashboards, cost-aware model routing, rightsizing | Program + DevOps |
| R-17 | GitHub Actions | Supply-chain compromise or secret leakage in CI (NFR-022) | Medium | High | Pinned actions, environment approval gates, TruffleHog/npm audit/pip-audit (§16.2), secrets manager (NFR-022) | DevOps/security |
| R-18 | Grafana/OTel stack | Observability gaps in AI pipeline or alert fatigue (§18.3) | Medium | Medium | SRS-mandated dashboards (AI latency/token/cost, queue depth), severity/escalation model (OR-008) | DevOps |
| R-19 | n8n | Workflow sprawl or unversioned automation logic (OR-005) | Medium | Medium | Workflows-as-code in repo, RBAC/basic auth (§16.1), review workflow | DevOps/ops |
| R-20 | Provider abstraction | Abstraction layers add latency or are bypassed by shortcuts (FR-149/072) | Low | High | Code-review rule: all third-party calls through adapters; provider-swap tests in staging (AR-004) | Engineering lead |

---

## 20. Verification Approach

Each decision is verified through a specific artifact or test before it is locked for pilot launch. Gates align with QR-001–QR-014 and §17.

| Technology | Verification Method | Gate / Evidence | Phase (Appendix D) |
| --- | --- | --- | --- |
| Node.js + TypeScript | Unit/integration suites with Jest; coverage gate ≥ 80% core (QR-002) | CI passes §16.2 `npm test` + coverage; OpenAPI contract tests (QR-005) | Phase 1 |
| Python AI/data | PyTest unit + pipeline integration tests; `pip-audit` clean | CI `pytest` green; pip-audit pass (QR-007) | Phase 1 |
| React Native + SQLite | Device-matrix E2E (low-end Android + iOS) incl. offline sync, push, assistive tech (§17.4) | Offline journey E2E green; no data loss/duplication (FR-136); AR-025 acceptance | Phase 4 |
| Web (Next.js) | Automated + manual WCAG 2.1 AA audit; role-based E2E | axe-core CI pass (QR-008); role-gate tests (FR-094, AR-030) | Phase 5 |
| PostgreSQL | Migration tests, constraint/immutability tests, index explain-plan review, load test | QR-003; NFR-007 slow-query target; consent immutability test (AR-012) | Phase 1 |
| Qdrant | Retrieval eval-set scores; ingestion/retrieval integration tests; snapshot restore test | ≥ 90% eval accuracy incl. retrieval quality (NFR-047, QR-011/014); DR drill restores snapshots (§19) | Phase 3 |
| Redis/BullMQ | Queue integration + failure-injection tests (retries, idempotency, DLQ); load test | FR-161 idempotency verified; NFR-005 broadcast window met | Phase 1/2 |
| Object storage | Signed-URL access-control tests; lifecycle retention test; malware-scan path | FR-019/150/AR-023 acceptance; retention purge audit (FR-105) | Phase 1/2 |
| ASR (AssemblyAI/Google) | EN + AM eval-set transcription scoring; fallback-failover test | Per-language accuracy threshold; fallback verified under simulated outage (FR-072-by-analogy, NFR-015) | Phase 3 |
| LLM tiers | Eval-set scoring per model; safety-layer regression; fallback-failover test | QR-014 release gate; ≥ 90% eval set (NFR-047); safety events monitored (NFR-050) | Phase 3 |
| WhatsApp (Meta + abstraction) | Mocked-provider webhook tests, signature validation, state-machine tests, provider-swap test | QR-010 suite; AR-004 provider-swap acceptance; template approval workflow verified | Phase 2 |
| Cloud hosting | IaC plan/apply in dev/staging/prod; multi-zone failover drill; DR drill | NFR-036 reproducible envs; NFR-012 RPO/RTO; AR-036/039 acceptance | Phase 1 |
| GitHub Actions | Full pipeline run per commit; release-gate enforcement; rollback drill | QR-013 gate enforced; FR-168 canary/rollback verified; QR-016 release review | Phase 1 |
| Observability | Dashboards for §18.2 surfaces; alert drill (queue depth, AI latency/cost, emergency failures) | OR-007/008 acceptance; alert fires within threshold (FR-166) | Phase 1 |
| n8n | Workflow-as-code export check; campaign/reminder workflow tests; basic-auth/RBAC check | FR-108/163 acceptance; workflows versioned in repo (OR-005) | Phase 2 |
| Cross-stack | End-to-end critical journey: registration → opt-in → weekly prompt → AI question → response (§17.4) | QR-004 E2E suite green before pilot; UAT (QR-017) and pilot evaluation (QR-018) | Phase 6/7 |

**Acceptance decision:** a technology is "locked" only when its verification gate passes in the relevant phase (Appendix D roadmap). Any decision that fails its gate returns to Section 2 for re-evaluation against the five criteria, and the outcome is recorded in `decision-log.md` as an ADR amendment per SRS §1.8.2.

---

## Cross-References

- System architecture and service boundaries: `03-system-architecture-plan.md`
- Database/migrations/indexes: `05-database-implementation-plan.md`
- Backend roadmap: `06-backend-development-plan.md`
- WhatsApp implementation: `07-whatsapp-platform-implementation-plan.md`
- AI/RAG implementation: `08-ai-rag-implementation-plan.md`
- Mobile implementation: `09-mobile-application-development-plan.md`
- Admin dashboard: `10-admin-dashboard-development-plan.md`
- DevOps/infrastructure: `12-devops-and-infrastructure-plan.md`
- Risk management: `16-risk-management-plan.md`
- Decision log: `decision-log.md`

**END OF DOCUMENT — 04. Technology Stack Analysis**
