#!/usr/bin/env bash
# One-shot: resolve Dockhand agent creds from 1Password into a local cache.
# Expect one unlock/approval, then scripts/dockhand-deploy.sh never calls `op` again.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
CACHE="${ROOT}/.local/dockhand.agent.env"
TMP="$(mktemp)"

cleanup() { rm -f "${TMP}"; }
trap cleanup EXIT

cat > "${TMP}" <<'EOF'
CURSOR_AGENT_USER=op://Docker_Stacks/secrets-global/CURSOR_AGENT_USER
CURSOR_AGENT_PASSWORD=op://Docker_Stacks/secrets-global/CURSOR_AGENT_PASSWORD
EOF

if ! command -v op >/dev/null 2>&1; then
  echo "1Password CLI (op) not found. Install it or create ${CACHE} manually:" >&2
  echo "  CURSOR_AGENT_USER=..." >&2
  echo "  CURSOR_AGENT_PASSWORD=..." >&2
  exit 1
fi

mkdir -p "${ROOT}/.local"
op inject -i "${TMP}" -o "${CACHE}"
chmod 600 "${CACHE}"

# Normalize to KEY=value (op inject may leave quotes)
if ! grep -q '^CURSOR_AGENT_USER=.' "${CACHE}" || ! grep -q '^CURSOR_AGENT_PASSWORD=.' "${CACHE}"; then
  echo "Cache write failed or empty values in ${CACHE}" >&2
  exit 1
fi

echo "Cached Dockhand agent credentials → ${CACHE}"
echo "Future deploys: ./scripts/dockhand-deploy.sh  (no 1Password prompts)"
