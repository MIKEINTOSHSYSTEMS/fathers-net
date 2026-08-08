import { Pool } from 'pg';
import { createPostgresChecklistBudgetStore } from '../src/store/postgres-store';

jest.mock('pg', () => ({
  Pool: jest.fn(),
}));

interface PgCall {
  text: string;
  values?: unknown[];
}

interface PgResponse {
  rows?: Record<string, unknown>[];
  rowCount?: number;
}

interface ScriptedError {
  at: number;
  code?: string;
}

/**
 * Hermetic Postgres-store unit tests (WP-023). A fake Pool scripts query
 * results and records every statement so the SQL generation and row mappers
 * are exercised without a live database; the real end-to-end adapter is
 * verified by the gated integration test against CHECKLISTS_TEST_DATABASE_URL.
 */
class FakePg {
  calls: PgCall[] = [];
  responses: PgResponse[] = [];
  errors: ScriptedError[] = [];
  ended = false;

  private run = async (text: string, values?: unknown[]): Promise<PgResponse> => {
    this.calls.push({ text, values });
    const fail = this.errors.find((e) => e.at === this.calls.length);
    if (fail) {
      const err: Error & { code?: string } = new Error('synthetic db error');
      if (fail.code) {
        err.code = fail.code;
      }
      throw err;
    }
    return this.responses.shift() ?? { rows: [] };
  };

  query = this.run;

  connect = async (): Promise<{
    query: (text: string, values?: unknown[]) => Promise<PgResponse>;
    release: jest.Mock;
  }> => ({
    query: this.run,
    release: jest.fn(),
  });

  end = async (): Promise<void> => {
    this.ended = true;
  };
}

const OWNER_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

const CHECKLIST_ROW = {
  id: '00000000-0000-4000-8000-000000000001',
  user_id: OWNER_ID,
  checklist_type: 'hospital_bag',
  title: 'Hospital Bag',
  progress: 0,
  created_at: new Date('2025-01-01T09:00:00Z'),
  updated_at: new Date('2025-01-01T09:00:00Z'),
};

const ITEM_ROW = {
  id: '00000000-0000-4000-8000-000000000010',
  checklist_id: CHECKLIST_ROW.id,
  category: 'Documents',
  item_name: 'Passport',
  completed: false,
  completed_at: null,
  custom: true,
  sort_order: 0,
  created_at: new Date('2025-01-01T09:00:00Z'),
  updated_at: new Date('2025-01-01T09:00:00Z'),
};

const BUDGET_ROW = {
  id: '00000000-0000-4000-8000-000000000020',
  user_id: OWNER_ID,
  category: 'Transport',
  item_name: 'Taxi',
  planned_amount: 1500,
  actual_amount: null,
  entry_date: new Date('2026-08-01T00:00:00Z'),
  notes: null,
  receipt_image: null,
  created_at: new Date('2025-01-01T09:00:00Z'),
  updated_at: new Date('2025-01-01T09:00:00Z'),
};

