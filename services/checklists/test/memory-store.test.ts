import { createMemoryChecklistBudgetStore } from '../src/store/memory-store';

const OWNER = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const STRANGER = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

describe('MemoryChecklistBudgetStore (M-08 test-double)', () => {
  let store: ReturnType<typeof createMemoryChecklistBudgetStore>;

  beforeEach(() => {
    store = createMemoryChecklistBudgetStore();
  });

  it('ensures one instance per checklist type per user (unique rule)', async () => {
    const first = await store.ensureChecklist({
      userId: OWNER,
      checklistType: 'hospital_bag',
      title: 'Hospital Bag',
    });
    const again = await store.ensureChecklist({
      userId: OWNER,
      checklistType: 'hospital_bag',
      title: 'Hospital Bag',
    });
    expect(again.id).toBe(first.id);

    const birthPrep = await store.ensureChecklist({
      userId: OWNER,
      checklistType: 'birth_prep',
      title: 'Birth Preparation',
    });
    expect(birthPrep.id).not.toBe(first.id);

    const stranger = await store.listChecklistsForUser(STRANGER);
    expect(stranger).toHaveLength(0);
  });

  it('adds custom items with increasing sort_order and recomputes progress', async () => {
    const checklist = await store.ensureChecklist({
      userId: OWNER,
      checklistType: 'hospital_bag',
      title: 'Hospital Bag',
    });
    expect(checklist.progress).toBe(0);

    const a = await store.addItem(checklist.id, OWNER, {
      category: 'Documents',
      itemName: 'ID Card',
    });
    const b = await store.addItem(checklist.id, OWNER, {
      category: 'Documents',
      itemName: 'ANC Card',
    });
    expect(a.sortOrder).toBe(0);
    expect(b.sortOrder).toBe(1);
    expect(a.custom).toBe(true);
    expect(a.completed).toBe(false);
    expect(a.completedAt).toBeNull();

    const afterAdd = await store.findChecklistForUser(checklist.id, OWNER);
    expect(afterAdd?.progress).toBe(0);

    const done = await store.updateItem(checklist.id, a.id, OWNER, { completed: true });
    expect(done.completed).toBe(true);
    expect(done.completedAt).toBeTruthy();

    const partial = await store.findChecklistForUser(checklist.id, OWNER);
    expect(partial?.progress).toBe(50);

    const undone = await store.updateItem(checklist.id, a.id, OWNER, { completed: false });
    expect(undone.completedAt).toBeNull();
    const reset = await store.findChecklistForUser(checklist.id, OWNER);
    expect(reset?.progress).toBe(0);
  });

  it('orders items by sort_order in the returned checklist', async () => {
    const checklist = await store.ensureChecklist({
      userId: OWNER,
      checklistType: 'birth_prep',
      title: 'Birth Preparation',
    });
    for (const name of ['z', 'a', 'm']) {
      await store.addItem(checklist.id, OWNER, { category: 'Mother', itemName: name });
    }
    const loaded = await store.findChecklistForUser(checklist.id, OWNER);
    expect(loaded?.items.map((i) => i.itemName)).toEqual(['z', 'a', 'm']);
  });

  it('gates checklist reads/mutations to the owner (404 invisibility)', async () => {
    const checklist = await store.ensureChecklist({
      userId: OWNER,
      checklistType: 'hospital_bag',
      title: 'Hospital Bag',
    });
    expect(await store.findChecklistForUser(checklist.id, STRANGER)).toBeNull();

    await expect(
      store.addItem(checklist.id, STRANGER, { category: 'Baby', itemName: 'x' }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
    const item = await store.addItem(checklist.id, OWNER, { category: 'Baby', itemName: 'x' });
    await expect(
      store.updateItem(checklist.id, item.id, STRANGER, { completed: true }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await expect(
      store.updateItem(checklist.id, '00000000-0000-4000-8000-000000000000', OWNER, {
        completed: true,
      }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('creates budget entries owned by the user', async () => {
    const entry = await store.createBudgetEntry({
      userId: OWNER,
      category: 'Transport',
      itemName: 'Taxi to hospital',
      plannedAmount: 1500.5,
      actualAmount: null,
      entryDate: '2026-08-01',
      notes: null,
    });
    expect(entry.id).toMatch(/^[0-9a-f-]{36}$/i);
    expect(entry.receiptImage).toBeNull();
    expect(entry.userId).toBe(OWNER);
  });

  it('lists budget entries newest entry_date first and merges per-field updates', async () => {
    await store.createBudgetEntry({
      userId: OWNER,
      category: 'Medical',
      itemName: 'A',
      plannedAmount: 100,
      actualAmount: null,
      entryDate: '2026-08-01',
      notes: null,
    });
    const b = await store.createBudgetEntry({
      userId: OWNER,
      category: 'Baby Items',
      itemName: 'B',
      plannedAmount: 200,
      actualAmount: 150,
      entryDate: '2026-08-05',
      notes: null,
    });
    await store.createBudgetEntry({
      userId: STRANGER,
      category: 'Food',
      itemName: 'S',
      plannedAmount: 50,
      actualAmount: null,
      entryDate: '2026-08-05',
      notes: null,
    });

    const list = await store.listBudgetEntriesForUser(OWNER);
    expect(list.map((e) => e.itemName)).toEqual(['B', 'A']);

    const merged = await store.updateBudgetEntry(b.id, OWNER, {
      actualAmount: 180,
      notes: 'paid',
    });
    expect(merged).toMatchObject({ actualAmount: 180, notes: 'paid', plannedAmount: 200 });

    await expect(
      store.updateBudgetEntry(b.id, STRANGER, { notes: 'hijack' }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await expect(store.deleteBudgetEntry(b.id, STRANGER)).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });

    await store.deleteBudgetEntry(b.id, OWNER);
    expect((await store.listBudgetEntriesForUser(OWNER)).map((e) => e.id)).not.toContain(b.id);
  });

  it('ping reports ready and dispose clears state', async () => {
    expect(await store.ping()).toBe(true);
    const checklist = await store.ensureChecklist({
      userId: OWNER,
      checklistType: 'hospital_bag',
      title: 'Hospital Bag',
    });
    await store.dispose();
    expect(await store.findChecklistForUser(checklist.id, OWNER)).toBeNull();
  });
});
