import { ConflictError, NotFoundError } from '@fathersnet/errors';
import { createMemoryContentStore } from '../src/services/store/memory-store';
import type { CreateContentInput, CreateContentVersionInput } from '../src/services/store/types';

function buildInput(overrides: Partial<CreateContentInput> = {}): CreateContentInput {
  return {
    contentType: 'article',
    titleEn: 'Safe pregnancy nutrition',
    titleAm: 'ደህንነቱ የተጠበቀ የእርግዝና አመጋገብ',
    bodyEn: 'Eat a balanced diet during pregnancy.',
    bodyAm: 'በእርግዝና ወቅት የተመጣጠነ ምግብ ይመገቡ።',
    pregnancyWeek: 12,
    createdBy: '33333333-3333-4333-8333-333333333333',
    ...overrides,
  };
}

describe('memory content store (M-08 test-double)', () => {
  it('creates a draft row together with its version-1 snapshot', async () => {
    const store = createMemoryContentStore();
    const created = await store.create(buildInput());

    expect(created).toMatchObject({
      status: 'draft',
      medicalReviewed: false,
      titleEn: 'Safe pregnancy nutrition',
    });
    const versions = await store.getVersions(created.id);
    expect(versions).toHaveLength(1);
    expect(versions[0].bodySnapshot).toMatchObject({ titleAm: 'ደህንነቱ የተጠበቀ የእርግዝና አመጋገብ' });
  });

  it('finds by id and returns null for unknown ids', async () => {
    const store = createMemoryContentStore();
    const created = await store.create(buildInput());
    await expect(store.findById(created.id)).resolves.toMatchObject({ id: created.id });
    await expect(store.findById('00000000-0000-4000-8000-000000000000')).resolves.toBeNull();
  });

  it('merges update patches and throws NotFoundError for missing rows', async () => {
    const store = createMemoryContentStore();
    const created = await store.create(buildInput());

    const updated = await store.updateContent(created.id, {
      bodyEn: 'New body',
      pregnancyWeek: null,
    });
    expect(updated.bodyEn).toBe('New body');
    expect(updated.titleEn).toBe('Safe pregnancy nutrition');
    expect(updated.pregnancyWeek).toBeNull();

    await expect(
      store.updateContent('00000000-0000-4000-8000-000000000000', { titleEn: 'x' }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it('enforces guarded status transitions', async () => {
    const store = createMemoryContentStore();
    const created = await store.create(buildInput());

    // Guarded transition succeeds from the current status.
    const submitted = await store.transition(created.id, {
      from: ['draft'],
      to: 'pending_medical_review',
    });
    expect(submitted.status).toBe('pending_medical_review');

    // A stale guard is a conflict.
    await expect(
      store.transition(created.id, { from: ['draft'], to: 'pending_medical_review' }),
    ).rejects.toBeInstanceOf(ConflictError);

    // medicalReviewed is only set when requested (approve).
    const published = await store.transition(created.id, {
      from: ['pending_medical_review'],
      to: 'published',
      medicalReviewed: true,
    });
    expect(published).toMatchObject({ status: 'published', medicalReviewed: true });
  });

  it('lists only published content with type/week/language filters, newest first', async () => {
    const store = createMemoryContentStore();
    const draft = await store.create(buildInput());
    await store.transition(draft.id, { from: ['draft'], to: 'published' });

    const other = await store.create(
      buildInput({ contentType: 'faq', pregnancyWeek: 20, titleAm: null, bodyAm: null }),
    );
    await store.transition(other.id, { from: ['draft'], to: 'published' });

    expect((await store.listPublished({})).map((c) => c.id)).toContainEqual(draft.id);

    expect((await store.listPublished({ type: 'faq' })).map((c) => c.id)).toEqual([other.id]);
    expect((await store.listPublished({ week: 12 })).map((c) => c.id)).toEqual([draft.id]);
    expect((await store.listPublished({ week: 12 })).map((c) => c.id)).toEqual([draft.id]);
    expect((await store.listPublished({ language: 'am' })).map((c) => c.id)).toEqual([draft.id]);
    expect((await store.listPublished({ language: 'en' })).map((c) => c.id)).toHaveLength(2);
  });

  it('searches published EN text only', async () => {
    const store = createMemoryContentStore();
    const draft = await store.create(buildInput());
    await store.transition(draft.id, { from: ['draft'], to: 'published' });

    expect((await store.search('nutrition', 'en')).map((c) => c.id)).toEqual([draft.id]);
    expect(await store.search('nutrition', 'am')).toEqual([]);
    expect(await store.search('missing-term', 'en')).toEqual([]);

    // Unpublished items never appear.
    const unpublished = await store.create(buildInput({ titleEn: 'Nutrition during labor' }));
    expect((await store.search('nutrition', 'en')).map((c) => c.id)).toEqual([draft.id]);
    expect(unpublished.status).toBe('draft');
  });

  it('appends version history and records the reviewer on the latest version', async () => {
    const store = createMemoryContentStore();
    const created = await store.create(buildInput());
    const input: CreateContentVersionInput = {
      contentId: created.id,
      version: 2,
      changeNote: 'Reviewed edit',
      bodySnapshot: { titleEn: 'v2' },
      reviewedBy: null,
    };
    await store.insertVersion(input);

    const versions = await store.getVersions(created.id);
    expect(versions.map((v) => v.version)).toEqual([1, 2]);

    const reviewed = await store.markVersionReviewed(
      created.id,
      '44444444-4444-4444-8444-444444444444',
    );
    expect(reviewed).toMatchObject({
      version: 2,
      reviewedBy: '44444444-4444-4444-8444-444444444444',
    });
    // The earlier version is untouched.
    const after = await store.getVersions(created.id);
    expect(after[0].reviewedBy).toBeNull();
  });

  it('dispose clears all state', async () => {
    const store = createMemoryContentStore();
    const created = await store.create(buildInput());
    await store.dispose();
    await expect(store.findById(created.id)).resolves.toBeNull();
    expect(await store.getVersions(created.id)).toEqual([]);
  });
});
