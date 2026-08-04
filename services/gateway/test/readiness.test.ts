import { createReadinessRegistry } from '../src/services/readiness';

describe('readiness registry', () => {
  it('reports ready when all registered probes pass', async () => {
    const registry = createReadinessRegistry();
    registry.register('postgres', async () => ({ name: 'postgres', status: 'up' }));
    registry.register('redis', async () => ({ name: 'redis', status: 'up' }));

    const result = await registry.checkAll();
    expect(result.status).toBe('ready');
    expect(result.checks).toHaveLength(2);
    expect(result.checks.every((c) => c.status === 'up')).toBe(true);
  });

  it('reports not_ready when any probe fails', async () => {
    const registry = createReadinessRegistry();
    registry.register('postgres', async () => ({ name: 'postgres', status: 'up' }));
    registry.register('redis', async () => ({ name: 'redis', status: 'down' }));

    const result = await registry.checkAll();
    expect(result.status).toBe('not_ready');
  });

  it('treats a throwing probe as down', async () => {
    const registry = createReadinessRegistry();
    registry.register('qdrant', async () => {
      throw new Error('connection refused');
    });

    const result = await registry.checkAll();
    expect(result.status).toBe('not_ready');
    expect(result.checks[0]).toMatchObject({ name: 'qdrant', status: 'down' });
  });

  it('records latency for each probe', async () => {
    const registry = createReadinessRegistry();
    registry.register('redis', async () => ({ name: 'redis', status: 'up' }));

    const result = await registry.checkAll();
    expect(result.checks[0].latency_ms).toBeGreaterThanOrEqual(0);
  });
});
