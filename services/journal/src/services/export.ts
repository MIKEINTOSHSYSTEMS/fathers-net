import type { JournalEntry } from '../store/types';

export const JOURNAL_EXPORT_SCHEMA_VERSION = 1;
export const JOURNAL_EXPORT_SCHEMA_URL = 'https://fathersnet.app/schema/journal-export/v1.json';

export interface JournalExportEntry {
  id: string;
  entry_type: JournalEntry['entryType'];
  content: string;
  pregnancy_week: number | null;
  shared_with_partner: boolean;
  created_at: string;
  updated_at: string;
}

export interface JournalExportArtifact {
  schema_version: number;
  schema_url: string;
  exported_at: string;
  entry_count: number;
  entries: JournalExportEntry[];
}

/**
 * Portable JSON export artifact (WP-022 §5, FR-057/FR-128).
 *
 * Synchronous, schema-versioned envelope:
 * - Owns ONLY the requesting user's entries (never another user's shared
 *   entries — export is self-scoped).
 * - Chronological ascending order (oldest first) for a stable, diff-able
 *   artifact.
 * - No media, no partner-shared rows, no internal ids beyond the entry id.
 * - Deterministic given the same rows + clock: `now` is injectable so the
 *   artifact bytes are reproducible for a fixed `exported_at` (FR-057
 *   portability). No random fields are ever injected.
 *
 * PDF rendering and the async job/`data_export_jobs` path are deferred to
 * Phase 4 (WP-060) — this avoids the beyond-catalog approval gate.
 */
export function buildJournalExport(
  entries: JournalEntry[],
  now: () => string = () => new Date().toISOString(),
): JournalExportArtifact {
  return {
    schema_version: JOURNAL_EXPORT_SCHEMA_VERSION,
    schema_url: JOURNAL_EXPORT_SCHEMA_URL,
    exported_at: now(),
    entry_count: entries.length,
    entries: entries.map(toExportEntry),
  };
}

function toExportEntry(entry: JournalEntry): JournalExportEntry {
  return {
    id: entry.id,
    entry_type: entry.entryType,
    content: entry.content,
    pregnancy_week: entry.pregnancyWeek,
    shared_with_partner: entry.sharedWithPartner,
    created_at: entry.createdAt,
    updated_at: entry.updatedAt,
  };
}
