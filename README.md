# FathersNet (Ayay)

Digital fatherhood and family-health platform. Monorepo managed with **npm
workspaces** and **Turborepo**.

> Planning artifacts and the complete requirements (SRS) live in
> `implementation-plan/` and `docs/` — this README covers the codebase.

## Repository layout

```
.
├── packages/          # Shared libraries (npm workspaces)
│   ├── api-spec/      # OpenAPI contracts (AR-003 — contract as source of truth)
│   ├── config/        # Central env-variable registry (engineering-standards §18)
│   ├── errors/        # Standard error envelope + typed errors (§5)
│   ├── logger/        # Structured JSON logger, no PII (§6)
│   └── test-utils/    # Shared test helpers (§7)
├── services/
│   └── gateway/       # Fastify HTTP entry point (health endpoints, M1)
├── ai-services/       # Python AI services (later milestones)
├── apps/              # mobile/, web/ (later milestones)
├── infra/             # nginx, docker certs, deployment reference
├── scripts/           # Dev/ops helper scripts
├── .github/workflows/ # CI/CD (12 §5.2)
└── .devcontainer/     # VS Code dev container
```

## Prerequisites

- Node.js **>=20 <23** (`.nvmrc` = 20), npm **>=10** (`packageManager` pinned)
- Docker + Docker Compose v2
- PowerShell 7+ (Windows) or bash (macOS/Linux)

## Quick start

```bash
npm install            # install all workspaces (lockfile = package-lock.json)
cp .env.example .env   # local env template (placeholder secrets only)
./scripts/dev.sh       # or: pwsh scripts/dev.ps1
```

This starts PostgreSQL, Redis, and Qdrant in Docker, then runs the gateway in
watch mode via Turborepo.

Verify the health endpoints:

```bash
curl http://localhost:3000/healthz   # liveness  -> {"status":"ok",...}
curl http://localhost:3000/readyz    # readiness -> {"status":"ready","checks":[]}
```

Full stack (optional, includes nginx reverse proxy + gateway image):

```bash
docker compose up -d --build
curl http://localhost:8080/healthz
```

Generate local TLS certs for the nginx HTTPS port:

```bash
./scripts/update-certs.sh
```

## Common commands

| Command                 | Purpose                                   |
| ----------------------- | ----------------------------------------- |
| `npm run build`         | Build all workspaces (turbo)              |
| `npm run test`          | Run all unit tests                        |
| `npm run test:coverage` | Run tests with coverage gates             |
| `npm run lint`          | ESLint (incl. security rules)             |
| `npm run format`        | Prettier write                            |
| `npm run format:check`  | Prettier check                            |
| `npm run typecheck`     | TypeScript strict across workspaces       |
| `npm run audit`         | npm audit (prod deps, high+)              |
| `npm run sast`          | eslint-plugin-security                    |
| `npm run contract:lint` | OpenAPI lint via Redocly                  |
| `npm run secret:scan`   | Scan tracked files for hard-coded secrets |

## Conventions

- **Branching** (12 §5.1): `feature/*` → PR into `develop` → `main` (prod gate).
- **Commits**: pre-commit hook runs lint-staged; follow the repo commit style.
- **Secrets** (NFR-022): never commit `.env` or real keys. `.env.example`
  documents the canonical variable set; secrets are injected via IaC in
  deployment.
- **Errors** (§5): all failures use the envelope
  `{"error":{"code","message","request_id","errors[]"}}`.
- **Logging** (§6): structured JSON via pino; no PII ever.

## License

MIT — see `LICENSE`.
