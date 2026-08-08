import { randomUUID } from 'node:crypto';
import { NotFoundError } from '@fathersnet/errors';
import type {
  AddItemInput,
  BudgetEntry,
  Checklist,
  ChecklistItem,
  CreateBudgetEntryInput,
  CreateChecklistInput,
  UpdateBudgetEntryInput,
  UpdateItemInput,
} from '../types';
import { computeProgress } from '../services/domain';
import type { ChecklistBudgetStore } from './types';

/**
 * In-memory checklist & budget store — the hermetic test-double (M-08).
 * Mirrors the Postgres adapter's invariants, most importantly the ownership
 * gate: every read is scoped by the caller's identity and non-owned rows are
 * invisible (404 contract, FR-126). Enforces the one-instance-per-type rule
 * (`uq_checklists_user_type`), item ordering by `sort_order`, and on-write
 * parent `progress` recompute (NFR-007) with the same `computeProgress`
 * semantics the Postgres adapter applies.
 */
export type MemoryChecklistBudgetStore = ChecklistBudgetStore;

export function createMemoryChecklistBudgetStore(): MemoryChecklistBudgetStore {
  const checklists = new Map<string, Omit<Checklist, 'items'>>();
  const itemsByChecklist = new Map<string, ChecklistItem[]>();
  const budgetEntries = new Map<string, BudgetEntry>();

  // Monotonic clock: `new Date().toISOString()` only has millisecond
  // resolution, so tight create loops would collide and break ordering
  // contracts. Each timestamp is strictly greater than the previous one,
  // mirroring the sequential `now()` semantics of the Postgres adapter.
  let lastMs = 0;
  function nextIso(): string {
    const now = Date.now();
    lastMs = now > lastMs ? now : lastMs + 1;
    return new Date(lastMs).toISOString();
  }

  function itemsFor(checklistId: string): ChecklistItem[] {
    return [...(itemsByChecklist.get(checklistId) ?? [])].sort(
      (a, b) => a.sortOrder - b.sortOrder || a.createdAt.localeCompare(b.createdAt),
    );
  }

  function toChecklist(row: Omit<Checklist, 'items'>): Checklist {
    return { ...row, items: itemsFor(row.id) };
  }

  function findOwnedChecklist(checklistId: string, ownerId: string): Omit<Checklist, 'items'> {
    const checklist = checklists.get(checklistId);
    if (!checklist || checklist.userId !== ownerId) {
      throw new NotFoundError('Checklist not found');
    }
    return checklist;
  }

  function recomputeProgress(checklistId: string): void {
    const checklist = checklists.get(checklistId);
    if (!checklist) {
      return;
    }
    checklist.progress = computeProgress(itemsFor(checklistId));
    checklist.updatedAt = nextIso();
  }

  return {
    async ensureChecklist(input: CreateChecklistInput): Promise<Checklist> {
      const existing = [...checklists.values()].find(
        (c) => c.userId === input.userId && c.checklistType === input.checklistType,
      );
      if (existing) {
        return toChecklist(existing);
      }
      const now = nextIso();
      const created: Omit<Checklist, 'items'> = {
        id: randomUUID(),
        userId: input.userId,
        checklistType: input.checklistType,
        title: input.title,
        progress: 0,
        createdAt: now,
        updatedAt: now,
      };
      checklists.set(created.id, created);
      itemsByChecklist.set(created.id, []);
      return toChecklist(created);
    },

    async listChecklistsForUser(userId: string): Promise<Checklist[]> {
      return [...checklists.values()]
        .filter((c) => c.userId === userId)
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
        .map(toChecklist);
    },

    async findChecklistForUser(id: string, userId: string): Promise<Checklist | null> {
      const checklist = checklists.get(id);
      if (!checklist || checklist.userId !== userId) {
        return null;
      }
      return toChecklist(checklist);
    },

    async addItem(
      checklistId: string,
      ownerId: string,
      input: AddItemInput,
    ): Promise<ChecklistItem> {
      findOwnedChecklist(checklistId, ownerId);
      const list = itemsByChecklist.get(checklistId) ?? [];
      const now = nextIso();
      const item: ChecklistItem = {
        id: randomUUID(),
        checklistId,
        category: input.category,
        itemName: input.itemName.trim(),
        completed: false,
        completedAt: null,
        custom: true,
        sortOrder: list.length === 0 ? 0 : Math.max(...list.map((i) => i.sortOrder)) + 1,
        createdAt: now,
        updatedAt: now,
      };
      list.push(item);
      itemsByChecklist.set(checklistId, list);
      recomputeProgress(checklistId);
      return { ...item };
    },

    async updateItem(
      checklistId: string,
      itemId: string,
      ownerId: string,
      patch: UpdateItemInput,
    ): Promise<ChecklistItem> {
      findOwnedChecklist(checklistId, ownerId);
      const list = itemsByChecklist.get(checklistId) ?? [];
      const index = list.findIndex((i) => i.id === itemId);
      if (index < 0) {
        throw new NotFoundError('Item not found');
      }
      // eslint-disable-next-line security/detect-object-injection -- `index` is a position found by `findIndex`, never raw user input.
      const existing = list[index];
      const completed = patch.completed !== undefined ? patch.completed : existing.completed;
      const now = nextIso();
      const next: ChecklistItem = {
        ...existing,
        completed,
        completedAt: completed ? now : null,
        updatedAt: now,
      };
      // eslint-disable-next-line security/detect-object-injection -- `index` is a position found by `findIndex`, never raw user input.
      list[index] = next;
      itemsByChecklist.set(checklistId, list);
      recomputeProgress(checklistId);
      return { ...next };
    },

    async createBudgetEntry(input: CreateBudgetEntryInput): Promise<BudgetEntry> {
      const now = nextIso();
      const entry: BudgetEntry = {
        id: randomUUID(),
        userId: input.userId,
        category: input.category,
        itemName: input.itemName.trim(),
        plannedAmount: input.plannedAmount,
        actualAmount: input.actualAmount,
        entryDate: input.entryDate,
        notes: input.notes,
        receiptImage: null,
        createdAt: now,
        updatedAt: now,
      };
      budgetEntries.set(entry.id, entry);
      return { ...entry };
    },

    async listBudgetEntriesForUser(userId: string): Promise<BudgetEntry[]> {
      return [...budgetEntries.values()]
        .filter((e) => e.userId === userId)
        .sort(
          (a, b) =>
            b.entryDate.localeCompare(a.entryDate) || b.createdAt.localeCompare(a.createdAt),
        )
        .map((e) => ({ ...e }));
    },

    async updateBudgetEntry(
      id: string,
      ownerId: string,
      patch: UpdateBudgetEntryInput,
    ): Promise<BudgetEntry> {
      const existing = budgetEntries.get(id);
      if (!existing || existing.userId !== ownerId) {
        throw new NotFoundError('Entry not found');
      }
      const now = nextIso();
      const next: BudgetEntry = {
        ...existing,
        category: patch.category !== undefined ? patch.category : existing.category,
        itemName: patch.itemName !== undefined ? patch.itemName.trim() : existing.itemName,
        plannedAmount:
          patch.plannedAmount !== undefined ? patch.plannedAmount : existing.plannedAmount,
        actualAmount: patch.actualAmount !== undefined ? patch.actualAmount : existing.actualAmount,
        entryDate: patch.entryDate !== undefined ? patch.entryDate : existing.entryDate,
        notes: patch.notes !== undefined ? patch.notes : existing.notes,
        receiptImage: patch.receiptImage !== undefined ? patch.receiptImage : existing.receiptImage,
        updatedAt: now,
      };
      budgetEntries.set(id, next);
      return { ...next };
    },

    async deleteBudgetEntry(id: string, ownerId: string): Promise<void> {
      const existing = budgetEntries.get(id);
      if (!existing || existing.userId !== ownerId) {
        throw new NotFoundError('Entry not found');
      }
      budgetEntries.delete(id);
    },

    async ping(): Promise<boolean> {
      return true;
    },

    async dispose(): Promise<void> {
      checklists.clear();
      itemsByChecklist.clear();
      budgetEntries.clear();
    },
  };
}
