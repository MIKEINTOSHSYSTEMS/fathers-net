import type { ContentStore } from './types';
import { createMemoryContentStore } from './memory-store';
import { createPostgresContentStore } from './postgres-store';

export type ContentStoreDriver = 'memory' | 'postgres';

export interface ContentStoreOptions {
  driver: ContentStoreDriver;
  /** Database URL used by the Postgres adapter (ignored for memory). */
  databaseUrl?: string;
}

/**
 * Store factory (M-08: provider-agnostic). The Postgres adapter persists on the
 * migration-011 schema (`content`, `content_versions`); the in-memory store is
 * the hermetic test-double used by unit tests, CI without a DB, and local
 * development.
 */
export type { ContentStore } from './types';
export type {
  ContentRecord,
  ContentVersionRecord,
  ContentType,
  ContentStatus,
  ContentLanguage,
  CreateContentInput,
  ContentUpdateInput,
  ContentListQuery,
} from './types';

export function createContentStore(options: ContentStoreOptions): ContentStore {
  if (options.driver === 'postgres' && options.databaseUrl) {
    return createPostgresContentStore(options.databaseUrl);
  }
  return createMemoryContentStore();
}
