import { loadSchedulerConfig } from '../src/config';
import { createSchedulerRuntime } from '../src/scheduler/runtime';
import { createTestLogger } from '@fathersnet/test-utils';

describe('scheduler runtime assembly', () => {
  it('registers jobs and runs them with the memory driver (M-08)', async () => {
    const config = loadSchedulerConfig({});
    const { logger } = createTestLogger();
    let ran = 0;
    const runtime = createSchedulerRuntime({
      config,
      logger,
      nowMs: () => 60_000,
      jobs: [
        {
          name: 'sync',
          intervalSeconds: 60,
          run: async () => {
            ran += 1;
          },
        },
      ],
    });
    expect(runtime.registry.size).toBe(1);
    const summary = await runtime.worker.runOnce();
    expect(summary.started).toBe(1);
    expect(ran).toBe(1);
    await runtime.stop();
  });

  it('start/stop exercises the background loop and leadership path', async () => {
    const config = loadSchedulerConfig({ FN_SCHEDULER_DRIVER: 'memory' });
    const { logger } = createTestLogger();
    const runtime = createSchedulerRuntime({ config, logger, jobs: [] });
    await runtime.start();
    expect(runtime.registry.size).toBe(0);
    await runtime.stop();
  });
});
