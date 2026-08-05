# @fathersnet/db

Database migration tooling foundation (implementation-plan `05` §4, `engineering-standards.md` §8).

## Layout

- `migrations/` — node-pg-migrate migration files, following the naming convention
  `<NNN>-<snake_case-description>.js|ts` (e.g. `001-create-users`). The directory
  is intentionally empty during the Phase 2 foundation; it exists so the runner and
  CI ephemeral database validation can be exercised end-to-end before any schema work.
- `src/index.ts` — migration runner configuration and helpers (tooling only, no schema).
- `src/migrate.ts` — CLI entry point.

## Tooling

`node-pg-migrate` (locked decision D-08, `decision-log.md` §3) is driven
programmatically: versioned file-based migrations, reversible up/down, plain-SQL
support, a `pgmigrations` tracking table, and a single-migrator advisory lock.

## Commands

| Command                 | Purpose                                         |
| ----------------------- | ----------------------------------------------- |
| `npm run migrate:up`    | Apply pending migrations to `DATABASE_URL`.     |
| `npm run migrate:down`  | Roll back the last applied migration.           |
| `npm run migrate:check` | Read-only connectivity + migration-state check. |

`DATABASE_URL` is required and fails fast if missing (NFR-022 — injected, never defaulted).

## Status

Migration `001` and any database schema are NOT yet authorized and will be created
under a separate work package (WP-015+).
