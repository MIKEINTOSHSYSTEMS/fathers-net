# STRIDE Threat Model — DRAFT

**Document:** FathersNet (Ayay) — STRIDE threat model (draft for review)
**Status:** **DRAFT — NOT SIGNED.** Produced during Phase 2 foundation preparation.
No security sign-off is claimed. Final approval (G1-05) is a human decision under
`implementation-plan/18` §2.1 (Produced → Passed → Signed) and NFR-019/FR-130.
**Authority source of truth:** `docs/FathersNet-Complete-SRS.md` §14.1 (STRIDE analysis),
§14.4 (OWASP mapping), §15.1 (trust zones); `implementation-plan/11-security-and-privacy-plan.md`
§2 (defense-in-depth, trust zones), §3–§14 (controls).
**Planned evidence artifact (final):** `verification/audits/threat-model/SEC-FR130-NFR019-<date>-<run#>-threat-model.md`
**Review owners (human, not assigned by this document):** Security Engineer / Privacy Advisor (`15` team roles).

---

## 1. Scope and Method

- **Method:** STRIDE-per-element analysis over the six trust zones (Z1–Z6) and the eight
  SRS §14.1 attack areas, following the SRS per-area template:
  threat / impact / likelihood / mitigation / detection.
- **Assets in scope:** user identity (OTP, tokens), journal, health/pregnancy data, voice/photo
  media, consents, research data, AI conversations, audit logs, WhatsApp/messaging, admin surface.
- **Out of scope (this draft):** final penetration-test schedule, vendor-specific controls,
  and the signed approval record.
- **Data-flow basis:** SRS §15.1 system diagram and `03` §9 diagrams.

## 2. Trust Zones (from `11` §2.2)

| Zone                   | Components                                                                   | Trust                        | Key boundary controls                                                                       |
| ---------------------- | ---------------------------------------------------------------------------- | ---------------------------- | ------------------------------------------------------------------------------------------- |
| Z1 Client              | Mobile, WhatsApp client, web admin                                           | Untrusted                    | TLS 1.2+; bearer tokens; OTP; fingerprint; signed expiring URLs                             |
| Z2 Edge                | API Gateway, Message Gateway/Webhooks, Auth service                          | Semi-trusted                 | Webhook HMAC (§7.4.1); rate limits (§12.1); WAF; TLS termination                            |
| Z3 Core                | User/Profile, Pregnancy, Reminder, Conversation, Content, Campaign, Research | Trusted (internal)           | Service-to-service mTLS/network policy; JWT role/ownership claims                           |
| Z4 AI                  | Orchestration, Medical Safety, RAG, ASR, NLU                                 | Trusted, external-call-aware | Pseudonymization before provider calls (FR-073, AR-019); DPA (NFR-029)                      |
| Z5 Data                | PostgreSQL, Object Storage, Redis, Queue                                     | Trusted (internal)           | Encryption at rest; KMS; role-separated DB credentials; research schema separation (AR-013) |
| Z6 External processors | WhatsApp, LLM/embedding, ASR, notification providers                         | Untrusted (contracted)       | DPA; signed inbound webhooks; outbound allow-list; per-provider secrets                     |

## 3. STRIDE-by-Category Summary

| STRIDE category                | Primary zones | Representative threats (SRS §14.1)                                                                      |
| ------------------------------ | ------------- | ------------------------------------------------------------------------------------------------------- |
| **S — Spoofing**               | Z1→Z2, Z6→Z2  | OTP interception, token theft, webhook signature forgery (§14.1.1, §14.1.5)                             |
| **T — Tampering**              | Z2→Z3, Z3→Z5  | Broken access control / IDOR / role escalation; media tampering (§14.1.2, §14.1.8)                      |
| **R — Repudiation**            | Z3, Z5        | Disputed consent/export/delete actions — addressed by append-only tamper-evident audit (§14.3, NFR-023) |
| **I — Information disclosure** | Z3→Z5, Z4→Z6  | PII/health-data leakage via storage/logs/exports/processors (§14.1.3)                                   |
| **D — Denial of service**      | Z1→Z2, Z6→Z2  | API/messaging abuse, scraping, cost spikes (§14.1.6)                                                    |
| **E — Elevation of privilege** | Z2→Z3, Z3→Z5  | Insider misuse; privilege escalation via broken access control (§14.1.2, §14.1.7)                       |

## 4. Threat Register (per SRS §14.1)

Each row follows the SRS template; the Mitigation/Detection columns restate the SRS controls
and link to the `11` plan sections that implement them.

