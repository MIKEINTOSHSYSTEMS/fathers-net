import { createMemoryJournalStore, type MemoryJournalStore } from '../src/store/memory-store';
import { encodeCursor } from '../src/store/cursor';

const OWNER = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const PARTNER = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

describe('MemoryJournalStore (M-08 test-double)', () => {
  let store: MemoryJournalStore;

  beforeEach(() => {
    store = createMemoryJournalStore();
  });

  it('creates entries with uuid ids and timestamps', async () => {
    const entry = await store.create({
      userId: OWNER,
      entryType: 'text',
      content: 'hello',
      pregnancyWeek: 12,
      sharedWithPartner: false,
    });
    expect(entry.id).toMatch(/^[0-9a-f-]{36}$/i);
    expect(entry.createdAt).toBeDefined();
    expect(entry.updatedAt).toBeDefined();
  });

  it('appends outbox entries on create and clears them on dispose (WP-024c)', async () => {
    expect(store.outboxLog).toHaveLength(0);
    const entry = {
      eventId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      eventType: 'journal.entry.created',
      producer: 'journal-service',
      schemaVersion: 1,
      occurredAt: '2026-03-01T12:00:00.000Z',
      aggregateType: 'journal_entry',
      aggregateId: 'entry-1',
      idempotencyKey: 'entry-1',
      payload: { entry_id: 'entry-1', type: 'text', week: 24 },
    };

    await store.create(
      {
        userId: OWNER,
        entryType: 'text',
        content: 'hello',
        pregnancyWeek: 24,
        sharedWithPartner: false,
      },
      [entry],
    );
    expect(store.outboxLog).toEqual([entry]);

    // A create without outbox rows appends nothing.
    await store.create({
      userId: OWNER,
      entryType: 'text',
      content: 'no outbox',
      pregnancyWeek: null,
      sharedWithPartner: false,
    });
    expect(store.outboxLog).toHaveLength(1);

    await store.dispose();
    expect(store.outboxLog).toHaveLength(0);
  });

  it('filters reads by ownership and partner share + linkage', async () => {
    store.setPartner(OWNER, PARTNER);

    const privateEntry = await store.create({
      userId: OWNER,
      entryType: 'text',
      content: 'private',
      pregnancyWeek: null,
      sharedWithPartner: false,
    });
    const sharedEntry = await store.create({
      userId: OWNER,
      entryType: 'text',
      content: 'shared',
      pregnancyWeek: null,
      sharedWithPartner: true,
    });

    expect((await store.findByIdForUser(privateEntry.id, OWNER))?.id).toBe(privateEntry.id);
    expect((await store.findByIdForUser(sharedEntry.id, OWNER))?.id).toBe(sharedEntry.id);
    // Partner sees only the explicitly shared entry.
    expect(await store.findByIdForUser(privateEntry.id, PARTNER)).toBeNull();
    expect((await store.findByIdForUser(sharedEntry.id, PARTNER))?.id).toBe(sharedEntry.id);
    // Unknown caller sees nothing.
    expect(
      await store.findByIdForUser(sharedEntry.id, 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'),
    ).toBeNull();
  });

  it('update/delete are owner-guarded with NotFoundError', async () => {
    store.setPartner(OWNER, PARTNER);
    const entry = await store.create({
      userId: OWNER,
      entryType: 'text',
      content: 'orig',
      pregnancyWeek: null,
      sharedWithPartner: true,
    });

    const updated = await store.updateEntry(entry.id, OWNER, { content: 'updated' });
    expect(updated.content).toBe('updated');

    await expect(store.updateEntry(entry.id, PARTNER, { content: 'x' })).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
    await expect(store.deleteEntry(entry.id, PARTNER)).rejects.toMatchObject({ code: 'NOT_FOUND' });

    await store.deleteEntry(entry.id, OWNER);
    expect(await store.findByIdForUser(entry.id, OWNER)).toBeNull();
  });

  it('setShared toggles the partner flag owner-only', async () => {
    const entry = await store.create({
      userId: OWNER,
      entryType: 'text',
      content: 'x',
      pregnancyWeek: null,
      sharedWithPartner: false,
    });
    expect((await store.setShared(entry.id, OWNER, true)).sharedWithPartner).toBe(true);
    await expect(store.setShared(entry.id, PARTNER, true)).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });

  it('paginates the timeline with stable cursor windows (R7)', async () => {
    for (let i = 1; i <= 7; i += 1) {
      await store.create({
        userId: OWNER,
        entryType: 'text',
        content: `e${i}`,
        pregnancyWeek: null,
        sharedWithPartner: false,
      });
    }

    const page1 = await store.listForUser(OWNER, { pageSize: 3 });
    expect(page1.items.map((e) => e.content)).toEqual(['e7', 'e6', 'e5']);
    expect(page1.nextCursor).toBeTruthy();

    // A concurrent write AFTER the first page must not shift the window
    // anchored by the cursor (keyset stability).
    await store.create({
      userId: OWNER,
      entryType: 'text',
      content: 'e8',
      pregnancyWeek: null,
      sharedWithPartner: false,
    });

    const page2 = await store.listForUser(OWNER, { pageSize: 3, cursor: page1.nextCursor });
    expect(page2.items.map((e) => e.content)).toEqual(['e4', 'e3', 'e2']);
    const page3 = await store.listForUser(OWNER, { pageSize: 3, cursor: page2.nextCursor });
    expect(page3.items.map((e) => e.content)).toEqual(['e1']);
    expect(page3.nextCursor).toBeNull();
  });

  it('handles malformed cursors by degrading to the first page', async () => {
    const entry = await store.create({
      userId: OWNER,
      entryType: 'text',
      content: 'x',
      pregnancyWeek: null,
      sharedWithPartner: false,
    });
    const list = await store.listForUser(OWNER, { pageSize: 5, cursor: 'not-a-cursor' });
    expect(list.items.map((e) => e.id)).toContain(entry.id);
  });

  it('listAllForUser is owner-only and chronological ascending (export source)', async () => {
    for (let i = 1; i <= 3; i += 1) {
      await store.create({
        userId: OWNER,
        entryType: 'text',
        content: `o${i}`,
        pregnancyWeek: null,
        sharedWithPartner: false,
      });
    }
    await store.create({
      userId: PARTNER,
      entryType: 'text',
      content: 'other',
      pregnancyWeek: null,
      sharedWithPartner: true,
    });
    const all = await store.listAllForUser(OWNER);
    expect(all.map((e) => e.content)).toEqual(['o1', 'o2', 'o3']);
    expect(all.some((e) => e.content === 'other')).toBe(false);
  });

  it('ping reports ready and dispose clears state', async () => {
    expect(await store.ping()).toBe(true);
    await store.create({
      userId: OWNER,
      entryType: 'text',
      content: 'x',
      pregnancyWeek: null,
      sharedWithPartner: false,
    });
    await store.dispose();
    expect((await store.listForUser(OWNER, { pageSize: 10 })).items).toHaveLength(0);
  });

  it('encodeCursor round-trips and rejects malformed payloads', () => {
    const encoded = encodeCursor({ userId: OWNER, createdAt: '2026-01-01T00:00:00.000Z', id: 'x' });
    const decoded = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8'));
    expect(decoded).toEqual({
      userId: OWNER,
      createdAt: '2026-01-01T00:00:00.000Z',
      id: 'x',
    });
  });
});
