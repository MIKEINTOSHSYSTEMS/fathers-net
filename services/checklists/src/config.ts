import { ENV_FIELD, loadConfig, type EnvName } from '@fathersnet/config';

export interface ChecklistsConfig {
  ENV: EnvName;
  FN_PORT: number;
  FN_HOST: string;
  FN_SERVICE_NAME: string;
  FN_VERSION: string;
  LOG_LEVEL: 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal';
  FN_CHECKLISTS_STORE_DRIVER: 'memory' | 'postgres';
  FN_REDIS_URL: string;
  FN_CHECKLISTS_DATABASE_URL: string;
  FN_CHECKLISTS_JWT_SECRET: string;
  FN_CHECKLISTS_ISSUER: string;
  FN_CHECKLISTS_AUDIENCE: string;
  /** Default page size cap for the checklist/budget list endpoints (06 §3.3). */
  FN_CHECKLISTS_PAGE_SIZE: number;
  /** Configurable M-07 budget cap. `0` = unset (summary `remaining` is null). */
  FN_BUDGET_CAP: number;
}

const SCHEMA = {
  ENV: ENV_FIELD,
  FN_PORT: { type: 'number', default: '3600', min: 1, max: 65535 },
  FN_HOST: { type: 'string', default: '0.0.0.0' },
  FN_SERVICE_NAME: { type: 'string', default: 'checklists' },
  FN_VERSION: { type: 'string', default: '0.1.0' },
  LOG_LEVEL: {
    type: 'enum',
    default: 'info',
    enumValues: ['trace', 'debug', 'info', 'warn', 'error', 'fatal'],
  },
  FN_CHECKLISTS_STORE_DRIVER: {
    type: 'enum',
    default: 'memory',
    enumValues: ['memory', 'postgres'],
  },
  // Reserved for a future event-publishing work package — WP-023 emits NO
  // events (no checklist/budget vocabulary entry exists). Unused at runtime;
  // kept so the compose/env shape is stable across the deferred upgrade.
  FN_REDIS_URL: { type: 'string', default: 'redis://127.0.0.1:6379' },
  // Database-bound config. Defaults to a local URL so `docker compose up` and
  // dev work out of the box; production injects the managed URL via IaC.
  FN_CHECKLISTS_DATABASE_URL: {
    type: 'string',
    default: 'postgres://fathersnet:local-dev-only@127.0.0.1:5432/fathersnet',
  },
  // Secret — never defaulted (packages/config registry, FR-170/NFR-022). The
  // checklist & budget service verifies WP-016 access JWTs issued by the auth
  // service with the same shared HS256 secret (see .env.example), so a missing
  // secret fails fast at boot.
  FN_CHECKLISTS_JWT_SECRET: { type: 'string', required: true },
  FN_CHECKLISTS_ISSUER: { type: 'string', default: 'fathersnet' },
  FN_CHECKLISTS_AUDIENCE: { type: 'string', default: 'fathersnet-api' },
  FN_CHECKLISTS_PAGE_SIZE: { type: 'number', default: '50', min: 1, max: 500 },
  // M-07 budget cap default (configurable — 02 §6 M-07; reference default in
  // 20-resource-and-delivery-analysis.md). Default 0 = unset until the Project
  // Owner confirms the cap amount; summary `remaining` reports null then.
  FN_BUDGET_CAP: { type: 'number', default: '0', min: 0 },
} as const;

export function loadChecklistsConfig(source: NodeJS.ProcessEnv = process.env): ChecklistsConfig {
  const parsed = loadConfig(SCHEMA, { source });
  const config: ChecklistsConfig = {
    ENV: parsed.ENV as EnvName,
    FN_PORT: parsed.FN_PORT as number,
    FN_HOST: parsed.FN_HOST as string,
    FN_SERVICE_NAME: parsed.FN_SERVICE_NAME as string,
    FN_VERSION: parsed.FN_VERSION as string,
    LOG_LEVEL: parsed.LOG_LEVEL as ChecklistsConfig['LOG_LEVEL'],
    FN_CHECKLISTS_STORE_DRIVER:
      parsed.FN_CHECKLISTS_STORE_DRIVER as ChecklistsConfig['FN_CHECKLISTS_STORE_DRIVER'],
    FN_REDIS_URL: parsed.FN_REDIS_URL as string,
    FN_CHECKLISTS_DATABASE_URL: parsed.FN_CHECKLISTS_DATABASE_URL as string,
    FN_CHECKLISTS_JWT_SECRET: parsed.FN_CHECKLISTS_JWT_SECRET as string,
    FN_CHECKLISTS_ISSUER: parsed.FN_CHECKLISTS_ISSUER as string,
    FN_CHECKLISTS_AUDIENCE: parsed.FN_CHECKLISTS_AUDIENCE as string,
    FN_CHECKLISTS_PAGE_SIZE: parsed.FN_CHECKLISTS_PAGE_SIZE as number,
    FN_BUDGET_CAP: parsed.FN_BUDGET_CAP as number,
  };
  return config;
}
