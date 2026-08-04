import { createRequestId, createTestLogger } from '../src';

describe('@fathersnet/test-utils', () => {
  describe('createTestLogger', () => {
    it('captures structured records', () => {
      const { logger, logs } = createTestLogger();
      logger.info('app.started', 'up', { port: 3000 });
      expect(logs).toHaveLength(1);
      expect(logs[0]).toMatchObject({ level: 'info', event: 'app.started', message: 'up' });
      expect(logs[0].fields).toEqual({ port: 3000 });
    });

    it('records every base log level', () => {
      const { logger, logs } = createTestLogger();
      logger.trace('e', 't');
      logger.debug('e', 'd');
      logger.info('e', 'i');
      logger.warn('e', 'w');
      logger.error('e', 'e');
      logger.fatal('e', 'f');

      expect(logs.map((l) => l.level)).toEqual([
        'trace',
        'debug',
        'info',
        'warn',
        'error',
        'fatal',
      ]);
    });

    it('child loggers merge bindings into fields', () => {
      const { logger, logs } = createTestLogger();
      logger.child({ request_id: 'r1' }).warn('app.warn', 'careful', { cause: 'x' });
      expect(logs[0].fields).toMatchObject({ request_id: 'r1', cause: 'x' });
    });

    it('supports nested child loggers with merged bindings', () => {
      const { logger, logs } = createTestLogger();
      logger.child({ request_id: 'r1' }).child({ flow: 'registration' }).error('app.error', 'boom');

      expect(logs[0].fields).toMatchObject({ request_id: 'r1', flow: 'registration' });
      expect(logs[0].level).toBe('error');
    });

    it('exposes the underlying pino instance', () => {
      const { logger, pino } = createTestLogger();
      expect(pino).toBeDefined();
      expect(logger.pino()).toBe(pino);
    });
  });

  describe('createRequestId', () => {
    it('produces URL-safe ids of length 21', () => {
      const id = createRequestId();
      expect(id).toHaveLength(21);
      expect(id).toMatch(/^[A-Za-z0-9]+$/);
    });
  });
});
