import { randomUUID } from 'node:crypto';
import { ConflictError, NotFoundError, ValidationError, type ErrorField } from '@fathersnet/errors';
import type { Logger } from '@fathersnet/logger';
import type { PhoneEncryptor } from '../providers/phone-encryption';
import { keyedDigest, maskPhone } from './crypto';
import { buildOutboxEntry } from './events';
import { PregnancyService } from './pregnancy-service';
import type { PregnancyEngine, PregnancySnapshot } from './pregnancy';
import type { PreferencesUpsertInput, QuietHours, UsersStore } from './store/types';

export interface UsersServiceOptions {
  store: UsersStore;
  logger: Logger;
  phoneEncryptor: PhoneEncryptor;
  /** Key for the keyed HMAC-SHA256 phone digest (05 §8.1). */
  phoneDigestKey: string;
  pregnancyEngine: PregnancyEngine;
  /** Pregnancy recompute/status/event owner (WP-019). */
  pregnancyService: PregnancyService;
  /** Injectable clock (milliseconds) for deterministic tests. */
  nowMs?: () => number;
}

export interface RegisterInput {
  phone: string;
  firstName: string;
  lastName: string;
  country?: string | null;
  region?: string | null;
  ageGroup?: string | null;
  language: string;
  cohort?: string | null;
  edd?: string | null;
  lmp?: string | null;
  requestId?: string;
}

export interface UpdateProfileInput {
  firstName?: string | null;
  lastName?: string | null;
  country?: string | null;
  region?: string | null;
  ageGroup?: string | null;
  language?: string | null;
  cohort?: string | null;
  requestId?: string;
}

export interface UpdatePregnancyInput {
  edd?: string | null;
  lmp?: string | null;
  requestId?: string;
}

export interface UpdatePreferencesInput {
  language?: string | null;
  quietHours?: QuietHours | null;
  notificationChannels?: string[] | null;
  contentCategories?: string[] | null;
}

export interface UserProfileDto {
  userId: string;
  phoneMasked: string;
  role: string;
  status: string;
  profile: {
    firstName: string | null;
    lastName: string | null;
    country: string | null;
    region: string | null;
    ageGroup: string | null;
    language: string | null;
    cohort: string | null;
  };
  pregnancy: {
    edd: string | null;
    lmp: string | null;
    pregnancyWeek: number | null;
    trimester: number | null;
  } | null;
  preferences: {
    language: string | null;
    quietHours: QuietHours | null;
    notificationChannels: string[] | null;
    contentCategories: string[] | null;
  } | null;
}

const PHONE_PATTERN = /^\+[1-9]\d{7,14}$/;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;
const COUNTRY_PATTERN = /^[A-Za-z]{2}$/;
const VALID_LANGUAGES: readonly string[] = ['en', 'am'];
const VALID_NOTIFICATION_CHANNELS: readonly string[] = ['sms', 'whatsapp', 'push'];
const VALID_CONTENT_CATEGORIES: readonly string[] = [
  'pregnancy_journey',
  'milestones',
  'nutrition',
  'health_risks',
  'birth_prep',
  'postpartum',
  'general',
];

/**
 * User & profile domain service (WP-017, SRS §12.3). Owns the durable
 * phone->user mapping (FR-009), profile CRUD (FR-002), EDD/LMP capture routed
 * through the pregnancy-engine contract (FR-006/FR-031), cohort tagging
 * (FR-010), and preferences (FR-038). The phone is encrypted before it ever
 * reaches the store and only ever returned masked. Publish events carry no PII.
 */
export class UsersService {
  private readonly nowMs: () => number;

  constructor(private readonly options: UsersServiceOptions) {
    this.nowMs = options.nowMs ?? Date.now;
  }

