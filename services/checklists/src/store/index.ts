import type { ChecklistBudgetStore } from './types';
import { createMemoryChecklistBudgetStore } from './memory-store';
import { createPostgresChecklistBudgetStore } from './postgres-store';

export type ChecklistBudgetStoreDriver = 'memory' | 'postgres';

export interface ChecklistBudgetStoreOptions {
  driver: ChecklistBudgetStoreDriver;
  /** Database URL used by the Postgres adapter (ignored for memory). */
  databaseUrl?: string;
}

/**
 * Store factory (M-08: provider-agnostic). The Postgres adapter persists on
 * the migration-020 schema (`checklists`, `checklist_items`, `budget_entries`);
 * the in-memory store is the hermetic test-double used by unit tests, CI
 * without a DB, and local development.
 */
export type { ChecklistBudgetStore } from './types';
export type {
  Checklist,
  ChecklistItem,
  BudgetEntry,
  BudgetSummary,
  ChecklistType,
  ChecklistCategory,
  BudgetCategory,
} from '../types';

export function createChecklistBudgetStore(
  options: ChecklistBudgetStoreOptions,
): ChecklistBudgetStore {
  if (options.driver === 'postgres' && options.databaseUrl) {
    return createPostgresChecklistBudgetStore(options.databaseUrl);
  }
  return createMemoryChecklistBudgetStore();
}
