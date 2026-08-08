import { createTestLogger } from '@fathersnet/test-utils';
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from '@fathersnet/errors';
import { ContentService, type CreateContentDraftInput } from '../src/services/content-service';
import {
  createMemoryContentStore,
  type MemoryContentStore,
} from '../src/services/store/memory-store';
import type { ContentRecord } from '../src/services/store/types';

const AUTHOR = '11111111-1111-4111-8111-111111111111';
const REVIEWER = '22222222-2222-4222-8222-222222222222';

function buildDraft(overrides: Partial<CreateContentDraftInput> = {}): CreateContentDraftInput {
  return {
    contentType: 'article',
    titleEn: 'Safe pregnancy nutrition',
    titleAm: 'ደህንነቱ የተጠበቀ የእርግዝና አመጋገብ',
    bodyEn: 'Eat a balanced diet during pregnancy.',
    bodyAm: 'በእርግዝና ወቅት የተመጣጠነ ምግብ ይመገቡ።',
    pregnancyWeek: 12,
    ...overrides,
  };
}

function setup(): {
  service: ContentService;
  store: MemoryContentStore;
} {
  const store = createMemoryContentStore();
  const { logger } = createTestLogger('debug');
  const service = new ContentService({ store, logger });
  return { service, store };
}

async function createDraft(
  service: ContentService,
  overrides: Partial<CreateContentDraftInput> = {},
): Promise<ContentRecord> {
  return service.createDraft(buildDraft(overrides), AUTHOR);
}