describe('checklists store Postgres adapter (SQL generation, hermetic)', () => {
  let fake: FakePg;

  beforeEach(() => {
    fake = new FakePg();
    (Pool as unknown as jest.Mock).mockImplementation(() => fake);
  });

  it('ensures a checklist per (user, type): reuses existing, inserts new, survives a 23505 race', async () => {
    const store = createPostgresChecklistBudgetStore('postgres://test');

    fake.responses.push({ rows: [CHECKLIST_ROW] }); // call0: SELECT existing
    const existing = await store.ensureChecklist({
      userId: OWNER_ID,
      checklistType: 'hospital_bag',
      title: 'Hospital Bag',
    });
    expect(existing).toMatchObject({
      id: CHECKLIST_ROW.id,
      userId: OWNER_ID,
      checklistType: 'hospital_bag',
      title: 'Hospital Bag',
      createdAt: '2025-01-01T09:00:00.000Z',
    });
    expect(fake.calls[0].text).toContain('SELECT id, user_id, checklist_type, title, progress');
    expect(fake.calls[0].text).toContain('user_id = $1 AND checklist_type = $2');

    // call2: SELECT birth_prep → empty → insert; call3: INSERT → row.
    fake.responses.push({ rows: [] });
    fake.responses.push({ rows: [CHECKLIST_ROW] });
    const created = await store.ensureChecklist({
      userId: OWNER_ID,
      checklistType: 'birth_prep',
      title: 'Birth Preparation',
    });
    expect(created.id).toBe(CHECKLIST_ROW.id);
    expect(fake.calls[3].text).toContain('INSERT INTO checklists');
    expect(fake.calls[3].values).toEqual([OWNER_ID, 'birth_prep', 'Birth Preparation']);

    // call5: SELECT hospital_bag → empty; call6: INSERT → 23505; call7: re-read the raced row.
    fake.errors.push({ at: 7, code: '23505' });
    fake.responses.push({ rows: [] });
    fake.responses.push({ rows: [CHECKLIST_ROW] });
    const raced = await store.ensureChecklist({
      userId: OWNER_ID,
      checklistType: 'hospital_bag',
      title: 'Hospital Bag',
    });
    expect(raced.id).toBe(CHECKLIST_ROW.id);
  });

  it('lists a user’s checklists and attaches items ordered by sort_order', async () => {
    const store = createPostgresChecklistBudgetStore('postgres://test');
    fake.responses.push({ rows: [CHECKLIST_ROW] });
    fake.responses.push({ rows: [ITEM_ROW] });

    const list = await store.listChecklistsForUser(OWNER_ID);
    expect(list).toHaveLength(1);
    expect(list[0].items[0]).toMatchObject({ itemName: 'Passport', sortOrder: 0, custom: true });
    expect(fake.calls[0].text).toContain('user_id = $1');
    expect(fake.calls[1].text).toContain('checklist_id = ANY($1)');
    expect(fake.calls[1].text).toContain('ORDER BY sort_order ASC, created_at ASC');
  });

  it('findChecklistForUser returns null when the checklist is missing or not owned', async () => {
    const store = createPostgresChecklistBudgetStore('postgres://test');
    fake.responses.push({ rows: [CHECKLIST_ROW] });
    fake.responses.push({ rows: [ITEM_ROW] });
    await expect(store.findChecklistForUser(CHECKLIST_ROW.id, OWNER_ID)).resolves.toMatchObject({
      id: CHECKLIST_ROW.id,
      userId: OWNER_ID,
    });
    expect(fake.calls[0].text).toContain('WHERE id = $1 AND user_id = $2');

    fake.responses.push({ rows: [] });
    await expect(store.findChecklistForUser(CHECKLIST_ROW.id, 'other-user')).resolves.toBeNull();
  });

  it('adds a custom item guarded by ownership (EXISTS) and refreshes parent progress', async () => {
    const store = createPostgresChecklistBudgetStore('postgres://test');
    fake.responses.push({ rows: [ITEM_ROW] });
    const item = await store.addItem(CHECKLIST_ROW.id, OWNER_ID, {
      category: 'Documents',
      itemName: '  Passport  ',
    });
    expect(item).toMatchObject({
      itemName: 'Passport',
      category: 'Documents',
      completed: false,
      completedAt: null,
    });
    expect(fake.calls[0].text).toContain('INSERT INTO checklist_items');
    expect(fake.calls[0].text).toContain('coalesce(max(sort_order) + 1, 0)');
    expect(fake.calls[0].text).toContain('c.user_id = $4');
    expect(fake.calls[0].values).toEqual([CHECKLIST_ROW.id, 'Documents', 'Passport', OWNER_ID]);
    expect(fake.calls[1].text).toContain('UPDATE checklists c');

    fake.responses.push({ rows: [] });
    await expect(
      store.addItem(CHECKLIST_ROW.id, 'other-user', { category: 'Baby', itemName: 'x' }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('updates an item inside a transaction with the atomic progress write', async () => {
    const store = createPostgresChecklistBudgetStore('postgres://test');
    fake.responses.push({ rows: [] }); // BEGIN
    fake.responses.push({
      rows: [{ ...ITEM_ROW, completed: true, completed_at: new Date('2025-01-02T00:00:00Z') }],
    }); // UPDATE
    const updated = await store.updateItem(CHECKLIST_ROW.id, ITEM_ROW.id, OWNER_ID, {
      completed: true,
    });
    expect(updated.completed).toBe(true);
    expect(updated.completedAt).toBe('2025-01-02T00:00:00.000Z');

    const begin = fake.calls[0];
    const update = fake.calls[1];
    expect(begin.text).toBe('BEGIN');
    expect(update.text).toContain('UPDATE checklist_items ci');
    expect(update.text).toContain('completed_at = CASE WHEN $2 THEN now() ELSE NULL END');
    expect(update.text).toContain('c.user_id = $5');
    expect(update.text).toContain('RETURNING id, checklist_id, category, item_name');
    expect(fake.calls[fake.calls.length - 1].text).toBe('COMMIT');

    fake.responses.push({ rows: [] }); // BEGIN
    fake.responses.push({ rows: [] }); // UPDATE → no row → 404
    await expect(
      store.updateItem(CHECKLIST_ROW.id, ITEM_ROW.id, 'other-user', { completed: true }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
    expect(fake.calls.some((c) => c.text === 'ROLLBACK')).toBe(true);
  });

  it('creates and lists budget entries with the migration-020 columns', async () => {
    const store = createPostgresChecklistBudgetStore('postgres://test');
    fake.responses.push({ rows: [BUDGET_ROW] });
    const created = await store.createBudgetEntry({
      userId: OWNER_ID,
      category: 'Transport',
      itemName: '  Taxi  ',
      plannedAmount: 1500,
      actualAmount: null,
      entryDate: '2026-08-01',
      notes: null,
    });
    expect(created).toMatchObject({
      userId: OWNER_ID,
      itemName: 'Taxi',
      category: 'Transport',
      plannedAmount: 1500,
      entryDate: '2026-08-01',
      receiptImage: null,
    });
    const insert = fake.calls[0];
    expect(insert.text).toContain('INSERT INTO budget_entries');
    expect(insert.text).toContain('receipt_image');
    expect(insert.values).toEqual([OWNER_ID, 'Transport', 'Taxi', 1500, null, '2026-08-01', null]);

    fake.responses.push({ rows: [BUDGET_ROW] });
    const list = await store.listBudgetEntriesForUser(OWNER_ID);
    expect(list).toHaveLength(1);
    expect(fake.calls[1].text).toContain('ORDER BY entry_date DESC, created_at DESC');
  });

  it('merges budget updates with dynamic sets and gates to the owner', async () => {
    const store = createPostgresChecklistBudgetStore('postgres://test');
    fake.responses.push({ rows: [{ ...BUDGET_ROW, notes: 'paid', actual_amount: 1600 }] });
    const updated = await store.updateBudgetEntry(BUDGET_ROW.id, OWNER_ID, {
      actualAmount: 1600,
      notes: 'paid',
    });
    expect(updated).toMatchObject({ actualAmount: 1600, notes: 'paid' });
    const call = fake.calls[0];
    expect(call.text).toContain('UPDATE budget_entries');
    expect(call.text).toContain('actual_amount = $1');
    expect(call.text).toContain('notes = $2');
    expect(call.text).toContain('WHERE id = $3 AND user_id = $4');

    fake.responses.push({ rows: [] });
    await expect(
      store.updateBudgetEntry(BUDGET_ROW.id, 'other-user', { notes: 'hijack' }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('deletes budget entries only for the owner', async () => {
    const store = createPostgresChecklistBudgetStore('postgres://test');
    fake.responses.push({ rows: [], rowCount: 1 });
    await expect(store.deleteBudgetEntry(BUDGET_ROW.id, OWNER_ID)).resolves.toBeUndefined();
    expect(fake.calls[0].text).toContain(
      'DELETE FROM budget_entries WHERE id = $1 AND user_id = $2',
    );

    fake.responses.push({ rows: [], rowCount: 0 });
    await expect(store.deleteBudgetEntry(BUDGET_ROW.id, 'other-user')).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });

  it('pings the database and reports failure', async () => {
    const store = createPostgresChecklistBudgetStore('postgres://test');
    fake.responses.push({ rows: [] });
    await expect(store.ping()).resolves.toBe(true);
    expect(fake.calls[0].text).toBe('SELECT 1');

    fake.errors.push({ at: 2 });
    await expect(store.ping()).resolves.toBe(false);
  });

  it('dispose ends the pool', async () => {
    const store = createPostgresChecklistBudgetStore('postgres://test');
    await store.dispose();
    expect(fake.ended).toBe(true);
  });
});
