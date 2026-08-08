import { createMemoryChecklistBudgetStore } from '../src/store/memory-store';
import { ChecklistService, DEFAULT_TITLES } from '../src/services/checklist-service';
import { createNoopLogger } from './helpers';

const OWNER = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const STRANGER = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

describe('ChecklistService (FR-051/FR-057/FR-089)', () => {
  let store: ReturnType<typeof createMemoryChecklistBudgetStore>;
  let service: ChecklistService;

  beforeEach(() => {
    store = createMemoryChecklistBudgetStore();
    service = new ChecklistService({ store, logger: createNoopLogger() });
  });

  it('listChecklists lazily instantiates the two default checklists with catalog titles', async () => {
    const before = await store.listChecklistsForUser(OWNER);
    expect(before).toHaveLength(0);

    const after = await service.listChecklists(OWNER);
    expect(after).toHaveLength(2);
    const byType = new Map(after.map((c) => [c.checklistType, c.title]));
    expect(byType.get('hospital_bag')).toBe(DEFAULT_TITLES.hospital_bag);
    expect(byType.get('birth_prep')).toBe(DEFAULT_TITLES.birth_prep);
    expect(after.every((c) => c.progress === 0 && c.items.length === 0)).toBe(true);

    const stable = await service.listChecklists(OWNER);
    expect(stable).toHaveLength(2);
    expect(stable.map((c) => c.id).sort()).toEqual(after.map((c) => c.id).sort());
  });

  it('getChecklist returns 404 for missing or non-owned checklists', async () => {
    const checklist = (await service.listChecklists(OWNER))[0];
    await expect(service.getChecklist(OWNER, checklist.id)).resolves.toMatchObject({
      id: checklist.id,
    });
    await expect(service.getChecklist(STRANGER, checklist.id)).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
    await expect(
      service.getChecklist(OWNER, '00000000-0000-4000-8000-000000000000'),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('addItem validates the category and rejects empty names', async () => {
    const checklist = (await service.listChecklists(OWNER))[0];
    await expect(
      service.addItem(OWNER, checklist.id, { itemName: '', category: 'Baby' }),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    await expect(
      service.addItem(OWNER, checklist.id, { itemName: 'x', category: 'Bogus' as never }),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });

    const item = await service.addItem(OWNER, checklist.id, {
      itemName: 'Passport',
      category: 'Documents',
    });
    expect(item).toMatchObject({ custom: true, completed: false, category: 'Documents' });
  });

  it('completion toggle is a per-field merge that updates parent progress', async () => {
    const checklist = (await service.listChecklists(OWNER))[0];
    const item = await service.addItem(OWNER, checklist.id, {
      itemName: 'Passport',
      category: 'Documents',
    });

    const done = await service.updateItem(OWNER, checklist.id, item.id, { completed: true });
    expect(done.completed).toBe(true);
    const parent = await service.getChecklist(OWNER, checklist.id);
    expect(parent.progress).toBe(100);

    const undone = await service.updateItem(OWNER, checklist.id, item.id, { completed: false });
    expect(undone.completed).toBe(false);
    expect((await service.getChecklist(OWNER, checklist.id)).progress).toBe(0);
  });
});