describe('ContentService workflow (WP-020, SRS §12.5, AR-015)', () => {
  it('creates a draft owned by the author with a version-1 snapshot', async () => {
    const { service, store } = setup();
    const draft = await createDraft(service);

    expect(draft).toMatchObject({
      contentType: 'article',
      titleEn: 'Safe pregnancy nutrition',
      status: 'draft',
      medicalReviewed: false,
      createdBy: AUTHOR,
    });
    expect(draft.pregnancyWeek).toBe(12);
    const versions = await store.getVersions(draft.id);
    expect(versions).toHaveLength(1);
    expect(versions[0]).toMatchObject({ version: 1, changeNote: null, reviewedBy: null });
    expect(versions[0].bodySnapshot).toMatchObject({ titleEn: 'Safe pregnancy nutrition' });
  });

  it('records a new immutable version snapshot on update with a change note', async () => {
    const { service, store } = setup();
    const draft = await createDraft(service);

    const updated = await service.update(draft.id, {
      bodyEn: 'Updated English body.',
      changeNote: 'Corrected dosage section',
    });
    expect(updated.bodyEn).toBe('Updated English body.');
    expect(updated.status).toBe('draft');

    const versions = await store.getVersions(draft.id);
    expect(versions).toHaveLength(2);
    expect(versions[1]).toMatchObject({
      version: 2,
      changeNote: 'Corrected dosage section',
      reviewedBy: null,
    });
    expect(versions[1].bodySnapshot).toMatchObject({ bodyEn: 'Updated English body.' });
    // v1 snapshot is immutable
    expect(versions[0].bodySnapshot).toMatchObject({
      bodyEn: 'Eat a balanced diet during pregnancy.',
    });
  });

  it('rejects editing published/archived content (409) and unknown ids (404)', async () => {
    const { service } = setup();
    const draft = await createDraft(service);
    await service.submit(draft.id);
    await service.approve(draft.id, REVIEWER);

    await expect(service.update(draft.id, { bodyEn: 'nope' })).rejects.toBeInstanceOf(
      ConflictError,
    );
    await expect(
      service.update('00000000-0000-4000-8000-000000000000', { bodyEn: 'nope' }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it('requires EN/AM parity before submit (FR-079)', async () => {
    const { service } = setup();
    const enOnly = await service.createDraft(buildDraft({ titleAm: null, bodyAm: null }), AUTHOR);
    await expect(service.submit(enOnly.id)).rejects.toBeInstanceOf(ValidationError);
    await expect(service.submit(enOnly.id)).rejects.toMatchObject({
      fields: [{ field: 'title_am' }, { field: 'body_am' }],
    });

    const amOnly = await service.createDraft(buildDraft({ titleEn: null, bodyEn: null }), AUTHOR);
    await expect(service.submit(amOnly.id)).rejects.toMatchObject({
      fields: [{ field: 'title_en' }, { field: 'body_en' }],
    });
  });

  it('submits a parity-complete draft into pending_medical_review', async () => {
    const { service } = setup();
    const draft = await createDraft(service);
    const submitted = await service.submit(draft.id);
    expect(submitted.status).toBe('pending_medical_review');
    await expect(service.submit(draft.id)).rejects.toBeInstanceOf(ConflictError);
  });

  it('approve publishes in one step and emits content.published per language (FR-078, AR-015)', async () => {
    const { service, store } = setup();
    const draft = await createDraft(service);
    await service.submit(draft.id);

    const result = await service.approve(draft.id, REVIEWER);
    expect(result.content.status).toBe('published');
    expect(result.content.medicalReviewed).toBe(true);
    expect(result.version).toBe(1);

    const published = store.outboxLog.filter((e) => e.eventType === 'content.published');
    expect(published).toHaveLength(2);
    const languages = published.map((e) => (e.payload as { language: string }).language).sort();
    expect(languages).toEqual(['am', 'en']);
    for (const entry of published) {
      expect(entry.producer).toBe('content-service');
      expect(entry.aggregateType).toBe('content');
      expect(entry.aggregateId).toBe(draft.id);
      expect(entry.idempotencyKey).toBe(`${draft.id}:1`);
      expect(entry.payload).toMatchObject({ content_id: draft.id, version: 1 });
    }
  });

  it('enforces segregation of duties: an author cannot approve own content (FR-106)', async () => {
    const { service, store } = setup();
    const draft = await createDraft(service);
    await service.submit(draft.id);

    await expect(service.approve(draft.id, AUTHOR)).rejects.toBeInstanceOf(ForbiddenError);
    expect(store.outboxLog.filter((e) => e.eventType === 'content.published')).toHaveLength(0);
    const stored = await service.getPublished(draft.id).catch(() => null);
    expect(stored).toBeNull();
  });

  it('records the reviewer on the latest snapshot and rejects re-approval', async () => {
    const { service, store } = setup();
    const draft = await createDraft(service);
    await service.submit(draft.id);
    await service.approve(draft.id, REVIEWER);

    const versions = await store.getVersions(draft.id);
    expect(versions[versions.length - 1].reviewedBy).toBe(REVIEWER);

    await expect(service.approve(draft.id, REVIEWER)).rejects.toBeInstanceOf(ConflictError);
  });

  it('approve from a non-pending status is a conflict', async () => {
    const { service } = setup();
    const draft = await createDraft(service);
    await expect(service.approve(draft.id, REVIEWER)).rejects.toBeInstanceOf(ConflictError);
  });

  it('archive removes published content from retrieval and emits content.retired (FR-080)', async () => {
    const { service, store } = setup();
    const draft = await createDraft(service);
    await service.submit(draft.id);
    await service.approve(draft.id, REVIEWER);

    const archived = await service.archive(draft.id);
    expect(archived.status).toBe('archived');
    await expect(service.getPublished(draft.id)).rejects.toBeInstanceOf(NotFoundError);
    expect(await service.listPublished({})).toHaveLength(0);

    const retired = store.outboxLog.filter((e) => e.eventType === 'content.retired');
    expect(retired).toHaveLength(1);
    expect(retired[0].payload).toMatchObject({ content_id: draft.id, version: 1 });
    expect(retired[0].producer).toBe('content-service');
    await expect(service.archive(draft.id)).rejects.toBeInstanceOf(ConflictError);
  });

  it('archiving an unpublished draft emits no retirement event', async () => {
    const { service, store } = setup();
    const draft = await createDraft(service);
    const archived = await service.archive(draft.id);
    expect(archived.status).toBe('archived');
    expect(store.outboxLog.filter((e) => e.eventType === 'content.retired')).toHaveLength(0);
  });

  it('lists only published content with language/week/type filters', async () => {
    const { service } = setup();
    const a = await createDraft(service);
    await service.createDraft(buildDraft({ contentType: 'faq', pregnancyWeek: 20 }), AUTHOR);

    await service.submit(a.id);
    await service.approve(a.id, REVIEWER);
    // b stays draft

    const all = await service.listPublished({});
    expect(all.map((c) => c.id)).toEqual([a.id]);

    const byType = await service.listPublished({ type: 'faq' });
    expect(byType).toHaveLength(0);

    const byWeek = await service.listPublished({ week: 12 });
    expect(byWeek.map((c) => c.id)).toEqual([a.id]);
  });

  it('serves published detail only; drafts are not exposed', async () => {
    const { service } = setup();
    const draft = await createDraft(service);
    await expect(service.getPublished(draft.id)).rejects.toBeInstanceOf(NotFoundError);
    await expect(
      service.getPublished('00000000-0000-4000-8000-000000000000'),
    ).rejects.toBeInstanceOf(NotFoundError);

    await service.submit(draft.id);
    await service.approve(draft.id, REVIEWER);
    await expect(service.getPublished(draft.id)).resolves.toMatchObject({
      status: 'published',
      medicalReviewed: true,
    });
  });

  it('searches published EN content and never matches Amharic or unpublished items (FR-083)', async () => {
    const { service } = setup();
    const draft = await createDraft(service);
    await service.submit(draft.id);
    await service.approve(draft.id, REVIEWER);

    expect((await service.search('nutrition', 'en')).map((c) => c.id)).toEqual([draft.id]);
    expect(await service.search('nutrition', 'am')).toEqual([]);

    const unrelated = await service.createDraft(buildDraft({ titleEn: 'Bowel movements' }), AUTHOR);
    await service.submit(unrelated.id);
    await service.approve(unrelated.id, REVIEWER);

    expect((await service.search('nutrition', 'en')).map((c) => c.id)).toEqual([draft.id]);
    expect((await service.search('bowel', 'en')).map((c) => c.id)).toEqual([unrelated.id]);
    expect(await service.search('not-present-anywhere', 'en')).toEqual([]);
  });
});
