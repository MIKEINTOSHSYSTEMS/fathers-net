import { createLogger, type Logger } from '@fathersnet/logger';

export interface RecordedLog {
  level: string;
  event: string;
  message: string;
  fields: Record<string, unknown>;
}

/**
 * In-memory logger for tests. Captures every line as a structured record so
 * assertions can verify event names, levels, and redacted-free fields.
 */
export function createTestLogger(level: 'debug' | 'info' | 'warn' | 'error' = 'info'): {
  logger: Logger;
  logs: RecordedLog[];
  pino: ReturnType<ReturnType<typeof createLogger>['pino']>;
} {
  const logs: RecordedLog[] = [];
  const pinoLogger = createLogger({
    service: 'test',
    env: 'test',
    level,
  });
  const pino = pinoLogger.pino();
  const logger: Logger = {
    trace: (e, m, f) => logs.push({ level: 'trace', event: e, message: m, fields: f ?? {} }),
    debug: (e, m, f) => logs.push({ level: 'debug', event: e, message: m, fields: f ?? {} }),
    info: (e, m, f) => logs.push({ level: 'info', event: e, message: m, fields: f ?? {} }),
    warn: (e, m, f) => logs.push({ level: 'warn', event: e, message: m, fields: f ?? {} }),
    error: (e, m, f) => logs.push({ level: 'error', event: e, message: m, fields: f ?? {} }),
    fatal: (e, m, f) => logs.push({ level: 'fatal', event: e, message: m, fields: f ?? {} }),
    child: (bindings) => {
      const baseFields = bindings;
      return {
        ...logger,
        child: (inner) => logger.child({ ...baseFields, ...inner }),
        trace: (e, m, f) =>
          logs.push({ level: 'trace', event: e, message: m, fields: { ...baseFields, ...f } }),
        debug: (e, m, f) =>
          logs.push({ level: 'debug', event: e, message: m, fields: { ...baseFields, ...f } }),
        info: (e, m, f) =>
          logs.push({ level: 'info', event: e, message: m, fields: { ...baseFields, ...f } }),
        warn: (e, m, f) =>
          logs.push({ level: 'warn', event: e, message: m, fields: { ...baseFields, ...f } }),
        error: (e, m, f) =>
          logs.push({ level: 'error', event: e, message: m, fields: { ...baseFields, ...f } }),
        fatal: (e, m, f) =>
          logs.push({ level: 'fatal', event: e, message: m, fields: { ...baseFields, ...f } }),
      };
    },
    pino: () => pino,
  };
  return { logger, logs, pino };
}

/** 21-char URL-safe request id generator for tests and dev scaffolding. */
export function createRequestId(): string {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let id = '';
  for (let i = 0; i < 21; i += 1) {
    id += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return id;
}

export { createLogger, type Logger };
