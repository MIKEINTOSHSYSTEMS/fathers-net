import type { ReminderStore } from './types';
import { createMemoryReminderStore } from './memory-store';
import { createPostgresReminderStore } from './postgres-store';

export type ReminderStoreDriver = 'memory' | 'postgres';

export interface ReminderStoreOptions {
  driver: ReminderStoreDriver;
  /** Database URL used by the Postgres adapter (ignored for memory). */
  databaseUrl?: string;
  /** Test seam for the memory adapter: per-user quiet hours (FR-038). */
  memoryUserQuietHours?: Record<string, unknown>;
}

/**
 * Store factory (M-08: provider-agnostic). The Postgres adapter persists on the
 * migration-018 schema; the in-memory store is the hermetic test-double used by
 * unit tests, CI without a DB, and local development.
 */
export type { ReminderStore } from './types';
export type {
  ReminderTemplate,
  ReminderInstance,
  ReminderDispatch,
  CreateReminderTemplateInput,
  CreateReminderInstanceInput,
  QuietHoursConfig,
} from '../types';
export type { DispatchOutcome } from './types';

export function createReminderStore(options: ReminderStoreOptions): ReminderStore {
  if (options.driver === 'postgres' && options.databaseUrl) {
    return createPostgresReminderStore(options.databaseUrl);
  }
  return createMemoryReminderStore(
    options.memoryUserQuietHours as Record<string, never> | undefined,
  );
}
