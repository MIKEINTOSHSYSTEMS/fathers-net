import type { FastifyInstance, FastifyRequest } from 'fastify';
import { ChecklistService } from '../services/checklist-service';
import type { ChecklistCategory } from '../types';
import { CHECKLIST_CATEGORIES } from '../types';
import type { AuthenticatedUser } from '../middleware/auth';

export interface ChecklistRouteDeps {
  checklistService: ChecklistService;
}

const UUID_PATTERN =
  '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$';

const ChecklistParams = {
  type: 'object',
  required: ['id'],
  properties: { id: { type: 'string', pattern: UUID_PATTERN } },
} as const;

const ItemParams = {
  type: 'object',
  required: ['id', 'itemId'],
  properties: {
    id: { type: 'string', pattern: UUID_PATTERN },
    itemId: { type: 'string', pattern: UUID_PATTERN },
  },
} as const;

const CreateItemBody = {
  type: 'object',
  required: ['item_name', 'category'],
  additionalProperties: false,
  properties: {
    item_name: { type: 'string', minLength: 1, maxLength: 200 },
    category: { type: 'string', enum: [...CHECKLIST_CATEGORIES] },
  },
} as const;

const UpdateItemBody = {
  type: 'object',
  required: ['completed'],
  additionalProperties: false,
  properties: {
    completed: { type: 'boolean' },
  },
} as const;

function actor(request: FastifyRequest): string {
  return (request.user as AuthenticatedUser).subjectId;
}

/**
 * SRS §12.6 checklist routes (WP-023). Every route is ownership-scoped from
 * the token `sub` claim (FR-126) — the caller identity never comes from the
 * body. A non-owned or missing checklist/item is 404 (invisibility, never
 * 403). Progress is maintained on write by the store (NFR-007).
 */
export async function checklistRoutes(
  app: FastifyInstance,
  deps: ChecklistRouteDeps,
): Promise<void> {
  app.get('/checklists', async (request) => {
    const checklists = await deps.checklistService.listChecklists(actor(request));
    return { items: checklists };
  });

  app.get('/checklists/:id', { schema: { params: ChecklistParams } }, async (request) => {
    const params = request.params as { id: string };
    return deps.checklistService.getChecklist(actor(request), params.id);
  });

  app.post(
    '/checklists/:id/items',
    { schema: { params: ChecklistParams, body: CreateItemBody } },
    async (request, reply) => {
      const params = request.params as { id: string };
      const body = request.body as { item_name: string; category: ChecklistCategory };
      const item = await deps.checklistService.addItem(actor(request), params.id, {
        itemName: body.item_name,
        category: body.category,
      });
      reply.status(201);
      return item;
    },
  );

  app.patch(
    '/checklists/:id/items/:itemId',
    { schema: { params: ItemParams, body: UpdateItemBody } },
    async (request) => {
      const params = request.params as { id: string; itemId: string };
      const body = request.body as { completed: boolean };
      return deps.checklistService.updateItem(actor(request), params.id, params.itemId, body);
    },
  );
}
