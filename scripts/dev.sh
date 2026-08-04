#!/usr/bin/env bash
# =============================================================================
# Start the local development stack: infra dependencies + gateway (turbo watch).
# Usage: ./scripts/dev.sh   |   pwsh scripts/dev.ps1
# =============================================================================
set -euo pipefail

if [ ! -f .env ]; then
  echo "No .env found — copying template (secrets are placeholders only)."
  cp .env.example .env
fi

docker compose up -d postgres redis qdrant
echo "Infra ready. Starting gateway with turbo (watch mode)…"
npx turbo run dev --filter=@fathersnet/gateway
