import { Client } from 'pg';
import { OutboxRelay, PostgresOutboxReader, type EventBus } from '@fathersnet/events';
import type { Logger } from '@fathersnet/logger';

export interface RemindersRelay {
  relay: OutboxRelay;
  client: Client;
  /** Connect the reader client and start polling. Awaited on the app boot
   *  path; the job factory may fire-and-forget it (the scheduler host
   *  terminates the process on shutdown, which releases the socket). */
  start(): Promise<void>;
  stop(): Promise<void>;
}

/**
 * Outbox relay wiring for the `reminder_outbox` table (WP-024c, D-03). The
 * store writes `reminder.due` rows atomically with each ack transaction; this
 * relay reads committed `pending`/`failed` rows, publishes them to the bus,
 * and marks them `published` — publish-on-commit without a dual-write hazard.
 * `onDead` is the OR-008 alerting surface (dead-letter after `maxAttempts`);
 * the current sink is an error log, upgraded when an alerting channel ships.
 */
export function createRemindersRelay(options: {
  bus: EventBus;
  logger?: Logger;
  connectionString: string;
}): RemindersRelay {
  const client = new Client({ connectionString: options.connectionString });
  const relay = new OutboxRelay({
    bus: options.bus,
    reader: new PostgresOutboxReader(client, 'reminder_outbox'),
    logger: options.logger,
    onDead: async (row, error) => {
      options.logger?.error('outbox.dead_alert', 'Outbox row dead-lettered (OR-008)', {
        event_id: row.event_id,
        event_type: row.event_type,
        error: error.message,
      });
    },
  });
  return {
    relay,
    client,
    async start(): Promise<void> {
      await client.connect();
      relay.start();
    },
    async stop(): Promise<void> {
      await relay.stop();
      await client.end();
    },
  };
}
