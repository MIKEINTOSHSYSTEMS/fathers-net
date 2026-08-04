# 01. Current System Analysis (Repository Audit)

## 1. Executive Purpose

This document is the formal audit of the repository state performed before implementation planning. It establishes the implementation maturity level, classifies the project, and identifies everything that must be built. It also documents what exists so the planning phase never invents existing systems.

## 2. Repository Maturity Level

**Classification: GREENFIELD**

- Current state: **SRS-only documentation repository**. No application source code exists.
- Existing implementation maturity: **0%**
- Implementation starting point: **Architecture and foundation phase**
- Migration requirement: **None** — there is no existing system to migrate from.
- Architecture alignment with SRS: **N/A** — no architecture exists to compare; the SRS defines the target.

**Reasoning:** The repository contains only documentation artifacts (the SRS, planning prompts, the authoritative business guide, and a session log). There are no source files, no dependency manifests, no tests, no database migrations, no deployment configuration, and no APIs. By definition this is a greenfield build: the SRS is the complete statement of what must be implemented.

## 3. Folder Structure

| Path | Content | Role |
| --- | --- | --- |
| `README.md` | Placeholder root readme | Not substantive |
| `LICENSE` | Standard license file | — |
| `.gitignore` | Empty/minimal gitignore | To be extended |
| `docs/FathersNet-Complete-SRS.md` | **FN-SRS-001 v2.0** (3,425 lines; 20 sections; 349 requirements) | **Single source of truth** |
| `docs/SRS-Parts/` | Split working parts 01–09 used to assemble the SRS | Superseded working artifacts |
| `docs/tasks/audit_001.md` | Prior audit notes | Historical working note |
| `Z/` | Working area: `prompt/` (original planning prompts), `note/`, `sessions/`, `bak/`, `SRS-Parts/` | Historical working area; not application code |
| `Z/bak/Guide.docx` | Authoritative business guide (*FathersNet: Your Guide to Supporting Your Family*) | Content source of truth for knowledge base; never modified |
| `implementation-plan/` | This plan (created during planning phase) | Controlling engineering reference |

## 4. Existing Technology Stack

**None.** There is no implemented technology stack. The SRS specifies a **Recommended Reference Architecture** that the implementation must follow:

- **Backend:** Node.js (recommended per SRS §16.1 Docker reference and §17.2 Jest guidance) microservices; Python for AI/data services (PyTest guidance §17.2).
- **Database:** PostgreSQL (SRS §13.1, ADR-003); vector store Qdrant (SRS §9.3, ADR-003); object storage (SRS §13.1).
- **Cache/queue:** Redis; message bus/queue (SRS §15.1, §16.1).
- **Workflow automation:** n8n (SRS §16.1).
- **Messaging:** WhatsApp Business API provider behind abstraction layer (SRS §7.1, ADR-001).
- **AI:** LLM provider with fallback tiers (SRS §9.8, ADR-005); embeddings; AssemblyAI primary / Google Speech-to-Text fallback (SRS §7.4.2, §9.7).
- **Mobile:** cross-platform framework (React Native or Flutter) with SQLite offline storage (SRS §8.5, ADR-004).
- **Deployment:** Docker Compose reference; GitHub Actions CI/CD (SRS §16).

## 5. Existing Implemented Features

**None.** No application features exist. All features are defined in the SRS and enumerated in `00-requirement-inventory.md`.

## 6. Existing Architecture

**None.** No runtime architecture exists. Target architecture is defined in SRS §15.1 (Overall System Architecture), §15.4 (ADRs), §16 (Deployment), and analyzed in `03-system-architecture-plan.md`.

## 7. Missing Components Compared With SRS

Every SRS component is missing. The complete gap list:

| SRS Area | Missing Implementation |
| --- | --- |
| §12 API platform | All API groups (auth, user, WhatsApp, content, checklist, budget, AI, journal, admin) |
| §13 Database | All 26+ tables, migrations, indexes |
| §4 FR-159/160/161 | Microservices, event bus, idempotency |
| §7 WhatsApp | Provider abstraction, webhook, state machine, templates, media pipeline |
| §9 AI/RAG | Ingestion, chunking, embeddings, vector store, retrieval, safety layer, model fallback |
| §8 Mobile | Android/iOS app, offline SQLite, sync engine, notifications |
| §11 Admin | Web portal: dashboards, user mgmt, CMS, campaigns, AI ops, research |
| §14 Security | Auth (OTP/MFA), RBAC, encryption, audit, threat model controls |
| §15 Architecture | Gateway, services, queues, observability |
| §16 DevOps | Docker Compose, CI/CD, environments, backups, monitoring |
| §17 Testing | Full test pyramid, AI eval set, privacy tests |
| §10 Research | Anonymized schema, theme extraction, export governance |
| §18/19 Ops/DR | Runbooks, alerting, DR drills, business continuity |

## 8. Technical Debt

**None — greenfield.** No legacy code, no outdated dependencies, no undocumented systems. The opportunity: establish zero-debt baseline from day one via the standards in `19-engineering-handoff-package.md`.

## 9. Security Concerns

No live system to compromise. Security work is forward-looking and mandatory:

1. **Secrets handling:** no secret manager configured; all provider credentials (WhatsApp, LLM, ASR, DB) must be introduced via a secret manager (SRS §14.2, NFR-022).
2. **Consent immutability:** must be designed into schema from the first migration (SRS §13.3.4, AR-012).
3. **AI safety:** the medical safety layer is a first-class component, not an afterthought (SRS §9.6, NFR-046).
4. **Webhook security:** signature validation must exist from first WhatsApp integration (SRS §7.4.1, §12.4).
5. **Phone as PII:** never a primary key; encrypted at rest; masked in admin views (SRS §13.3.1, FR-022).

## 10. Architecture Concerns

1. **Service granularity:** SRS §15.1 defines 7 core services + AI sub-services. Recommend starting with a small number of services (API + auth, user/pregnancy, reminder, WhatsApp/conversation, content, campaign, research, AI orchestration) and avoiding premature splitting.
2. **Offline sync complexity:** partner sync + offline journaling with field-level conflict resolution (SRS §8.4/§8.5) is a high-complexity area; plan a dedicated sync protocol.
3. **WhatsApp 24-hour window:** template vs. free-form messaging rules (SRS §7.4.3) constrain all outbound flows; the message gateway must enforce them.
4. **AI cost/latency:** Gemini Flash primary with fallback tiers (SRS §9.8) must be routed by intent cost classes to meet NFR-009.
5. **Environment isolation:** dev/staging/prod must never share production data (AR-009); synthetic data pipeline required from the start (QR-012).

## 11. Migration Recommendations

**Not applicable.** No existing system. Migration tooling is still required by the SRS (FR-164) for schema evolution and environment-to-environment data movement, and is planned in `05-database-implementation-plan.md` and `12-devops-and-infrastructure-plan.md`.

## 12. Development Risks (At-a-Glance)

Full treatment in `16-risk-management-plan.md`. Headline risks:

1. AI grounding/safety failures → unsafe health answers (C-01, NFR-046).
2. WhatsApp platform policy/template approval delays (D-01, C-06).
3. Clinical content readiness gating the knowledge base (D-04, QR-019).
4. Offline sync conflict-resolution bugs (AR-025, FR-136).
5. Research governance blocking data collection/export (FR-122, NFR-042).
6. Cost overrun on AI tokens and messaging (A-07, AR-040).

## 13. Repository Change Control

Per planning-phase rules, the repository is unchanged except for the addition of the `implementation-plan/` directory. No source files, dependencies, configurations, or documentation files were modified.
