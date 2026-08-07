import { ENV_FIELD, loadConfig, type EnvName } from '@fathersnet/config';

export interface SchedulerConfig {
  ENV: EnvName;
  FN_PORT: number;
  FN_HOST: string;
  FN_SERVICE_NAME: string;
  FN_VERSION: string;
  LOG_LEVEL: 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal';
  /** Redis-backed driver in production; memory keeps dev/CI hermetic (M-08). */
  FN_SCHEDULER_DRIVER: 'memory' | 'redis';
  FN_REDIS_URL: string;
  /** Leader lease TTL. The elected worker must renew before this elapses. */
  FN_SCHEDULER_LEADER_LEASE_MS: number;
  /** Worker tick cadence. */
  FN_SCHEDULER_TICK_MS: number;
  /**
   * Window during which a run id cannot be re-claimed (FR-163 run-id binding).
   * Must exceed the largest job interval to prevent duplicate work after a
   * crash/restart within the same run slot.
   */
  FN_SCHEDULER_RUN_TTL_SECONDS: number;
  FN_SCHEDULER_RETRY_ATTEMPTS: number;
  FN_SCHEDULER_RETRY_BASE_MS: number;
  FN_SCHEDULER_RETRY_MAX_MS: number;
  FN_SCHEDULER_RETRY_JITTER: number;
}

const SCHEMA = {
  ENV: ENV_FIELD,
  FN_PORT: { type: 'number', default: '3400', min: 1, max: 65535 },
  FN_HOST: { type: 'string', default: '0.0.0.0' },
  FN_SERVICE_NAME: { type: 'string', default: 'scheduler' },
  FN_VERSION: { type: 'string', default: '0.1.0' },
  LOG_LEVEL: {
    type: 'enum',
    default: 'info',
    enumValues: ['trace', 'debug', 'info', 'warn', 'error', 'fatal'],
  },
  FN_SCHEDULER_DRIVER: { type: 'enum', default: 'memory', enumValues: ['memory', 'redis'] },
  // Event-bus broker + scheduler state broker. Defaults to the local compose
  // Redis so `docker compose up` and dev work out of the box.
  FN_REDIS_URL: { type: 'string', default: 'redis://127.0.0.1:6379' },
  FN_SCHEDULER_LEADER_LEASE_MS: { type: 'number', default: '10000', min: 1000 },
  FN_SCHEDULER_TICK_MS: { type: 'number', default: '1000', min: 100 },
  FN_SCHEDULER_RUN_TTL_SECONDS: { type: 'number', default: '900', min: 60 },
  FN_SCHEDULER_RETRY_ATTEMPTS: { type: 'number', default: '3', min: 1, max: 10 },
  FN_SCHEDULER_RETRY_BASE_MS: { type: 'number', default: '500', min: 100 },
  FN_SCHEDULER_RETRY_MAX_MS: { type: 'number', default: '5000', min: 100 },
  FN_SCHEDULER_RETRY_JITTER: { type: 'number', default: '0.2', min: 0, max: 0.5 },
} as const;

export function loadSchedulerConfig(source: NodeJS.ProcessEnv = process.env): SchedulerConfig {
  const parsed = loadConfig(SCHEMA, { source });
  const config: SchedulerConfig = {
    ENV: parsed.ENV as EnvName,
    FN_PORT: parsed.FN_PORT as number,
    FN_HOST: parsed.FN_HOST as string,
    FN_SERVICE_NAME: parsed.FN_SERVICE_NAME as string,
    FN_VERSION: parsed.FN_VERSION as string,
    LOG_LEVEL: parsed.LOG_LEVEL as SchedulerConfig['LOG_LEVEL'],
    FN_SCHEDULER_DRIVER: parsed.FN_SCHEDULER_DRIVER as SchedulerConfig['FN_SCHEDULER_DRIVER'],
    FN_REDIS_URL: parsed.FN_REDIS_URL as string,
    FN_SCHEDULER_LEADER_LEASE_MS: parsed.FN_SCHEDULER_LEADER_LEASE_MS as number,
    FN_SCHEDULER_TICK_MS: parsed.FN_SCHEDULER_TICK_MS as number,
    FN_SCHEDULER_RUN_TTL_SECONDS: parsed.FN_SCHEDULER_RUN_TTL_SECONDS as number,
    FN_SCHEDULER_RETRY_ATTEMPTS: parsed.FN_SCHEDULER_RETRY_ATTEMPTS as number,
    FN_SCHEDULER_RETRY_BASE_MS: parsed.FN_SCHEDULER_RETRY_BASE_MS as number,
    FN_SCHEDULER_RETRY_MAX_MS: parsed.FN_SCHEDULER_RETRY_MAX_MS as number,
    FN_SCHEDULER_RETRY_JITTER: parsed.FN_SCHEDULER_RETRY_JITTER as number,
  };
  return config;
}
