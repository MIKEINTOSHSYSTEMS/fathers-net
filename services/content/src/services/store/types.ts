export type ContentType = 'article' | 'video' | 'audio' | 'infographic' | 'checklist' | 'faq';

/** Knowledge-content lifecycle (AR-015). `approved` is transitional — in the
 *  WP-020 API the approve action carries pending_medical_review → published in
 *  one step (see the WP-020 implementation notes). */
export type ContentStatus =
  'draft' | 'pending_medical_review' | 'approved' | 'published' | 'archived';

export type ContentLanguage = 'en' | 'am';

export interface ContentRecord {
  /** Durable UUID identity. */
  id: string;
  contentType: ContentType;
  titleEn: string | null;
  titleAm: string | null;
  bodyEn: string | null;
  bodyAm: string | null;
  /** Applicable pregnancy week, 1–45 (nullable). */
  pregnancyWeek: number | null;
  status: ContentStatus;
  /** True once a medical reviewer approved the item (FR-081). */
  medicalReviewed: boolean;
  /** Author identity (staff user id) — used for FR-106 segregation of duties. */
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ContentVersionRecord {
  id: string;
  contentId: string;
  /** 1-based immutable version counter per content item. */
  version: number;
  changeNote: string | null;
  /** Immutable snapshot of the editable content at that version. */
  bodySnapshot: Record<string, unknown>;
  /** Medical reviewer recorded at approval time (FR-078, SRS §11.4). */
  reviewedBy: string | null;
  createdAt: string;
}

export interface CreateContentInput {
  contentType: ContentType;
  titleEn: string | null;
  titleAm: string | null;
  bodyEn: string | null;
  bodyAm: string | null;
  pregnancyWeek: number | null;
  /** Author (staff user id) — SET NULL on staff erasure (`05` §13.4). */
  createdBy: string | null;
}

export interface ContentUpdateInput {
  titleEn?: string | null;
  titleAm?: string | null;
  bodyEn?: string | null;
  bodyAm?: string | null;
  pregnancyWeek?: number | null;
}

export interface ContentListQuery {
  language?: ContentLanguage;
  week?: number;
  type?: ContentType;
}

export interface CreateContentVersionInput {
  contentId: string;
  version: number;
  changeNote: string | null;
  bodySnapshot: Record<string, unknown>;
  reviewedBy: string | null;
}

export interface ContentTransition {
  from: ContentStatus[];
  to: ContentStatus;
  /** Set true only on approve (medical review cleared, FR-081). */
  medicalReviewed?: boolean;
}

/**
 * Provider-agnostic content store (M-08). WP-020 persists the content library
 * on the migration-011 tables (`content`, `content_versions`) via the Postgres
 * adapter; the in-memory test-double keeps unit/CI hermetic. The lifecycle
 * `status` CHECK validates the value set; legal transitions are enforced by the
 * service (workflow) layer, and the guarded `transition` upsert is the
 * concurrency control. `create` inserts the content row plus its version-1
 * snapshot atomically.
 */
export interface ContentStore {
  /** Atomically insert the content row (status=draft) plus version 1. */
  create(input: CreateContentInput): Promise<ContentRecord>;

  findById(id: string): Promise<ContentRecord | null>;

  /** Merge-apply editable fields; throws NotFoundError when the row is gone. */
  updateContent(id: string, patch: ContentUpdateInput): Promise<ContentRecord>;

  /** Optimistic status transition; throws ConflictError when `status` is not
   *  in `from` (concurrent guard on top of the service-level check). */
  transition(id: string, change: ContentTransition): Promise<ContentRecord>;

  /** Published items only, newest first — retrieval eligibility (FR-078, AR-015). */
  listPublished(query: ContentListQuery): Promise<ContentRecord[]>;

  /** Published-only relevance search. PG FTS is EN-only (`05` §8.5.2); the
   *  `am` language returns no matches. */
  search(query: string, language: ContentLanguage): Promise<ContentRecord[]>;

  insertVersion(input: CreateContentVersionInput): Promise<ContentVersionRecord>;

  getVersions(contentId: string): Promise<ContentVersionRecord[]>;

  /** Record the reviewer on the latest version (approval audit trail). */
  markVersionReviewed(contentId: string, reviewedBy: string): Promise<ContentVersionRecord>;

  dispose(): Promise<void>;
}
