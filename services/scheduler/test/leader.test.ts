import { createLeaderElector, createMemoryLeaderElector } from '../src/scheduler/leader';

describe('in-memory leader elector (M-08 double)', () => {
  it('acquires leadership once per instance', async () => {
    const elector = createMemoryLeaderElector();
    await expect(elector.tryAcquire()).resolves.toBe(true);
    await expect(elector.tryAcquire()).resolves.toBe(false);
    await elector.dispose();
  });

  it('reports leadership and renews while held', async () => {
    const elector = createMemoryLeaderElector();
    await elector.tryAcquire();
    await expect(elector.isLeader()).resolves.toBe(true);
    await expect(elector.renew()).resolves.toBeUndefined();
    await elector.dispose();
  });

  it('releases leadership so the next acquire succeeds', async () => {
    const elector = createMemoryLeaderElector();
    await elector.tryAcquire();
    await elector.release();
    await expect(elector.isLeader()).resolves.toBe(false);
    await expect(elector.tryAcquire()).resolves.toBe(true);
    await elector.dispose();
  });

  it('throws on renew after leadership is lost', async () => {
    const elector = createMemoryLeaderElector();
    await elector.tryAcquire();
    await elector.release();
    await expect(elector.renew()).rejects.toThrow('lease');
    await elector.dispose();
  });
});

describe('leader elector factory', () => {
  it('falls back to the memory double for the memory driver', () => {
    const elector = createLeaderElector({ driver: 'memory' });
    expect(elector).toBeDefined();
    void elector.dispose();
  });
});
