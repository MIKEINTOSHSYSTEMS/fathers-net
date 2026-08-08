/**
 * Journal domain + store types (WP-022). The store interface is the
 * provider-agnostic boundary (M-08): the Postgres adapter persists on the
 * migration-019 tables (`journal_entries`, `journal_media`); the in-memory
 * store is the hermetic test-double.
 *
 * Privacy is enforced AT the store layer, never in routes (plan §4 R1): every
 * read is scoped by the caller's identity. `findByIdForUser` returns an entry
 * only when the caller owns it OR (the entry is explicitly shared AND the
 * caller is the linked partner via `pregnancies.partner_user_id`); any other
 * caller gets `null` → 404 (invisibility, not 403). Mutations are owner-only.
 */

export type EntryType = 'text' | 'voice' | 'photo' | 'prompt_response' | 'legacy';

export interface JournalEntry {
  id: string;
  userId: string;
  entryType: EntryType;
  /** Text body / transcription (05 §2.6). WP-022 writes text entries only. */
  content: string;
  pregnancyWeek: number | null;
  /** Opt-in sharing with the linked partner (FR-039); false = private (FR-052). */
  sharedWithPartner: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CreateJournalEntryInput {
  /** Durable id. Optional: the service supplies it so the `journal.entry.created`
   *  outbox row can reference the entry in the same transaction (D-03); the
   *  Postgres adapter falls back to `gen_random_uuid()`. */
  id?: string;
  userId: string;
  entryType: EntryType;
  content: string;
  pregnancyWeek: number | null;
  sharedWithPartner: boolean;
}

export interface UpdateJournalEntryInput {
  content?: string;
  pregnancyWeek?: number | null;
  sharedWithPartner?: boolean;
}

export interface EntryListQuery {
  /** Max items to return (page size). The store fetches pageSize + 1 to
   *  compute the next cursor, so callers see at most this many items. */
  pageSize: number;
  /** Opaque cursor from the previous page (base64url-encoded). */
  cursor?: string | null;
}

export interface JournalEntryList {
  items: JournalEntry[];
  /** Opaque next-page cursor, or null when there are no more pages. */
  nextCursor: string | null;
}

/**
 * Write-side outbox row (WP-024c, D-03): the canonical 16-column `021-outbox`
 * contract minus the DB-defaulted columns (`id`, `status`, `attempts`,
 * `available_at`, `created_at`, `published_at`, `last_error`). The relay
 * reconstructs the wire event envelope from the committed row, so these fields
 * must survive verbatim. The canonical contract carries no `request_id`;
 * request correlation stops at the service boundary for outbox-published
 * events (approved in wp-024c §9).
 */
export interface OutboxEntry {
  eventId: string;
  eventType: string;
  producer: string;
  schemaVersion: number;
  occurredAt: string;
  aggregateType: string | null;
  aggregateId: string | null;
  idempotencyKey: string;
  payload: Record<string, unknown>;
}

export interface JournalStore {
  /** Create an entry. `entryType` is caller-controlled at the store layer but
   *  the WP-022 service always passes `text` (Phase 2 scope). `outbox` rows are
   *  appended inside the SAME DB transaction as the entry INSERT (D-03). */
  create(input: CreateJournalEntryInput, outbox?: OutboxEntry[]): Promise<JournalEntry>;

  /** Privacy gate (FR-052/FR-126): owner, or explicitly-shared linked partner.
   *  Returns null for any other caller — the 404-invisibility contract. */
  findByIdForUser(id: string, userId: string): Promise<JournalEntry | null>;

  /** Owner-only chronological timeline (SRS §13.4), newest first, cursor
   *  paginated (06 §3.3 — high-volume stream). */
  listForUser(userId: string, query: EntryListQuery): Promise<JournalEntryList>;

  /** Owner-only merge update. Throws NotFoundError when the entry is missing
   *  OR not owned (invisibility preserved — no existence leak). */
  updateEntry(id: string, ownerId: string, patch: UpdateJournalEntryInput): Promise<JournalEntry>;

  /** Owner-only delete (FR-128 erasure path; CASCADE covers media). */
  deleteEntry(id: string, ownerId: string): Promise<void>;

  /** Owner-only opt-in share toggle (FR-039). Throws NotFoundError when the
   *  entry is missing or not owned. */
  setShared(id: string, ownerId: string, shared: boolean): Promise<JournalEntry>;

  /** All entries owned by the user, chronological — the JSON export source
   *  (FR-057/FR-128). Never includes other users' entries. */
  listAllForUser(userId: string): Promise<JournalEntry[]>;

  /** Store round-trip for the `/readyz` probe. Postgres executes `SELECT 1`. */
  ping(): Promise<boolean>;

  dispose(): Promise<void>;
}
