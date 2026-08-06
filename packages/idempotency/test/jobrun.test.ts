import Redis from 'ioredis';

import { createJobRunStore } from '../src';

const REDIS_TEST_URL = process.env.REDIS_TEST_URL;
const describeRedis = REDIS_TEST_URL ? describe : describe.skip;

describe('@fathersnet/idempotency scheduler run-id binding (FR-163)', () => {
  it('memory: claims a run id exactly once', async () => {
    const store = createJobRunStore({ driver: 'memory', name: 'prompts' });
    try {
      await expect(store.claimRun('run-2026-08-06-01', 3600)).resolves.toBe(true);
      await expect(store.claimRun('run-2026-08-06-01', 3600)).resolves.toBe(false);
    } finally {
      await store.dispose();
    }
  });

  it('memory: distinct run ids are each claimable', async () => {
    const store = createJobRunStore({ driver: 'memory', name: 'prompts' });
    try {
      await expect(store.claimRun('run-a', 3600)).resolves.toBe(true);
      await expect(store.claimRun('run-b', 3600)).resolves.toBe(true);
    } finally {
      await store.dispose();
    }
  });

  it('memory: runs are isolated per scheduler job name', async () => {
    const a = createJobRunStore({ driver: 'memory', name: 'prompts' });
    const b = createJobRunStore({ driver: 'memory', name: 'reminders' });
    try {
      await expect(a.claimRun('run-1', 3600)).resolves.toBe(true);
      await expect(b.claimRun('run-1', 3600)).resolves.toBe(true);
    } finally {
      await a.dispose();
      await b.dispose();
    }
  });
});

describeRedis('@fathersnet/idempotency scheduler run-id binding (redis)', () => {
  let client: Redis;

  beforeAll(() => {
    client = new Redis(REDIS_TEST_URL as string);
  });

  afterAll(async () => {
    await client.quit();
  });

  afterEach(async () => {
    await client.flushall();
  });

  it('claims a run id exactly once across relay restarts', async () => {
    const first = createJobRunStore({ driver: 'redis', redis: client, name: 'prompts' });
    const second = createJobRunStore({ driver: 'redis', redis: client, name: 'prompts' });
    try {
      await expect(first.claimRun('run-2026-08-06-01', 3600)).resolves.toBe(true);
      await expect(second.claimRun('run-2026-08-06-01', 3600)).resolves.toBe(false);
    } finally {
      await first.dispose();
      await second.dispose();
    }
  });
});
