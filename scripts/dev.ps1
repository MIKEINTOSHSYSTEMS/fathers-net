# =============================================================================
# Start the local development stack on Windows (PowerShell 7+).
# Equivalent to scripts/dev.sh.
# =============================================================================
[CmdletBinding()]
param()

if (-not (Test-Path .env)) {
  Write-Host "No .env found - copying template (secrets are placeholders only)."
  Copy-Item .env.example .env
}

docker compose up -d postgres redis qdrant
Write-Host "Infra ready. Starting gateway with turbo (watch mode)..."
npx turbo run dev --filter=@fathersnet/gateway
