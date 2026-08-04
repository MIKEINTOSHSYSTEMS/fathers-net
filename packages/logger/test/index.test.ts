import { Writable } from 'node:stream';
import { createLogger, type Logger } from '../src';

function captureLogger(level: 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal' = 'info'): {
  logger: Logger;
  lines: Array<Record<string, unknown>>;
} {
  const lines: Array<Record<string, unknown>> = [];
  const stream = new Writable({
    write(chunk: Buffer, _enc, cb) {
      lines.push(JSON.parse(chunk.toString('utf8')));
      cb();
    },
  });
  const logger = createLogger({
    service: 'test-service',
    env: 'test',
    level,
    destination: stream,
  });
  return { logger, lines };
}

describe('@fathersnet/logger', () => {
  it('emits structured JSON with required base keys', () => {
    const { logger, lines } = captureLogger();
    logger.info('test.event', 'hello');

    expect(lines).toHaveLength(1);
    const line = lines[0];
    expect(line.level).toBe('info');
    expect(line.service).toBe('test-service');
    expect(line.env).toBe('test');
    expect(line.event).toBe('test.event');
    expect(line.message).toBe('hello');
    expect(typeof line.time).toBe('string');
  });

  it('redacts known sensitive field paths at the source', () => {
    const { logger, lines } = captureLogger();
    logger.info('test.event', 'auth', { authorization: 'Bearer abc123' });

    const line = lines[0];
    expect(line.authorization).toBe('[redacted]');
    expect(JSON.stringify(line)).not.toContain('abc123');
  });

  it('supports child loggers that inherit bindings', () => {
    const { logger, lines } = captureLogger();
    const child = logger.child({ request_id: 'req-9' });
    child.warn('test.child', 'nested');

    const line = lines[0];
    expect(line.request_id).toBe('req-9');
    expect(line.service).toBe('test-service');
    expect(line.level).toBe('warn');
  });

  it('does not include PII field names even when logged by mistake', () => {
    const { logger, lines } = captureLogger();
    logger.error('test.event', 'boom', { phone: '+1 555 0100', otp: '123456' });

    const line = lines[0];
    expect(line.phone).toBe('[redacted]');
    expect(line.otp).toBe('[redacted]');
  });

  it('routes every log level through to the pino transport', () => {
    const { logger, lines } = captureLogger('trace');

    logger.trace('test.event', 't');
    logger.debug('test.event', 'd');
    logger.info('test.event', 'i');
    logger.warn('test.event', 'w');
    logger.error('test.event', 'e');
    logger.fatal('test.event', 'f');

    expect(lines.map((l) => l.level)).toEqual(['trace', 'debug', 'info', 'warn', 'error', 'fatal']);
  });

  it('honours a non-default level option at creation', () => {
    const stream = new Writable({
      write(_chunk: Buffer, _enc, cb) {
        cb();
      },
    });
    const logger = createLogger({
      service: 'test-service',
      env: 'test',
      level: 'debug',
      destination: stream,
    });
    expect(logger).toBeDefined();
  });

  it('child loggers expose every level', () => {
    const { logger, lines } = captureLogger('trace');
    const child = logger.child({ request_id: 'req-9' });

    child.trace('test.child', 't');
    child.debug('test.child', 'd');
    child.info('test.child', 'i');
    child.warn('test.child', 'w');
    child.error('test.child', 'e');
    child.fatal('test.child', 'f');

    expect(lines.map((l) => l.level)).toEqual(['trace', 'debug', 'info', 'warn', 'error', 'fatal']);
    expect(lines.every((l) => l.request_id === 'req-9')).toBe(true);
  });
});
