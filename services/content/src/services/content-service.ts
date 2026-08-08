import type { Logger } from '@fathersnet/logger';
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from '@fathersnet/errors';
import { buildOutboxEntry } from './events';
import type {
  ContentLanguage,
  ContentListQuery,
  ContentRecord,
  ContentStore,
  ContentType,
  ContentUpdateInput,
  OutboxEntry,
} from './store/types';

export interface ContentServiceOptions {
  store: ContentStore;
  logger: Logger;
}

export interface CreateContentDraftInput {
  contentType: ContentType;
  titleEn: string | null;
  titleAm: string | null;
  bodyEn: string | null;
  bodyAm: string | null;
  pregnancyWeek: number | null;
}

export interface UpdateContentInput extends ContentUpdateInput {
  /** Human-readable change note stored on the new version snapshot. */
  changeNote?: string | null;
}

export interface ApproveResult {
  content: ContentRecord;
  /** Version number of the snapshot that was reviewed (approval audit). */
  version: number;
}

/**
 * Content/CMS service (WP-020, SRS §12.5, FR-076…FR-085, FR-106, AR-015).
 *
 * Owns the knowledge-content lifecycle. WP-020 exposes §12.5 only, so the
 * approve action performs the approve→publish transition in one step
 * (pending_medical_review → approved → published) and records `content.published`
 * outbox rows in the same transaction as the transition (WP-024c) — recorded
 * as an API/workflow interpretation decision in the WP-020 implementation
 * notes. Events carry no PII — content reference data only (FR-022).
 * Segregation of duties (FR-106): the author (created_by) can never approve
 * their own content.
 */
export class ContentService {
  constructor(private readonly options: ContentServiceOptions) {}

  /** Build the `content.published`/`content.retired` outbox row for a content
   *  version. The content version is the canonical idempotency key (06 §2.2);
   *  approve emits once per language so the AI KB ingests each localized body. */
  private publishedEntries(id: string, version: number): OutboxEntry[] {
    return (['en', 'am'] as const).map((language) =>
      buildOutboxEntry({
        type: 'content.published',
        payload: { content_id: id, version, language },
        aggregate: { type: 'content', id },
        idempotencyKey: `${id}:${version}`,
      }),
    );
  }

  private retiredEntry(id: string, version: number): OutboxEntry {
    return buildOutboxEntry({
      type: 'content.retired',
      payload: { content_id: id, version },
      aggregate: { type: 'content', id },
      idempotencyKey: `${id}:${version}`,
    });
  }

  /** Create a content draft plus its version-1 snapshot (SRS §12.5 POST). */
  async createDraft(
    input: CreateContentDraftInput,
    actorId: string,
    requestId?: string,
  ): Promise<ContentRecord> {
    const content = await this.options.store.create({
      ...input,
      createdBy: actorId,
    });
    this.options.logger.info('content.draft_created', 'content draft created', {
      content_id: content.id,
      content_type: content.contentType,
      request_id: requestId,
    });
    return content;
  }

  /** Update editable content and record a new immutable version snapshot
   *  (SRS §12.5 PUT). Only draft/pending_medical_review are editable;
   *  published/archived content is immutable (re-edit requires a new item). */
  async update(id: string, input: UpdateContentInput, requestId?: string): Promise<ContentRecord> {
    const existing = await this.options.store.findById(id);
    if (!existing) {
      throw new NotFoundError('Content not found');
    }
    if (existing.status !== 'draft' && existing.status !== 'pending_medical_review') {
      throw new ConflictError(`Content in status '${existing.status}' cannot be edited`);
    }

    const { changeNote, ...patch } = input;
    const updated = await this.options.store.updateContent(id, patch);

    const versions = await this.options.store.getVersions(id);
    const nextVersion = versions.length > 0 ? versions[versions.length - 1].version + 1 : 1;
    await this.options.store.insertVersion({
      contentId: id,
      version: nextVersion,
      changeNote: changeNote ?? null,
      bodySnapshot: {
        contentType: updated.contentType,
        titleEn: updated.titleEn,
        titleAm: updated.titleAm,
        bodyEn: updated.bodyEn,
        bodyAm: updated.bodyAm,
        pregnancyWeek: updated.pregnancyWeek,
      },
      reviewedBy: null,
    });

    this.options.logger.info('content.updated', 'content updated with new version', {
      content_id: id,
      version: nextVersion,
      request_id: requestId,
    });
    return updated;
  }

  /** Submit a draft for medical review — requires EN/AM parity (FR-079)
   *  before review can begin (SRS §12.5 POST /submit). */
  async submit(id: string, requestId?: string): Promise<ContentRecord> {
    const existing = await this.options.store.findById(id);
    if (!existing) {
      throw new NotFoundError('Content not found');
    }
    this.assertParity(existing);
    const content = await this.options.store.transition(id, {
      from: ['draft'],
      to: 'pending_medical_review',
    });
    this.options.logger.info('content.submitted', 'content submitted for medical review', {
      content_id: id,
      request_id: requestId,
    });
    return content;
  }

