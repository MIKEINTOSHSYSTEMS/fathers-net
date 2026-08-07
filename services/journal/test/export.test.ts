import {
  buildJournalExport,
  JOURNAL_EXPORT_SCHEMA_URL,
  JOURNAL_EXPORT_SCHEMA_VERSION,
} from '../src/services/export';
import type { JournalEntry } from '../src/store/types';

const OWNER = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

function entry(overrides: Partial<JournalEntry> = {}): JournalEntry {
  return {
    id: 'entry-1',
    userId: OWNER,
    entryType: 'text',
    content: 'Our journey',
    pregnancyWeek: 24,
    sharedWithPartner: false,
    createdAt: '2026-01-01T09:00:00.000Z',
    updatedAt: '2026-01-01T09:00:00.000Z',
    ...overrides,
  };
}

describe('buildJournalExport (FR-057/FR-128 portability)', () => {
  it('produces a schema-versioned, deterministic artifact', () => {
    const rows = [
      entry(),
      entry({ id: 'entry-2', content: 'Second', createdAt: '2026-01-02T09:00:00.000Z' }),
    ];
    const now = () => '2026-08-07T12:00:00.000Z';

    const a = buildJournalExport(rows, now);
    const b = buildJournalExport(rows, now);

    expect(a.schema_version).toBe(JOURNAL_EXPORT_SCHEMA_VERSION);
    expect(a.schema_url).toBe(JOURNAL_EXPORT_SCHEMA_URL);
    expect(a.exported_at).toBe('2026-08-07T12:00:00.000Z');
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it('maps owner entries in chronological order with snake_case field names', () => {
    const rows = [
      entry(),
      entry({ id: 'entry-2', content: 'Older', createdAt: '2025-12-01T09:00:00.000Z' }),
    ];
    const artifact = buildJournalExport(rows, () => 'now');

    expect(artifact.entry_count).toBe(2);
    expect(artifact.entries.map((e) => e.content)).toEqual(['Our journey', 'Older']);
    expect(artifact.entries[0]).toEqual({
      id: 'entry-1',
      entry_type: 'text',
      content: 'Our journey',
      pregnancy_week: 24,
      shared_with_partner: false,
      created_at: '2026-01-01T09:00:00.000Z',
      updated_at: '2026-01-01T09:00:00.000Z',
    });
    // No internal fields leak (userId never exported).
    expect(JSON.stringify(artifact)).not.toContain(OWNER);
    expect(JSON.stringify(artifact)).not.toContain('userId');
  });

  it('excludes media-like or partner rows by construction (self-scoped entries only)', () => {
    const rows = [entry({ sharedWithPartner: true })];
    const artifact = buildJournalExport(rows, () => 'now');
    expect(artifact.entries[0].shared_with_partner).toBe(true);
    expect(artifact.entries).toHaveLength(1);
  });
});
