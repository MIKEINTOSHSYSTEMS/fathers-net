/**
 * CLI entry point for the migration runner.
 *
 *   node migrate.ts up|down|check
 *
 * Default command is `up`. `check` is read-only: it verifies connectivity and
 * reports the migration state without applying anything. `DATABASE_URL` is
 * required (NFR-022 — injected, never defaulted).
 */

import { buildMigrationOptions, checkMigrations, DbConfigError, runMigrations } from './index';

async function main(): Promise<void> {
  const command = process.argv[2] ?? 'up';
  const options = buildMigrationOptions(process.env);

  if (command === 'check') {
    const result = await checkMigrations(options.databaseUrl);
    const summary = {
      tableExists: result.tableExists,
      applied: result.applied.length,
      pending: result.pending.length,
    };
    process.stdout.write(JSON.stringify(summary));
    process.stdout.write('\n');
    return;
  }

  if (command !== 'up' && command !== 'down') {
    throw new Error(`Unknown command '${command}'. Expected one of: up, down, check.`);
  }

  const direction = command;
  await runMigrations({ ...options, direction });
  process.stdout.write(`Migrations applied (direction: ${direction})\n`);
}

main().catch((error: unknown) => {
  const message =
    error instanceof Error
      ? error.message
      : typeof error === 'string'
        ? error
        : 'Unknown migration error.';
  const detail =
    error instanceof DbConfigError && error.missing.length > 0
      ? ` Missing: ${error.missing.join(', ')}.`
      : '';
  process.stderr.write(`Migration failed: ${message}${detail}\n`);
  process.exitCode = 1;
});
