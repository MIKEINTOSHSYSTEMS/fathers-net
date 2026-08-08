import type { Logger } from '@fathersnet/logger';
import { ValidationError } from '@fathersnet/errors';
import type {
  BudgetCategory,
  BudgetEntry,
  BudgetSummary,
  CreateBudgetEntryInput,
  UpdateBudgetEntryInput,
} from '../types';
import { BUDGET_CATEGORIES } from '../types';
import { roundMoney, todayIso } from './domain';
import type { ChecklistBudgetStore } from '../store/types';

export interface BudgetServiceOptions {
  store: ChecklistBudgetStore;
  logger: Logger;
  /** Configurable M-07 cap; `0` = unset (summary `remaining` is null). */
  cap: number;
}

export interface CreateEntryPayload {
  category: BudgetCategory;
  itemName: string;
  plannedAmount: number;
  actualAmount?: number | null;
  entryDate?: string;
  notes?: string | null;
}

export interface EntryListResult {
  items: BudgetEntry[];
  totals: { totalPlanned: number; totalActual: number };
}

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Budget service (WP-023, SRS §12.7, FR-087, §8.3, M-07).
 *
 * Owns the budget rules — routes stay thin:
 *
 * - Entries CRUD, owner-only (FR-126): mutations guarded by the store's
 *   `user_id = owner` WHERE clause; missing/non-owned ids are 404.
 * - Category validation against the §12.7 enum; amounts are non-negative
 *   NUMERIC(12,2); `entry_date` defaults to today.
 * - Per-field merge on PATCH (offline-sync-ready contract, FR-089) — only the
 *   provided fields change; absent fields keep their revision.
 * - Summary per §8.3: total planned, total actual (null actual → 0),
 *   variance = actual − planned, remaining = cap − planned (null when the
 *   M-07 cap is unset).
 */
export class BudgetService {
  private readonly store: ChecklistBudgetStore;
  private readonly logger: Logger;
  private readonly cap: number;

  constructor(options: BudgetServiceOptions) {
    this.store = options.store;
    this.logger = options.logger;
    this.cap = options.cap;
  }

  /** Owner-only list, newest entry_date first, with computed totals. */
  async listEntries(userId: string): Promise<EntryListResult> {
    const items = await this.store.listBudgetEntriesForUser(userId);
    return {
      items,
      totals: {
        totalPlanned: roundMoney(items.reduce((sum, e) => sum + e.plannedAmount, 0)),
        totalActual: roundMoney(items.reduce((sum, e) => sum + (e.actualAmount ?? 0), 0)),
      },
    };
  }

  /** Owner-only create (category + amount validation). */
  async createEntry(userId: string, input: CreateEntryPayload): Promise<BudgetEntry> {
    this.validateCreate(input);
    const entry = await this.store.createBudgetEntry({
      userId,
      category: input.category,
      itemName: input.itemName.trim(),
      plannedAmount: input.plannedAmount,
      actualAmount: input.actualAmount ?? null,
      entryDate: input.entryDate ?? todayIso(),
      notes: input.notes ?? null,
    } satisfies CreateBudgetEntryInput);
    this.logger.info('budget.entry_created', 'budget entry created', {
      entry_id: entry.id,
      category: entry.category,
    });
    return entry;
  }

  /** Owner-only per-field merge (FR-089 contract). */
  async updateEntry(
    userId: string,
    id: string,
    patch: UpdateBudgetEntryInput,
  ): Promise<BudgetEntry> {
    this.validatePatch(patch);
    const normalized: UpdateBudgetEntryInput =
      patch.itemName !== undefined ? { ...patch, itemName: patch.itemName.trim() } : patch;
    const entry = await this.store.updateBudgetEntry(id, userId, normalized);
    this.logger.info('budget.entry_updated', 'budget entry updated', {
      entry_id: id,
    });
    return entry;
  }

  /** Owner-only delete (FR-128 erasure path). */
  async deleteEntry(userId: string, id: string): Promise<void> {
    await this.store.deleteBudgetEntry(id, userId);
    this.logger.info('budget.entry_deleted', 'budget entry deleted', { entry_id: id });
  }

  /** §8.3 summary: totals, variance, remaining vs the configurable M-07 cap. */
  async summary(userId: string): Promise<BudgetSummary> {
    const items = await this.store.listBudgetEntriesForUser(userId);
    const totalPlanned = roundMoney(items.reduce((sum, e) => sum + e.plannedAmount, 0));
    const totalActual = roundMoney(items.reduce((sum, e) => sum + (e.actualAmount ?? 0), 0));
    const variance = roundMoney(totalActual - totalPlanned);
    const cap = this.cap > 0 ? this.cap : null;
    const remaining = cap != null ? roundMoney(cap - totalPlanned) : null;
    return { totalPlanned, totalActual, variance, cap, remaining };
  }

  private validateCreate(input: CreateEntryPayload): void {
    this.assertCategory(input.category);
    this.assertItemName(input.itemName);
    this.assertAmount('planned_amount', input.plannedAmount);
    if (input.actualAmount != null) {
      this.assertAmount('actual_amount', input.actualAmount);
    }
    if (input.entryDate !== undefined) {
      this.assertDate(input.entryDate);
    }
    if (input.notes != null && typeof input.notes !== 'string') {
      throw new ValidationError('Invalid budget entry notes', [
        { field: 'notes', reason: 'must be a string or null' },
      ]);
    }
  }

  private validatePatch(patch: UpdateBudgetEntryInput): void {
    if (patch.category !== undefined) {
      this.assertCategory(patch.category);
    }
    if (patch.itemName !== undefined) {
      this.assertItemName(patch.itemName);
    }
    if (patch.plannedAmount !== undefined) {
      this.assertAmount('planned_amount', patch.plannedAmount);
    }
    if (patch.actualAmount != null) {
      this.assertAmount('actual_amount', patch.actualAmount);
    }
    if (patch.entryDate !== undefined) {
      this.assertDate(patch.entryDate);
    }
  }

  private assertCategory(category: string): void {
    if (!BUDGET_CATEGORIES.includes(category as BudgetCategory)) {
      throw new ValidationError('Invalid budget entry category', [
        { field: 'category', reason: `must be one of: ${BUDGET_CATEGORIES.join(', ')}` },
      ]);
    }
  }

  private assertItemName(itemName: string): void {
    if (typeof itemName !== 'string' || itemName.trim().length === 0) {
      throw new ValidationError('Budget entry item name must not be empty', [
        { field: 'item_name', reason: 'must not be empty' },
      ]);
    }
  }

  private assertAmount(field: string, value: number): void {
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
      throw new ValidationError(`Invalid budget amount for ${field}`, [
        { field, reason: 'must be a non-negative number' },
      ]);
    }
  }

  private assertDate(value: string): void {
    if (typeof value !== 'string' || !DATE_PATTERN.test(value) || Number.isNaN(Date.parse(value))) {
      throw new ValidationError('Invalid budget entry date', [
        { field: 'entry_date', reason: 'must be a YYYY-MM-DD date' },
      ]);
    }
  }
}
