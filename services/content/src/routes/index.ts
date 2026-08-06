import type { FastifyInstance } from 'fastify';
import type { EventBus } from '@fathersnet/events';
import type { Logger } from '@fathersnet/logger';
import { ForbiddenError } from '@fathersnet/errors';
import type { ContentService } from '../services/content-service';
import type { ContentType } from '../services/store/types';
import type { AuthenticatedUser } from '../middleware/auth';

export interface ContentRouteDeps {
  contentService: ContentService;
  eventBus: EventBus;
  logger: Logger;
}

const ContentIdParams = {
  type: 'object',
  required: ['id'],
  properties: {
    id: {
      type: 'string',
      pattern: '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$',
    },
  },
} as const;

const ListQuery = {
  type: 'object',
  properties: {
    language: { type: 'string', enum: ['en', 'am'] },
    week: { type: 'integer', minimum: 1, maximum: 45 },
    type: {
      type: 'string',
      enum: ['article', 'video', 'audio', 'infographic', 'checklist', 'faq'],
    },
  },
} as const;

const LocalizedText = { type: ['string', 'null'], minLength: 1, maxLength: 20000 };

const CreateDraftBody = {
  type: 'object',
  required: ['content_type'],
  additionalProperties: false,
  properties: {
    content_type: {
      type: 'string',
      enum: ['article', 'video', 'audio', 'infographic', 'checklist', 'faq'],
    },
    title_en: LocalizedText,
    title_am: LocalizedText,
    body_en: LocalizedText,
    body_am: LocalizedText,
    pregnancy_week: { type: ['integer', 'null'], minimum: 1, maximum: 45 },
  },
} as const;

const UpdateBody = {
  type: 'object',
  additionalProperties: false,
  properties: {
    title_en: LocalizedText,
    title_am: LocalizedText,
    body_en: LocalizedText,
    body_am: LocalizedText,
    pregnancy_week: { type: ['integer', 'null'], minimum: 1, maximum: 45 },
    change_note: { type: ['string', 'null'], minLength: 1, maxLength: 2000 },
  },
} as const;

/** Staff gate — Phase 2 RBAC boundary (see middleware/auth.ts). */
function requireStaff(user: AuthenticatedUser | null): asserts user is AuthenticatedUser {
  if (!user || user.role !== 'staff') {
    throw new ForbiddenError('Staff role required');
  }
}

/**
 * SRS §12.5 content routes (WP-020). GET list/detail are open to any
 * authenticated user and expose published content only (FR-078, AR-015);
 * every write handler is staff-gated via the token `role` claim and the
 * author/approver identity comes from the token `sub` claim, never the body.
 * Responses use camelCase field names (matching the WP-017 naming drift the
 * OpenAPI contract documents in snake_case).
 */
export async function contentRoutes(app: FastifyInstance, deps: ContentRouteDeps): Promise<void> {
  app.get('/', { schema: { querystring: ListQuery } }, async (request) => {
    const query = request.query as { language?: string; week?: number; type?: string };
    const content = await deps.contentService.listPublished({
      language: query.language === 'en' || query.language === 'am' ? query.language : undefined,
      week: query.week,
      type: query.type as ContentType | undefined,
    });
    return { content };
  });

  app.get('/:id', { schema: { params: ContentIdParams } }, async (request) => {
    const params = request.params as { id: string };
    return deps.contentService.getPublished(params.id);
  });

  app.post('/', { schema: { body: CreateDraftBody } }, async (request, reply) => {
    requireStaff(request.user as AuthenticatedUser | null);
    const body = request.body as {
      content_type: ContentType;
      title_en?: string | null;
      title_am?: string | null;
      body_en?: string | null;
      body_am?: string | null;
      pregnancy_week?: number | null;
    };
    const result = await deps.contentService.createDraft(
      {
        contentType: body.content_type,
        titleEn: body.title_en ?? null,
        titleAm: body.title_am ?? null,
        bodyEn: body.body_en ?? null,
        bodyAm: body.body_am ?? null,
        pregnancyWeek: body.pregnancy_week ?? null,
      },
      (request.user as { subjectId: string }).subjectId,
      request.id,
    );
    reply.status(201);
    return result;
  });

  app.put('/:id', { schema: { params: ContentIdParams, body: UpdateBody } }, async (request) => {
    requireStaff(request.user as AuthenticatedUser | null);
    const params = request.params as { id: string };
    const body = request.body as {
      title_en?: string | null;
      title_am?: string | null;
      body_en?: string | null;
      body_am?: string | null;
      pregnancy_week?: number | null;
      change_note?: string | null;
    };
    return deps.contentService.update(
      params.id,
      {
        titleEn: body.title_en,
        titleAm: body.title_am,
        bodyEn: body.body_en,
        bodyAm: body.body_am,
        pregnancyWeek: body.pregnancy_week,
        changeNote: body.change_note,
      },
      request.id,
    );
  });

  app.post('/:id/submit', { schema: { params: ContentIdParams } }, async (request) => {
    requireStaff(request.user as AuthenticatedUser | null);
    const params = request.params as { id: string };
    return deps.contentService.submit(params.id, request.id);
  });

  app.post('/:id/approve', { schema: { params: ContentIdParams } }, async (request) => {
    requireStaff(request.user as AuthenticatedUser | null);
    const params = request.params as { id: string };
    return deps.contentService.approve(
      params.id,
      (request.user as { subjectId: string }).subjectId,
      request.id,
    );
  });

  app.post('/:id/archive', { schema: { params: ContentIdParams } }, async (request) => {
    requireStaff(request.user as AuthenticatedUser | null);
    const params = request.params as { id: string };
    return deps.contentService.archive(params.id, request.id);
  });
}
