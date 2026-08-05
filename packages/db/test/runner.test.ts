import { runner } from 'node-pg-migrate';
import { Client } from 'pg';

import { checkMigrations, runMigrations } from '../src';

jest.mock('node-pg-migrate', () => ({
  runner: jest.fn().mockResolvedValue(undefined),
}));

interface MockClientInstance {
  calls: string[];
  results: Array<{ rows: Record<string, unknown>[] }>;
  connected: boolean;
  ended: boolean;
  connect(): Promise<void>;
  query(sql: string): Promise<{ rows: Record<string, unknown>[] }>;
  end(): Promise<void>;
}

jest.mock('pg', () => {
  const instances: MockClientInstance[] = [];
  class MockClient implements MockClientInstance {
    calls: string[] = [];
    results: Array<{ rows: Record<string, unknown>[] }> = [];
    connected = false;
    ended = false;

    async connect(): Promise<void> {
      this.connected = true;
    }

    async query(sql: string): Promise<{ rows: Record<string, unknown>[] }> {
      this.calls.push(sql);
      return this.results.shift() ?? { rows: [] };
    }

    async end(): Promise<void> {
      this.ended = true;
    }
  }
  const ClientCtor = jest.fn(() => {
    const instance = new MockClient();
    instances.push(instance);
    return instance;
  });
  (ClientCtor as unknown as { instances: MockClientInstance[] }).instances = instances;
  return { Client: ClientCtor };
});

const MockClient = Client as unknown as { instances: MockClientInstance[] };

function lastClient(): MockClientInstance {
  const instances = MockClient.instances;
  return instances[instances.length - 1];
}

describe('runMigrations', () => {
  it('connects, runs the runner with defaults, and closes the client', async () => {
    const code = await runMigrations({ databaseUrl: 'postgres://x' });
    expect(code).toBe(0);
    const client = lastClient();
    expect(client.connected).toBe(true);
    expect(client.ended).toBe(true);
    expect(runner).toHaveBeenCalledWith(
      expect.objectContaining({
        direction: 'up',
        migrationsTable: 'pgmigrations',
        count: Infinity,
        dir: expect.stringMatching(/migrations$/),
      }),
    );
  });

  it('honours the requested direction and count', async () => {
    await runMigrations({
      databaseUrl: 'postgres://x',
      direction: 'down',
      count: 1,
    });
    expect(runner).toHaveBeenLastCalledWith(
      expect.objectContaining({ direction: 'down', count: 1 }),
    );
  });

  it('closes the client even when the runner throws', async () => {
    (runner as jest.Mock).mockRejectedValueOnce(new Error('boom'));
    await expect(runMigrations({ databaseUrl: 'postgres://x' })).rejects.toThrow('boom');
    expect(lastClient().ended).toBe(true);
  });
});

describe('checkMigrations', () => {
  it('reports tableExists false when the tracking table is missing', async () => {
    const result = await checkMigrations('postgres://x');
    expect(result.tableExists).toBe(false);
    expect(result.applied).toEqual([]);
    const client = lastClient();
    expect(client.calls[0]).toContain('to_regclass');
    expect(client.ended).toBe(true);
  });

  it('reports applied migrations when the tracking table exists', async () => {
    const pending = checkMigrations('postgres://x');
    const client = lastClient();
    client.results = [
      { rows: [{ table_name: 'pgmigrations' }] },
      { rows: [{ name: '001-create-users' }, { name: '002-add-pregnancies' }] },
    ];
    const result = await pending;
    expect(result.tableExists).toBe(true);
    expect(result.applied).toEqual(['001-create-users', '002-add-pregnancies']);
  });
});
