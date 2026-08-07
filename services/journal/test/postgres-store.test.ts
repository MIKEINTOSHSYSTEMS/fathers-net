import { Pool } from 'pg';
import { createPostgresJournalStore } from '../src/store/postgres-store';

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
 * Hermetic Postgres-store unit tests (WP-022). A fake Pool scripts query
 * results and records every statement so the SQL generation and row mappers
 * are exercised without a live database; the real end-to-end adapter is
 * verified by the gated integration test against JOURNAL_TEST_DATABASE_URL.
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

  end = async (): Promise<void> => {
    this.ended = true;
  };
}

const ENTRY_ROW = {
  id: '00000000-0000-4000-8000-000000000001',
  user_id: '55555555-5555-4555-8555-555555555555',
  entry_type: 'text',
  content: 'Today the baby kicked',
  pregnancy_week: 24,
  shared_with_partner: false,
  created_at: new Date('2025-01-01T09:00:00Z'),
  updated_at: new Date('2025-01-01T09:00:00Z'),
};

describe('journal store Postgres adapter (SQL generation, hermetic)', () => {
  let fake: FakePg;

  beforeEach(() => {
    fake = new FakePg();
    (Pool as unknown as jest.Mock).mockImplementation(() => fake);
  });

  it('inserts an entry with the migration-019 columns and parses the row', async () => {
    const store = createPostgresJournalStore('postgres://test');
    fake.responses.push({ rows: [ENTRY_ROW] });

    const created = await store.create({
      userId: ENTRY_ROW.user_id,
      entryType: 'text',
      content: ENTRY_ROW.content,
      pregnancyWeek: 24,
      sharedWithPartner: false,
    });
    expect(created).toMatchObject({
      id: ENTRY_ROW.id,
      userId: ENTRY_ROW.user_id,
      entryType: 'text',
      content: 'Today the baby kicked',
      pregnancyWeek: 24,
      sharedWithPartner: false,
      createdAt: '2025-01-01T09:00:00.000Z',
    });
    const call = fake.calls[0];
    expect(call.text).toContain('INSERT INTO journal_entries');
    expect(call.text).toContain('shared_with_partner');
    expect(call.values).toEqual([ENTRY_ROW.user_id, 'text', ENTRY_ROW.content, 24, false]);
  });

  it('finds an entry for the owner or the explicitly-shared linked partner', async () => {
    const store = createPostgresJournalStore('postgres://test');
    fake.responses.push({ rows: [ENTRY_ROW] });
    await expect(store.findByIdForUser(ENTRY_ROW.id, ENTRY_ROW.user_id)).resolves.toMatchObject({
      id: ENTRY_ROW.id,
    });
    const call = fake.calls[0];
    expect(call.text).toContain('je.user_id = $2');
    expect(call.text).toContain('je.shared_with_partner = true');
    expect(call.text).toContain('p.partner_user_id = $2');
    expect(call.text).toContain('FROM pregnancies p');

    fake.responses.push({ rows: [] });
    await expect(store.findByIdForUser(ENTRY_ROW.id, 'other-user')).resolves.toBeNull();
  });

  it('lists the timeline newest-first with keyset pagination over (created_at, id)', async () => {
    const store = createPostgresJournalStore('postgres://test');
    fake.responses.push({
      rows: [{ ...ENTRY_ROW, id: '00000000-0000-4000-8000-000000000002' }, ENTRY_ROW],
    });
    const page = await store.listForUser(ENTRY_ROW.user_id, { pageSize: 2 });
    expect(page.items).toHaveLength(2);
    expect(page.nextCursor).toBeNull();

    const call = fake.calls[0];
    expect(call.text).toContain('je.user_id = $1');
    expect(call.text).toContain('ORDER BY je.created_at DESC, je.id DESC');
    expect(call.text).toContain('LIMIT $2');
    expect(call.values).toEqual([ENTRY_ROW.user_id, 3]); // pageSize + 1

    // Second page with a cursor anchors strictly after (created_at, id).
    fake.responses.push({ rows: [ENTRY_ROW] });
    const cursor = Buffer.from(
      JSON.stringify({
        userId: ENTRY_ROW.user_id,
        createdAt: (ENTRY_ROW.created_at as Date).toISOString(),
        id: ENTRY_ROW.id,
      }),
    ).toString('base64url');
    await store.listForUser(ENTRY_ROW.user_id, {
      pageSize: 2,
      cursor,
    });
    expect(fake.calls[1].text).toContain('(je.created_at, je.id) < ($2, $3)');
    expect(fake.calls[1].values).toHaveLength(4);
  });

  it('updates only owner rows with parameterized sets and throws NotFoundError otherwise', async () => {
    const store = createPostgresJournalStore('postgres://test');
    fake.responses.push({
      rows: [{ ...ENTRY_ROW, content: 'updated', pregnancy_week: null }],
    });
    const updated = await store.updateEntry(ENTRY_ROW.id, ENTRY_ROW.user_id, {
      content: 'updated',
      pregnancyWeek: null,
    });
    expect(updated.content).toBe('updated');
    expect(updated.pregnancyWeek).toBeNull();
    const call = fake.calls[0];
    expect(call.text).toContain('UPDATE journal_entries');
    expect(call.text).toContain('content = $1');
    expect(call.text).toContain('pregnancy_week = $2');
    expect(call.text).toContain('WHERE id = $3 AND user_id = $4');
    expect(call.text).toContain('updated_at = now()');

    fake.responses.push({ rows: [] });
    await expect(
      store.updateEntry(ENTRY_ROW.id, 'not-the-owner', { content: 'x' }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('deletes only owner rows and throws NotFoundError when nothing matched', async () => {
    const store = createPostgresJournalStore('postgres://test');
    fake.responses.push({ rows: [], rowCount: 1 });
    await expect(store.deleteEntry(ENTRY_ROW.id, ENTRY_ROW.user_id)).resolves.toBeUndefined();
    expect(fake.calls[0].text).toContain(
      'DELETE FROM journal_entries WHERE id = $1 AND user_id = $2',
    );

    fake.responses.push({ rows: [], rowCount: 0 });
    await expect(store.deleteEntry(ENTRY_ROW.id, 'not-the-owner')).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });

  it('lists all owner entries ascending (export source, FR-057)', async () => {
    const store = createPostgresJournalStore('postgres://test');
    fake.responses.push({ rows: [ENTRY_ROW] });
    const all = await store.listAllForUser(ENTRY_ROW.user_id);
    expect(all).toHaveLength(1);
    const call = fake.calls[0];
    expect(call.text).toContain('je.user_id = $1');
    expect(call.text).toContain('ORDER BY je.created_at ASC, je.id ASC');
  });

  it('pings the database and reports failure', async () => {
    const store = createPostgresJournalStore('postgres://test');
    fake.responses.push({ rows: [] });
    await expect(store.ping()).resolves.toBe(true);
    expect(fake.calls[0].text).toBe('SELECT 1');

    fake.errors.push({ at: 2 });
    await expect(store.ping()).resolves.toBe(false);
  });

  it('dispose ends the pool', async () => {
    const store = createPostgresJournalStore('postgres://test');
    await store.dispose();
    expect(fake.ended).toBe(true);
  });
});
