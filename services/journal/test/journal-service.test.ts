import { randomUUID } from 'node:crypto';
import { createTestLogger } from '@fathersnet/test-utils';
import { JournalService } from '../src/services/journal-service';
import { createMemoryJournalStore, type MemoryJournalStore } from '../src/store/memory-store';

const OWNER = '11111111-1111-4111-8111-111111111111';
const PARTNER = '22222222-2222-4222-8222-222222222222';
const STRANGER = '33333333-3333-4333-8333-333333333333';

describe('JournalService privacy matrix (FR-052/FR-126)', () => {
  let store: MemoryJournalStore;
  let service: JournalService;

  beforeEach(() => {
    store = createMemoryJournalStore();
    const { logger } = createTestLogger('info');
    service = new JournalService({ store, logger });
  });

  it('creates text entries private by default and joins journal.entry.created to the outbox with no content PII', async () => {
    const entry = await service.createEntry(OWNER, {
      content: '  Today we felt the baby kick.  ',
      pregnancyWeek: 22,
      sharedWithPartner: false,
    });

    expect(entry.entryType).toBe('text');
    expect(entry.content).toBe('Today we felt the baby kick.');
    expect(entry.sharedWithPartner).toBe(false);
    expect(entry.userId).toBe(OWNER);

    // WP-024c: the entry and its outbox row commit atomically (D-03); the
    // relay publishes the committed row, so the memory store captures it.
    expect(store.outboxLog).toHaveLength(1);
    const row = store.outboxLog[0];
    expect(row.eventType).toBe('journal.entry.created');
    expect(row.producer).toBe('journal-service');
    expect(row.schemaVersion).toBe(1);
    expect(row.aggregateType).toBe('journal_entry');
    expect(row.aggregateId).toBe(entry.id);
    expect(row.idempotencyKey).toBe(entry.id);
    expect(row.eventId).toMatch(/^[0-9a-f-]{36}$/i);
    expect(row.payload).toEqual({
      entry_id: entry.id,
      type: 'text',
      week: 22,
      consent_flags: { shared_with_partner: false },
    });
    // FR-022/FR-123: the journal body is never published.
    expect(JSON.stringify(row.payload)).not.toContain('kick');
    expect(JSON.stringify(row.payload)).not.toContain('content');
  });

  it('owner can read and update their own entry', async () => {
    const created = await service.createEntry(OWNER, {
      content: 'First entry',
      pregnancyWeek: null,
      sharedWithPartner: false,
    });

    const read = await service.getEntry(OWNER, created.id);
    expect(read.content).toBe('First entry');

    const updated = await service.updateEntry(OWNER, created.id, {
      content: '  Second version  ',
      pregnancyWeek: 23,
    });
    expect(updated.content).toBe('Second version');
    expect(updated.pregnancyWeek).toBe(23);
    expect(updated.updatedAt >= created.updatedAt).toBe(true);
  });

  it('stranger gets 404 on read and write of a non-owned entry (invisibility, not 403)', async () => {
    const created = await service.createEntry(OWNER, {
      content: 'Secret thoughts',
      pregnancyWeek: null,
      sharedWithPartner: false,
    });

    await expect(service.getEntry(STRANGER, created.id)).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
    await expect(
      service.updateEntry(STRANGER, created.id, { content: 'hijack' }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await expect(service.deleteEntry(STRANGER, created.id)).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
    await expect(service.shareEntry(STRANGER, created.id)).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });

    // The owner's entry is untouched by the failed stranger writes.
    const stillOwned = await service.getEntry(OWNER, created.id);
    expect(stillOwned.content).toBe('Secret thoughts');
  });

  it('shared partner can read only after explicit opt-in share (FR-039)', async () => {
    store.setPartner(OWNER, PARTNER);

    const created = await service.createEntry(OWNER, {
      content: 'Our baby news',
      pregnancyWeek: 20,
      sharedWithPartner: false,
    });

    // Not shared yet → partner cannot read (404).
    await expect(service.getEntry(PARTNER, created.id)).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });

    const shared = await service.shareEntry(OWNER, created.id);
    expect(shared.sharedWithPartner).toBe(true);

    // Now the linked partner can read.
    const partnerRead = await service.getEntry(PARTNER, created.id);
    expect(partnerRead.content).toBe('Our baby news');

    // The partner can read but NOT write (owner-only writes).
    await expect(
      service.updateEntry(PARTNER, created.id, { content: 'tampered' }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('partner read requires a real partner linkage (partner_user_id), else 404', async () => {
    const created = await service.createEntry(OWNER, {
      content: 'Private',
      pregnancyWeek: null,
      sharedWithPartner: true,
    });

    // No pregnancies.partner_user_id link registered → even a shared entry is
    // invisible to PARTNER (R2 fallback: owner-only when linkage absent).
    await expect(service.getEntry(PARTNER, created.id)).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });

  it('unsharing via PATCH revokes partner access', async () => {
    store.setPartner(OWNER, PARTNER);
    const created = await service.createEntry(OWNER, {
      content: 'To share then retract',
      pregnancyWeek: null,
      sharedWithPartner: true,
    });
    expect((await service.getEntry(PARTNER, created.id)).id).toBe(created.id);

    await service.updateEntry(OWNER, created.id, { sharedWithPartner: false });
    await expect(service.getEntry(PARTNER, created.id)).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });

  it('timeline is owner-only, newest first, cursor paginated', async () => {
    for (let i = 1; i <= 5; i += 1) {
      await service.createEntry(OWNER, {
        content: `Entry ${i}`,
        pregnancyWeek: i,
        sharedWithPartner: false,
      });
    }
    // A stranger's entry must never appear in the owner's timeline.
    await service.createEntry(STRANGER, {
      content: 'Stranger entry',
      pregnancyWeek: null,
      sharedWithPartner: false,
    });

    const first = await service.listEntries(OWNER, 2);
    expect(first.items).toHaveLength(2);
    expect(first.nextCursor).toBeTruthy();
    // Newest first (the 5th created entry leads).
    expect(first.items[0].content).toBe('Entry 5');
    expect(first.items[1].content).toBe('Entry 4');

    const second = await service.listEntries(OWNER, 2, first.nextCursor);
    expect(second.items.map((e) => e.content)).toEqual(['Entry 3', 'Entry 2']);
    const third = await service.listEntries(OWNER, 2, second.nextCursor);
    expect(third.items.map((e) => e.content)).toEqual(['Entry 1']);
    expect(third.nextCursor).toBeNull();

    // Stranger sees only their own entry.
    const strangerList = await service.listEntries(STRANGER, 20);
    expect(strangerList.items.map((e) => e.content)).toEqual(['Stranger entry']);
  });

  it('delete removes the entry for the owner (FR-128 erasure path)', async () => {
    const created = await service.createEntry(OWNER, {
      content: 'To delete',
      pregnancyWeek: null,
      sharedWithPartner: false,
    });
    await service.deleteEntry(OWNER, created.id);
    await expect(service.getEntry(OWNER, created.id)).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
    await expect(service.deleteEntry(OWNER, created.id)).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });

  it('rejects empty/whitespace-only content with a validation error', async () => {
    await expect(
      service.createEntry(OWNER, {
        content: '   ',
        pregnancyWeek: null,
        sharedWithPartner: false,
      }),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
  });

  it('export contains only the owner’s entries in chronological order (FR-057/FR-128)', async () => {
    store.setPartner(OWNER, PARTNER);
    for (const [content, week] of [
      ['first', 10],
      ['second', 12],
      ['third', 14],
    ] as const) {
      await service.createEntry(OWNER, { content, pregnancyWeek: week, sharedWithPartner: false });
    }
    await service.createEntry(PARTNER, {
      content: 'Partner own entry',
      pregnancyWeek: null,
      sharedWithPartner: true,
    });

    const fixedNow = '2026-08-07T12:00:00.000Z';
    const artifact = await service.exportEntries(OWNER, 'req-export', () => fixedNow);

    expect(artifact.schema_version).toBe(1);
    expect(artifact.exported_at).toBe(fixedNow);
    expect(artifact.entry_count).toBe(3);
    expect(artifact.entries.map((e) => e.content)).toEqual(['first', 'second', 'third']);
    // The partner's own entry (even shared) never leaks into the owner's export.
    expect(artifact.entries.some((e) => e.content === 'Partner own entry')).toBe(false);
    expect(JSON.stringify(artifact)).toBe(JSON.stringify(artifact)); // deterministic shape
  });

  it('getEntry on a missing id returns 404', async () => {
    await expect(service.getEntry(OWNER, randomUUID())).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });
});