  async register(input: RegisterInput): Promise<UserProfileDto> {
    this.validateRegister(input);

    const phoneE164Digest = keyedDigest(input.phone, this.options.phoneDigestKey);
    const existing = await this.options.store.findByPhoneDigest(phoneE164Digest);
    if (existing) {
      throw new ConflictError('Phone number is already enrolled');
    }

    const phoneE164 = this.options.phoneEncryptor.encrypt(input.phone);
    // The durable id is generated here so the `user.enrolled` outbox row can
    // reference it in the SAME transaction as the user row (WP-024c, D-03).
    const userId = randomUUID();
    const user = await this.options.store.createUser(
      {
        id: userId,
        phoneE164,
        phoneE164Digest,
        role: 'father',
        profile: {
          firstName: input.firstName,
          lastName: input.lastName,
          country: input.country ?? null,
          region: input.region ?? null,
          ageGroup: input.ageGroup ?? null,
          language: input.language,
          cohort: input.cohort ?? null,
        },
        pregnancy:
          input.edd || input.lmp
            ? this.computePregnancy({ edd: input.edd ?? null, lmp: input.lmp ?? null })
            : null,
        preferences: {
          language: input.language,
          quietHours: null,
          notificationChannels: null,
          contentCategories: null,
        },
      },
      [
        buildOutboxEntry({
          type: 'user.enrolled',
          payload: {
            user_id: userId,
            language: input.language,
            ...(input.region ? { region: input.region } : {}),
            ...(input.cohort ? { cohort: input.cohort } : {}),
          },
          aggregate: { type: 'user', id: userId },
        }),
      ],
    );

    this.options.logger.info('users.enrolled', 'user enrolled', { user_id: user.id });

    const profile = await this.load(user.id);
    return profile as UserProfileDto;
  }

  async getProfile(userId: string): Promise<UserProfileDto> {
    const profile = await this.load(userId);
    if (!profile) {
      throw new NotFoundError('User not found');
    }
    return profile;
  }

  async updateProfile(userId: string, input: UpdateProfileInput): Promise<UserProfileDto> {
    await this.requireUser(userId);
    this.validateUpdateProfile(input);

    const changed: string[] = [];
    const patch: Record<string, string | null> = {};
    for (const [field, value] of Object.entries(input)) {
      if (value !== undefined && field !== 'requestId') {
        // eslint-disable-next-line security/detect-object-injection -- `field` comes from the closed UpdateProfileInput field set, never raw user input.
        patch[field] = value as string | null;
        changed.push(field);
      }
    }
    if (changed.length === 0) {
      return this.getProfile(userId);
    }

    await this.options.store.updateProfile(userId, patch, [
      buildOutboxEntry({
        type: 'user.profile.updated',
        payload: { user_id: userId, changed },
        aggregate: { type: 'user', id: userId },
      }),
    ]);

    this.options.logger.info('users.profile_updated', 'profile updated', {
      user_id: userId,
      changed,
    });

    const profile = await this.load(userId);
    return profile as UserProfileDto;
  }

  async updatePregnancy(userId: string, input: UpdatePregnancyInput): Promise<PregnancySnapshot> {
    await this.requireUser(userId);

    const edd = input.edd ?? null;
    const lmp = input.lmp ?? null;
    const fields: ErrorField[] = [];
    if (!edd && !lmp) {
      fields.push({ field: 'edd', reason: 'at least one of edd/lmp is required' });
    }
    if (edd !== null && !DATE_PATTERN.test(edd)) {
      fields.push({ field: 'edd', reason: 'must be a YYYY-MM-DD date' });
    }
    if (lmp !== null && !DATE_PATTERN.test(lmp)) {
      fields.push({ field: 'lmp', reason: 'must be a YYYY-MM-DD date' });
    }
    if (fields.length > 0) {
      throw new ValidationError('Invalid pregnancy update', fields);
    }

    // Recompute-on-edit (FR-006): recompute week/trimester, persist the new
    // computed state, and emit `pregnancy.week.changed`/`milestone.reached`
    // only when something actually changed (WP-019). The legacy
    // `user.profile.updated` (changed edd/lmp) rides the same transaction as
    // the pregnancy upsert so all three events commit atomically (WP-024c).
    const snapshot = await this.options.pregnancyService.refreshAfterEdit(userId, { edd, lmp }, [
      buildOutboxEntry({
        type: 'user.profile.updated',
        payload: { user_id: userId, changed: ['edd', 'lmp'] },
        aggregate: { type: 'user', id: userId },
      }),
    ]);

    this.options.logger.info('users.pregnancy_updated', 'pregnancy updated', {
      user_id: userId,
      pregnancy_week: snapshot.pregnancyWeek,
    });

    return snapshot;
  }

