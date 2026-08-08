import type { Logger } from '@fathersnet/logger';
import { createMemoryChecklistBudgetStore } from '../src/store/memory-store';
import { BudgetService } from '../src/services/budget-service';
import { createNoopLogger } from './helpers';

const OWNER = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const STRANGER = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

describe('BudgetService (FR-087/FR-088/FR-126, §8.3 formulas)', () => {
  let store: ReturnType<typeof createMemoryChecklistBudgetStore>;
  let service: BudgetService;
  let logger: Logger;

  beforeEach(() => {
    store = createMemoryChecklistBudgetStore();
    logger = createNoopLogger();
    service = new BudgetService({ store, logger, cap: 20000 });
  });

  it('listEntries returns per-entry rows plus planned/actual totals', async () => {
    await service.createEntry(OWNER, {
      category: 'Transport',
      itemName: 'Taxi',
      plannedAmount: 1500,
      actualAmount: 1600,
    });
    await service.createEntry(OWNER, {
      category: 'Food',
      itemName: 'Snacks',
      plannedAmount: 250.5,
      actualAmount: null,
    });
    await service.createEntry(STRANGER, {
      category: 'Other',
      itemName: 'Sneaky',
      plannedAmount: 99999,
    });

    const result = await service.listEntries(OWNER);
    expect(result.items).toHaveLength(2);
    expect(result.totals).toEqual({ totalPlanned: 1750.5, totalActual: 1600 });
  });

  it('createEntry validates category, item name, amount and date', async () => {
    await expect(
      service.createEntry(OWNER, { category: 'Bogus' as never, itemName: 'x', plannedAmount: 1 }),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    await expect(
      service.createEntry(OWNER, { category: 'Food', itemName: '   ', plannedAmount: 1 }),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    await expect(
      service.createEntry(OWNER, { category: 'Food', itemName: 'x', plannedAmount: -1 }),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    await expect(
      service.createEntry(OWNER, {
        category: 'Food',
        itemName: 'x',
        plannedAmount: 1,
        entryDate: '2026/08/01',
      }),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    await expect(
      service.createEntry(OWNER, {
        category: 'Food',
        itemName: 'x',
        plannedAmount: 1,
        actualAmount: -5,
      }),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });

    const entry = await service.createEntry(OWNER, {
      category: 'Baby Items',
      itemName: '  Diapers  ',
      plannedAmount: 1200,
    });
    expect(entry.itemName).toBe('Diapers');
    expect(entry.entryDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('updateEntry is a per-field merge with explicit-null clearing', async () => {
    const entry = await service.createEntry(OWNER, {
      category: 'Medical',
      itemName: 'Blood test',
      plannedAmount: 500,
      actualAmount: 500,
      notes: 'first',
    });
    const merged = await service.updateEntry(OWNER, entry.id, {
      actualAmount: null,
      notes: 'paid cash',
    });
    expect(merged).toMatchObject({
      actualAmount: null,
      notes: 'paid cash',
      plannedAmount: 500,
      category: 'Medical',
    });

    const cleared = await service.updateEntry(OWNER, entry.id, { receiptImage: null });
    expect(cleared.receiptImage).toBeNull();

    await expect(service.updateEntry(OWNER, entry.id, { itemName: '' })).rejects.toMatchObject({
      code: 'VALIDATION_ERROR',
    });
    await expect(
      service.updateEntry(OWNER, entry.id, { category: 'Nope' as never }),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    await expect(service.updateEntry(OWNER, entry.id, { plannedAmount: -1 })).rejects.toMatchObject(
      { code: 'VALIDATION_ERROR' },
    );
  });

  it('updateEntry and deleteEntry are ownership-gated (404 for strangers)', async () => {
    const entry = await service.createEntry(OWNER, {
      category: 'Food',
      itemName: 'Snacks',
      plannedAmount: 100,
    });
    await expect(service.updateEntry(STRANGER, entry.id, { notes: 'x' })).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
    await expect(service.deleteEntry(STRANGER, entry.id)).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
    await service.deleteEntry(OWNER, entry.id);
    await expect(service.deleteEntry(OWNER, entry.id)).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });

  it('summary applies the §8.3 formulas with a configured cap', async () => {
    await service.createEntry(OWNER, {
      category: 'Transport',
      itemName: 'Taxi',
      plannedAmount: 1500,
      actualAmount: 1600,
    });
    await service.createEntry(OWNER, {
      category: 'Food',
      itemName: 'Snacks',
      plannedAmount: 250.5,
      actualAmount: 100,
    });
    const summary = await service.summary(OWNER);
    expect(summary).toEqual({
      cap: 20000,
      totalPlanned: 1750.5,
      totalActual: 1700,
      variance: -50.5,
      remaining: 18249.5,
    });
  });

  it('summary reports remaining null when no cap is configured (M-07 unset)', async () => {
    const uncapped = new BudgetService({ store, logger, cap: 0 });
    await uncapped.createEntry(OWNER, {
      category: 'Food',
      itemName: 'Snacks',
      plannedAmount: 100,
    });
    const summary = await uncapped.summary(OWNER);
    expect(summary.cap).toBeNull();
    expect(summary.remaining).toBeNull();
    expect(summary).toMatchObject({ totalPlanned: 100, totalActual: 0, variance: -100 });
  });
});
