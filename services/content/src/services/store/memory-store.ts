import { randomUUID } from 'node:crypto';
import { ConflictError, NotFoundError } from '@fathersnet/errors';
import type {
  ContentLanguage,
  ContentListQuery,
  ContentRecord,
  ContentStore,
  ContentTransition,
  ContentUpdateInput,
  ContentVersionRecord,
  CreateContentInput,
  CreateContentVersionInput,
  OutboxEntry,
} from './types';

/** In-memory content store — the hermetic test-double (M-08). */
export interface MemoryContentStore extends ContentStore {
  /** Outbox rows appended by transition calls (WP-024c); the hermetic analog
   *  of the `content_outbox` table rows the Postgres adapter inserts. */
  outboxLog: OutboxEntry[];
}

/**
 * In-memory content store — the hermetic test-double (M-08). Mirrors the
 * Postgres adapter's invariants: `create` inserts the content row plus its
 * version-1 snapshot together, `transition` is guarded by the current status
 * (ConflictError on violation), `updateContent` throws NotFoundError for a
 * missing row, and published-only retrieval excludes anything not in
 * `published`. Search is a lightweight EN substring/term match standing in for
 * the Postgres GIN FTS index (`05` §8.5.2 — Amharic is unsupported).
 */
export function createMemoryContentStore(): MemoryContentStore {
  const content = new Map<string, ContentRecord>();
  const versions = new Map<string, ContentVersionRecord[]>();
  const outboxLog: OutboxEntry[] = [];

  function snapshotOf(record: ContentRecord): Record<string, unknown> {
    return {
      contentType: record.contentType,
      titleEn: record.titleEn,
      titleAm: record.titleAm,
      bodyEn: record.bodyEn,
      bodyAm: record.bodyAm,
      pregnancyWeek: record.pregnancyWeek,
    };
  }

  function latestVersionOf(contentId: string): ContentVersionRecord | null {
    const list = versions.get(contentId) ?? [];
    return list.length > 0 ? list[list.length - 1] : null;
  }

  function recordMatches(record: ContentRecord, query: ContentListQuery): boolean {
    if (record.status !== 'published') {
      return false;
    }
    if (query.type && record.contentType !== query.type) {
      return false;
    }
    if (query.week && record.pregnancyWeek !== query.week) {
      return false;
    }
    if (query.language === 'am' && (record.titleAm == null || record.bodyAm == null)) {
      return false;
    }
    if (query.language === 'en' && (record.titleEn == null || record.bodyEn == null)) {
      return false;
    }
    return true;
  }

  return {
    async create(input: CreateContentInput): Promise<ContentRecord> {
      const now = new Date().toISOString();
      const id = randomUUID();
      const record: ContentRecord = {
        id,
        contentType: input.contentType,
        titleEn: input.titleEn,
        titleAm: input.titleAm,
        bodyEn: input.bodyEn,
        bodyAm: input.bodyAm,
        pregnancyWeek: input.pregnancyWeek,
        status: 'draft',
        medicalReviewed: false,
        createdBy: input.createdBy,
        createdAt: now,
        updatedAt: now,
      };
      content.set(id, record);
      versions.set(id, [
        {
          id: randomUUID(),
          contentId: id,
          version: 1,
          changeNote: null,
          bodySnapshot: snapshotOf(record),
          reviewedBy: null,
          createdAt: now,
        },
      ]);
      return { ...record };
    },

    async findById(id: string): Promise<ContentRecord | null> {
      const record = content.get(id);
      return record ? { ...record } : null;
    },

    async updateContent(id: string, patch: ContentUpdateInput): Promise<ContentRecord> {
      const existing = content.get(id);
      if (!existing) {
        throw new NotFoundError('Content not found');
      }
      const next: ContentRecord = {
        ...existing,
        titleEn: patch.titleEn !== undefined ? patch.titleEn : existing.titleEn,
        titleAm: patch.titleAm !== undefined ? patch.titleAm : existing.titleAm,
        bodyEn: patch.bodyEn !== undefined ? patch.bodyEn : existing.bodyEn,
        bodyAm: patch.bodyAm !== undefined ? patch.bodyAm : existing.bodyAm,
        pregnancyWeek:
          patch.pregnancyWeek !== undefined ? patch.pregnancyWeek : existing.pregnancyWeek,
        updatedAt: new Date().toISOString(),
      };
      content.set(id, next);
      return { ...next };
    },

    async transition(
      id: string,
      change: ContentTransition,
      outbox: OutboxEntry[] = [],
    ): Promise<ContentRecord> {
      const existing = content.get(id);
      if (!existing) {
        throw new NotFoundError('Content not found');
      }
      if (!change.from.includes(existing.status)) {
        throw new ConflictError(`Invalid transition from '${existing.status}' to '${change.to}'`);
      }
      const next: ContentRecord = {
        ...existing,
        status: change.to,
        medicalReviewed: change.medicalReviewed ?? existing.medicalReviewed,
        updatedAt: new Date().toISOString(),
      };
      content.set(id, next);
      outboxLog.push(...outbox);
      return { ...next };
    },

    async listPublished(query: ContentListQuery): Promise<ContentRecord[]> {
      return [...content.values()]
        .filter((record) => recordMatches(record, query))
        .sort((a, b) =>
          a.updatedAt === b.updatedAt
            ? a.id.localeCompare(b.id)
            : a.updatedAt > b.updatedAt
              ? -1
              : 1,
        )
        .map((record) => ({ ...record }));
    },

    async search(query: string, language: ContentLanguage): Promise<ContentRecord[]> {
      if (language !== 'en') {
        return [];
      }
      const terms = query
        .toLowerCase()
        .split(/\s+/)
        .filter((term) => term.length > 0);
      if (terms.length === 0) {
        return [];
      }
      const hits = [...content.values()].filter((record) => {
        if (record.status !== 'published') {
          return false;
        }
        const haystack = `${record.titleEn ?? ''} ${record.bodyEn ?? ''}`.toLowerCase();
        return terms.every((term) => haystack.includes(term));
      });
      return hits
        .sort((a, b) =>
          a.updatedAt === b.updatedAt
            ? a.id.localeCompare(b.id)
            : a.updatedAt > b.updatedAt
              ? -1
              : 1,
        )
        .map((record) => ({ ...record }));
    },

    async insertVersion(input: CreateContentVersionInput): Promise<ContentVersionRecord> {
      const record: ContentVersionRecord = {
        id: randomUUID(),
        contentId: input.contentId,
        version: input.version,
        changeNote: input.changeNote,
        bodySnapshot: input.bodySnapshot,
        reviewedBy: input.reviewedBy,
        createdAt: new Date().toISOString(),
      };
      const list = versions.get(input.contentId) ?? [];
      list.push(record);
      versions.set(input.contentId, list);
      return { ...record };
    },

    async getVersions(contentId: string): Promise<ContentVersionRecord[]> {
      return (versions.get(contentId) ?? []).map((record) => ({ ...record }));
    },

    async markVersionReviewed(
      contentId: string,
      reviewedBy: string,
    ): Promise<ContentVersionRecord> {
      const latest = latestVersionOf(contentId);
      if (!latest) {
        throw new NotFoundError('Content version not found');
      }
      const next: ContentVersionRecord = { ...latest, reviewedBy };
      const list = versions.get(contentId) ?? [];
      list[list.length - 1] = next;
      versions.set(contentId, list);
      return { ...next };
    },

    async dispose(): Promise<void> {
      content.clear();
      versions.clear();
      outboxLog.length = 0;
    },

    outboxLog,
  };
}
