import { randomUUID } from 'node:crypto';
import { NotFoundError } from '@fathersnet/errors';
import { decodeCursor, encodeCursor } from './cursor';
import type {
  CreateJournalEntryInput,
  EntryListQuery,
  JournalEntry,
  JournalEntryList,
  JournalStore,
  UpdateJournalEntryInput,
} from './types';

/**
 * In-memory journal store — the hermetic test-double (M-08). Mirrors the
 * Postgres adapter's invariants, most importantly the privacy gate: an entry
 * is visible to a caller only when they own it or are the explicitly-shared
 * linked partner (`sharedWithPartner` + a matching partner link). Partner
 * links are registered via `setPartner(ownerId, partnerId)` to stand in for
 * `pregnancies.partner_user_id`; reads for everyone else return null/404.
 * Timeline is `created_at DESC, id DESC` with cursor pagination.
 */
export interface MemoryJournalStore extends JournalStore {
  /** Test/seed helper standing in for `pregnancies.partner_user_id`:
   *  registers `partnerId` as the linked partner of `ownerId`. */
  setPartner(ownerId: string, partnerId: string): void;
}

export function createMemoryJournalStore(): MemoryJournalStore {
  const entries = new Map<string, JournalEntry>();
  const partnerOf = new Map<string, string>();

  // Monotonic clock: `new Date().toISOString()` only has millisecond
  // resolution, so tight create loops would collide and break the
  // (created_at, id) DESC ordering the timeline contract depends on. Each
  // timestamp is guaranteed to be strictly greater than the previous one,
  // mirroring the sequential `now()` semantics of the Postgres adapter.
  let lastMs = 0;
  function nextIso(): string {
    const now = Date.now();
    lastMs = now > lastMs ? now : lastMs + 1;
    return new Date(lastMs).toISOString();
  }

  function setPartner(ownerId: string, partnerId: string): void {
    partnerOf.set(ownerId, partnerId);
  }

  function isOwner(entry: JournalEntry, userId: string): boolean {
    return entry.userId === userId;
  }

  function isSharedPartner(entry: JournalEntry, userId: string): boolean {
    return entry.sharedWithPartner && partnerOf.get(entry.userId) === userId;
  }

  function canRead(entry: JournalEntry, userId: string): boolean {
    return isOwner(entry, userId) || isSharedPartner(entry, userId);
  }

  function sortDesc(a: JournalEntry, b: JournalEntry): number {
    if (a.createdAt === b.createdAt) {
      return a.id.localeCompare(b.id) > 0 ? -1 : 1;
    }
    return a.createdAt > b.createdAt ? -1 : 1;
  }

  function sortAsc(a: JournalEntry, b: JournalEntry): number {
    if (a.createdAt === b.createdAt) {
      return a.id.localeCompare(b.id);
    }
    return a.createdAt < b.createdAt ? -1 : 1;
  }

  function after(position: { createdAt: string; id: string }): (entry: JournalEntry) => boolean {
    return (entry) =>
      entry.createdAt < position.createdAt ||
      (entry.createdAt === position.createdAt && entry.id < position.id);
  }

  return {
    setPartner,

    async create(input: CreateJournalEntryInput): Promise<JournalEntry> {
      const now = nextIso();
      const entry: JournalEntry = {
        id: randomUUID(),
        userId: input.userId,
        entryType: input.entryType,
        content: input.content,
        pregnancyWeek: input.pregnancyWeek,
        sharedWithPartner: input.sharedWithPartner,
        createdAt: now,
        updatedAt: now,
      };
      entries.set(entry.id, entry);
      return { ...entry };
    },

    async findByIdForUser(id: string, userId: string): Promise<JournalEntry | null> {
      const entry = entries.get(id);
      if (!entry || !canRead(entry, userId)) {
        return null;
      }
      return { ...entry };
    },

    async listForUser(userId: string, query: EntryListQuery): Promise<JournalEntryList> {
      const cursor = decodeCursor(query.cursor);
      const owned = [...entries.values()]
        .filter((entry) => entry.userId === userId)
        .sort(sortDesc)
        .filter((entry) => (cursor ? after(cursor)(entry) : true));

      const page = owned.slice(0, query.pageSize);
      const hasMore = owned.length > query.pageSize;
      const nextCursor =
        hasMore && page.length > 0
          ? encodeCursor({
              userId,
              createdAt: page[page.length - 1].createdAt,
              id: page[page.length - 1].id,
            })
          : null;
      return { items: page.map((entry) => ({ ...entry })), nextCursor };
    },

    async updateEntry(
      id: string,
      ownerId: string,
      patch: UpdateJournalEntryInput,
    ): Promise<JournalEntry> {
      const existing = entries.get(id);
      if (!existing || !isOwner(existing, ownerId)) {
        throw new NotFoundError('Entry not found');
      }
      const next: JournalEntry = {
        ...existing,
        content: patch.content !== undefined ? patch.content : existing.content,
        pregnancyWeek:
          patch.pregnancyWeek !== undefined ? patch.pregnancyWeek : existing.pregnancyWeek,
        sharedWithPartner:
          patch.sharedWithPartner !== undefined
            ? patch.sharedWithPartner
            : existing.sharedWithPartner,
        updatedAt: nextIso(),
      };
      entries.set(id, next);
      return { ...next };
    },

    async deleteEntry(id: string, ownerId: string): Promise<void> {
      const existing = entries.get(id);
      if (!existing || !isOwner(existing, ownerId)) {
        throw new NotFoundError('Entry not found');
      }
      entries.delete(id);
    },

    async setShared(id: string, ownerId: string, shared: boolean): Promise<JournalEntry> {
      return this.updateEntry(id, ownerId, { sharedWithPartner: shared });
    },

    async listAllForUser(userId: string): Promise<JournalEntry[]> {
      return [...entries.values()]
        .filter((entry) => entry.userId === userId)
        .sort(sortAsc)
        .map((entry) => ({ ...entry }));
    },

    async ping(): Promise<boolean> {
      return true;
    },

    async dispose(): Promise<void> {
      entries.clear();
      partnerOf.clear();
    },
  };
}
