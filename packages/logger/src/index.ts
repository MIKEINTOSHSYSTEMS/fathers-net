import pino from 'pino';

export type LogLevel = 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal';

export interface LoggerOptions {
  service: string;
  env: string;
  level?: LogLevel;
  base?: Record<string, unknown>;
  /** Destination stream (defaults to stdout). Used by tests/transports. */
  destination?: pino.DestinationStream;
}

/**
 * Structured JSON logger. Every log line carries the required keys from
 * engineering-standards.md §6: ts, level, request_id, service, env, event,
 * message. Forbidden in logs: phone numbers, tokens, JWT bodies, message
 * content, OTP values, full names, any PII (FR-022, §14.3). Known sensitive
 * field paths are redacted at source as defense-in-depth; callers must still
 * never pass PII.
 */
export interface Logger {
  trace(event: string, message: string, fields?: Record<string, unknown>): void;
  debug(event: string, message: string, fields?: Record<string, unknown>): void;
  info(event: string, message: string, fields?: Record<string, unknown>): void;
  warn(event: string, message: string, fields?: Record<string, unknown>): void;
  error(event: string, message: string, fields?: Record<string, unknown>): void;
  fatal(event: string, message: string, fields?: Record<string, unknown>): void;
  child(bindings: Record<string, unknown>): Logger;
  /** Underlying pino instance (e.g. for Fastify logger option). */
  pino(): pino.Logger;
}

const REDACT_PATHS = [
  'req.headers.authorization',
  'authorization',
  'password',
  'token',
  'access_token',
  'refresh_token',
  'otp',
  'otp_code',
  'phone',
  'phone_e164',
  'secret',
  'api_key',
  'message_content',
];

function toPinoLevel(level: LogLevel): pino.Level {
  switch (level) {
    case 'trace':
      return 'trace';
    case 'debug':
      return 'debug';
    case 'info':
      return 'info';
    case 'warn':
      return 'warn';
    case 'error':
      return 'error';
    case 'fatal':
      return 'fatal';
  }
}

export function createLogger(options: LoggerOptions): Logger {
  const { service, env } = options;
  const destination = options.destination ?? pino.destination();
  const pinoLogger = pino(
    {
      level: toPinoLevel(options.level ?? 'info'),
      base: {
        service,
        env,
        ...options.base,
      },
      redact: { paths: REDACT_PATHS, censor: '[redacted]' },
      timestamp: pino.stdTimeFunctions.isoTime,
      formatters: {
        level: (label) => ({ level: label }),
      },
      messageKey: 'message',
    },
    destination,
  );

  const emit = (level: LogLevel) => {
    return (event: string, message: string, fields?: Record<string, unknown>) => {
      // eslint-disable-next-line security/detect-object-injection -- `level` is a member of the closed LogLevel union, never user input.
      pinoLogger[level]({ event, ...fields }, message);
    };
  };

  const logger: Logger = {
    trace: emit('trace'),
    debug: emit('debug'),
    info: emit('info'),
    warn: emit('warn'),
    error: emit('error'),
    fatal: emit('fatal'),
    child(bindings: Record<string, unknown>): Logger {
      const child = pinoLogger.child(bindings);
      return {
        ...logger,
        trace: (e, m, f) => child.trace({ event: e, ...f }, m),
        debug: (e, m, f) => child.debug({ event: e, ...f }, m),
        info: (e, m, f) => child.info({ event: e, ...f }, m),
        warn: (e, m, f) => child.warn({ event: e, ...f }, m),
        error: (e, m, f) => child.error({ event: e, ...f }, m),
        fatal: (e, m, f) => child.fatal({ event: e, ...f }, m),
        pino: () => child,
      };
    },
    pino: () => pinoLogger,
  };

  return logger;
}

export type { pino as Pino };
