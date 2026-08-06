import { ENV_FIELD, loadConfig, type EnvName } from '@fathersnet/config';

export interface GatewayConfig {
  ENV: EnvName;
  FN_PORT: number;
  FN_HOST: string;
  FN_SERVICE_NAME: string;
  FN_VERSION: string;
  FN_CORS_ORIGINS: string[];
  LOG_LEVEL: 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal';
  FN_REDIS_URL: string;
  FN_STORE_DRIVER: 'memory' | 'redis';
  FN_RATE_LIMIT_DEFAULT: number;
  FN_RATE_LIMIT_AI: number;
  FN_RATE_LIMIT_ADMIN_EXPORT: number;
  FN_RATE_LIMIT_WINDOW_SECONDS: number;
  FN_IDEMPOTENCY_TTL_SECONDS: number;
  FN_AUTH_JWT_SECRET: string;
  FN_AUTH_ISSUER: string;
  FN_AUTH_AUDIENCE: string;
}

const SCHEMA = {
  ENV: ENV_FIELD,
  FN_PORT: { type: 'number', default: '3000', min: 1, max: 65535 },
  FN_HOST: { type: 'string', default: '0.0.0.0' },
  FN_SERVICE_NAME: { type: 'string', default: 'gateway' },
  FN_VERSION: { type: 'string', default: '0.1.0' },
  FN_CORS_ORIGINS: { type: 'string[]', default: '' },
  LOG_LEVEL: {
    type: 'enum',
    default: 'info',
    enumValues: ['trace', 'debug', 'info', 'warn', 'error', 'fatal'],
  },
  FN_REDIS_URL: { type: 'string', default: 'redis://127.0.0.1:6379' },
  FN_STORE_DRIVER: { type: 'enum', default: 'memory', enumValues: ['memory', 'redis'] },
  FN_RATE_LIMIT_DEFAULT: { type: 'number', default: '120', min: 1, max: 100000 },
  FN_RATE_LIMIT_AI: { type: 'number', default: '30', min: 1, max: 100000 },
  FN_RATE_LIMIT_ADMIN_EXPORT: { type: 'number', default: '10', min: 1, max: 100000 },
  FN_RATE_LIMIT_WINDOW_SECONDS: { type: 'number', default: '60', min: 1, max: 86400 },
  FN_IDEMPOTENCY_TTL_SECONDS: { type: 'number', default: '86400', min: 1, max: 604800 },
  // Empty (unset) => Bearer tokens pass through unvalidated (pre-WP-016 dev
  // mode). When set, the gateway validates access JWTs signed with the auth
  // service's shared secret. Failing closed on absent config is safe: no
  // secret, no claims, no authenticated identity.
  FN_AUTH_JWT_SECRET: { type: 'string', default: '' },
  FN_AUTH_ISSUER: { type: 'string', default: 'fathersnet' },
  FN_AUTH_AUDIENCE: { type: 'string', default: 'fathersnet-api' },
} as const;

export function loadGatewayConfig(source: NodeJS.ProcessEnv = process.env): GatewayConfig {
  const parsed = loadConfig(SCHEMA, { source });
  const config: GatewayConfig = {
    ENV: parsed.ENV as EnvName,
    FN_PORT: parsed.FN_PORT as number,
    FN_HOST: parsed.FN_HOST as string,
    FN_SERVICE_NAME: parsed.FN_SERVICE_NAME as string,
    FN_VERSION: parsed.FN_VERSION as string,
    FN_CORS_ORIGINS: parsed.FN_CORS_ORIGINS as string[],
    LOG_LEVEL: parsed.LOG_LEVEL as GatewayConfig['LOG_LEVEL'],
    FN_REDIS_URL: parsed.FN_REDIS_URL as string,
    FN_STORE_DRIVER: parsed.FN_STORE_DRIVER as GatewayConfig['FN_STORE_DRIVER'],
    FN_RATE_LIMIT_DEFAULT: parsed.FN_RATE_LIMIT_DEFAULT as number,
    FN_RATE_LIMIT_AI: parsed.FN_RATE_LIMIT_AI as number,
    FN_RATE_LIMIT_ADMIN_EXPORT: parsed.FN_RATE_LIMIT_ADMIN_EXPORT as number,
    FN_RATE_LIMIT_WINDOW_SECONDS: parsed.FN_RATE_LIMIT_WINDOW_SECONDS as number,
    FN_IDEMPOTENCY_TTL_SECONDS: parsed.FN_IDEMPOTENCY_TTL_SECONDS as number,
    FN_AUTH_JWT_SECRET: parsed.FN_AUTH_JWT_SECRET as string,
    FN_AUTH_ISSUER: parsed.FN_AUTH_ISSUER as string,
    FN_AUTH_AUDIENCE: parsed.FN_AUTH_AUDIENCE as string,
  };
  return config;
}
