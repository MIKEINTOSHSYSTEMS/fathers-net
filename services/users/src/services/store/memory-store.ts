import { randomUUID } from 'node:crypto';
import { ConflictError } from '@fathersnet/errors';
import type {
  ConsentRecord,
  CreateConsentInput,
  CreateUserInput,
  PreferencesRecord,
  PreferencesUpsertInput,
  PregnancyRecord,
  PregnancyUpsertInput,
  ProfilePatch,
  ProfileRecord,
  UserRecord,
  UsersStore,
} from './types';

/**
 * In-memory users store — the hermetic test-double (M-08). Mirrors the
 * Postgres adapter's invariants: the phone is only ever the ciphertext the
 * caller passes in (this store never sees the plaintext), the keyed digest is
 * unique, and the user row is created together with its child rows. The
 * `consents` stream is append-only: `insertConsent` enforces the same state
 * guard as the `004` trigger (AR-012) so hermetic tests exercise the real
 * transition rules.
 */
export function createMemoryUsersStore(): UsersStore {
  const users = new Map<string, UserRecord>();
  const byDigest = new Map<string, string>();
  const profiles = new Map<string, ProfileRecord>();
  const pregnancies = new Map<string, PregnancyRecord>();
  const preferences = new Map<string, PreferencesRecord>();
  const consents = new Map<string, ConsentRecord[]>();

  function touch(user: UserRecord): UserRecord {
    const next: UserRecord = { ...user, updatedAt: new Date().toISOString() };
    users.set(user.id, next);
    return next;
  }

  /** `true` when `a` sorts after `b` in the trigger's `ORDER BY granted_at DESC, id DESC`. */
  function isLater(a: ConsentRecord, b: ConsentRecord): boolean {
    if (a.grantedAt !== b.grantedAt) {
      return a.grantedAt > b.grantedAt;
    }
    return a.id > b.id;
  }

  function latestOf(records: readonly ConsentRecord[]): ConsentRecord | null {
    let latest: ConsentRecord | null = null;
    for (const record of records) {
      if (!latest || isLater(record, latest)) {
        latest = record;
      }
    }
    return latest;
  }

  return {
    async findByPhoneDigest(digest: string): Promise<UserRecord | null> {
      const id = byDigest.get(digest);
      if (!id) {
        return null;
      }
      return users.get(id) ?? null;
    },

    async findById(id: string): Promise<UserRecord | null> {
      return users.get(id) ?? null;
    },

    async getProfile(userId: string): Promise<ProfileRecord | null> {
      return profiles.get(userId) ?? null;
    },

    async getPregnancy(userId: string): Promise<PregnancyRecord | null> {
      return pregnancies.get(userId) ?? null;
    },

    async getPreferences(userId: string): Promise<PreferencesRecord | null> {
      return preferences.get(userId) ?? null;
    },

    async createUser(input: CreateUserInput): Promise<UserRecord> {
      const now = new Date().toISOString();
      const id = randomUUID();
      const user: UserRecord = {
        id,
        phoneE164: input.phoneE164,
        phoneE164Digest: input.phoneE164Digest,
        role: input.role,
        status: 'active',
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
      };
      users.set(id, user);
      byDigest.set(input.phoneE164Digest, id);
      profiles.set(id, { userId: id, ...input.profile });
      if (input.pregnancy) {
        pregnancies.set(id, {
          id: randomUUID(),
          userId: id,
          edd: input.pregnancy.edd,
          lmp: input.pregnancy.lmp,
          pregnancyWeek: input.pregnancy.pregnancyWeek,
          trimester: input.pregnancy.trimester,
          partnerUserId: null,
        });
      }
      if (input.preferences) {
        preferences.set(id, { userId: id, ...input.preferences });
      }
      return user;
    },

    async updateProfile(userId: string, patch: ProfilePatch): Promise<ProfileRecord> {
      const existing = profiles.get(userId);
      if (!existing) {
        throw new Error(`No profile for user ${userId}`);
      }
      const next: ProfileRecord = { ...existing, ...patch };
      profiles.set(userId, next);
      const user = users.get(userId);
      if (user) {
        touch(user);
      }
      return next;
    },

    async upsertPregnancy(userId: string, input: PregnancyUpsertInput): Promise<PregnancyRecord> {
      const existing = pregnancies.get(userId);
      const next: PregnancyRecord = {
        id: existing?.id ?? randomUUID(),
        userId,
        edd: input.edd,
        lmp: input.lmp,
        pregnancyWeek: input.pregnancyWeek,
        trimester: input.trimester,
        partnerUserId: existing?.partnerUserId ?? null,
      };
      pregnancies.set(userId, next);
      const user = users.get(userId);
      if (user) {
        touch(user);
      }
      return next;
    },

    async upsertPreferences(
      userId: string,
      input: PreferencesUpsertInput,
    ): Promise<PreferencesRecord> {
      const existing = preferences.get(userId);
      const next: PreferencesRecord = {
        userId,
        language: input.language ?? existing?.language ?? null,
        quietHours: input.quietHours ?? existing?.quietHours ?? null,
        notificationChannels: input.notificationChannels ?? existing?.notificationChannels ?? null,
        contentCategories: input.contentCategories ?? existing?.contentCategories ?? null,
      };
      preferences.set(userId, next);
      const user = users.get(userId);
      if (user) {
        touch(user);
      }
      return next;
    },

    async getConsents(userId: string): Promise<ConsentRecord[]> {
      const list = consents.get(userId) ?? [];
      return [...list]
        .sort((a, b) =>
          a.grantedAt === b.grantedAt
            ? a.id < b.id
              ? -1
              : a.id > b.id
                ? 1
                : 0
            : a.grantedAt < b.grantedAt
              ? -1
              : 1,
        )
        .map((record) => ({ ...record }));
    },

    async findConsentById(userId: string, id: string): Promise<ConsentRecord | null> {
      const record = (consents.get(userId) ?? []).find((r) => r.id === id);
      return record ? { ...record } : null;
    },

    async insertConsent(input: CreateConsentInput): Promise<ConsentRecord> {
      const list = consents.get(input.userId) ?? [];
      const latest = latestOf(list.filter((r) => r.consentType === input.consentType));
      if (latest === null && input.state !== 'granted') {
        throw new ConflictError('first consent record for a type must be a grant');
      }
      if (latest !== null && latest.state === input.state) {
        throw new ConflictError(
          `single active grant per consent type (AR-012): cannot record ${input.state} after ${latest.state}`,
        );
      }
      if (input.state === 'withdrawn' && input.withdrawnAt === null) {
        throw new ConflictError('withdrawn consent requires withdrawn_at');
      }
      if (input.state === 'granted' && input.withdrawnAt !== null) {
        throw new ConflictError('granted consent must not set withdrawn_at');
      }
      const record: ConsentRecord = {
        id: randomUUID(),
        userId: input.userId,
        consentType: input.consentType,
        version: input.version,
        state: input.state,
        grantedAt: input.grantedAt,
        withdrawnAt: input.withdrawnAt,
      };
      list.push(record);
      consents.set(input.userId, list);
      return { ...record };
    },

    async dispose(): Promise<void> {
      users.clear();
      byDigest.clear();
      profiles.clear();
      pregnancies.clear();
      preferences.clear();
      consents.clear();
    },
  };
}
