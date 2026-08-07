import { ENV_FIELD, loadConfig, type EnvName } from '@fathersnet/config';

export interface JournalConfig {
  ENV: EnvName;
  FN_PORT: number;
  FN_HOST: string;
  FN_SERVICE_NAME: string;
  FN_VERSION: string;
  LOG_LEVEL: 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal';
  FN_STORE_DRIVER: 'memory' | 'postgres';
  FN_REDIS_URL: string;
  FN_DATABASE_URL: string;
  FN_JOURNAL_JWT_SECRET: string;
  FN_JOURNAL_ISSUER: string;
  FN_JOURNAL_AUDIENCE: string;
  /** Default page size for the cursor-paginated timeline (NFR-007). */
  FN_JOURNAL_PAGE_SIZE: number;
  /** Max content length per entry (a journal entry is a single capture). */
  FN_JOURNAL_MAX_CONTENT_LENGTH: number;
}

const SCHEMA = {
  ENV: ENV_FIELD,
  FN_PORT: { type: 'number', default: '3700', min: 1, max: 65535 },
  FN_HOST: { type: 'string', default: '0.0.0.0' },
  FN_SERVICE_NAME: { type: 'string', default: 'journal' },
  FN_VERSION: { type: 'string', default: '0.1.0' },
  LOG_LEVEL: {
    type: 'enum',
    default: 'info',
    enumValues: ['trace', 'debug', 'info', 'warn', 'error', 'fatal'],
  },
  FN_STORE_DRIVER: { type: 'enum', default: 'memory', enumValues: ['memory', 'postgres'] },
  // Event bus broker. Used for best-effort `journal.entry.created` publishing
  // when the Postgres store driver is active (production); memory mode keeps
  // dev/CI hermetic (M-08). The default points at the local compose Redis.
  FN_REDIS_URL: { type: 'string', default: 'redis://127.0.0.1:6379' },
  // Database-bound config. Defaults to a local URL so `docker compose up` and
  // dev work out of the box; production injects the managed URL via IaC.
  FN_DATABASE_URL: {
    type: 'string',
    default: 'postgres://fathersnet:local-dev-only@127.0.0.1:5432/fathersnet',
  },
  // Secret — never defaulted (packages/config registry, FR-170/NFR-022). The
  // journal service verifies WP-016 access JWTs issued by the auth service with
  // the same shared HS256 secret (see .env.example), so a missing secret fails
  // fast at boot.
  FN_JOURNAL_JWT_SECRET: { type: 'string', required: true },
  FN_JOURNAL_ISSUER: { type: 'string', default: 'fathersnet' },
  FN_JOURNAL_AUDIENCE: { type: 'string', default: 'fathersnet-api' },
  FN_JOURNAL_PAGE_SIZE: { type: 'number', default: '20', min: 1, max: 100 },
  FN_JOURNAL_MAX_CONTENT_LENGTH: { type: 'number', default: '10000', min: 1, max: 100000 },
} as const;

export function loadJournalConfig(source: NodeJS.ProcessEnv = process.env): JournalConfig {
  const parsed = loadConfig(SCHEMA, { source });
  const config: JournalConfig = {
    ENV: parsed.ENV as EnvName,
    FN_PORT: parsed.FN_PORT as number,
    FN_HOST: parsed.FN_HOST as string,
    FN_SERVICE_NAME: parsed.FN_SERVICE_NAME as string,
    FN_VERSION: parsed.FN_VERSION as string,
    LOG_LEVEL: parsed.LOG_LEVEL as JournalConfig['LOG_LEVEL'],
    FN_STORE_DRIVER: parsed.FN_STORE_DRIVER as JournalConfig['FN_STORE_DRIVER'],
    FN_REDIS_URL: parsed.FN_REDIS_URL as string,
    FN_DATABASE_URL: parsed.FN_DATABASE_URL as string,
    FN_JOURNAL_JWT_SECRET: parsed.FN_JOURNAL_JWT_SECRET as string,
    FN_JOURNAL_ISSUER: parsed.FN_JOURNAL_ISSUER as string,
    FN_JOURNAL_AUDIENCE: parsed.FN_JOURNAL_AUDIENCE as string,
    FN_JOURNAL_PAGE_SIZE: parsed.FN_JOURNAL_PAGE_SIZE as number,
    FN_JOURNAL_MAX_CONTENT_LENGTH: parsed.FN_JOURNAL_MAX_CONTENT_LENGTH as number,
  };
  return config;
}
