import { createTestLogger } from '@fathersnet/test-utils';
import type { RemindersConfig } from '../src/config';
import type { ReminderService } from '../src/engine/reminder-service';
import { createRemindersJobs } from '../src/jobs/reminders-dispatch-job';

function buildConfig(overrides: Partial<RemindersConfig> = {}): RemindersConfig {
  return {
    ENV: 'dev',
    FN_PORT: 3500,
    FN_HOST: '0.0.0.0',
    FN_SERVICE_NAME: 'reminders',
    FN_VERSION: '0.1.0',
    LOG_LEVEL: 'info',
    FN_STORE_DRIVER: 'memory',
    FN_REDIS_URL: 'redis://127.0.0.1:6379',
    FN_DATABASE_URL: 'postgres://test',
    FN_REMINDERS_JWT_SECRET: 'secret',
    FN_REMINDERS_ISSUER: 'fathersnet',
    FN_REMINDERS_AUDIENCE: 'fathersnet-api',
    FN_REMINDERS_DAILY_CAP: 5,
    FN_REMINDERS_TZ_OFFSET_MINUTES: 180,
    FN_REMINDERS_QUIET_HOURS_ENABLED: true,
    FN_REMINDERS_QUIET_HOURS_START: '21:00',
    FN_REMINDERS_QUIET_HOURS_END: '07:00',
    FN_REMINDERS_EXPIRY_MINUTES: 60,
    FN_REMINDERS_JOB_INTERVAL_SECONDS: 60,
    FN_REMINDERS_DISPATCH_BATCH_LIMIT: 100,
    FN_REMINDERS_MAX_WEEK: 45,
    ...overrides,
  };
}

const EMPTY_RESULT = {
  expired: 0,
  selected: 0,
  outcomes: {
    dispatched: 0,
    skippedQuietHours: 0,
    rateLimited: 0,
    failed: 0,
    conflict: 0,
  },
};

describe('reminders dispatch job factory (scheduler extension point)', () => {
  it('registers one reminders.dispatch job with the configured interval', () => {
    const config = buildConfig({ FN_REMINDERS_JOB_INTERVAL_SECONDS: 120 });
    const jobs = createRemindersJobs({ config });
    expect(jobs).toHaveLength(1);
    expect(jobs[0]).toMatchObject({ name: 'reminders.dispatch', intervalSeconds: 120 });
  });

  it('runs the dispatch cycle for a scheduler slot through the injected service', async () => {
    const runDispatchCycle = jest.fn().mockResolvedValue(EMPTY_RESULT);
    const service = { runDispatchCycle } as unknown as ReminderService;
    const config = buildConfig();
    const jobs = createRemindersJobs({ config, service });

    await jobs[0].run({ runId: 'run-abc', scheduledFor: '2025-01-01T10:00:00Z', attempt: 1 });
    expect(runDispatchCycle).toHaveBeenCalledWith('run-abc');
  });

  it('self-configures hermetically on the memory driver (M-08)', async () => {
    const { logger, logs } = createTestLogger('info');
    const config = buildConfig({ FN_STORE_DRIVER: 'memory' });
    const jobs = createRemindersJobs({ config, logger });

    await expect(
      jobs[0].run({ runId: 'run-def', scheduledFor: '2025-01-01T10:00:00Z', attempt: 1 }),
    ).resolves.toBeUndefined();
    expect(logs.some((entry) => entry.event === 'reminders.dispatch_cycle')).toBe(true);
  });
});
