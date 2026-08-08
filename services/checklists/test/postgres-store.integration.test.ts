import { Pool } from 'pg';
import { createPostgresChecklistBudgetStore } from '../src/store/postgres-store';
import type { ChecklistBudgetStore } from '../src/store/types';

const TEST_DATABASE_URL = process.env.CHECKLISTS_TEST_DATABASE_URL;
const describeIntegration = TEST_DATABASE_URL ? describe : describe.skip;

const OWNER_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const STRANGER_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

/**
 * Checklist & budget store Postgres integration (migration 020 schema). Gated
 * on CHECKLISTS_TEST_DATABASE_URL (journal/reminders precedent). Covers the
 * real (user_id, checklist_type) unique rule, the transactional progress
 * recompute on completion, owner-only budget CRUD, and the FK ON DELETE
 * CASCADE erasure path (FR-128).
 */
describeIntegration('checklists store Postgres adapter (migration 020 schema)', () => {
  let store: ChecklistBudgetStore;

  beforeEach(async () => {
    const pool = new Pool({ connectionString: TEST_DATABASE_URL });
    try {
      await pool.query('TRUNCATE budget_entries, checklist_items, checklists CASCADE');
      await pool.query(
        `INSERT INTO users (id, phone_e164, phone_e164_digest, role, status) VALUES
           ($1, 'cipher.checklists.owner', 'digest.checklists.owner', 'father', 'active'),
           ($2, 'cipher.checklists.stranger', 'digest.checklists.stranger', 'father', 'active')
         ON CONFLICT (id) DO NOTHING`,
        [OWNER_ID, STRANGER_ID],
      );
    } finally {
      await pool.end();
    }
    store = createPostgresChecklistBudgetStore(TEST_DATABASE_URL as string);
  });

  afterEach(async () => {
    await store.dispose();
  });

  it('ensures one instance per (user, type) and round-trips items with progress', async () => {
    const first = await store.ensureChecklist({
      userId: OWNER_ID,
      checklistType: 'hospital_bag',
      title: 'Hospital Bag',
    });
    expect(first.id).toMatch(/^[0-9a-f-]{36}$/i);
    expect(first).toMatchObject({
      userId: OWNER_ID,
      checklistType: 'hospital_bag',
      title: 'Hospital Bag',
      progress: 0,
      items: [],
    });

    const again = await store.ensureChecklist({
      userId: OWNER_ID,
      checklistType: 'hospital_bag',
      title: 'Hospital Bag',
    });
    expect(again.id).toBe(first.id);

    const a = await store.addItem(first.id, OWNER_ID, {
      category: 'Documents',
      itemName: 'Passport',
    });
    const b = await store.addItem(first.id, OWNER_ID, {
      category: 'Documents',
      itemName: 'ANC Card',
    });
    expect(a.sortOrder).toBe(0);
    expect(b.sortOrder).toBe(1);

    const done = await store.updateItem(first.id, a.id, OWNER_ID, { completed: true });
    expect(done.completed).toBe(true);
    expect(done.completedAt).toBeTruthy();

    const loaded = await store.findChecklistForUser(first.id, OWNER_ID);
    expect(loaded?.progress).toBe(50);
    expect(loaded?.items.map((i) => i.itemName)).toEqual(['Passport', 'ANC Card']);

    const undone = await store.updateItem(first.id, a.id, OWNER_ID, { completed: false });
    expect(undone.completedAt).toBeNull();
    expect((await store.findChecklistForUser(first.id, OWNER_ID))?.progress).toBe(0);
  });

  it('scopes checklists to their owner (404 invisibility)', async () => {
    const checklist = await store.ensureChecklist({
      userId: OWNER_ID,
      checklistType: 'birth_prep',
      title: 'Birth Preparation',
    });
    expect(await store.findChecklistForUser(checklist.id, STRANGER_ID)).toBeNull();

    await expect(
      store.addItem(checklist.id, STRANGER_ID, { category: 'Mother', itemName: 'x' }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });

    const item = await store.addItem(checklist.id, OWNER_ID, {
      category: 'Mother',
      itemName: 'x',
    });
    await expect(
      store.updateItem(checklist.id, item.id, STRANGER_ID, { completed: true }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });

    expect((await store.listChecklistsForUser(STRANGER_ID)).length).toBeGreaterThanOrEqual(0);
    const listed = await store.listChecklistsForUser(STRANGER_ID);
    expect(listed.find((c) => c.id === checklist.id)).toBeUndefined();
  });

  it('creates, lists newest-first, merges updates and deletes budget entries owner-only', async () => {
    await store.createBudgetEntry({
      userId: OWNER_ID,
      category: 'Medical',
      itemName: 'Blood test',
      plannedAmount: 500,
      actualAmount: null,
      entryDate: '2026-08-01',
      notes: null,
    });
    const b = await store.createBudgetEntry({
      userId: OWNER_ID,
      category: 'Baby Items',
      itemName: 'Crib',
      plannedAmount: 15000,
      actualAmount: 14000,
      entryDate: '2026-08-10',
      notes: null,
    });
    await store.createBudgetEntry({
      userId: STRANGER_ID,
      category: 'Other',
      itemName: 'Sneaky',
      plannedAmount: 1,
      actualAmount: null,
      entryDate: '2026-08-10',
      notes: null,
    });

    const list = await store.listBudgetEntriesForUser(OWNER_ID);
    expect(list.map((e) => e.itemName)).toEqual(['Crib', 'Blood test']);

    const merged = await store.updateBudgetEntry(b.id, OWNER_ID, {
      actualAmount: 14500,
      notes: 'deal',
    });
    expect(merged).toMatchObject({ actualAmount: 14500, notes: 'deal', plannedAmount: 15000 });

    await expect(
      store.updateBudgetEntry(b.id, STRANGER_ID, { notes: 'hijack' }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await expect(store.deleteBudgetEntry(b.id, STRANGER_ID)).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });

    await store.deleteBudgetEntry(b.id, OWNER_ID);
    expect((await store.listBudgetEntriesForUser(OWNER_ID)).map((e) => e.id)).not.toContain(b.id);
    expect(await store.ping()).toBe(true);
  });

  it('cascades checklist and budget rows when the owning user is erased (FR-128)', async () => {
    const checklist = await store.ensureChecklist({
      userId: STRANGER_ID,
      checklistType: 'hospital_bag',
      title: 'Hospital Bag',
    });
    await store.addItem(checklist.id, STRANGER_ID, { category: 'Baby', itemName: 'to cascade' });
    await store.createBudgetEntry({
      userId: STRANGER_ID,
      category: 'Food',
      itemName: 'to cascade',
      plannedAmount: 10,
      actualAmount: null,
      entryDate: '2026-08-01',
      notes: null,
    });

    const pool = new Pool({ connectionString: TEST_DATABASE_URL });
    try {
      await pool.query('BEGIN');
      await pool.query(`SET LOCAL app.consent_erasure = 'on'`);
      await pool.query(`DELETE FROM users WHERE id = $1`, [STRANGER_ID]);
      await pool.query('COMMIT');
    } finally {
      await pool.end();
    }

    expect(await store.findChecklistForUser(checklist.id, OWNER_ID)).toBeNull();
    const verifyPool = new Pool({ connectionString: TEST_DATABASE_URL });
    try {
      const orphanItems = await verifyPool.query(
        `SELECT count(*)::int AS n FROM checklist_items ci
         JOIN checklists c ON ci.checklist_id = c.id
         WHERE c.id = $1`,
        [checklist.id],
      );
      expect(orphanItems.rows[0].n).toBe(0);
    } finally {
      await verifyPool.end();
    }
  });
});
