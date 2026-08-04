#!/usr/bin/env bash
# =============================================================================
# Generate a local self-signed TLS certificate for the nginx dev proxy.
# Output: infra/docker/certs/localhost.{crt,key} (gitignored).
# =============================================================================
set -euo pipefail

CERT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/infra/docker/certs"
mkdir -p "$CERT_DIR"

openssl req -x509 -nodes -newkey rsa:2048 -days 365 \
  -keyout "$CERT_DIR/localhost.key" \
  -out "$CERT_DIR/localhost.crt" \
  -subj "/CN=localhost" \
  -addext "subjectAltName=DNS:localhost,IP:127.0.0.1" >/dev/null 2>&1

echo "Generated $CERT_DIR/localhost.crt and localhost.key"
