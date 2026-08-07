import { createLogger } from '@fathersnet/logger';
import { buildRemindersApp } from './app';
import { loadRemindersConfig } from './config';

const config = loadRemindersConfig(process.env);
const logger = createLogger({
  service: config.FN_SERVICE_NAME,
  env: config.ENV,
  level: config.LOG_LEVEL,
});

async function main(): Promise<void> {
  const app = await buildRemindersApp({ config, logger });

  const shutdown = async (signal: string): Promise<void> => {
    logger.info('app.shutdown', 'shutting down', { signal });
    await app.close();
    process.exit(0);
  };

  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));

  try {
    await app.listen({ host: config.FN_HOST, port: config.FN_PORT });
    logger.info('app.started', 'reminders service listening', {
      host: config.FN_HOST,
      port: config.FN_PORT,
      version: config.FN_VERSION,
      driver: config.FN_STORE_DRIVER,
    });
  } catch (err) {
    logger.error('app.fatal', 'failed to start reminders service', { err: String(err) });
    process.exit(1);
  }
}

void main();
