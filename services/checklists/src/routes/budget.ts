import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { BudgetService } from '../services/budget-service';
import type { BudgetCategory } from '../types';
import { BUDGET_CATEGORIES } from '../types';
import type { AuthenticatedUser } from '../middleware/auth';

export interface BudgetRouteDeps {
  budgetService: BudgetService;
}

const UUID_PATTERN =
  '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$';

const DATE_PATTERN = '^\\d{4}-\\d{2}-\\d{2}$';

const EntryIdParams = {
  type: 'object',
  required: ['id'],
  properties: { id: { type: 'string', pattern: UUID_PATTERN } },
} as const;

const CreateEntryBody = {
  type: 'object',
  required: ['category', 'item_name', 'planned_amount'],
  additionalProperties: false,
  properties: {
    category: { type: 'string', enum: [...BUDGET_CATEGORIES] },
    item_name: { type: 'string', minLength: 1, maxLength: 200 },
    planned_amount: { type: 'number', minimum: 0 },
    actual_amount: { type: ['number', 'null'], minimum: 0 },
    entry_date: { type: 'string', pattern: DATE_PATTERN },
    notes: { type: ['string', 'null'], maxLength: 1000 },
  },
} as const;

const UpdateEntryBody = {
  type: 'object',
  additionalProperties: false,
  minProperties: 1,
  properties: {
    category: { type: 'string', enum: [...BUDGET_CATEGORIES] },
    item_name: { type: 'string', minLength: 1, maxLength: 200 },
    planned_amount: { type: 'number', minimum: 0 },
    actual_amount: { type: ['number', 'null'], minimum: 0 },
    entry_date: { type: 'string', pattern: DATE_PATTERN },
    notes: { type: ['string', 'null'], maxLength: 1000 },
    receipt_image: { type: ['string', 'null'], maxLength: 2048 },
  },
} as const;

function actor(request: FastifyRequest): string {
  return (request.user as AuthenticatedUser).subjectId;
}

/**
 * SRS §12.7 budget routes (WP-023). Every route is ownership-scoped from the
 * token `sub` claim (FR-126) — the caller identity never comes from the body.
 * A non-owned or missing entry is 404 (invisibility, never 403). PATCH is a
 * per-field merge (offline-sync-ready contract, FR-089). The summary reports
 * totals/variance/remaining vs the configurable M-07 cap (§8.3).
 */
export async function budgetRoutes(app: FastifyInstance, deps: BudgetRouteDeps): Promise<void> {
  app.get('/budget/entries', async (request) => {
    return deps.budgetService.listEntries(actor(request));
  });

  app.post('/budget/entries', { schema: { body: CreateEntryBody } }, async (request, reply) => {
    const body = request.body as {
      category: BudgetCategory;
      item_name: string;
      planned_amount: number;
      actual_amount?: number | null;
      entry_date?: string;
      notes?: string | null;
    };
    const entry = await deps.budgetService.createEntry(actor(request), {
      category: body.category,
      itemName: body.item_name,
      plannedAmount: body.planned_amount,
      actualAmount: body.actual_amount,
      entryDate: body.entry_date,
      notes: body.notes,
    });
    reply.status(201);
    return entry;
  });

  app.patch(
    '/budget/entries/:id',
    { schema: { params: EntryIdParams, body: UpdateEntryBody } },
    async (request) => {
      const params = request.params as { id: string };
      const body = request.body as {
        category?: BudgetCategory;
        item_name?: string;
        planned_amount?: number;
        actual_amount?: number | null;
        entry_date?: string;
        notes?: string | null;
        receipt_image?: string | null;
      };
      return deps.budgetService.updateEntry(actor(request), params.id, {
        category: body.category,
        itemName: body.item_name,
        plannedAmount: body.planned_amount,
        actualAmount: body.actual_amount,
        entryDate: body.entry_date,
        notes: body.notes,
        receiptImage: body.receipt_image,
      });
    },
  );

  app.delete(
    '/budget/entries/:id',
    { schema: { params: EntryIdParams } },
    async (request, reply: FastifyReply) => {
      const params = request.params as { id: string };
      await deps.budgetService.deleteEntry(actor(request), params.id);
      reply.status(204);
      return reply.send();
    },
  );

  app.get('/budget/summary', async (request) => {
    return deps.budgetService.summary(actor(request));
  });
}
