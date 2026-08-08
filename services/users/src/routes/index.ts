import type { FastifyInstance } from 'fastify';
import type { Logger } from '@fathersnet/logger';
import { NotFoundError } from '@fathersnet/errors';
import type { UsersService } from '../services/users-service';
import type { ConsentType } from '../services/store/types';
import type { ConsentsService } from '../services/consents-service';
import type { PregnancyService } from '../services/pregnancy-service';

export interface UsersRouteDeps {
  usersService: UsersService;
  consentsService: ConsentsService;
  pregnancyService: PregnancyService;
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

const ConsentBody = {
  type: 'object',
  required: ['consent_type', 'version'],
  additionalProperties: false,
  properties: {
    consent_type: {
      type: 'string',
      enum: ['participation', 'research', 'media', 'whatsapp_opt_in'],
    },
    version: { type: 'string', minLength: 1, maxLength: 100 },
  },
} as const;

const ConsentIdParams = {
  type: 'object',
  required: ['id'],
  properties: {
    id: {
      type: 'string',
      pattern: '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$',
    },
  },
} as const;

const InternalUserIdParams = {
  type: 'object',
  required: ['userId'],
  properties: {
    userId: {
      type: 'string',
      pattern: '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$',
    },
  },
} as const;

/**
 * SRS §12.3 users routes (WP-017/WP-018). The `/register` endpoint is public;
 * every `/me` handler is self-scoped — the authenticated subject from the
 * bearer token is the only user id ever used, so a caller can never read or
 * mutate another user (11 §3.2, SRS §12.3). Responses mask the phone (QR-009);
 * no PII is logged or emitted (FR-022). The consent handlers enforce the
 * append-only lifecycle (AR-012): grant/re-consent, withdrawal, and the
 * immutable history view (FR-003/FR-004/FR-125/FR-117). Note: like the other
 * `/me` endpoints, responses use camelCase field names while the OpenAPI
 * contract documents snake_case — a pre-existing WP-017 naming drift, kept
 * consistent here and awaiting a global contract-alignment pass.
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

  app.get('/me/consents', async (request) => {
    const user = request.user as { subjectId: string };
    return deps.consentsService.getConsents(user.subjectId);
  });

  app.post('/me/consents', { schema: { body: ConsentBody } }, async (request, reply) => {
    const user = request.user as { subjectId: string };
    const body = request.body as { consent_type: string; version: string };
    const result = await deps.consentsService.grantConsent(user.subjectId, {
      consentType: body.consent_type as ConsentType,
      version: body.version,
      requestId: request.id,
    });
    reply.status(201);
    return result;
  });

  app.post(
    '/me/consents/:id/withdraw',
    { schema: { params: ConsentIdParams } },
    async (request) => {
      const user = request.user as { subjectId: string };
      const params = request.params as { id: string };
      return deps.consentsService.withdrawConsent(user.subjectId, {
        consentId: params.id,
        requestId: request.id,
      });
    },
  );
}

/**
 * Internal service-to-service contract (06 §373, WP-019): the authoritative
 * pregnancy journey snapshot consumed by the users-service responses and,
 * later, WhatsApp/content personalization. Serves current computed state and
 * rolls the stored week/trimester forward as time advances (FR-031). Returns
 * 404 when the subject has no pregnancy record.
 */
export async function internalPregnancyRoute(
  app: FastifyInstance,
  deps: UsersRouteDeps,
): Promise<void> {
  app.get(
    '/internal/pregnancy/:userId',
    { schema: { params: InternalUserIdParams } },
    async (request) => {
      const params = request.params as { userId: string };
      const snapshot = await deps.pregnancyService.getStatus(params.userId);
      if (!snapshot) {
        throw new NotFoundError('Pregnancy not found');
      }
      return snapshot;
    },
  );
}
