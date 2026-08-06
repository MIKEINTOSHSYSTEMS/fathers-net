import { randomUUID } from 'node:crypto';
import type {
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
 * unique, and the user row is created together with its child rows.
 */
export function createMemoryUsersStore(): UsersStore {
  const users = new Map<string, UserRecord>();
  const byDigest = new Map<string, string>();
  const profiles = new Map<string, ProfileRecord>();
  const pregnancies = new Map<string, PregnancyRecord>();
  const preferences = new Map<string, PreferencesRecord>();

  function touch(user: UserRecord): UserRecord {
    const next: UserRecord = { ...user, updatedAt: new Date().toISOString() };
    users.set(user.id, next);
    return next;
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

    async dispose(): Promise<void> {
      users.clear();
      byDigest.clear();
      profiles.clear();
      pregnancies.clear();
      preferences.clear();
    },
  };
}