  async updatePreferences(userId: string, input: UpdatePreferencesInput): Promise<UserProfileDto> {
    await this.requireUser(userId);
    this.validatePreferences(input);

    const prefs: PreferencesUpsertInput = {
      language: input.language ?? null,
      quietHours: input.quietHours ?? null,
      notificationChannels: input.notificationChannels ?? null,
      contentCategories: input.contentCategories ?? null,
    };
    if (
      prefs.language === null &&
      prefs.quietHours === null &&
      prefs.notificationChannels === null &&
      prefs.contentCategories === null
    ) {
      return this.getProfile(userId);
    }

    await this.options.store.upsertPreferences(userId, prefs);
    this.options.logger.info('users.preferences_updated', 'preferences updated', {
      user_id: userId,
    });

    const profile = await this.load(userId);
    return profile as UserProfileDto;
  }

  private computePregnancy(input: { edd: string | null; lmp: string | null }): {
    edd: string | null;
    lmp: string | null;
    pregnancyWeek: number;
    trimester: number;
  } {
    const computation = this.options.pregnancyEngine.compute({
      edd: input.edd,
      lmp: input.lmp,
      now: new Date(this.nowMs()).toISOString(),
    });
    return { edd: input.edd, lmp: input.lmp, ...computation };
  }

  private async requireUser(userId: string): Promise<void> {
    const user = await this.options.store.findById(userId);
    if (!user) {
      throw new NotFoundError('User not found');
    }
  }

  private async load(userId: string): Promise<UserProfileDto | null> {
    const user = await this.options.store.findById(userId);
    if (!user) {
      return null;
    }
    const [profile, pregnancy, preferences] = await Promise.all([
      this.options.store.getProfile(userId),
      this.options.store.getPregnancy(userId),
      this.options.store.getPreferences(userId),
    ]);
    if (!profile) {
      return null;
    }
    return {
      userId: user.id,
      phoneMasked: maskPhone(this.options.phoneEncryptor.decrypt(user.phoneE164)),
      role: user.role,
      status: user.status,
      profile: {
        firstName: profile.firstName,
        lastName: profile.lastName,
        country: profile.country,
        region: profile.region,
        ageGroup: profile.ageGroup,
        language: profile.language,
        cohort: profile.cohort,
      },
      pregnancy: pregnancy
        ? {
            edd: pregnancy.edd,
            lmp: pregnancy.lmp,
            pregnancyWeek: pregnancy.pregnancyWeek,
            trimester: pregnancy.trimester,
          }
        : null,
      preferences: preferences
        ? {
            language: preferences.language,
            quietHours: preferences.quietHours,
            notificationChannels: preferences.notificationChannels,
            contentCategories: preferences.contentCategories,
          }
        : null,
    };
  }

  private validateRegister(input: RegisterInput): void {
    const fields: ErrorField[] = [];
    if (!PHONE_PATTERN.test(input.phone)) {
      fields.push({ field: 'phone', reason: 'must be a valid E.164 phone number' });
    }
    if (!input.firstName || input.firstName.length > 100) {
      fields.push({ field: 'first_name', reason: 'must be 1-100 characters' });
    }
    if (!input.lastName || input.lastName.length > 100) {
      fields.push({ field: 'last_name', reason: 'must be 1-100 characters' });
    }
    if (!VALID_LANGUAGES.includes(input.language)) {
      fields.push({ field: 'language', reason: 'must be one of: en, am' });
    }
    if (input.country != null && !COUNTRY_PATTERN.test(input.country)) {
      fields.push({ field: 'country', reason: 'must be an ISO 3166-1 alpha-2 code' });
    }
    if (input.region != null && (input.region.length === 0 || input.region.length > 100)) {
      fields.push({ field: 'region', reason: 'must be 1-100 characters' });
    }
    if (input.ageGroup != null && (input.ageGroup.length === 0 || input.ageGroup.length > 32)) {
      fields.push({ field: 'age_group', reason: 'must be 1-32 characters' });
    }
    if (input.cohort != null && (input.cohort.length === 0 || input.cohort.length > 100)) {
      fields.push({ field: 'cohort', reason: 'must be 1-100 characters' });
    }
    if (input.edd !== undefined && input.edd !== null && !DATE_PATTERN.test(input.edd)) {
      fields.push({ field: 'edd', reason: 'must be a YYYY-MM-DD date' });
    }
    if (input.lmp !== undefined && input.lmp !== null && !DATE_PATTERN.test(input.lmp)) {
      fields.push({ field: 'lmp', reason: 'must be a YYYY-MM-DD date' });
    }
    if (fields.length > 0) {
      throw new ValidationError('Invalid registration', fields);
    }
  }

