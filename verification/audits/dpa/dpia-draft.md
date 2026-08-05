# Data Protection Impact Assessment (DPIA) — DRAFT

**Document:** FathersNet (Ayay) — Data Protection Impact Assessment + Record of Processing Activities (draft for review)
**Status:** **DRAFT — NOT SIGNED.** Produced during Phase 2 foundation preparation.
No privacy sign-off is claimed. Final approval (G1-06) is a human decision under
`implementation-plan/18` §2.1 and FR-132 / NFR-028.
**Authority source of truth:** `docs/FathersNet-Complete-SRS.md` §14.5 (privacy-by-design),
§14.8 (healthcare data governance), §14.9 (privacy requirements), §14.12 (data ownership),
§13.3 (tables incl. `consents` §13.3.4, `research_users` §13.3.23, `ai_conversations` §13.3.20),
§1.10 (no self-claimed certification — "designed to support alignment"); FR-124, FR-125, FR-128,
FR-119, FR-132; NFR-025…029; OR-022.
**Planned evidence artifact (final):** `verification/audits/dpa/PRI-FR132-NFR028-<date>-<run#>-dpia.md`
**Review owners (human, not assigned by this document):** Privacy Advisor / Program legal review.

---

## 1. Processing Overview

FathersNet is an Ethiopia-first digital fatherhood and family-health platform. It processes
personal and health-related data of users (fathers/guardians) across five surfaces — mobile app,
WhatsApp, web admin/research portal, AI assistant (RAG), research/evidence pipeline.

| Attribute                  | Value                                                                                                                                                                                                                      |
| -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Controller of record       | FathersNet program (to be confirmed by legal review, NFR-041)                                                                                                                                                              |
| Lawful-basis determination | **Open — to be confirmed by legal review.** Candidates: consent (participation/research/media/WhatsApp opt-in, §13.3.4), contract (service provision), and legal obligations. No basis is asserted as final in this draft. |
| Cross-border transfers     | WhatsApp, LLM/embedding, ASR, notification, and cloud processors — DPAs required and transfer compliance to be confirmed (NFR-029).                                                                                        |
| Data minimisation          | Every collected field must map to an approved purpose (FR-124, §14.5).                                                                                                                                                     |
| Data-subject rights        | Access, rectification, erasure, portability, restriction, deletion-of-media (FR-128, NFR-026; `11` §9.3).                                                                                                                  |

## 2. Data Classes and Processing (SRS §14.8 / `11` §9.4)

| Class               | Examples                                          | Purposes                             | Retention (configurable)                  | Key controls                                        |
| ------------------- | ------------------------------------------------- | ------------------------------------ | ----------------------------------------- | --------------------------------------------------- |
| Public              | Marketing content                                 | Content delivery                     | n/a                                       | None                                                |
| Internal            | Analytics aggregates                              | Operations, reporting                | Per policy                                | Role-gated access                                   |
| Confidential        | Profiles, consents, journey data                  | Service delivery, consent management | Per data class                            | Encrypted; least privilege; consent-gated           |
| Highly Confidential | Journal, voice/photo media, pregnancy/health info | Core product + healthcare safety     | Per data class; secure deletion (NFR-024) | Encrypted; ownership-scoped; audit-logged (`11` §8) |

Processing activities register (extended in the final artifact): account + OTP auth, journal
(FR-052), pregnancy tracking, reminder scheduling, WhatsApp messaging/campaigns (opt-in gated,
FR-017/FR-112), AI assistant with RAG (pseudonymized question/answer, §13.3.20), research
(anonymized cohort, FR-122/AR-013), media storage (voice/photo), admin/support, exports
(FR-127), deletion/purge jobs (FR-105/AR-014).

## 3. High-Risk Processing Identification (FR-132)

