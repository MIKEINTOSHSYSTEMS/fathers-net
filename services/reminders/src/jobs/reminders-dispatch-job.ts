import type Redis from 'ioredis';
import type { Logger } from '@fathersnet/logger';
import { createInMemoryEventBus, createRedisEventBus, type EventBus } from '@fathersnet/events';
import { loadRemindersConfig, type RemindersConfig } from '../config';
import { createReminderService, type ReminderService } from '../engine/reminder-service';
import { createStubDispatcher } from '../services/dispatcher';
import { createRedisClient } from '../services/redis';
import { createRemindersRelay } from '../services/relay';
import { createReminderStore } from '../store';

/**
 * Structural match of the scheduler's `JobDefinition` (WP-024b). The scheduler
 * service depends on `@fathersnet/reminders` — not the reverse — so the job
 * factory duck-types the contract instead of importing the scheduler package.
 */
export interface ReminderJobDefinition {
  name: string;
  intervalSeconds: number;
  run(ctx: { runId: string; scheduledFor: string; attempt: number }): Promise<void>;
}

export interface CreateRemindersJobsOptions {
  logger?: Logger;
  /** Test seams — inject a service/config instead of building from env. */
  service?: ReminderService;
  config?: RemindersConfig;
}

/**
 * Build the `reminders.dispatch` scheduler job (WP-021 §2). The factory
 * self-configures from `FN_REMINDERS_*` env — the scheduler host needs no new
 * scheduler-config keys (risk R3) — wiring the reminder store (Postgres in
 * production, memory in dev/CI, M-08), the stub channel dispatcher (R8), and
 * the `reminder.due` outbox relay (WP-024c). Run-id binding is the FR-163
 * idempotency guard: re-runs of the same slot cannot double-dispatch because
 * the store claim + `UNIQUE(instance_id, run_id)` reject them.
 *
 * When the factory builds its own service the store pool, bus, and relay are
 * process-scoped: the scheduler host terminates the process on shutdown, which
 * releases the OS resources. A dispose hook is deliberately out of scope here.
 */
export function createRemindersJobs(
  options: CreateRemindersJobsOptions = {},
): ReminderJobDefinition[] {
  const config = options.config ?? loadRemindersConfig(process.env);
  const logger = options.logger;
  const service = options.service ?? buildOwnedService(config, logger);

  return [
    {
      name: 'reminders.dispatch',
      intervalSeconds: config.FN_REMINDERS_JOB_INTERVAL_SECONDS,
      run: async (ctx) => {
        const started = Date.now();
        const result = await service.runDispatchCycle(ctx.runId);
        logger?.info('reminders.dispatch_cycle', 'reminder dispatch cycle complete', {
          run_id: ctx.runId,
          attempt: ctx.attempt,
          expired: result.expired,
          selected: result.selected,
          dispatched: result.outcomes.dispatched,
          skipped_quiet_hours: result.outcomes.skippedQuietHours,
          rate_limited: result.outcomes.rateLimited,
          failed: result.outcomes.failed,
          conflict: result.outcomes.conflict,
          duration_ms: Date.now() - started,
        });
      },
    },
  ];
}

function buildOwnedService(config: RemindersConfig, logger: Logger | undefined): ReminderService {
  const usePostgres = config.FN_STORE_DRIVER === 'postgres';
  const redis: Redis | null = usePostgres ? createRedisClient(config.FN_REDIS_URL) : null;
  const bus: EventBus =
    usePostgres && redis
      ? createRedisEventBus({ client: redis, logger })
      : createInMemoryEventBus();
  const store = createReminderStore({
    driver: config.FN_STORE_DRIVER,
    databaseUrl: config.FN_DATABASE_URL,
  });
  if (usePostgres) {
    void createRemindersRelay({ bus, logger, connectionString: config.FN_DATABASE_URL })
      .start()
      .catch((err: unknown) => {
        logger?.error('outbox.relay_start_failed', 'Outbox relay failed to start', {
          error: String(err),
        });
      });
  }
  const dispatcher = createStubDispatcher(logger);
  return createReminderService({ store, dispatcher, logger, config });
}