  private validateUpdateProfile(input: UpdateProfileInput): void {
    const fields: ErrorField[] = [];
    if (
      input.language !== undefined &&
      input.language !== null &&
      !VALID_LANGUAGES.includes(input.language)
    ) {
      fields.push({ field: 'language', reason: 'must be one of: en, am' });
    }
    if (
      input.country !== undefined &&
      input.country !== null &&
      !COUNTRY_PATTERN.test(input.country)
    ) {
      fields.push({ field: 'country', reason: 'must be an ISO 3166-1 alpha-2 code' });
    }
    if (
      input.firstName !== undefined &&
      input.firstName !== null &&
      (input.firstName.length === 0 || input.firstName.length > 100)
    ) {
      fields.push({ field: 'first_name', reason: 'must be 1-100 characters' });
    }
    if (
      input.lastName !== undefined &&
      input.lastName !== null &&
      (input.lastName.length === 0 || input.lastName.length > 100)
    ) {
      fields.push({ field: 'last_name', reason: 'must be 1-100 characters' });
    }
    if (
      input.region !== undefined &&
      input.region !== null &&
      (input.region.length === 0 || input.region.length > 100)
    ) {
      fields.push({ field: 'region', reason: 'must be 1-100 characters' });
    }
    if (
      input.ageGroup !== undefined &&
      input.ageGroup !== null &&
      (input.ageGroup.length === 0 || input.ageGroup.length > 32)
    ) {
      fields.push({ field: 'age_group', reason: 'must be 1-32 characters' });
    }
    if (
      input.cohort !== undefined &&
      input.cohort !== null &&
      (input.cohort.length === 0 || input.cohort.length > 100)
    ) {
      fields.push({ field: 'cohort', reason: 'must be 1-100 characters' });
    }
    if (fields.length > 0) {
      throw new ValidationError('Invalid profile update', fields);
    }
  }

  private validatePreferences(input: UpdatePreferencesInput): void {
    const fields: ErrorField[] = [];
    if (
      input.language !== undefined &&
      input.language !== null &&
      !VALID_LANGUAGES.includes(input.language)
    ) {
      fields.push({ field: 'language', reason: 'must be one of: en, am' });
    }
    if (input.notificationChannels !== undefined && input.notificationChannels !== null) {
      for (const channel of input.notificationChannels) {
        if (!VALID_NOTIFICATION_CHANNELS.includes(channel)) {
          fields.push({ field: 'notification_channels', reason: `unknown channel '${channel}'` });
        }
      }
      if (new Set(input.notificationChannels).size !== input.notificationChannels.length) {
        fields.push({ field: 'notification_channels', reason: 'channels must be unique' });
      }
    }
    if (input.contentCategories !== undefined && input.contentCategories !== null) {
      for (const category of input.contentCategories) {
        if (!VALID_CONTENT_CATEGORIES.includes(category)) {
          fields.push({ field: 'content_categories', reason: `unknown category '${category}'` });
        }
      }
      if (new Set(input.contentCategories).size !== input.contentCategories.length) {
        fields.push({ field: 'content_categories', reason: 'categories must be unique' });
      }
    }
    if (input.quietHours !== undefined && input.quietHours !== null) {
      if (!TIME_PATTERN.test(input.quietHours.start)) {
        fields.push({ field: 'quiet_hours.start', reason: 'must be HH:MM (24-hour)' });
      }
      if (!TIME_PATTERN.test(input.quietHours.end)) {
        fields.push({ field: 'quiet_hours.end', reason: 'must be HH:MM (24-hour)' });
      }
    }
    if (fields.length > 0) {
      throw new ValidationError('Invalid preferences', fields);
    }
  }
}
