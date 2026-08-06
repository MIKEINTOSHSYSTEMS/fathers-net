import { Pool } from 'pg';
import { ConflictError, NotFoundError } from '@fathersnet/errors';
import { createPostgresContentStore } from '../src/services/store/postgres-store';
import type { ContentUpdateInput } from '../src/services/store/types';

jest.mock('pg', () => ({
  Pool: jest.fn(),
}));

interface PgCall {
  text: string;
  values?: unknown[];
}

/**
 * Hermetic Postgres-store unit tests (WP-020). A fake Pool scripts query
 * results and records every statement so the SQL generation and row mappers
 * are exercised without a live database; the real end-to-end adapter is
 * verified by the gated integration test against CONTENT_TEST_DATABASE_URL.
 */
class FakePg {
  calls: PgCall[] = [];
  responses: Array<{ rows: Record<string, unknown>[] }> = [];
  ended = false;
  throwAfter = Number.POSITIVE_INFINITY;

  private run = async (
    text: string,
    values?: unknown[],
  ): Promise<{ rows: Record<string, unknown>[] }> => {
    this.calls.push({ text, values });
    if (this.calls.length > this.throwAfter) {
      throw new Error('duplicate key');
    }
    return this.responses.shift() ?? { rows: [] };
  };

  query = this.run;

  connect = async (): Promise<{
    query: (text: string, values?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }>;
    release: jest.Mock;
  }> => {
    return {
      query: this.run,
      release: jest.fn(),
    };
  };

  end = async (): Promise<void> => {
    this.ended = true;
  };
}

const CONTENT_ROW = {
  id: '00000000-0000-4000-8000-000000000001',
  content_type: 'article',
  title_en: 'Safe pregnancy nutrition',
  title_am: 'ደህንነቱ የተጠበቀ የእርግዝና አመጋገብ',
  body_en: 'Eat a balanced diet during pregnancy.',
  body_am: 'በእርግዝና ወቅት የተመጣጠነ ምግብ ይመገቡ።',
  pregnancy_week: 12,
  status: 'draft',
  medical_reviewed: false,
  created_by: null,
  created_at: new Date('2025-01-01T00:00:00Z'),
  updated_at: new Date('2025-01-01T00:00:00Z'),
};

const VERSION_ROW = {
  id: '00000000-0000-4000-8000-000000000002',
  content_id: CONTENT_ROW.id,
  version: 1,
  change_note: null,
  body_snapshot: { titleEn: CONTENT_ROW.title_en },
  reviewed_by: null,
  created_at: new Date('2025-01-01T00:00:00Z'),
};

const CREATE_INPUT = {
  contentType: 'article',
  titleEn: 'Safe pregnancy nutrition',
  titleAm: 'ደህንነቱ የተጠበቀ የእርግዝና አመጋገብ',
  bodyEn: 'Eat a balanced diet during pregnancy.',
  bodyAm: 'በእርግዝና ወቅት የተመጣጠነ ምግብ ይመገቡ።',
  pregnancyWeek: 12,
  createdBy: null,
} as const;

