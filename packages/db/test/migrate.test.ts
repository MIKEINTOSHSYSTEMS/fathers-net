import { buildMigrationOptions, DbConfigError, MIGRATIONS_DIR, MIGRATIONS_TABLE } from '../src';

function makeEnv(overrides: Record<string, string> = {}): NodeJS.ProcessEnv {
  return {
    DATABASE_URL: 'postgres://fathersnet:pass@localhost:5432/fathersnet',
    ...overrides,
  } as NodeJS.ProcessEnv;
}

describe('@fathersnet/db migration tooling', () => {
  describe('buildMigrationOptions', () => {
    it('parses a valid DATABASE_URL', () => {
      const options = buildMigrationOptions(makeEnv());
      expect(options.databaseUrl).toContain('postgres://');
      expect(options.direction).toBeUndefined();
      expect(options.count).toBe(Infinity);
    });

    it('fails fast when DATABASE_URL is missing', () => {
      try {
        buildMigrationOptions({});
        throw new Error('expected DbConfigError');
      } catch (err) {
        expect(err).toBeInstanceOf(DbConfigError);
        const configErr = err as DbConfigError;
        expect(configErr.missing).toContain('DATABASE_URL');
      }
    });

    it('never returns a partial config on failure', () => {
      expect(() => buildMigrationOptions({})).toThrow('Missing required fields: DATABASE_URL.');
    });

    it('accepts a bounded migration count', () => {
      const options = buildMigrationOptions(makeEnv({ PGMIGRATE_COUNT: '3' }));
      expect(options.count).toBe(3);
    });

    it('rejects a non-numeric count', () => {
      expect(() => buildMigrationOptions(makeEnv({ PGMIGRATE_COUNT: 'many' }))).toThrow(
        /PGMIGRATE_COUNT.*positive integer/,
      );
    });
  });

  describe('constants', () => {
    it('points at the migrations directory', () => {
      expect(MIGRATIONS_DIR.endsWith('migrations')).toBe(true);
    });

    it('uses the standard tracking table name', () => {
      expect(MIGRATIONS_TABLE).toBe('pgmigrations');
    });
  });
});