| Processing                      | Risk driver                                     | Measures that reduce risk                                                                                     |
| ------------------------------- | ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| Journal + pregnancy/health data | Sensitive data; healthcare-adjacent             | Ownership-scoped encryption; consent lifecycle; audit logging; referral for emergency (FR-063)                |
| Voice/photo media               | Intimate/identifiable content                   | Encrypted at rest; signed expiring URLs; malware scan; retention + verifiable deletion                        |
| AI processing with RAG          | Sensitive content; provider transfer            | Pseudonymization before provider calls (FR-073/AR-019); medical safety layer; DPA; no-PHI-to-providers        |
| Research pipeline               | Large-scale processing of special-category data | Pseudonymization at collection (FR-119); research schema separation (AR-013); approval-gated exports (FR-116) |
| WhatsApp channel                | Third-party processing; message content         | Opt-in consent; webhook HMAC; template governance; DPA (NFR-029)                                              |

## 4. Data Subject Rights Implementation (FR-128, NFR-026)

| Right          | Implementation                                                                                                 | SLA (configurable) |
| -------------- | -------------------------------------------------------------------------------------------------------------- | ------------------ |
| Access         | `GET /v1/users/me`, consents view, self-service                                                                | Defined SLA        |
| Rectification  | `PATCH /v1/users/me`, pregnancy update                                                                         | Defined SLA        |
| Erasure        | `DELETE /v1/users/me` → request → confirmation → grace period → purge → deletion record (FR-007, §14.8)        | Defined SLA        |
| Portability    | `POST /v1/users/me/export` → PDF/JSON delivered securely (FR-057)                                              | Defined SLA        |
| Restriction    | Consent withdrawal stops non-essential processing (FR-004); research restricted on research-consent withdrawal | Defined SLA        |
| Media deletion | Secure deletion incl. copies with verification where required (NFR-024, FR-105)                                | Defined SLA        |

## 5. Consent Lifecycle (FR-125, §13.3.4)

- Capture: plain-language Terms & Privacy at registration; explicit acceptance required (FR-003).
- Versioning: `consents.version`; types participation / research / media / whatsapp_opt_in.
- Re-consent on template/purpose change (§14.8).
- Withdrawal: `POST /v1/users/me/consents/:id/withdraw` → `withdrawn`; audit preserved (FR-004).
- Proof: immutable, versioned, timestamped consent events (AR-012).
- Broadcasts only to `whatsapp_opt_in`; opt-out removes immediately (FR-017, FR-112).

## 6. Research Pseudonymization (FR-119, NFR-027, AR-013)

- De-identification at collection; `research_users` holds only anonymized cohort identities (FR-122).
- Research data physically/logically separated and restricted; dashboards operate on anonymized aggregates (AR-032).
- Exports ethics/approval-gated, de-identified, aggregated, fully audited (FR-116).
- Research consent independent and revocable (FR-117).

## 7. Third-Party Processors and Transfers (NFR-029)

| Processor category      | Purpose             | DPA required | Notes                                   |
| ----------------------- | ------------------- | ------------ | --------------------------------------- |
| WhatsApp (Meta)         | Messaging/campaigns | Yes          | Webhook HMAC; template governance       |
| LLM/embedding providers | AI assistant        | Yes          | Pseudonymized payloads; no PHI (FR-073) |
| ASR/transcription       | Voice input         | Yes          | Pseudonymized                           |
| Notification providers  | Reminders           | Yes          | Minimal data                            |
| Cloud provider          | Hosting             | Yes          | IaC; AR-009 isolation (M-01 dependent)  |

Cross-border transfer compliance is flagged for legal confirmation (NFR-029; SRS §1.10).

## 8. Risk Conclusion (draft)

Residual risk after the measures in sections 3–7 is assessed as **medium** overall at this draft
stage, concentrated in healthcare-sensitive processing and third-party transfer. This is not a
final determination: the DPIA must be completed, signed (G1-06), and reviewed before go-live
(FR-132: "completed and recorded before go-live for high-risk processing").

## 9. Open Items for Review

1. Lawful-basis determination per processing activity — legal review (NFR-041).
2. Controller-of-record entity and contact path.
3. Transfer mechanism for each cross-border processor (NFR-029).
4. Data-retention schedule per data class confirmed with program + legal.
5. This draft must be approved by the human Privacy approvers before the final evidence
   artifact name (`PRI-FR132-NFR028-…`) is used.

---

**Status: DRAFT — pending human privacy/legal review and sign-off. No approval claimed.**
