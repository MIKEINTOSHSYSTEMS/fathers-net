import type { Logger } from '@fathersnet/logger';
import { NotFoundError, ValidationError } from '@fathersnet/errors';
import type {
  AddItemInput,
  Checklist,
  ChecklistCategory,
  ChecklistItem,
  ChecklistType,
} from '../types';
import { CHECKLIST_CATEGORIES, CHECKLIST_TYPES } from '../types';
import type { ChecklistBudgetStore } from '../store/types';

export interface ChecklistServiceOptions {
  store: ChecklistBudgetStore;
  logger: Logger;
}

export interface AddItemPayload {
  itemName: string;
  category: ChecklistCategory;
}

export const DEFAULT_TITLES: Record<ChecklistType, string> = {
  hospital_bag: 'Hospital Bag',
  birth_prep: 'Birth Preparation',
};

/**
 * Checklist service (WP-023, SRS §12.6, FR-086/FR-088, FR-126).
 *
 * Owns the checklist rules — routes stay thin:
 *
 * - Template-driven instantiation (06 Phase F): `ensureDefaults` materializes
 *   the two standard per-user instances (`hospital_bag` + `birth_prep`) on
 *   first list. WP-023 creates EMPTY instances only — the §8.2 default items
 *   are seed data (migration 017, deferred).
 * - Ownership (FR-126): the actor identity comes from the token `sub`, never
 *   the body. Reads are scoped at the store; a missing or non-owned checklist
 *   is 404 (invisibility, never 403).
 * - Progress is maintained ON WRITE by the store (NFR-007) — the service never
 *   recomputes it on reads.
 * - Custom-item add validates category and item name; completion toggle is a
 *   per-field merge (`completed` → `completed_at` derived in the store).
 */
export class ChecklistService {
  private readonly store: ChecklistBudgetStore;
  private readonly logger: Logger;

  constructor(options: ChecklistServiceOptions) {
    this.store = options.store;
    this.logger = options.logger;
  }

  /** Ensure the two standard instances exist, then list the user's
   *  checklists with items, in creation order (hospital bag first). */
  async listChecklists(userId: string): Promise<Checklist[]> {
    await this.ensureDefaults(userId);
    return this.store.listChecklistsForUser(userId);
  }

  /** Owner-only read. Missing or non-owned ids are 404 (FR-126). */
  async getChecklist(userId: string, id: string): Promise<Checklist> {
    const checklist = await this.store.findChecklistForUser(id, userId);
    if (!checklist) {
      throw new NotFoundError('Checklist not found');
    }
    return checklist;
  }

  /** Owner-only add of a user-added (custom) item (FR-086 §8.2). */
  async addItem(
    userId: string,
    checklistId: string,
    input: AddItemPayload,
  ): Promise<ChecklistItem> {
    this.assertItemName(input.itemName);
    this.assertCategory(input.category);
    const item = await this.store.addItem(checklistId, userId, {
      itemName: input.itemName,
      category: input.category,
    } satisfies AddItemInput);
    this.logger.info('checklist.item_added', 'checklist custom item added', {
      checklist_id: checklistId,
      item_id: item.id,
    });
    return item;
  }

  /** Owner-only completion toggle (per-field merge, FR-088/FR-089 contract). */
  async updateItem(
    userId: string,
    checklistId: string,
    itemId: string,
    patch: { completed?: boolean },
  ): Promise<ChecklistItem> {
    const item = await this.store.updateItem(checklistId, itemId, userId, {
      completed: patch.completed,
    });
    this.logger.info('checklist.item_updated', 'checklist item updated', {
      checklist_id: checklistId,
      item_id: itemId,
      completed: item.completed,
    });
    return item;
  }

  private async ensureDefaults(userId: string): Promise<void> {
    for (const checklistType of CHECKLIST_TYPES) {
      await this.store.ensureChecklist({
        userId,
        checklistType,
        // eslint-disable-next-line security/detect-object-injection -- `checklistType` is a member of the closed CHECKLIST_TYPES union.
        title: DEFAULT_TITLES[checklistType],
      });
    }
  }

  private assertItemName(itemName: string): void {
    if (typeof itemName !== 'string' || itemName.trim().length === 0) {
      throw new ValidationError('Checklist item name must not be empty', [
        { field: 'item_name', reason: 'must not be empty' },
      ]);
    }
  }

  private assertCategory(category: string): void {
    if (!CHECKLIST_CATEGORIES.includes(category as ChecklistCategory)) {
      throw new ValidationError('Invalid checklist item category', [
        { field: 'category', reason: `must be one of: ${CHECKLIST_CATEGORIES.join(', ')}` },
      ]);
    }
  }
}
