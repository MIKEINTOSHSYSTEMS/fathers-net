import { ConfigError, ENV_FIELD, loadConfig, parseEnvName } from '../src';

const SCHEMA = {
  ENV: ENV_FIELD,
  FN_PORT: { type: 'number', required: true, min: 1, max: 65535 },
  FN_SERVICE_NAME: { type: 'string', required: true },
  FN_CORS_ORIGINS: { type: 'string[]', default: '' },
  FN_DEBUG: { type: 'boolean', default: 'false' },
  DB_PASSWORD: { type: 'string', required: true },
} as const;

function makeEnv(overrides: Record<string, string> = {}): NodeJS.ProcessEnv {
  return {
    FN_PORT: '3000',
    FN_SERVICE_NAME: 'gateway',
    DB_PASSWORD: 'x',
    ...overrides,
  } as NodeJS.ProcessEnv;
}

describe('@fathersnet/config', () => {
  describe('parseEnvName', () => {
    it.each(['dev', 'staging', 'prod'])('accepts %s', (env) => {
      expect(parseEnvName(env)).toBe(env);
    });

    it('defaults to dev when unset', () => {
      expect(parseEnvName(undefined)).toBe('dev');
    });

    it('is case-insensitive', () => {
      expect(parseEnvName('PROD')).toBe('prod');
    });

    it('rejects unknown values', () => {
      expect(() => parseEnvName('production')).toThrow(ConfigError);
    });
  });

  describe('loadConfig', () => {
    it('parses typed fields', () => {
      const config = loadConfig(SCHEMA, {
        source: makeEnv({ FN_DEBUG: 'true', FN_CORS_ORIGINS: 'a.com,b.com' }),
      });
      expect(config.FN_PORT).toBe(3000);
      expect(config.FN_DEBUG).toBe(true);
      expect(config.FN_CORS_ORIGINS).toEqual(['a.com', 'b.com']);
    });

    it('fails fast listing all missing required fields', () => {
      try {
        loadConfig(SCHEMA, { source: {} });
        throw new Error('expected ConfigError');
      } catch (err) {
        expect(err).toBeInstanceOf(ConfigError);
        const configErr = err as ConfigError;
        expect(configErr.missing).toContain('FN_PORT');
        expect(configErr.missing).toContain('FN_SERVICE_NAME');
        expect(configErr.missing).toContain('DB_PASSWORD');
      }
    });

    it('reports invalid values with field name', () => {
      expect(() => loadConfig(SCHEMA, { source: makeEnv({ FN_PORT: 'abc' }) })).toThrow(
        /FN_PORT.*must be a number/,
      );
    });

    it('enforces number min/max bounds', () => {
      expect(() => loadConfig(SCHEMA, { source: makeEnv({ FN_PORT: '99999' }) })).toThrow(
        /<= 65535/,
      );
      expect(() => loadConfig(SCHEMA, { source: makeEnv({ FN_PORT: '0' }) })).toThrow(/>= 1/);
    });

    it('uses defaults for optional fields', () => {
      const config = loadConfig(SCHEMA, { source: makeEnv() });
      expect(config.FN_DEBUG).toBe(false);
      expect(config.FN_CORS_ORIGINS).toEqual([]);
    });

    it('never returns a partial config on failure', () => {
      try {
        loadConfig(SCHEMA, { source: makeEnv({ FN_PORT: 'nope' }) });
        throw new Error('expected ConfigError');
      } catch (err) {
        expect(err).toBeInstanceOf(ConfigError);
      }
    });
  });
});
