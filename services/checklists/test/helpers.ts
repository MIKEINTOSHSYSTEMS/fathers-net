import type { Logger } from '@fathersnet/logger';

const noop = (): void => {};

/** Logger that records nothing; for service/store unit tests. */
export function createNoopLogger(): Logger {
  return {
    trace: noop,
    debug: noop,
    info: noop,
    warn: noop,
    error: noop,
    fatal: noop,
    child: () => createNoopLogger(),
    pino: () => ({ child: () => ({ level: 30, child: () => ({}) as never }) }) as never,
  };
}
