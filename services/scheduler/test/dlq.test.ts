import { createJobDlq, createMemoryJobDlq } from '../src/scheduler/dlq';

describe('in-memory job DLQ (M-08 double)', () => {
  it('pushes, counts, and lists entries newest-first', async () => {
    const dlq = createMemoryJobDlq();
    await dlq.push({
      job: 'a',
      runId: 'a:1',
      scheduledFor: '2026-08-07T00:00:00.000Z',
      attempts: 3,
      error: 'e1',
      failedAt: '2026-08-07T00:00:01.000Z',
    });
    await dlq.push({
      job: 'b',
      runId: 'b:1',
      scheduledFor: '2026-08-07T00:01:00.000Z',
      attempts: 2,
      error: 'e2',
      failedAt: '2026-08-07T00:00:02.000Z',
    });
    await expect(dlq.len()).resolves.toBe(2);
    const entries = await dlq.list();
    expect(entries.map((entry) => entry.job)).toEqual(['b', 'a']);
    await dlq.dispose();
  });

  it('respects the list limit', async () => {
    const dlq = createMemoryJobDlq();
    for (let i = 0; i < 5; i += 1) {
      await dlq.push({
        job: `j${i}`,
        runId: `j${i}:1`,
        scheduledFor: '',
        attempts: 1,
        error: '',
        failedAt: '',
      });
    }
    const entries = await dlq.list(2);
    expect(entries).toHaveLength(2);
    await dlq.dispose();
  });

  it('returns an empty list when empty', async () => {
    const dlq = createMemoryJobDlq();
    await expect(dlq.list()).resolves.toEqual([]);
    await dlq.dispose();
  });
});

describe('job DLQ factory', () => {
  it('falls back to the memory double for the memory driver', () => {
    const dlq = createJobDlq({ driver: 'memory' });
    expect(dlq).toBeDefined();
    void dlq.dispose();
  });
});
