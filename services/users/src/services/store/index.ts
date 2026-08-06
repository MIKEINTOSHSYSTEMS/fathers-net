import type { UsersStore } from './types';
import { createMemoryUsersStore } from './memory-store';
import { createPostgresUsersStore } from './postgres-store';

export type UsersStoreDriver = 'memory' | 'postgres';

export interface UsersStoreOptions {
  driver: UsersStoreDriver;
  /** Database URL used by the Postgres adapter (ignored for memory). */
  databaseUrl?: string;
  /** Injectable clock (milliseconds) for deterministic tests. */
  nowMs?: () => number;
}

/**
 * Store factory (M-08: provider-agnostic). The Postgres adapter persists on the
 * baseline schema (migrations 001–004); the in-memory store is the hermetic
 * test-double used by unit tests, CI without a DB, and local development.
 */
export type { UsersStore } from './types';
export type {
  UserRecord,
  ProfileRecord,
  PregnancyRecord,
  PreferencesRecord,
  CreateUserInput,
} from './types';

export function createUsersStore(options: UsersStoreOptions): UsersStore {
  if (options.driver === 'postgres' && options.databaseUrl) {
    return createPostgresUsersStore(options.databaseUrl);
  }
  return createMemoryUsersStore();
}
