import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { JournalService } from '../services/journal-service';
import type { AuthenticatedUser } from '../middleware/auth';

export interface EntryRouteDeps {
  journalService: JournalService;
}

const UUID_PATTERN =
  '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$';

const EntryIdParams = {
  type: 'object',
  required: ['id'],
  properties: { id: { type: 'string', pattern: UUID_PATTERN } },
} as const;

const ListQuery = {
  type: 'object',
  properties: {
    limit: { type: 'integer', minimum: 1, maximum: 100 },
    cursor: { type: 'string', minLength: 1, maxLength: 4096 },
  },
} as const;

const CreateEntryBody = {
  type: 'object',
  required: ['content'],
  additionalProperties: false,
  properties: {
    content: { type: 'string', minLength: 1, maxLength: 10000 },
    pregnancy_week: { type: ['integer', 'null'], minimum: 1, maximum: 45 },
    shared_with_partner: { type: 'boolean', default: false },
  },
} as const;

const UpdateEntryBody = {
  type: 'object',
  additionalProperties: false,
  minProperties: 1,
  properties: {
    content: { type: 'string', minLength: 1, maxLength: 10000 },
    pregnancy_week: { type: ['integer', 'null'], minimum: 1, maximum: 45 },
    shared_with_partner: { type: 'boolean' },
  },
} as const;

function actor(request: FastifyRequest): string {
  return (request.user as AuthenticatedUser).subjectId;
}

/**
 * SRS §12.9 journal routes (WP-022). Every route is ownership-scoped from the
 * token `sub` claim (FR-126) — the caller identity never comes from the body.
 * Privacy-by-default (FR-052): the timeline and detail reads expose the
 * owner's entries only; a non-owned or unshared entry is 404 (invisibility,
 * never 403). `POST /media` is spec-reserved (AR-023) but 501 until WP-060.
 */
export async function entryRoutes(app: FastifyInstance, deps: EntryRouteDeps): Promise<void> {
  app.get('/entries', { schema: { querystring: ListQuery } }, async (request) => {
    const query = request.query as { limit?: number; cursor?: string };
    const limit = query.limit ?? 20;
    const result = await deps.journalService.listEntries(actor(request), limit, query.cursor);
    return { items: result.items, next_cursor: result.nextCursor, total: null };
  });

  app.post('/entries', { schema: { body: CreateEntryBody } }, async (request, reply) => {
    const body = request.body as {
      content: string;
      pregnancy_week?: number | null;
      shared_with_partner?: boolean;
    };
    const entry = await deps.journalService.createEntry(
      actor(request),
      {
        content: body.content,
        pregnancyWeek: body.pregnancy_week ?? null,
        sharedWithPartner: body.shared_with_partner ?? false,
      },
      request.id,
    );
    reply.status(201);
    return entry;
  });

  app.get('/entries/:id', { schema: { params: EntryIdParams } }, async (request) => {
    const params = request.params as { id: string };
    return deps.journalService.getEntry(actor(request), params.id);
  });

  app.patch(
    '/entries/:id',
    { schema: { params: EntryIdParams, body: UpdateEntryBody } },
    async (request) => {
      const params = request.params as { id: string };
      const body = request.body as {
        content?: string;
        pregnancy_week?: number | null;
        shared_with_partner?: boolean;
      };
      return deps.journalService.updateEntry(actor(request), params.id, {
        content: body.content,
        pregnancyWeek: body.pregnancy_week,
        sharedWithPartner: body.shared_with_partner,
      });
    },
  );

  app.delete(
    '/entries/:id',
    { schema: { params: EntryIdParams } },
    async (request, reply: FastifyReply) => {
      const params = request.params as { id: string };
      await deps.journalService.deleteEntry(actor(request), params.id);
      reply.status(204);
      return reply.send();
    },
  );

  app.post('/entries/:id/share', { schema: { params: EntryIdParams } }, async (request) => {
    const params = request.params as { id: string };
    return deps.journalService.shareEntry(actor(request), params.id);
  });

  app.get('/export', async (request) => {
    return deps.journalService.exportEntries(actor(request), request.id);
  });

  app.post('/media', async (_request, reply) => {
    // Spec-reserved (AR-023) — object storage + signed uploads land with
    // WP-060 (Phase 4). Deliberate 501, never a silent stub.
    reply.status(501);
    return { error: { code: 'NOT_IMPLEMENTED', message: 'Media upload is not implemented yet' } };
  });
}
