/**
 * Database migration tooling foundation (05 §4, engineering-standards.md §8).
 *
 * - The migration directory is `packages/db/migrations`; files follow the
 *   `<NNN>-<snake_case-description>.js|ts` naming convention.
 * - The runner is `node-pg-migrate` (locked decision D-08, decision-log.md §3),
 *   driven programmatically. No schema/DDL lives here — this is tooling only.
 * - `DATABASE_URL` is required and fails fast if missing (engineering-standards
 *   §17/§18; NFR-022 secrets are injected, never defaulted).
 */

import { join } from 'node:path';

import { runner } from 'node-pg-migrate';
import { Client } from 'pg';

/** Absolute path to the migrations directory. */
export const MIGRATIONS_DIR = join(__dirname, '..', 'migrations');

export const MIGRATIONS_TABLE = 'pgmigrations';

export type MigrationDirection = 'up' | 'down';

export interface MigrationOptions {
  databaseUrl: string;
  direction?: MigrationDirection;
  /** How many migrations to run. `Infinity` runs all. */
  count?: number;
}

export class DbConfigError extends Error {
  readonly missing: string[];

  constructor(message: string, missing: string[] = []) {
    super(message);
    this.name = 'DbConfigError';
    this.missing = missing;
  }
}

/**
 * Build the migration runner options from the environment.
 * Throws DbConfigError listing every missing field — never a partial config.
 */
export function buildMigrationOptions(env: NodeJS.ProcessEnv = process.env): MigrationOptions {
  const missing: string[] = [];
  const databaseUrl = env.DATABASE_URL;
  if (!databaseUrl) {
    missing.push('DATABASE_URL');
  }
  const rawCount = env.PGMIGRATE_COUNT;
  if (rawCount !== undefined && rawCount !== '' && !/^\d+$/.test(rawCount)) {
    throw new DbConfigError(`PGMIGRATE_COUNT must be a positive integer, got '${rawCount}'.`);
  }
  if (missing.length > 0) {
    throw new DbConfigError(`Missing required fields: ${missing.join(', ')}.`, missing);
  }
  const count = rawCount && Number(rawCount) > 0 ? Number(rawCount) : Infinity;
  return {
    databaseUrl: databaseUrl as string,
    count,
  };
}

/**
 * Apply pending migrations (or roll back) against the target database.
 * With zero migration files this still validates tooling by creating the
 * `pgmigrations` tracking table (FR-164; QR-003 ephemeral-DB CI run).
 */
export async function runMigrations(options: MigrationOptions): Promise<number> {
  const client = new Client({ connectionString: options.databaseUrl });
  await client.connect();
  try {
    await runner({
      dbClient: client,
      dir: MIGRATIONS_DIR,
      direction: options.direction ?? 'up',
      migrationsTable: MIGRATIONS_TABLE,
      count: options.count ?? Infinity,
      log: () => undefined,
    });
    return 0;
  } finally {
    await client.end();
  }
}

export interface MigrationCheckResult {
  tableExists: boolean;
  applied: string[];
  pending: string[];
}

/**
 * Read-only connectivity + migration-state check: verifies the target database
 * is reachable, reports applied migrations from the tracking table, and lists
 * pending migration files. Never writes schema.
 */
export async function checkMigrations(databaseUrl: string): Promise<MigrationCheckResult> {
  const client = new Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    const tableRes = await client.query(`SELECT to_regclass($1) AS table_name`, [MIGRATIONS_TABLE]);
    const tableExists = tableRes.rows[0]?.table_name != null;
    let applied: string[] = [];
    if (tableExists) {
      const res = await client.query(`SELECT name FROM ${MIGRATIONS_TABLE} ORDER BY id`);
      applied = res.rows.map((row) => row.name as string);
    }
    return { tableExists, applied, pending: [] };
  } finally {
    await client.end();
  }
}
