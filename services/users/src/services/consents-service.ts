import { ConflictError, NotFoundError, ValidationError, type ErrorField } from '@fathersnet/errors';
import type { Logger } from '@fathersnet/logger';
import { buildOutboxEntry } from './events';
import type { ConsentRecord, ConsentState, ConsentType, UsersStore } from './store/types';

export interface ConsentsServiceOptions {
  store: UsersStore;
  logger: Logger;
  /** Injectable clock (milliseconds) for deterministic tests. */
  nowMs?: () => number;
}

export interface GrantConsentInput {
  consentType: ConsentType;
  version: string;
  requestId?: string;
}

export interface WithdrawConsentInput {
  /** Id of the granted consent record being withdrawn. */
  consentId: string;
  requestId?: string;
}

export interface ConsentStatusDto {
  consentType: ConsentType;
  /** Current state, derived from the most recent record (AR-012 ordering). */
  state: ConsentState;
  version: string;
  grantedAt: string;
  withdrawnAt: string | null;
  /** Full immutable record stream, oldest first — proof of consent (FR-125). */
  history: ConsentRecord[];
}

export const CONSENT_TYPES: readonly ConsentType[] = [
  'participation',
  'research',
  'media',
  'whatsapp_opt_in',
];

/**
 * `true` when `a` sorts after `b` in the `004` trigger's
 * `ORDER BY granted_at DESC, id DESC` — the authoritative "latest" ordering.
 */
function isLater(a: ConsentRecord, b: ConsentRecord): boolean {
  if (a.grantedAt !== b.grantedAt) {
    return a.grantedAt > b.grantedAt;
  }
  return a.id > b.id;
}

function latestByType(records: readonly ConsentRecord[], type: ConsentType): ConsentRecord | null {
  let latest: ConsentRecord | null = null;
  for (const record of records) {
    if (record.consentType !== type) {
      continue;
    }
    if (!latest || isLater(record, latest)) {
      latest = record;
    }
  }
  return latest;
}

/**
 * Consent lifecycle domain service (WP-018, SRS §12.3 / §13.3.4, AR-012).
 * Owns grant / re-consent / withdrawal and the append-only history view
 * (FR-003/FR-004/FR-125/FR-117). Every operation is self-scoped — the caller's
 * durable user id is always the store key, never a caller-supplied one. State
 * transitions are pre-checked here and enforced atomically by the `004` state
 * guard (single active grant per type, first record must be a grant).
 * Published `user.consent.changed` events carry only `user_id, consent_type,
 * version, state` — no PII (FR-022).
 */
export class ConsentsService {
  private readonly nowMs: () => number;

  constructor(private readonly options: ConsentsServiceOptions) {
    this.nowMs = options.nowMs ?? Date.now;
  }

  async getConsents(userId: string): Promise<{ consents: ConsentStatusDto[] }> {
    await this.requireUser(userId);
    const records = await this.options.store.getConsents(userId);
    const consents: ConsentStatusDto[] = [];
    for (const type of CONSENT_TYPES) {
      const history = records.filter((record) => record.consentType === type);
      if (history.length === 0) {
        continue;
      }
      const latest = latestByType(history, type) as ConsentRecord;
      consents.push({
        consentType: type,
        state: latest.state,
        version: latest.version,
        grantedAt: latest.grantedAt,
        withdrawnAt: latest.withdrawnAt,
        history,
      });
    }
    return { consents };
  }

  async grantConsent(userId: string, input: GrantConsentInput): Promise<ConsentRecord> {
    await this.requireUser(userId);
    this.validateGrant(input);

    const records = await this.options.store.getConsents(userId);
    const latest = latestByType(records, input.consentType);
    if (latest && latest.state === 'granted') {
      throw new ConflictError(`Consent '${input.consentType}' is already granted`);
    }

    const record = await this.options.store.insertConsent(
      {
        userId,
        consentType: input.consentType,
        version: input.version,
        state: 'granted',
        grantedAt: new Date(this.nowMs()).toISOString(),
        withdrawnAt: null,
      },
      [
        buildOutboxEntry({
          type: 'user.consent.changed',
          payload: {
            user_id: userId,
            consent_type: input.consentType,
            version: input.version,
            state: 'granted',
          },
          aggregate: { type: 'user', id: userId },
        }),
      ],
    );

    this.options.logger.info('users.consent_granted', 'consent granted', {
      user_id: userId,
      consent_type: record.consentType,
      version: record.version,
    });

    return record;
  }

  async withdrawConsent(userId: string, input: WithdrawConsentInput): Promise<ConsentRecord> {
    await this.requireUser(userId);

    const consent = await this.options.store.findConsentById(userId, input.consentId);
    if (!consent) {
      throw new NotFoundError('Consent not found');
    }

    const records = await this.options.store.getConsents(userId);
    const latest = latestByType(records, consent.consentType);
    if (!latest || latest.state !== 'granted') {
      throw new ConflictError(`Consent '${consent.consentType}' is already withdrawn`);
    }

    const withdrawnAt = new Date(this.nowMs()).toISOString();
    const record = await this.options.store.insertConsent(
      {
        userId,
        consentType: consent.consentType,
        version: consent.version,
        state: 'withdrawn',
        grantedAt: withdrawnAt,
        withdrawnAt,
      },
      [
        buildOutboxEntry({
          type: 'user.consent.changed',
          payload: {
            user_id: userId,
            consent_type: consent.consentType,
            version: consent.version,
            state: 'withdrawn',
          },
          aggregate: { type: 'user', id: userId },
        }),
      ],
    );

    this.options.logger.info('users.consent_withdrawn', 'consent withdrawn', {
      user_id: userId,
      consent_type: record.consentType,
      version: record.version,
    });

    return record;
  }

  private async requireUser(userId: string): Promise<void> {
    const user = await this.options.store.findById(userId);
    if (!user) {
      throw new NotFoundError('User not found');
    }
  }

  private validateGrant(input: GrantConsentInput): void {
    const fields: ErrorField[] = [];
    if (!CONSENT_TYPES.includes(input.consentType)) {
      fields.push({
        field: 'consent_type',
        reason: 'must be one of: participation, research, media, whatsapp_opt_in',
      });
    }
    if (!input.version || input.version.length > 100) {
      fields.push({ field: 'version', reason: 'must be 1-100 characters' });
    }
    if (fields.length > 0) {
      throw new ValidationError('Invalid consent grant', fields);
    }
  }
}
