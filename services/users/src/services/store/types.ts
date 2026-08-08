export interface QuietHours {
  start: string;
  end: string;
}

/** Independently revocable consent type (WP-018, FR-117). */
export type ConsentType = 'participation' | 'research' | 'media' | 'whatsapp_opt_in';

/** Append-only consent state (WP-018, AR-012). */
export type ConsentState = 'granted' | 'withdrawn';

export interface ConsentRecord {
  /** Immutable record id (uuid). */
  id: string;
  userId: string;
  consentType: ConsentType;
  /** Consent statement version the record was recorded at (FR-003/FR-125). */
  version: string;
  state: ConsentState;
  /** When this record was recorded (UTC). A withdrawn row records the withdrawal time. */
  grantedAt: string;
  /** Set only on withdrawn records. */
  withdrawnAt: string | null;
}

export interface CreateConsentInput {
  userId: string;
  consentType: ConsentType;
  version: string;
  state: ConsentState;
  grantedAt: string;
  withdrawnAt: string | null;
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
  /**
   * Durable UUID identity. When omitted the store generates it; the
   * users-service supplies it so the `user.enrolled` outbox row (joined to the
   * same transaction) can reference the id (WP-024c). */
  id?: string;
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
 * Provider-agnostic users store (M-08). WP-017/WP-018 persist the durable user
 * record and the consent stream on the baseline `users`/`profiles`/
 * `pregnancies`/`user_preferences`/`consents` tables (migrations 002–004) via
 * the Postgres adapter; the in-memory test-double keeps unit/CI hermetic.
 * Phone numbers are stored only as ciphertext + keyed digest — the store never
 * sees the plaintext phone. `consents` is append-only (AR-012): `insertConsent`
 * appends a new immutable row and the state guard (DB trigger / in-memory
 * invariant) rejects any transition that would create a second active grant.
 */
/**
 * Write-side outbox row (WP-024c, `021-outbox` `user_outbox` table). Mirrors
 * the canonical 16-column contract in `packages/events/src/outbox.ts` for the
 * columns a producer fills — `id` (uuid default), `status`, `attempts`,
 * `available_at`, `created_at`, `published_at`, `last_error` are DB-managed.
 */
export interface OutboxEntry {
  eventId: string;
  eventType: string;
  producer: string;
  schemaVersion: number;
  /** ISO 8601. */
  occurredAt: string;
  aggregateType: string | null;
  aggregateId: string | null;
  idempotencyKey: string;
  payload: Record<string, unknown>;
}

/**
 * Provider-agnostic users store (M-08). WP-017/WP-018 persist the durable user
 * record and the consent stream on the baseline `users`/`profiles`/
 * `pregnancies`/`user_preferences`/`consents` tables (migrations 002–004) via
 * the Postgres adapter; the in-memory test-double keeps unit/CI hermetic.
 * Phone numbers are stored only as ciphertext + keyed digest — the store never
 * sees the plaintext phone. `consents` is append-only (AR-012): `insertConsent`
 * appends a new immutable row and the state guard (DB trigger / in-memory
 * invariant) rejects any transition that would create a second active grant.
 *
 * WP-024c: each published-write method accepts optional outbox entries that
 * are persisted atomically with the domain write (D-03 — one DB transaction;
 * the in-memory store appends them to `outboxLog` for hermetic assertions).
 */
export interface UsersStore {
  findByPhoneDigest(digest: string): Promise<UserRecord | null>;
  findById(id: string): Promise<UserRecord | null>;
  getProfile(userId: string): Promise<ProfileRecord | null>;
  getPregnancy(userId: string): Promise<PregnancyRecord | null>;
  getPreferences(userId: string): Promise<PreferencesRecord | null>;

  /** Atomically insert the user row plus its profile/pregnancy/preferences. */
  createUser(input: CreateUserInput, outbox?: OutboxEntry[]): Promise<UserRecord>;

  updateProfile(
    userId: string,
    patch: ProfilePatch,
    outbox?: OutboxEntry[],
  ): Promise<ProfileRecord>;

  upsertPregnancy(
    userId: string,
    input: PregnancyUpsertInput,
    outbox?: OutboxEntry[],
  ): Promise<PregnancyRecord>;

  upsertPreferences(userId: string, input: PreferencesUpsertInput): Promise<PreferencesRecord>;

  /** All immutable consent records for the user, oldest first (WP-018). */
  getConsents(userId: string): Promise<ConsentRecord[]>;

  /** Single consent record scoped to the caller — null if absent or not owned. */
  findConsentById(userId: string, id: string): Promise<ConsentRecord | null>;

  /** Append a consent record; rejects transitions that violate AR-012. */
  insertConsent(input: CreateConsentInput, outbox?: OutboxEntry[]): Promise<ConsentRecord>;

  dispose(): Promise<void>;
}
