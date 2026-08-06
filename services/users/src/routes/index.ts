import type { FastifyInstance } from 'fastify';
import type { EventBus } from '@fathersnet/events';
import type { Logger } from '@fathersnet/logger';
import type { UsersService } from '../services/users-service';

export interface UsersRouteDeps {
  usersService: UsersService;
  eventBus: EventBus;
  logger: Logger;
}

const RegisterBody = {
  type: 'object',
  required: ['phone', 'first_name', 'last_name', 'language'],
  additionalProperties: false,
  properties: {
    phone: { type: 'string', pattern: '^\\+[1-9]\\d{7,14}$' },
    first_name: { type: 'string', minLength: 1, maxLength: 100 },
    last_name: { type: 'string', minLength: 1, maxLength: 100 },
    country: { type: 'string', pattern: '^[A-Za-z]{2}$' },
    region: { type: 'string', minLength: 1, maxLength: 100 },
    age_group: { type: 'string', minLength: 1, maxLength: 32 },
    language: { type: 'string', enum: ['en', 'am'] },
    cohort: { type: 'string', minLength: 1, maxLength: 100 },
    edd: { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$' },
    lmp: { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$' },
  },
} as const;

const UpdateProfileBody = {
  type: 'object',
  additionalProperties: false,
  properties: {
    first_name: { type: ['string', 'null'], minLength: 1, maxLength: 100 },
    last_name: { type: ['string', 'null'], minLength: 1, maxLength: 100 },
    country: { type: ['string', 'null'], pattern: '^[A-Za-z]{2}$' },
    region: { type: ['string', 'null'], minLength: 1, maxLength: 100 },
    age_group: { type: ['string', 'null'], minLength: 1, maxLength: 32 },
    language: { type: ['string', 'null'], enum: ['en', 'am'] },
    cohort: { type: ['string', 'null'], minLength: 1, maxLength: 100 },
  },
} as const;

const PregnancyBody = {
  type: 'object',
  additionalProperties: false,
  properties: {
    edd: { type: ['string', 'null'], pattern: '^\\d{4}-\\d{2}-\\d{2}$' },
    lmp: { type: ['string', 'null'], pattern: '^\\d{4}-\\d{2}-\\d{2}$' },
  },
} as const;

const PreferencesBody = {
  type: 'object',
  additionalProperties: false,
  properties: {
    language: { type: ['string', 'null'], enum: ['en', 'am'] },
    quiet_hours: {
      type: ['object', 'null'],
      additionalProperties: false,
      properties: {
        start: { type: 'string', pattern: '^([01]\\d|2[0-3]):[0-5]\\d$' },
        end: { type: 'string', pattern: '^([01]\\d|2[0-3]):[0-5]\\d$' },
      },
      required: ['start', 'end'],
    },
    notification_channels: {
      type: ['array', 'null'],
      items: { type: 'string', enum: ['sms', 'whatsapp', 'push'] },
      uniqueItems: true,
    },
    content_categories: {
      type: ['array', 'null'],
      items: {
        type: 'string',
        enum: [
          'pregnancy_journey',
          'milestones',
          'nutrition',
          'health_risks',
          'birth_prep',
          'postpartum',
          'general',
        ],
      },
      uniqueItems: true,
    },
  },
} as const;

/**
 * SRS §12.3 users routes (WP-017). The `/register` endpoint is public; every
 * `/me` handler is self-scoped — the authenticated subject from the bearer
 * token is the only user id ever used, so a caller can never read or mutate
 * another user (11 §3.2, SRS §12.3). Responses mask the phone (QR-009); no
 * PII is logged or emitted (FR-022).
 */
export async function usersRegisterRoute(
  app: FastifyInstance,
  deps: UsersRouteDeps,
): Promise<void> {
  app.post('/register', { schema: { body: RegisterBody } }, async (request, reply) => {
    const body = request.body as {
      phone: string;
      first_name: string;
      last_name: string;
      country?: string;
      region?: string;
      age_group?: string;
      language: string;
      cohort?: string;
      edd?: string;
      lmp?: string;
    };
    const result = await deps.usersService.register({
      phone: body.phone,
      firstName: body.first_name,
      lastName: body.last_name,
      country: body.country,
      region: body.region,
      ageGroup: body.age_group,
      language: body.language,
      cohort: body.cohort,
      edd: body.edd,
      lmp: body.lmp,
      requestId: request.id,
    });
    reply.status(201);
    return result;
  });
}

export async function usersMeRoutes(app: FastifyInstance, deps: UsersRouteDeps): Promise<void> {
  app.get('/me', async (request) => {
    const user = request.user as { subjectId: string };
    return deps.usersService.getProfile(user.subjectId);
  });

  app.patch('/me', { schema: { body: UpdateProfileBody } }, async (request) => {
    const user = request.user as { subjectId: string };
    const body = request.body as Record<string, string | null | undefined>;
    return deps.usersService.updateProfile(user.subjectId, {
      firstName: body.first_name,
      lastName: body.last_name,
      country: body.country,
      region: body.region,
      ageGroup: body.age_group,
      language: body.language,
      cohort: body.cohort,
      requestId: request.id,
    });
  });

  app.put('/me/pregnancy', { schema: { body: PregnancyBody } }, async (request) => {
    const user = request.user as { subjectId: string };
    const body = request.body as { edd?: string | null; lmp?: string | null };
    return deps.usersService.updatePregnancy(user.subjectId, {
      edd: body.edd,
      lmp: body.lmp,
      requestId: request.id,
    });
  });

  app.put('/me/preferences', { schema: { body: PreferencesBody } }, async (request) => {
    const user = request.user as { subjectId: string };
    const body = request.body as {
      language?: string | null;
      quiet_hours?: { start: string; end: string } | null;
      notification_channels?: string[] | null;
      content_categories?: string[] | null;
    };
    return deps.usersService.updatePreferences(user.subjectId, {
      language: body.language,
      quietHours: body.quiet_hours,
      notificationChannels: body.notification_channels,
      contentCategories: body.content_categories,
    });
  });
}
