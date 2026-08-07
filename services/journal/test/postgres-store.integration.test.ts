import { Pool } from 'pg';
import { createPostgresJournalStore } from '../src/store/postgres-store';
import type { JournalStore } from '../src/store/types';

const TEST_DATABASE_URL = process.env.JOURNAL_TEST_DATABASE_URL;
const describeIntegration = TEST_DATABASE_URL ? describe : describe.skip;

const OWNER_ID = '55555555-5555-4555-8555-555555555555';
const PARTNER_ID = '66666666-6666-4666-8666-666666666666';
const STRANGER_ID = '77777777-7777-4777-8777-777777777777';

/**
 * Journal store Postgres integration (migration 019 schema). Gated on
 * JOURNAL_TEST_DATABASE_URL (reminders precedent). Covers the real
 * `(user_id, created_at DESC)` timeline query, the shared-partner read that
 * resolves through `pregnancies.partner_user_id`, and the FK ON DELETE
 * CASCADE erasure path (FR-128).
 */
describeIntegration('journal store Postgres adapter (migration 019 schema)', () => {
  let store: JournalStore;

  beforeEach(async () => {
    const pool = new Pool({ connectionString: TEST_DATABASE_URL });
    try {
      await pool.query('TRUNCATE journal_media, journal_entries CASCADE');
      await pool.query(
        `INSERT INTO users (id, phone_e164, phone_e164_digest, role, status) VALUES
           ($1, 'cipher.journal.owner', 'digest.journal.owner', 'father', 'active'),
           ($2, 'cipher.journal.partner', 'digest.journal.partner', 'father', 'active'),
           ($3, 'cipher.journal.stranger', 'digest.journal.stranger', 'father', 'active')
         ON CONFLICT (id) DO NOTHING`,
        [OWNER_ID, PARTNER_ID, STRANGER_ID],
      );
      await pool.query(
        `INSERT INTO pregnancies (user_id, edd, partner_user_id)
         VALUES ($1, '2027-03-15', $2)
         ON CONFLICT DO NOTHING`,
        [OWNER_ID, PARTNER_ID],
      );
    } finally {
      await pool.end();
    }
    store = createPostgresJournalStore(TEST_DATABASE_URL as string);
  });

  afterEach(async () => {
    await store.dispose();
  });

  it('round-trips a text entry and maps the migration-019 columns', async () => {
    const created = await store.create({
      userId: OWNER_ID,
      entryType: 'text',
      content: 'First entry in Postgres',
      pregnancyWeek: 22,
      sharedWithPartner: false,
    });
    expect(created.id).toMatch(/^[0-9a-f-]{36}$/i);
    expect(created).toMatchObject({
      userId: OWNER_ID,
      entryType: 'text',
      content: 'First entry in Postgres',
      pregnancyWeek: 22,
      sharedWithPartner: false,
    });

    const found = await store.findByIdForUser(created.id, OWNER_ID);
    expect(found).toMatchObject({ id: created.id, content: 'First entry in Postgres' });
  });

  it('enforces the partner matrix against a real pregnancies.partner_user_id link', async () => {
    const privateEntry = await store.create({
      userId: OWNER_ID,
      entryType: 'text',
      content: 'private thoughts',
      pregnancyWeek: null,
      sharedWithPartner: false,
    });
    const sharedEntry = await store.create({
      userId: OWNER_ID,
      entryType: 'text',
      content: 'shared with my partner',
      pregnancyWeek: null,
      sharedWithPartner: true,
    });

    // Owner reads both.
    expect((await store.findByIdForUser(privateEntry.id, OWNER_ID))?.id).toBe(privateEntry.id);
    expect((await store.findByIdForUser(sharedEntry.id, OWNER_ID))?.id).toBe(sharedEntry.id);

    // Linked partner reads ONLY the explicitly shared entry.
    expect(await store.findByIdForUser(privateEntry.id, PARTNER_ID)).toBeNull();
    expect((await store.findByIdForUser(sharedEntry.id, PARTNER_ID))?.id).toBe(sharedEntry.id);

    // A user with no pregnancy link (stranger) never reads.
    expect(await store.findByIdForUser(sharedEntry.id, STRANGER_ID)).toBeNull();
  });

  it('timeline uses (user_id, created_at DESC) and cursor pagination', async () => {
    for (let i = 1; i <= 5; i += 1) {
      await store.create({
        userId: OWNER_ID,
        entryType: 'text',
        content: `pg-entry-${i}`,
        pregnancyWeek: i,
        sharedWithPartner: false,
      });
    }
    await store.create({
      userId: STRANGER_ID,
      entryType: 'text',
      content: 'other-user-entry',
      pregnancyWeek: null,
      sharedWithPartner: false,
    });

    const page1 = await store.listForUser(OWNER_ID, { pageSize: 2 });
    expect(page1.items.map((e) => e.content)).toEqual(['pg-entry-5', 'pg-entry-4']);
    expect(page1.nextCursor).toBeTruthy();

    const page2 = await store.listForUser(OWNER_ID, { pageSize: 2, cursor: page1.nextCursor });
    expect(page2.items.map((e) => e.content)).toEqual(['pg-entry-3', 'pg-entry-2']);

    const page3 = await store.listForUser(OWNER_ID, { pageSize: 2, cursor: page2.nextCursor });
    expect(page3.items.map((e) => e.content)).toEqual(['pg-entry-1']);
    expect(page3.nextCursor).toBeNull();

    // Stranger timeline never contains the owner's entries.
    const strangerList = await store.listForUser(STRANGER_ID, { pageSize: 10 });
    expect(strangerList.items.map((e) => e.content)).toEqual(['other-user-entry']);
  });

  it('updates and deletes are owner-only; non-owners get NotFoundError', async () => {
    const entry = await store.create({
      userId: OWNER_ID,
      entryType: 'text',
      content: 'mutable',
      pregnancyWeek: null,
      sharedWithPartner: true,
    });

    await expect(
      store.updateEntry(entry.id, PARTNER_ID, { content: 'partner-edit' }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await expect(store.deleteEntry(entry.id, PARTNER_ID)).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });

    const updated = await store.updateEntry(entry.id, OWNER_ID, {
      content: 'owner-edit',
      pregnancyWeek: 30,
    });
    expect(updated).toMatchObject({ content: 'owner-edit', pregnancyWeek: 30 });

    await store.deleteEntry(entry.id, OWNER_ID);
    expect(await store.findByIdForUser(entry.id, OWNER_ID)).toBeNull();
  });

  it('cascades entry deletion when the owning user is erased (FR-128)', async () => {
    const entry = await store.create({
      userId: PARTNER_ID,
      entryType: 'text',
      content: 'to cascade',
      pregnancyWeek: null,
      sharedWithPartner: false,
    });

    const pool = new Pool({ connectionString: TEST_DATABASE_URL });
    try {
      await pool.query('BEGIN');
      await pool.query(`SET LOCAL app.consent_erasure = 'on'`);
      await pool.query(`DELETE FROM users WHERE id = $1`, [PARTNER_ID]);
      await pool.query('COMMIT');
    } finally {
      await pool.end();
    }

    expect(await store.findByIdForUser(entry.id, OWNER_ID)).toBeNull();
  });

  it('pings the database round-trip', async () => {
    await expect(store.ping()).resolves.toBe(true);
  });
});
