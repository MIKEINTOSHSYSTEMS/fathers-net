import type { JournalStore } from './types';
import { createMemoryJournalStore } from './memory-store';
import { createPostgresJournalStore } from './postgres-store';

export type JournalStoreDriver = 'memory' | 'postgres';

export interface JournalStoreOptions {
  driver: JournalStoreDriver;
  /** Database URL used by the Postgres adapter (ignored for memory). */
  databaseUrl?: string;
}

/**
 * Store factory (M-08: provider-agnostic). The Postgres adapter persists on the
 * migration-019 schema (`journal_entries`, `journal_media`); the in-memory
 * store is the hermetic test-double used by unit tests, CI without a DB, and
 * local development.
 */
export type { JournalStore } from './types';
export type {
  JournalEntry,
  EntryType,
  CreateJournalEntryInput,
  UpdateJournalEntryInput,
  EntryListQuery,
  JournalEntryList,
  OutboxEntry,
} from './types';

export function createJournalStore(options: JournalStoreOptions): JournalStore {
  if (options.driver === 'postgres' && options.databaseUrl) {
    return createPostgresJournalStore(options.databaseUrl);
  }
  return createMemoryJournalStore();
}
