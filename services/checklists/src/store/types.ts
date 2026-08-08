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

/**
 * Checklist & budget store interface (WP-023). The store is the
 * provider-agnostic boundary (M-08): the Postgres adapter persists on the
 * migration-020 tables (`checklists`, `checklist_items`, `budget_entries`);
 * the in-memory store is the hermetic test-double.
 *
 * Privacy is enforced AT the store layer, never in routes (plan §7): every
 * checklist read/mutation is scoped by the caller's identity (owner-only,
 * FR-126). A checklist owned by someone else, or a missing row, yields
 * `null` (reads) or `NotFoundError` (mutations) → 404 invisibility, never 403.
 * Budget entry mutations are owner-guarded in the WHERE clause the same way.
 *
 * `ensureChecklist` materializes the standard per-user instance on first use
 * (template-driven instantiation, 06 Phase F). The §8.2 default ITEMS are
 * seed data (migration 017, deferred) — WP-023 creates empty instances only.
 * Progress on a parent checklist is maintained ON WRITE (NFR-007): item add /
 * completion toggle recomputes `checklists.progress` in the same operation.
 */
export interface ChecklistBudgetStore {
  /** Create the user's checklist of the given type if absent; else return the
   *  existing one. Returns the checklist WITH its items attached. */
  ensureChecklist(input: CreateChecklistInput): Promise<Checklist>;

  /** Owner-only: the user's checklists with items, ordered by creation. */
  listChecklistsForUser(userId: string): Promise<Checklist[]>;

  /** Owner-only read. Returns null for a missing or non-owned checklist —
   *  the 404-invisibility contract (FR-126). */
  findChecklistForUser(id: string, userId: string): Promise<Checklist | null>;

  /** Owner-only add of a user-added (custom) item. Throws NotFoundError when
   *  the checklist is missing or not owned. Recomputes parent progress. */
  addItem(checklistId: string, ownerId: string, input: AddItemInput): Promise<ChecklistItem>;

  /** Owner-only per-field item update (completion toggle). Throws
   *  NotFoundError for a missing or non-owned checklist/item. Recomputes
   *  parent progress transactionally. */
  updateItem(
    checklistId: string,
    itemId: string,
    ownerId: string,
    patch: UpdateItemInput,
  ): Promise<ChecklistItem>;

  /** Create a budget entry owned by `userId`. */
  createBudgetEntry(input: CreateBudgetEntryInput): Promise<BudgetEntry>;

  /** Owner-only entries, newest entry_date first. */
  listBudgetEntriesForUser(userId: string): Promise<BudgetEntry[]>;

  /** Owner-only per-field merge. Throws NotFoundError when missing/not owned. */
  updateBudgetEntry(
    id: string,
    ownerId: string,
    patch: UpdateBudgetEntryInput,
  ): Promise<BudgetEntry>;

  /** Owner-only delete (FR-128 erasure path). Throws NotFoundError. */
  deleteBudgetEntry(id: string, ownerId: string): Promise<void>;

  /** Store round-trip for the `/readyz` probe. Postgres executes `SELECT 1`. */
  ping(): Promise<boolean>;

  dispose(): Promise<void>;
}
