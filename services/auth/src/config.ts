import { ENV_FIELD, loadConfig, type EnvName } from '@fathersnet/config';

export interface AuthConfig {
  ENV: EnvName;
  FN_PORT: number;
  FN_HOST: string;
  FN_SERVICE_NAME: string;
  FN_VERSION: string;
  LOG_LEVEL: 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal';
  FN_REDIS_URL: string;
  FN_STORE_DRIVER: 'memory' | 'redis';
  FN_AUTH_JWT_SECRET: string;
  FN_AUTH_ISSUER: string;
  FN_AUTH_AUDIENCE: string;
  FN_AUTH_ACCESS_TTL_SECONDS: number;
  FN_AUTH_REFRESH_TTL_SECONDS: number;
  FN_AUTH_OTP_TTL_SECONDS: number;
  FN_AUTH_OTP_LENGTH: number;
  FN_AUTH_OTP_MAX_REQUESTS: number;
  FN_AUTH_OTP_REQUEST_WINDOW_SECONDS: number;
  FN_AUTH_OTP_MAX_ATTEMPTS: number;
  FN_AUTH_OTP_LOCKOUT_SECONDS: number;
}

const SCHEMA = {
  ENV: ENV_FIELD,
  FN_PORT: { type: 'number', default: '3100', min: 1, max: 65535 },
  FN_HOST: { type: 'string', default: '0.0.0.0' },
  FN_SERVICE_NAME: { type: 'string', default: 'auth' },
  FN_VERSION: { type: 'string', default: '0.1.0' },
  LOG_LEVEL: {
    type: 'enum',
    default: 'info',
    enumValues: ['trace', 'debug', 'info', 'warn', 'error', 'fatal'],
  },
  FN_REDIS_URL: { type: 'string', default: 'redis://127.0.0.1:6379' },
  FN_STORE_DRIVER: { type: 'enum', default: 'memory', enumValues: ['memory', 'redis'] },
  // Secret — never defaulted (packages/config registry, FR-170/NFR-022). The
  // auth service signs tokens, so a missing secret fails fast at boot.
  FN_AUTH_JWT_SECRET: { type: 'string', required: true },
  FN_AUTH_ISSUER: { type: 'string', default: 'fathersnet' },
  FN_AUTH_AUDIENCE: { type: 'string', default: 'fathersnet-api' },
  FN_AUTH_ACCESS_TTL_SECONDS: { type: 'number', default: '900', min: 60, max: 86400 },
  FN_AUTH_REFRESH_TTL_SECONDS: { type: 'number', default: '2592000', min: 86400, max: 31536000 },
  FN_AUTH_OTP_TTL_SECONDS: { type: 'number', default: '300', min: 60, max: 3600 },
  FN_AUTH_OTP_LENGTH: { type: 'number', default: '6', min: 4, max: 8 },
  FN_AUTH_OTP_MAX_REQUESTS: { type: 'number', default: '5', min: 1, max: 100 },
  FN_AUTH_OTP_REQUEST_WINDOW_SECONDS: { type: 'number', default: '900', min: 60, max: 86400 },
  FN_AUTH_OTP_MAX_ATTEMPTS: { type: 'number', default: '5', min: 1, max: 100 },
  FN_AUTH_OTP_LOCKOUT_SECONDS: { type: 'number', default: '900', min: 60, max: 86400 },
} as const;

export function loadAuthConfig(source: NodeJS.ProcessEnv = process.env): AuthConfig {
  const parsed = loadConfig(SCHEMA, { source });
  const config: AuthConfig = {
    ENV: parsed.ENV as EnvName,
    FN_PORT: parsed.FN_PORT as number,
    FN_HOST: parsed.FN_HOST as string,
    FN_SERVICE_NAME: parsed.FN_SERVICE_NAME as string,
    FN_VERSION: parsed.FN_VERSION as string,
    LOG_LEVEL: parsed.LOG_LEVEL as AuthConfig['LOG_LEVEL'],
    FN_REDIS_URL: parsed.FN_REDIS_URL as string,
    FN_STORE_DRIVER: parsed.FN_STORE_DRIVER as AuthConfig['FN_STORE_DRIVER'],
    FN_AUTH_JWT_SECRET: parsed.FN_AUTH_JWT_SECRET as string,
    FN_AUTH_ISSUER: parsed.FN_AUTH_ISSUER as string,
    FN_AUTH_AUDIENCE: parsed.FN_AUTH_AUDIENCE as string,
    FN_AUTH_ACCESS_TTL_SECONDS: parsed.FN_AUTH_ACCESS_TTL_SECONDS as number,
    FN_AUTH_REFRESH_TTL_SECONDS: parsed.FN_AUTH_REFRESH_TTL_SECONDS as number,
    FN_AUTH_OTP_TTL_SECONDS: parsed.FN_AUTH_OTP_TTL_SECONDS as number,
    FN_AUTH_OTP_LENGTH: parsed.FN_AUTH_OTP_LENGTH as number,
    FN_AUTH_OTP_MAX_REQUESTS: parsed.FN_AUTH_OTP_MAX_REQUESTS as number,
    FN_AUTH_OTP_REQUEST_WINDOW_SECONDS: parsed.FN_AUTH_OTP_REQUEST_WINDOW_SECONDS as number,
    FN_AUTH_OTP_MAX_ATTEMPTS: parsed.FN_AUTH_OTP_MAX_ATTEMPTS as number,
    FN_AUTH_OTP_LOCKOUT_SECONDS: parsed.FN_AUTH_OTP_LOCKOUT_SECONDS as number,
  };
  return config;
}
