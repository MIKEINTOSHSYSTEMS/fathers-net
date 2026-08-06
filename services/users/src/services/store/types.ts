export interface QuietHours {
  start: string;
  end: string;
}

export interface UserRecord {
  /** Durable UUID identity (FR-009). */
  id: string;
  /** AES-256-GCM ciphertext of the E.164 phone — never plaintext (05 §8.1). */
  phoneE164: string;
  /** Keyed HMAC-SHA256 digest for unique lookup/dedup without decrypting. */
  phoneE164Digest: string;
  role: 'father' | 'partner' | 'staff';
  status: 'active' | 'suspended' | 'deleted';
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

export interface ProfileRecord {
  userId: string;
  firstName: string | null;
  lastName: string | null;
  country: string | null;
  region: string | null;
  ageGroup: string | null;
  language: string | null;
  cohort: string | null;
}

export interface PregnancyRecord {
  id: string;
  userId: string;
  edd: string | null;
  lmp: string | null;
  pregnancyWeek: number | null;
  trimester: number | null;
  partnerUserId: string | null;
}

export interface PreferencesRecord {
  userId: string;
  language: string | null;
  quietHours: QuietHours | null;
  notificationChannels: string[] | null;
  contentCategories: string[] | null;
}

export interface CreateUserProfileInput {
  firstName: string | null;
  lastName: string | null;
  country: string | null;
  region: string | null;
  ageGroup: string | null;
  language: string | null;
  cohort: string | null;
}

export interface CreateUserPregnancyInput {
  edd: string | null;
  lmp: string | null;
  pregnancyWeek: number | null;
  trimester: number | null;
}

export interface CreateUserPreferencesInput {
  language: string | null;
  quietHours: QuietHours | null;
  notificationChannels: string[] | null;
  contentCategories: string[] | null;
}

export interface CreateUserInput {
  /** AES-256-GCM ciphertext (never the plaintext phone). */
  phoneE164: string;
  /** Keyed HMAC-SHA256 digest (FR-009). */
  phoneE164Digest: string;
  role: 'father' | 'partner' | 'staff';
  profile: CreateUserProfileInput;
  pregnancy: CreateUserPregnancyInput | null;
  preferences: CreateUserPreferencesInput | null;
}

export type ProfilePatch = Partial<
  Pick<
    ProfileRecord,
    'firstName' | 'lastName' | 'country' | 'region' | 'ageGroup' | 'language' | 'cohort'
  >
>;

export interface PregnancyUpsertInput {
  edd: string | null;
  lmp: string | null;
  pregnancyWeek: number;
  trimester: number;
}

export interface PreferencesUpsertInput {
  language: string | null;
  quietHours: QuietHours | null;
  notificationChannels: string[] | null;
  contentCategories: string[] | null;
}

/**
 * Provider-agnostic users store (M-08). WP-017 persists the durable user
 * record on the baseline `users`/`profiles`/`pregnancies`/`user_preferences`
 * tables (migrations 002–004) via the Postgres adapter; the in-memory
 * test-double keeps unit/CI hermetic. Phone numbers are stored only as
 * ciphertext + keyed digest — the store never sees the plaintext phone.
 */
export interface UsersStore {
  findByPhoneDigest(digest: string): Promise<UserRecord | null>;
  findById(id: string): Promise<UserRecord | null>;
  getProfile(userId: string): Promise<ProfileRecord | null>;
  getPregnancy(userId: string): Promise<PregnancyRecord | null>;
  getPreferences(userId: string): Promise<PreferencesRecord | null>;

  /** Atomically insert the user row plus its profile/pregnancy/preferences. */
  createUser(input: CreateUserInput): Promise<UserRecord>;

  updateProfile(userId: string, patch: ProfilePatch): Promise<ProfileRecord>;

  upsertPregnancy(userId: string, input: PregnancyUpsertInput): Promise<PregnancyRecord>;

  upsertPreferences(userId: string, input: PreferencesUpsertInput): Promise<PreferencesRecord>;

  dispose(): Promise<void>;
}