describe('content store Postgres adapter (SQL generation, hermetic)', () => {
  let fake: FakePg;

  beforeEach(() => {
    fake = new FakePg();
    (Pool as unknown as jest.Mock).mockImplementation(() => fake);
  });

  it('creates a draft inside a transaction with a version-1 snapshot', async () => {
    const store = createPostgresContentStore('postgres://test');
    fake.responses.push({ rows: [] }); // BEGIN
    fake.responses.push({ rows: [CONTENT_ROW] }); // INSERT content ... RETURNING
    const created = await store.create(CREATE_INPUT);
    expect(created).toMatchObject({
      id: CONTENT_ROW.id,
      status: 'draft',
      medicalReviewed: false,
      titleEn: 'Safe pregnancy nutrition',
    });
    expect(created.createdAt).toBe('2025-01-01T00:00:00.000Z');

    const texts = fake.calls.map((c) => c.text);
    expect(texts[0]).toBe('BEGIN');
    expect(texts[1]).toContain('INSERT INTO content');
    expect(texts[2]).toContain('INSERT INTO content_versions');
    expect(texts[2]).toContain('VALUES ($1, 1, NULL, $2::jsonb, NULL)');
    expect(texts.join('\n')).toContain('COMMIT');
    expect(fake.calls[1].values).toEqual([
      'article',
      'Safe pregnancy nutrition',
      'ደህንነቱ የተጠበቀ የእርግዝና አመጋገብ',
      'Eat a balanced diet during pregnancy.',
      'በእርግዝና ወቅት የተመጣጠነ ምግብ ይመገቡ።',
      12,
      null,
    ]);
  });

  it('rolls back and rethrows when the transaction fails', async () => {
    const store = createPostgresContentStore('postgres://test');
    fake.throwAfter = 1; // BEGIN ok; INSERT content throws; ROLLBACK runs.
    await expect(store.create(CREATE_INPUT)).rejects.toThrow('duplicate key');
    expect(fake.calls.map((c) => c.text)).toContain('ROLLBACK');
  });

  it('finds a content row by id and parses nullable fields', async () => {
    const store = createPostgresContentStore('postgres://test');
    fake.responses.push({ rows: [CONTENT_ROW] });
    await expect(store.findById(CONTENT_ROW.id)).resolves.toMatchObject({
      id: CONTENT_ROW.id,
      titleEn: 'Safe pregnancy nutrition',
      pregnancyWeek: 12,
      createdBy: null,
    });
    expect(fake.calls[0].text).toContain('FROM content');
    expect(fake.calls[0].text).toContain('WHERE id = $1');
  });

  it('returns null when the id lookup misses', async () => {
    const store = createPostgresContentStore('postgres://test');
    await expect(store.findById('missing')).resolves.toBeNull();
  });

  it('parses null localized fields into null', async () => {
    const store = createPostgresContentStore('postgres://test');
    fake.responses.push({
      rows: [{ ...CONTENT_ROW, title_am: null, body_am: null, pregnancy_week: null }],
    });
    const found = await store.findById(CONTENT_ROW.id);
    expect(found).toMatchObject({ titleAm: null, bodyAm: null, pregnancyWeek: null });
  });

  it('updates the given content columns only', async () => {
    const store = createPostgresContentStore('postgres://test');
    fake.responses.push({
      rows: [{ ...CONTENT_ROW, body_en: 'Updated body', pregnancy_week: 20 }],
    });
    const patch: ContentUpdateInput = { bodyEn: 'Updated body', pregnancyWeek: 20 };
    const updated = await store.updateContent(CONTENT_ROW.id, patch);
    expect(updated).toMatchObject({ bodyEn: 'Updated body', pregnancyWeek: 20 });

    const updateCall = fake.calls[0];
    expect(updateCall.text).toContain('UPDATE content SET body_en = $1, pregnancy_week = $2');
    expect(updateCall.text).toContain('WHERE id = $3');
    expect(updateCall.text).toContain('updated_at = now()');
    expect(updateCall.values).toEqual(['Updated body', 20, CONTENT_ROW.id]);
  });

  it('coerces undefined fields to null in the update', async () => {
    const store = createPostgresContentStore('postgres://test');
    fake.responses.push({ rows: [{ ...CONTENT_ROW, title_en: null }] });
    const updated = await store.updateContent(CONTENT_ROW.id, { titleEn: undefined });
    expect(updated.titleEn).toBeNull();
    expect(fake.calls[0].values).toEqual([null, CONTENT_ROW.id]);
  });

  it('throws NotFoundError when updating a missing content row', async () => {
    const store = createPostgresContentStore('postgres://test');
    await expect(store.updateContent('missing', { bodyEn: 'X' })).rejects.toBeInstanceOf(
      NotFoundError,
    );
  });

  it('transitions status with the guarded WHERE clause', async () => {
    const store = createPostgresContentStore('postgres://test');
    fake.responses.push({ rows: [{ ...CONTENT_ROW, status: 'pending_medical_review' }] });
    const submitted = await store.transition(CONTENT_ROW.id, {
      from: ['draft'],
      to: 'pending_medical_review',
    });
    expect(submitted.status).toBe('pending_medical_review');

    const call = fake.calls[0];
    expect(call.text).toContain('SET status = $2,');
    expect(call.text).toContain('WHERE id = $1 AND status = ANY($4::text[])');
    expect(call.values).toEqual([CONTENT_ROW.id, 'pending_medical_review', false, ['draft']]);
  });

  it('clears medical_reviewed on approve transitions', async () => {
    const store = createPostgresContentStore('postgres://test');
    fake.responses.push({
      rows: [{ ...CONTENT_ROW, status: 'published', medical_reviewed: true }],
    });
    const published = await store.transition(CONTENT_ROW.id, {
      from: ['pending_medical_review'],
      to: 'published',
      medicalReviewed: true,
    });
    expect(published).toMatchObject({ status: 'published', medicalReviewed: true });
    expect(fake.calls[0].values).toEqual([
      CONTENT_ROW.id,
      'published',
      true,
      ['pending_medical_review'],
    ]);
  });

  it('throws ConflictError when the guarded transition matches no row', async () => {
    const store = createPostgresContentStore('postgres://test');
    await expect(
      store.transition(CONTENT_ROW.id, { from: ['draft'], to: 'pending_medical_review' }),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it('lists published content newest first with no filters', async () => {
    const store = createPostgresContentStore('postgres://test');
    fake.responses.push({ rows: [CONTENT_ROW] });
    const items = await store.listPublished({});
    expect(items).toHaveLength(1);
    const call = fake.calls[0];
    expect(call.text).toContain("WHERE status = 'published'");
    expect(call.text).toContain('ORDER BY updated_at DESC, id DESC');
    expect(call.values).toEqual([]);
  });

  it('filters the published list by type, week, and language', async () => {
    const store = createPostgresContentStore('postgres://test');
    fake.responses.push({ rows: [] });
    await store.listPublished({ type: 'video', week: 20, language: 'am' });
    const call = fake.calls[0];
    expect(call.text).toContain("status = 'published'");
    expect(call.text).toContain('content_type = $1');
    expect(call.text).toContain('pregnancy_week = $2');
    expect(call.text).toContain('title_am IS NOT NULL AND body_am IS NOT NULL');
    expect(call.values).toEqual(['video', 20]);
  });

  it('adds the EN-language clause for en filters', async () => {
    const store = createPostgresContentStore('postgres://test');
    fake.responses.push({ rows: [] });
    await store.listPublished({ language: 'en' });
    expect(fake.calls[0].text).toContain('title_en IS NOT NULL AND body_en IS NOT NULL');
  });

  it('searches published EN content with FTS and rank ordering', async () => {
    const store = createPostgresContentStore('postgres://test');
    fake.responses.push({ rows: [CONTENT_ROW] });
    const hits = await store.search('nutrition', 'en');
    expect(hits).toHaveLength(1);
    const call = fake.calls[0];
    expect(call.text).toContain("to_tsvector('english'");
    expect(call.text).toContain("status = 'published'");
    expect(call.text).toContain('ORDER BY rank DESC, id DESC');
    expect(call.values).toEqual(['nutrition']);
  });

  it('returns no results for non-English or blank searches', async () => {
    const store = createPostgresContentStore('postgres://test');
    expect(await store.search('ተመጣጠነ', 'am')).toEqual([]);
    expect(await store.search('   ', 'en')).toEqual([]);
    expect(fake.calls).toHaveLength(0);
  });

  it('inserts a version snapshot and parses the version row', async () => {
    const store = createPostgresContentStore('postgres://test');
    fake.responses.push({
      rows: [{ ...VERSION_ROW, version: 2, change_note: 'Add a source' }],
    });
    const version = await store.insertVersion({
      contentId: CONTENT_ROW.id,
      version: 2,
      changeNote: 'Add a source',
      bodySnapshot: { titleEn: CONTENT_ROW.title_en, bodyEn: 'New body' },
      reviewedBy: null,
    });
    expect(version).toMatchObject({ version: 2, changeNote: 'Add a source', reviewedBy: null });
    expect(version.bodySnapshot).toEqual({ titleEn: CONTENT_ROW.title_en });
    expect(version.createdAt).toBe('2025-01-01T00:00:00.000Z');

    const call = fake.calls[0];
    expect(call.text).toContain('INSERT INTO content_versions');
    expect(call.text).toContain('$4::jsonb');
    expect(call.values).toEqual([
      CONTENT_ROW.id,
      2,
      'Add a source',
      JSON.stringify({ titleEn: CONTENT_ROW.title_en, bodyEn: 'New body' }),
      null,
    ]);
  });

  it('reads version history ordered ascending', async () => {
    const store = createPostgresContentStore('postgres://test');
    fake.responses.push({
      rows: [
        { ...VERSION_ROW, version: 1 },
        { ...VERSION_ROW, version: 2 },
      ],
    });
    const versions = await store.getVersions(CONTENT_ROW.id);
    expect(versions.map((v) => v.version)).toEqual([1, 2]);
    expect(fake.calls[0].text).toContain('ORDER BY version ASC');
  });

  it('marks the latest version reviewed', async () => {
    const store = createPostgresContentStore('postgres://test');
    fake.responses.push({
      rows: [{ ...VERSION_ROW, reviewed_by: '44444444-4444-4444-8444-444444444444' }],
    });
    const reviewed = await store.markVersionReviewed(
      CONTENT_ROW.id,
      '44444444-4444-4444-8444-444444444444',
    );
    expect(reviewed).toMatchObject({
      version: 1,
      reviewedBy: '44444444-4444-4444-8444-444444444444',
    });
    const call = fake.calls[0];
    expect(call.text).toContain(
      'version = (SELECT MAX(version) FROM content_versions WHERE content_id = $1)',
    );
    expect(call.values).toEqual([CONTENT_ROW.id, '44444444-4444-4444-8444-444444444444']);
  });

  it('throws NotFoundError when no version row matches the reviewer update', async () => {
    const store = createPostgresContentStore('postgres://test');
    await expect(
      store.markVersionReviewed('missing', '44444444-4444-4444-8444-444444444444'),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it('parses an empty body_snapshot as an empty object', async () => {
    const store = createPostgresContentStore('postgres://test');
    fake.responses.push({ rows: [{ ...VERSION_ROW, body_snapshot: null }] });
    const versions = await store.getVersions(CONTENT_ROW.id);
    expect(versions[0].bodySnapshot).toEqual({});
  });

  it('dispose ends the pool', async () => {
    const store = createPostgresContentStore('postgres://test');
    await store.dispose();
    expect(fake.ended).toBe(true);
  });
});
