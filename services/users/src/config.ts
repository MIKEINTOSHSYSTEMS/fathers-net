import { ENV_FIELD, loadConfig, type EnvName } from '@fathersnet/config';

export interface UsersConfig {
  ENV: EnvName;
  FN_PORT: number;
  FN_HOST: string;
  FN_SERVICE_NAME: string;
  FN_VERSION: string;
  LOG_LEVEL: 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal';
  FN_STORE_DRIVER: 'memory' | 'postgres';
  FN_REDIS_URL: string;
  FN_DATABASE_URL: string;
  FN_USERS_JWT_SECRET: string;
  FN_USERS_ISSUER: string;
  FN_USERS_AUDIENCE: string;
  FN_USERS_PHONE_ENC_KEY: string;
  FN_USERS_PHONE_DIGEST_KEY: string;
}

const SCHEMA = {
  ENV: ENV_FIELD,
  FN_PORT: { type: 'number', default: '3200', min: 1, max: 65535 },
  FN_HOST: { type: 'string', default: '0.0.0.0' },
  FN_SERVICE_NAME: { type: 'string', default: 'users' },
  FN_VERSION: { type: 'string', default: '0.1.0' },
  LOG_LEVEL: {
    type: 'enum',
    default: 'info',
    enumValues: ['trace', 'debug', 'info', 'warn', 'error', 'fatal'],
  },
  FN_STORE_DRIVER: { type: 'enum', default: 'memory', enumValues: ['memory', 'postgres'] },
  // Event bus broker. Used for best-effort `user.*` event publishing when the
  // Postgres store driver is active (production); memory mode keeps dev/CI
  // hermetic (M-08). The default points at the local compose Redis.
  FN_REDIS_URL: { type: 'string', default: 'redis://127.0.0.1:6379' },
  // Database-bound config. Defaults to a local URL so `docker compose up` and
  // dev work out of the box; production injects the managed URL via IaC.
  FN_DATABASE_URL: {
    type: 'string',
    default: 'postgres://fathersnet:local-dev-only@127.0.0.1:5432/fathersnet',
  },
  // Secrets — never defaulted (packages/config registry, FR-170/NFR-022). The
  // users service verifies WP-016 access JWTs and encrypts phone numbers at
  // rest, so missing secrets fail fast at boot.
  FN_USERS_JWT_SECRET: { type: 'string', required: true },
  FN_USERS_ISSUER: { type: 'string', default: 'fathersnet' },
  FN_USERS_AUDIENCE: { type: 'string', default: 'fathersnet-api' },
  FN_USERS_PHONE_ENC_KEY: { type: 'string', required: true },
  FN_USERS_PHONE_DIGEST_KEY: { type: 'string', required: true },
} as const;

export function loadUsersConfig(source: NodeJS.ProcessEnv = process.env): UsersConfig {
  const parsed = loadConfig(SCHEMA, { source });
  const config: UsersConfig = {
    ENV: parsed.ENV as EnvName,
    FN_PORT: parsed.FN_PORT as number,
    FN_HOST: parsed.FN_HOST as string,
    FN_SERVICE_NAME: parsed.FN_SERVICE_NAME as string,
    FN_VERSION: parsed.FN_VERSION as string,
    LOG_LEVEL: parsed.LOG_LEVEL as UsersConfig['LOG_LEVEL'],
    FN_STORE_DRIVER: parsed.FN_STORE_DRIVER as UsersConfig['FN_STORE_DRIVER'],
    FN_REDIS_URL: parsed.FN_REDIS_URL as string,
    FN_DATABASE_URL: parsed.FN_DATABASE_URL as string,
    FN_USERS_JWT_SECRET: parsed.FN_USERS_JWT_SECRET as string,
    FN_USERS_ISSUER: parsed.FN_USERS_ISSUER as string,
    FN_USERS_AUDIENCE: parsed.FN_USERS_AUDIENCE as string,
    FN_USERS_PHONE_ENC_KEY: parsed.FN_USERS_PHONE_ENC_KEY as string,
    FN_USERS_PHONE_DIGEST_KEY: parsed.FN_USERS_PHONE_DIGEST_KEY as string,
  };
  return config;
}
