import { ENV_FIELD, loadConfig, type EnvName } from '@fathersnet/config';

export interface GatewayConfig {
  ENV: EnvName;
  FN_PORT: number;
  FN_HOST: string;
  FN_SERVICE_NAME: string;
  FN_VERSION: string;
  FN_CORS_ORIGINS: string[];
  LOG_LEVEL: 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal';
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
  };
  return config;
}