  /** Approve (and thereby publish) pending content — SRS §12.5 POST /approve.
   *  Moves pending_medical_review → approved → published in one step, records
   *  the reviewer on the latest snapshot, and emits `content.published` per
   *  language (FR-078, AR-015). The author can never approve their own content
   *  (FR-106 segregation of duties). */
  async approve(id: string, reviewerId: string, requestId?: string): Promise<ApproveResult> {
    const existing = await this.options.store.findById(id);
    if (!existing) {
      throw new NotFoundError('Content not found');
    }
    if (existing.status !== 'pending_medical_review') {
      throw new ConflictError(
        `Content in status '${existing.status}' cannot be approved — expected 'pending_medical_review'`,
      );
    }
    if (existing.createdBy !== null && existing.createdBy === reviewerId) {
      throw new ForbiddenError('An author cannot approve their own content');
    }

    // The reviewed version is the latest snapshot — read before the transition
    // so the `content.published` outbox rows (idempotency key = content
    // version, 06 §2.2) are written in the same transaction as the status
    // change (WP-024c). The state machine makes re-approval a ConflictError,
    // so a retry can never double-emit.
    const versions = await this.options.store.getVersions(id);
    const version = versions.length > 0 ? versions[versions.length - 1].version : 1;

    const content = await this.options.store.transition(
      id,
      {
        from: ['pending_medical_review'],
        to: 'published',
        medicalReviewed: true,
      },
      this.publishedEntries(id, version),
    );
    await this.options.store.markVersionReviewed(id, reviewerId);

    this.options.logger.info('content.published', 'content approved and published', {
      content_id: id,
      version,
      request_id: requestId,
    });
    return { content, version };
  }

  /** Archive content and remove it from retrieval (SRS §12.5 POST /archive,
   *  FR-080). Emits `content.retired` only when the item had been published —
   *  nothing was ever retrievable (or embedded in the AI KB) before that. */
  async archive(id: string, requestId?: string): Promise<ContentRecord> {
    const existing = await this.options.store.findById(id);
    if (!existing) {
      throw new NotFoundError('Content not found');
    }
    if (existing.status === 'archived') {
      throw new ConflictError('Content is already archived');
    }
    const wasPublished = existing.status === 'published';

    // The retired event (idempotency key = content version, 06 §2.2) is written
    // in the same transaction as the transition (WP-024c). Only items that had
    // been published were ever retrievable, so nothing else emits.
    const versions = await this.options.store.getVersions(id);
    const version = versions.length > 0 ? versions[versions.length - 1].version : 1;
    const content = await this.options.store.transition(
      id,
      {
        from: ['draft', 'pending_medical_review', 'approved', 'published'],
        to: 'archived',
      },
      wasPublished ? [this.retiredEntry(id, version)] : [],
    );

    this.options.logger.info('content.archived', 'content archived', {
      content_id: id,
      request_id: requestId,
    });
    return content;
  }

  /** Published items only, newest first, with language/week/type filters
   *  (SRS §12.5 GET, FR-078 / AR-015 retrieval eligibility). */
  listPublished(query: ContentListQuery): Promise<ContentRecord[]> {
    return this.options.store.listPublished(query);
  }

  /** Detail of a single published item; non-published items are 404 so the
   *  library never leaks drafts or work-in-progress (FR-078). */
  async getPublished(id: string): Promise<ContentRecord> {
    const content = await this.options.store.findById(id);
    if (!content || content.status !== 'published') {
      throw new NotFoundError('Content not found');
    }
    return content;
  }

  /** Published-only relevance search (FR-083). PG FTS is EN-only (`05` §8.5.2);
   *  Amharic returns no matches. Not exposed as an HTTP route in WP-020 — §12.5
   *  defines no search endpoint; this serves the store/search contract and the
   *  FR-083 foundation. */
  search(query: string, language: ContentLanguage): Promise<ContentRecord[]> {
    return this.options.store.search(query, language);
  }

  /** EN/AM parity check (FR-079): both localized title and body must be present
   *  before an item can move into medical review. */
  private assertParity(content: ContentRecord): void {
    const missing: { field: string; reason: string }[] = [];
    if (!content.titleEn || content.titleEn.trim() === '') {
      missing.push({ field: 'title_en', reason: 'English title is required' });
    }
    if (!content.bodyEn || content.bodyEn.trim() === '') {
      missing.push({ field: 'body_en', reason: 'English body is required' });
    }
    if (!content.titleAm || content.titleAm.trim() === '') {
      missing.push({ field: 'title_am', reason: 'Amharic title is required' });
    }
    if (!content.bodyAm || content.bodyAm.trim() === '') {
      missing.push({ field: 'body_am', reason: 'Amharic body is required' });
    }
    if (missing.length > 0) {
      throw new ValidationError(
        'Content requires both English and Amharic title and body before review (FR-079)',
        missing,
      );
    }
  }
}
