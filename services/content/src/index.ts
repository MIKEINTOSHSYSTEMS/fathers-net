import { createLogger } from '@fathersnet/logger';
import { loadContentConfig } from './config';
import { buildContentApp } from './app';

const config = loadContentConfig(process.env);
const logger = createLogger({
  service: config.FN_SERVICE_NAME,
  env: config.ENV,
  level: config.LOG_LEVEL,
});

async function main(): Promise<void> {
  const app = await buildContentApp({ config, logger });

  const shutdown = async (signal: string): Promise<void> => {
    logger.info('app.shutdown', 'shutting down', { signal });
    await app.close();
    process.exit(0);
  };

  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));

  try {
    await app.listen({ host: config.FN_HOST, port: config.FN_PORT });
    logger.info('app.started', 'content service listening', {
      host: config.FN_HOST,
      port: config.FN_PORT,
      version: config.FN_VERSION,
    });
  } catch (err) {
    logger.error('app.fatal', 'failed to start content service', { err: String(err) });
    process.exit(1);
  }
}

void main();
