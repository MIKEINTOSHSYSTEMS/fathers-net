/**
 * Checklist & budget domain types (WP-023). Single workspace hosts both API
 * groups (plan §4 interpretation decision — one WP, one deployment). Domain
 * rules — progress math, category enums, summary/cap computation, per-field
 * merge — live in the services, not the routes or the store.
 */

export type ChecklistType = 'hospital_bag' | 'birth_prep';

export type ChecklistCategory = 'Documents' | 'Mother' | 'Baby' | 'Hygiene' | 'Extras';

export type BudgetCategory =
  | 'Transport'
  | 'Medical'
  | 'Baby Items'
  | 'Food'
  | 'Clothing'
  | 'Equipment'
  | 'Emergency Fund'
  | 'Other';

export const CHECKLIST_TYPES: readonly ChecklistType[] = ['hospital_bag', 'birth_prep'];

export const CHECKLIST_CATEGORIES: readonly ChecklistCategory[] = [
  'Documents',
  'Mother',
  'Baby',
  'Hygiene',
  'Extras',
];

export const BUDGET_CATEGORIES: readonly BudgetCategory[] = [
  'Transport',
  'Medical',
  'Baby Items',
  'Food',
  'Clothing',
  'Equipment',
  'Emergency Fund',
  'Other',
];

export interface ChecklistItem {
  id: string;
  checklistId: string;
  category: ChecklistCategory;
  itemName: string;
  completed: boolean;
  completedAt: string | null;
  /** User-added item (FR-086 §8.2); seeded defaults are custom = false. */
  custom: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface Checklist {
  id: string;
  userId: string;
  checklistType: ChecklistType;
  title: string;
  /** 0–100, maintained on write (NFR-007) — never recomputed per read. */
  progress: number;
  items: ChecklistItem[];
  createdAt: string;
  updatedAt: string;
}

export interface BudgetEntry {
  id: string;
  userId: string;
  category: BudgetCategory;
  itemName: string;
  plannedAmount: number;
  actualAmount: number | null;
  /** ISO date (YYYY-MM-DD). */
  entryDate: string;
  notes: string | null;
  /** Anonymized object ref (FR-022/§7.4.2) — metadata-only in Phase 2. */
  receiptImage: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface BudgetSummary {
  totalPlanned: number;
  totalActual: number;
  variance: number;
  /** The configured M-07 cap; null when unset (FN_BUDGET_CAP = 0). */
  cap: number | null;
  /** cap - totalPlanned; null when the cap is unset (FN_BUDGET_CAP = 0). */
  remaining: number | null;
}

export interface CreateChecklistInput {
  userId: string;
  checklistType: ChecklistType;
  title: string;
}

export interface AddItemInput {
  category: ChecklistCategory;
  itemName: string;
}

export interface UpdateItemInput {
  completed?: boolean;
}

export interface CreateBudgetEntryInput {
  userId: string;
  category: BudgetCategory;
  itemName: string;
  plannedAmount: number;
  actualAmount: number | null;
  entryDate: string;
  notes: string | null;
}

export interface UpdateBudgetEntryInput {
  category?: BudgetCategory;
  itemName?: string;
  plannedAmount?: number;
  actualAmount?: number | null;
  entryDate?: string;
  notes?: string | null;
  receiptImage?: string | null;
}
