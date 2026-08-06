import { Pool } from 'pg';
import { ConflictError } from '@fathersnet/errors';
import { createPostgresContentStore } from '../src/services/store/postgres-store';
import type { CreateContentInput } from '../src/services/store/types';

const TEST_DATABASE_URL = process.env.CONTENT_TEST_DATABASE_URL;
const describeIntegration = TEST_DATABASE_URL ? describe : describe.skip;

/**
 * A staff reviewer must exist in `users` before `reviewed_by` can reference it
 * (migration 011 `content_versions.reviewed_by REFERENCES users(id) ON DELETE
 * SET NULL`). Fixed uuid so tests can assert on it.
 */
const REVIEWER_USER_ID = '44444444-4444-4444-8444-444444444444';

function buildInput(): CreateContentInput {
  return {
    contentType: 'article',
    titleEn: `Safe pregnancy nutrition ${Math.random().toString(36).slice(2)}`,
    titleAm: 'ደህንነቱ የተጠበቀ የእርግዝና አመጋገብ',
    bodyEn: 'Eat a balanced diet during pregnancy.',
    bodyAm: 'በእርግዝና ወቅት የተመጣጠነ ምግብ ይመገቡ።',
    pregnancyWeek: 12,
    createdBy: null,
  };
}

describeIntegration('content store Postgres adapter (migration 011 schema)', () => {
  let store: ReturnType<typeof createPostgresContentStore>;

  beforeEach(async () => {
    const pool = new Pool({ connectionString: TEST_DATABASE_URL });
    try {
      // Isolate each test: the store reads the whole table, so rows from a
      // previous test/run must not leak into listPublished/search assertions.
      await pool.query('TRUNCATE content_versions, content CASCADE');
      await pool.query(
        `INSERT INTO users (id, phone_e164, phone_e164_digest, role, status)
         VALUES ($1, 'cipher.reviewer', 'digest.reviewer', 'staff', 'active')
         ON CONFLICT (id) DO NOTHING`,
        [REVIEWER_USER_ID],
      );
    } finally {
      await pool.end();
    }
    store = createPostgresContentStore(TEST_DATABASE_URL as string);
  });

  afterEach(async () => {
    await store.dispose();
  });

  it('creates a draft atomically with its version-1 snapshot', async () => {
    const input = buildInput();
    const created = await store.create(input);
    expect(created.id).toMatch(/^[0-9a-f-]{36}$/i);
    expect(created).toMatchObject({ status: 'draft', medicalReviewed: false });

    const versions = await store.getVersions(created.id);
    expect(versions).toHaveLength(1);
    expect(versions[0]).toMatchObject({ version: 1, changeNote: null, reviewedBy: null });
    expect(versions[0].bodySnapshot).toMatchObject({ titleEn: input.titleEn });
  });

  it('merges updates and appends an immutable version snapshot', async () => {
    const created = await store.create(buildInput());
    const updated = await store.updateContent(created.id, {
      bodyEn: 'Updated body',
      pregnancyWeek: 20,
    });
    expect(updated).toMatchObject({ bodyEn: 'Updated body', pregnancyWeek: 20 });
    expect(updated.titleEn).toBe(created.titleEn);

    const versions = await store.getVersions(created.id);
    expect(versions).toHaveLength(1);
  });

  it('enforces guarded transitions and the lifecycle status CHECK', async () => {
    const created = await store.create(buildInput());

    const submitted = await store.transition(created.id, {
      from: ['draft'],
      to: 'pending_medical_review',
    });
    expect(submitted.status).toBe('pending_medical_review');

    await expect(
      store.transition(created.id, { from: ['draft'], to: 'pending_medical_review' }),
    ).rejects.toBeInstanceOf(ConflictError);

    const published = await store.transition(created.id, {
      from: ['pending_medical_review'],
      to: 'published',
      medicalReviewed: true,
    });
    expect(published).toMatchObject({ status: 'published', medicalReviewed: true });
  });

  it('runs FTS search over published EN content only', async () => {
    const created = await store.create(buildInput());
    await store.transition(created.id, { from: ['draft'], to: 'published' });

    const term = created.titleEn!.split(' ').pop()!;
    const hits = await store.search(term, 'en');
    expect(hits.map((c) => c.id)).toEqual([created.id]);

    expect(await store.search('nutrition', 'am')).toEqual([]);

    // A second draft with matching text stays hidden until published.
    const draft = await store.create(buildInput());
    expect((await store.search(term, 'en')).map((c) => c.id)).toEqual([created.id]);
    expect(draft.status).toBe('draft');
  });

  it('filters the published list by type, week, and language', async () => {
    const a = await store.create(buildInput());
    await store.transition(a.id, { from: ['draft'], to: 'published' });
    const b = await store.create(buildInput());
    await store.transition(b.id, { from: ['draft'], to: 'published' });

    expect((await store.listPublished({ type: 'article' })).map((c) => c.id)).toHaveLength(2);
    expect((await store.listPublished({ week: 12 })).map((c) => c.id)).toHaveLength(2);
    expect((await store.listPublished({ language: 'am' })).map((c) => c.id)).toHaveLength(2);
    expect(await store.listPublished({ type: 'video' })).toEqual([]);
    expect(await store.listPublished({ week: 30 })).toEqual([]);
  });

  it('records the reviewer on the latest version snapshot', async () => {
    const created = await store.create(buildInput());
    const reviewed = await store.markVersionReviewed(
      created.id,
      '44444444-4444-4444-8444-444444444444',
    );
    expect(reviewed).toMatchObject({
      version: 1,
      reviewedBy: '44444444-4444-4444-8444-444444444444',
    });
    const versions = await store.getVersions(created.id);
    expect(versions[0].reviewedBy).toBe('44444444-4444-4444-8444-444444444444');
  });

  it('rejects an out-of-set status at the DB layer (CHECK)', async () => {
    const created = await store.create(buildInput());
    const pool = new Pool({ connectionString: TEST_DATABASE_URL });
    try {
      await expect(
        pool.query(`UPDATE content SET status = 'bogus' WHERE id = $1`, [created.id]),
      ).rejects.toThrow(/check/);
    } finally {
      await pool.end();
    }
  });
});
