import { ENV_FIELD, loadConfig, type EnvName } from '@fathersnet/config';

export interface RemindersConfig {
  ENV: EnvName;
  FN_PORT: number;
  FN_HOST: string;
  FN_SERVICE_NAME: string;
  FN_VERSION: string;
  LOG_LEVEL: 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal';
  FN_STORE_DRIVER: 'memory' | 'postgres';
  FN_REDIS_URL: string;
  FN_DATABASE_URL: string;
  FN_REMINDERS_JWT_SECRET: string;
  FN_REMINDERS_ISSUER: string;
  FN_REMINDERS_AUDIENCE: string;
  /**
   * Per-user daily outbound cap (06 §4.14). Range 3–5 by design — reminders
   * must never flood a parent; the cap is counted per Addis day from the
   * append-only dispatch log in the same store transaction as the insert.
   */
  FN_REMINDERS_DAILY_CAP: number;
  /** Fixed offset for the reminder clock (UTC+3, Addis Ababa — no DST). */
  FN_REMINDERS_TZ_OFFSET_MINUTES: number;
  /** Night quiet-hours window for `normal` reminders (FR-029, FR-043). */
  FN_REMINDERS_QUIET_HOURS_ENABLED: boolean;
  FN_REMINDERS_QUIET_HOURS_START: string;
  FN_REMINDERS_QUIET_HOURS_END: string;
  /** A scheduled instance older than this is marked `expired`, never sent late. */
  FN_REMINDERS_EXPIRY_MINUTES: number;
  /** Dispatch job run slot interval (scheduler extension point; FR-163). */
  FN_REMINDERS_JOB_INTERVAL_SECONDS: number;
  /** Max instances examined per dispatch run (bounded batch work). */
  FN_REMINDERS_DISPATCH_BATCH_LIMIT: number;
  /** Upper bound for weekly recurrence expansion (pregnancy window 1–45, FR-041). */
  FN_REMINDERS_MAX_WEEK: number;
}

const SCHEMA = {
  ENV: ENV_FIELD,
  FN_PORT: { type: 'number', default: '3500', min: 1, max: 65535 },
  FN_HOST: { type: 'string', default: '0.0.0.0' },
  FN_SERVICE_NAME: { type: 'string', default: 'reminders' },
  FN_VERSION: { type: 'string', default: '0.1.0' },
  LOG_LEVEL: {
    type: 'enum',
    default: 'info',
    enumValues: ['trace', 'debug', 'info', 'warn', 'error', 'fatal'],
  },
  FN_STORE_DRIVER: { type: 'enum', default: 'memory', enumValues: ['memory', 'postgres'] },
  // Event bus broker. Used for best-effort `reminder.due` publishing when the
  // Postgres store driver is active (production); memory mode keeps dev/CI
  // hermetic (M-08). The default points at the local compose Redis.
  FN_REDIS_URL: { type: 'string', default: 'redis://127.0.0.1:6379' },
  // Database-bound config. Defaults to a local URL so `docker compose up` and
  // dev work out of the box; production injects the managed URL via IaC.
  FN_DATABASE_URL: {
    type: 'string',
    default: 'postgres://fathersnet:local-dev-only@127.0.0.1:5432/fathersnet',
  },
  // Secret — never defaulted (packages/config registry, FR-170/NFR-022). The
  // reminders service verifies WP-016 access JWTs issued by the auth service
  // with the same shared HS256 secret (see .env.example), so a missing secret
  // fails fast at boot.
  FN_REMINDERS_JWT_SECRET: { type: 'string', required: true },
  FN_REMINDERS_ISSUER: { type: 'string', default: 'fathersnet' },
  FN_REMINDERS_AUDIENCE: { type: 'string', default: 'fathersnet-api' },
  FN_REMINDERS_DAILY_CAP: { type: 'number', default: '5', min: 3, max: 5 },
  FN_REMINDERS_TZ_OFFSET_MINUTES: { type: 'number', default: '180', min: -720, max: 840 },
  FN_REMINDERS_QUIET_HOURS_ENABLED: { type: 'boolean', default: 'true' },
  FN_REMINDERS_QUIET_HOURS_START: { type: 'string', default: '21:00' },
  FN_REMINDERS_QUIET_HOURS_END: { type: 'string', default: '07:00' },
  FN_REMINDERS_EXPIRY_MINUTES: { type: 'number', default: '60', min: 5 },
  FN_REMINDERS_JOB_INTERVAL_SECONDS: { type: 'number', default: '60', min: 10 },
  FN_REMINDERS_DISPATCH_BATCH_LIMIT: { type: 'number', default: '100', min: 1, max: 1000 },
  FN_REMINDERS_MAX_WEEK: { type: 'number', default: '45', min: 1, max: 45 },
} as const;

export function loadRemindersConfig(source: NodeJS.ProcessEnv = process.env): RemindersConfig {
  const parsed = loadConfig(SCHEMA, { source });
  const config: RemindersConfig = {
    ENV: parsed.ENV as EnvName,
    FN_PORT: parsed.FN_PORT as number,
    FN_HOST: parsed.FN_HOST as string,
    FN_SERVICE_NAME: parsed.FN_SERVICE_NAME as string,
    FN_VERSION: parsed.FN_VERSION as string,
    LOG_LEVEL: parsed.LOG_LEVEL as RemindersConfig['LOG_LEVEL'],
    FN_STORE_DRIVER: parsed.FN_STORE_DRIVER as RemindersConfig['FN_STORE_DRIVER'],
    FN_REDIS_URL: parsed.FN_REDIS_URL as string,
    FN_DATABASE_URL: parsed.FN_DATABASE_URL as string,
    FN_REMINDERS_JWT_SECRET: parsed.FN_REMINDERS_JWT_SECRET as string,
    FN_REMINDERS_ISSUER: parsed.FN_REMINDERS_ISSUER as string,
    FN_REMINDERS_AUDIENCE: parsed.FN_REMINDERS_AUDIENCE as string,
    FN_REMINDERS_DAILY_CAP: parsed.FN_REMINDERS_DAILY_CAP as number,
    FN_REMINDERS_TZ_OFFSET_MINUTES: parsed.FN_REMINDERS_TZ_OFFSET_MINUTES as number,
    FN_REMINDERS_QUIET_HOURS_ENABLED: parsed.FN_REMINDERS_QUIET_HOURS_ENABLED as boolean,
    FN_REMINDERS_QUIET_HOURS_START: parsed.FN_REMINDERS_QUIET_HOURS_START as string,
    FN_REMINDERS_QUIET_HOURS_END: parsed.FN_REMINDERS_QUIET_HOURS_END as string,
    FN_REMINDERS_EXPIRY_MINUTES: parsed.FN_REMINDERS_EXPIRY_MINUTES as number,
    FN_REMINDERS_JOB_INTERVAL_SECONDS: parsed.FN_REMINDERS_JOB_INTERVAL_SECONDS as number,
    FN_REMINDERS_DISPATCH_BATCH_LIMIT: parsed.FN_REMINDERS_DISPATCH_BATCH_LIMIT as number,
    FN_REMINDERS_MAX_WEEK: parsed.FN_REMINDERS_MAX_WEEK as number,
  };
  return config;
}