| #    | Threat (SRS §14.1.x)                                                          | Impact                                                               | Likelihood  | Mitigation (implemented by `11`)                                                                                                                                           | Detection                                                                                    |
| ---- | ----------------------------------------------------------------------------- | -------------------------------------------------------------------- | ----------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| T-01 | Auth spoofing: OTP interception, token theft, credential stuffing (14.1.1)    | Account takeover; unauthorized access to private journal/health data | Medium–High | OTP expiry + lockout, rate limiting, device fingerprinting, short-lived access tokens, refresh-token rotation, MFA on admin (`11` §3)                                      | Failed-OTP counters, token-reuse alarms, login anomaly detection, audit logging              |
| T-02 | Authorization failure: IDOR / role escalation (14.1.2)                        | Access to another user's data; unauthorized admin actions            | Medium      | Server-side RBAC + ownership checks on every endpoint; deny-by-default; field-level trimming; segregation of duties (`11` §4, §5)                                          | Access-denial audit events; anomalous cross-user access patterns; negative authz tests in CI |
| T-03 | Data leakage: PII/health data via storage, logs, exports, processors (14.1.3) | Privacy breach; regulatory exposure; loss of trust                   | Medium      | Encryption at rest/in transit; data minimization; research pseudonymization; no PII in logs; signed expiring media URLs; DPAs (`11` §6, §8, §9)                            | Access-log review; DLP checks; secret scanning; periodic privacy reviews                     |
| T-04 | AI prompt injection / jailbreak (14.1.4)                                      | Unsafe/policy-violating responses; system-instruction override       | Medium–High | Input safety classification; hardened system prompt; output safety layer; RAG grounding to approved chunks; no tool access from user text; injection test suite (`11` §10) | Safety-layer violations logged; injected-content regression tests; AI ops review queue       |
| T-05 | Webhook spoof/replay/forgery (14.1.5)                                         | False emergency handling; message injection; data pollution          | Medium      | `X-Hub-Signature-256` HMAC, constant-time comparison, idempotency keys, TLS, secret rotation (`11` §11)                                                                    | Signature-mismatch alerts; duplicate message-ID detection; webhook security tests            |
| T-06 | API abuse / DoS / scraping (14.1.6)                                           | Cost spikes; degraded service; data harvesting                       | High        | Rate limiting at gateway and per endpoint; AI/messaging quotas; abuse detection; WAF (`11` §3.4)                                                                           | Rate-limit counters; anomaly detection; cost alerts                                          |
| T-07 | Insider access misuse (14.1.7)                                                | Privacy breach; research contamination; data tampering               | Low–Medium  | Least privilege; MFA; segregation of duties; read-only audit roles; data-access justification (`11` §4, §5)                                                                | Comprehensive audit logging; anomaly reviews; quarterly access reviews                       |
| T-08 | Malware uploads via media (14.1.8)                                            | Malware on storage/infrastructure; moderation bypass                 | Medium      | File type/size validation; malware scanning on upload; isolated storage; signed URLs; no execution of uploads (`11` §12)                                                   | Scan results logged; quarantine alerts                                                       |

## 5. Control Mapping to OWASP (SRS §14.4 / `11` §13)

| OWASP 2021                       | Threat row(s) | Controls                                                                    |
| -------------------------------- | ------------- | --------------------------------------------------------------------------- |
| A01 Broken Access Control        | T-02, T-07    | `11` §4 denial-by-default + ownership; §5 RBAC/SoD; negative authz CI suite |
| A02 Cryptographic Failures       | T-01, T-03    | `11` §6 encryption; §7 KMS; app-level `phone_e164`                          |
| A03 Injection                    | T-04          | Parameterized SQL (FR-129); LLM output encoding; input validation           |
| A04 Insecure Design              | all           | This STRIDE model; DPIA (FR-132); design-review gate (NFR-019)              |
| A05 Security Misconfiguration    | T-03          | IaC + drift detection; hardening baselines; CORS allow-list                 |
| A06 Vulnerable Components        | —             | CI SCA gate (NFR-016); patch cadence; supply-chain scanning                 |
| A07 Identification/Auth Failures | T-01          | `11` §3 OTP/MFA/token lifecycle                                             |
| A08 Software/Data Integrity      | T-05, T-02    | HMAC webhooks; idempotency; append-only audit (NFR-023); SBOM               |
| A09 Logging/Monitoring Failures  | T-07          | `11` §8 audit/security logging; centralized observability (FR-166)          |
| A10 SSRF                         | T-06          | Zone isolation; egress allow-list; no user-controlled server-side fetches   |

## 6. Open Items for Review

1. Confirm likelihood ratings against pilot operating context (Ethiopia, low-bandwidth, voice-first).
2. Confirm per-zone service-to-service authentication mechanism (mTLS vs network policy) once M-01 resolves.
3. Confirm breach-notification scope with legal review before final sign-off (NFR-041; SRS §1.10 — no self-claimed certification).
4. Schedule the annual STRIDE refresh and re-review on significant changes (NFR-019).
5. This draft must be approved (G1-05) by the human Security/Privacy approvers before the final
   evidence artifact name (`SEC-FR130-NFR019-…`) is used.

---

**Status: DRAFT — pending human security/privacy review and sign-off. No approval claimed.**
