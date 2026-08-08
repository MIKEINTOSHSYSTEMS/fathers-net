import { randomUUID } from 'node:crypto';
import type { Logger } from '@fathersnet/logger';
import { NotFoundError, ValidationError } from '@fathersnet/errors';
import { buildOutboxEntry } from './events';
import { buildJournalExport, type JournalExportArtifact } from './export';
import type {
  JournalEntry,
  JournalEntryList,
  JournalStore,
  UpdateJournalEntryInput,
} from '../store/types';

export interface JournalServiceOptions {
  store: JournalStore;
  logger: Logger;
  /** Injectable clock for deterministic export artifacts (defaults to now). */
  now?: () => string;
}

export interface CreateEntryInput {
  content: string;
  pregnancyWeek: number | null;
  sharedWithPartner: boolean;
}

/**
 * Journal service (WP-022, SRS §12.9, FR-051…FR-058, FR-126, FR-039).
 *
 * Owns the journal rules — routes stay thin:
 *
 * Privacy core (FR-052/FR-126): ownership and partner sharing are enforced at
 * the STORE layer via `findByIdForUser` (a missing or non-owned entry returns
 * null → 404, so existence is never disclosed). The caller identity always
 * comes from the token `sub` claim, never the body. Writes are owner-only.
 *
 * Events (WP-024c): `journal.entry.created` on create (producer
 * `journal-service`, vocabulary `journal.entry.created`) with a no-PII payload
 * `{ entry_id, type, week, consent flags }` and idempotency key = entry id.
 * The outbox row is appended atomically with the entry INSERT (D-03) — the
 * relay publishes it after commit, so no direct bus publish is needed.
 *
 * Export (FR-057/FR-128): synchronous JSON artifact of the owner's entries.
 */
export class JournalService {
  private readonly store: JournalStore;
  private readonly logger: Logger;
  private readonly now: () => string;

  constructor(options: JournalServiceOptions) {
    this.store = options.store;
    this.logger = options.logger;
    this.now = options.now ?? (() => new Date().toISOString());
  }

  /** Create a text journal entry, private by default (FR-051, FR-052). The
   *  actor identity comes from the token `sub`, never the body. Emits
   *  `journal.entry.created` via the outbox with a no-PII payload (FR-022). */
  async createEntry(
    actorId: string,
    input: CreateEntryInput,
    requestId?: string,
  ): Promise<JournalEntry> {
    this.assertContent(input.content);
    // The durable id is generated here so the `journal.entry.created` outbox
    // row can reference it in the SAME transaction as the entry INSERT
    // (WP-024c, D-03).
    const entryId = randomUUID();
    const entry = await this.store.create(
      {
        id: entryId,
        userId: actorId,
        entryType: 'text',
        content: input.content.trim(),
        pregnancyWeek: input.pregnancyWeek,
        sharedWithPartner: input.sharedWithPartner,
      },
      [
        buildOutboxEntry({
          type: 'journal.entry.created',
          payload: {
            entry_id: entryId,
            type: 'text',
            week: input.pregnancyWeek,
            consent_flags: { shared_with_partner: input.sharedWithPartner },
          },
          aggregate: { type: 'journal_entry', id: entryId },
          idempotencyKey: entryId,
        }),
      ],
    );
    this.logger.info('journal.entry_created', 'journal entry created', {
      entry_id: entry.id,
      request_id: requestId,
    });
    return entry;
  }

  /** Owner or explicitly-shared partner read (FR-052/FR-126). All other
   *  callers get 404 — non-owned entries never reveal existence. */
  async getEntry(actorId: string, id: string): Promise<JournalEntry> {
    const entry = await this.store.findByIdForUser(id, actorId);
    if (!entry) {
      throw new NotFoundError('Entry not found');
    }
    return entry;
  }

  /** Owner-only timeline, newest first, cursor paginated (SRS §13.4). */
  async listEntries(
    actorId: string,
    pageSize: number,
    cursor?: string | null,
  ): Promise<JournalEntryList> {
    return this.store.listForUser(actorId, { pageSize, cursor: cursor ?? null });
  }

  /** Owner-only merge update (PATCH). Non-owned entries are 404. */
  async updateEntry(
    actorId: string,
    id: string,
    patch: UpdateJournalEntryInput,
  ): Promise<JournalEntry> {
    let nextPatch = patch;
    if (patch.content !== undefined) {
      this.assertContent(patch.content);
      nextPatch = { ...patch, content: patch.content.trim() };
    }
    const entry = await this.store.updateEntry(id, actorId, nextPatch);
    this.logger.info('journal.entry_updated', 'journal entry updated', { entry_id: id });
    return entry;
  }

  /** Owner-only delete (FR-128 erasure path; DB CASCADE covers media). */
  async deleteEntry(actorId: string, id: string): Promise<void> {
    await this.store.deleteEntry(id, actorId);
    this.logger.info('journal.entry_deleted', 'journal entry deleted', { entry_id: id });
  }

  /** Explicit opt-in sharing shortcut (FR-039) → `shared_with_partner = true`. */
  async shareEntry(actorId: string, id: string): Promise<JournalEntry> {
    const entry = await this.store.setShared(id, actorId, true);
    this.logger.info('journal.entry_shared', 'journal entry shared with partner', {
      entry_id: id,
    });
    return entry;
  }

  /** Owner-only synchronous JSON export (FR-057/FR-128). Self-scoped: the
   *  requesting user's entries only, chronological, no media. */
  async exportEntries(
    actorId: string,
    requestId?: string,
    now?: () => string,
  ): Promise<JournalExportArtifact> {
    const entries = await this.store.listAllForUser(actorId);
    this.logger.info('journal.exported', 'journal export produced', {
      entry_count: entries.length,
      request_id: requestId,
    });
    return buildJournalExport(entries, now ?? this.now);
  }

  private assertContent(content: string): void {
    const trimmed = content.trim();
    if (trimmed.length === 0) {
      throw new ValidationError('Journal entry content must not be empty', [
        { field: 'content', reason: 'must not be empty' },
      ]);
    }
  }
}
