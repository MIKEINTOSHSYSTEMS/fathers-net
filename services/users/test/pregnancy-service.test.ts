import { createTestLogger } from '@fathersnet/test-utils';
import { createInMemoryEventBus, type InMemoryEventBus } from '@fathersnet/events';
import { PregnancyService } from '../src/services/pregnancy-service';
import { createMemoryUsersStore } from '../src/services/store/memory-store';
import { createPregnancyEngine } from '../src/services/pregnancy';
import type { UsersStore } from '../src/services/store/types';

const DAY_MS = 24 * 60 * 60 * 1000;

describe('PregnancyService (WP-019)', () => {
  const NOW = new Date('2025-03-01T12:00:00Z').getTime();

  let clock: number;
  let store: UsersStore;
  let service: PregnancyService;
  let eventBus: InMemoryEventBus;

  function build(): void {
    clock = NOW;
    eventBus = createInMemoryEventBus();
    const { logger } = createTestLogger('debug');
    store = createMemoryUsersStore();
    service = new PregnancyService({
      store,
      eventBus,
      logger,
      engine: createPregnancyEngine(),
      nowMs: () => clock,
    });
  }

  it('returns null from getStatus when the user has no pregnancy record', async () => {
    build();
    await expect(service.getStatus('00000000-0000-4000-8000-000000000000')).resolves.toBeNull();
    expect(eventBus.published).toHaveLength(0);
  });

  it('persists recompute-on-edit and emits pregnancy.week.changed on first capture', async () => {
    build();
    const userId = '00000000-0000-4000-8000-000000000001';

    const snapshot = await service.refreshAfterEdit(userId, { edd: '2025-10-01', lmp: null });

    expect(snapshot).toMatchObject({
      pregnancyWeek: 9,
      trimester: 1,
      edd: '2025-10-01',
      lmp: null,
    });
    await expect(store.getPregnancy(userId)).resolves.toMatchObject({
      edd: '2025-10-01',
      pregnancyWeek: 9,
      trimester: 1,
    });

    expect(eventBus.published).toHaveLength(1);
    expect(eventBus.published[0]).toMatchObject({
      type: 'pregnancy.week.changed',
      producer: 'pregnancy-engine',
      aggregate: { type: 'pregnancy', id: userId },
      idempotency_key: `${userId}:9`,
      payload: { user_id: userId, week: 9, trimester: 1, edd: '2025-10-01' },
    });
  });

  it('is idempotent on repeated recompute with an unchanged anchor', async () => {
    build();
    const userId = '00000000-0000-4000-8000-000000000002';
    await service.refreshAfterEdit(userId, { edd: '2025-10-01', lmp: null });
    await service.refreshAfterEdit(userId, { edd: '2025-10-01', lmp: null });
    await service.refreshAfterEdit(userId, { edd: '2025-10-01', lmp: null });
    expect(eventBus.published.filter((e) => e.type === 'pregnancy.week.changed')).toHaveLength(1);
    expect(eventBus.published.filter((e) => e.type === 'milestone.reached')).toHaveLength(0);
  });

  it('emits milestone.reached for every milestone crossed by an anchor edit (FR-006)', async () => {
    build();
    const userId = '00000000-0000-4000-8000-000000000003';

    await service.refreshAfterEdit(userId, { edd: '2025-10-01', lmp: null });
    eventBus.published.length = 0;

    const snapshot = await service.refreshAfterEdit(userId, { edd: '2025-09-01', lmp: null });
    expect(snapshot.pregnancyWeek).toBe(13);

    const reached = eventBus.published.filter((e) => e.type === 'milestone.reached');
    expect(reached.map((e) => e.payload)).toEqual([
      { user_id: userId, milestone: 'first_anc_visit', week: 12 },
      { user_id: userId, milestone: 'first_trimester_end', week: 13 },
    ]);
    for (const event of reached) {
      expect(event.producer).toBe('pregnancy-engine');
    }
    expect(eventBus.published.filter((e) => e.type === 'pregnancy.week.changed')).toHaveLength(1);

    await service.refreshAfterEdit(userId, { edd: '2025-09-01', lmp: null });
    expect(eventBus.published.filter((e) => e.type === 'milestone.reached')).toHaveLength(2);
  });

  it('lazily rolls the stored week forward as time advances (FR-031)', async () => {
    build();
    const userId = '00000000-0000-4000-8000-000000000004';
    await service.refreshAfterEdit(userId, { edd: '2025-10-01', lmp: null });

    const before = await service.getStatus(userId);
    expect(before?.pregnancyWeek).toBe(9);
    expect(eventBus.published.filter((e) => e.type === 'pregnancy.week.changed')).toHaveLength(1);

    clock += 7 * DAY_MS;

    const after = await service.getStatus(userId);
    expect(after?.pregnancyWeek).toBe(10);
    await expect(store.getPregnancy(userId)).resolves.toMatchObject({ pregnancyWeek: 10 });
    expect(eventBus.published.filter((e) => e.type === 'pregnancy.week.changed')).toHaveLength(2);

    const repeat = await service.getStatus(userId);
    expect(repeat?.pregnancyWeek).toBe(10);
    expect(eventBus.published.filter((e) => e.type === 'pregnancy.week.changed')).toHaveLength(2);
  });

  it('rolls into trimester 2 and emits the week change with the new trimester', async () => {
    build();
    const userId = '00000000-0000-4000-8000-000000000005';
    await service.refreshAfterEdit(userId, { edd: '2025-10-01', lmp: null });

    clock += 30 * DAY_MS;

    const after = await service.getStatus(userId);
    expect(after?.pregnancyWeek).toBe(13);
    expect(after?.trimester).toBe(1);

    clock += 2 * DAY_MS;

    const t2 = await service.getStatus(userId);
    expect(t2?.pregnancyWeek).toBe(14);
    expect(t2?.trimester).toBe(2);
    const last = eventBus.published.filter((e) => e.type === 'pregnancy.week.changed').at(-1);
    expect(last?.payload).toMatchObject({ user_id: userId, week: 14, trimester: 2 });
  });
});
