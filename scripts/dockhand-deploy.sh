#!/usr/bin/env bash
# Deploy portal beta via Dockhand stack 151 — never calls 1Password.
# Auth cache: .local/dockhand.agent.env (./scripts/dockhand-auth-cache.sh once).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
CACHE="${ROOT}/.local/dockhand.agent.env"
STACK_ID="${DOCKHAND_STACK_ID:-151}"
SSH_HOST="${DOCKHAND_SSH_HOST:-truenas02}"
DOCKHAND_LOCAL="${DOCKHAND_LOCAL_URL:-http://127.0.0.1:13001}"

if [[ ! -f "${CACHE}" ]]; then
  echo "Missing ${CACHE}" >&2
  echo "Run once (single 1Password unlock): ./scripts/dockhand-auth-cache.sh" >&2
  exit 1
fi

# shellcheck disable=SC1090
set -a
# shellcheck source=/dev/null
source "${CACHE}"
set +a

if [[ -z "${CURSOR_AGENT_USER:-}" || -z "${CURSOR_AGENT_PASSWORD:-}" ]]; then
  echo "${CACHE} needs CURSOR_AGENT_USER and CURSOR_AGENT_PASSWORD" >&2
  exit 1
fi

echo "Dockhand deploy stack ${STACK_ID} via ${SSH_HOST} (cached agent auth, no op)…"

ssh -o BatchMode=yes -o ConnectTimeout=15 "${SSH_HOST}" \
  DOCKHAND="${DOCKHAND_LOCAL}" \
  STACK_ID="${STACK_ID}" \
  AGENT_USER="${CURSOR_AGENT_USER}" \
  AGENT_PASS="${CURSOR_AGENT_PASSWORD}" \
  python3 - <<'PY'
import json, os, time, urllib.error, urllib.request, http.cookiejar

base = os.environ["DOCKHAND"].rstrip("/")
stack_id = os.environ["STACK_ID"]
user = os.environ["AGENT_USER"]
password = os.environ["AGENT_PASS"]

jar = http.cookiejar.CookieJar()
opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(jar))

def call(method, path, body=None, timeout=300):
    data = None if body is None else json.dumps(body).encode()
    req = urllib.request.Request(
        f"{base}{path}",
        data=data,
        headers={"Accept": "application/json", "Content-Type": "application/json"},
        method=method,
    )
    try:
        with opener.open(req, timeout=timeout) as resp:
            raw = resp.read().decode() or "{}"
            return json.loads(raw)
    except urllib.error.HTTPError as err:
        detail = err.read().decode(errors="replace")[:500]
        raise SystemExit(f"{method} {path} → HTTP {err.code}: {detail}") from err

login = call("POST", "/api/auth/login", {"username": user, "password": password}, timeout=60)
print("login ok", json.dumps({k: login.get(k) for k in ("success", "user", "username") if k in login} or {"ok": True}))

sync = call("POST", f"/api/git/stacks/{stack_id}/sync", {}, timeout=180)
print("sync", json.dumps({"success": sync.get("success"), "keys": list(sync)[:8]}))

deploy = call("POST", f"/api/git/stacks/{stack_id}/deploy", {}, timeout=300)
print("deploy", json.dumps(deploy)[:500])

job_id = deploy.get("jobId") or deploy.get("id")
if job_id:
    for _ in range(90):
        time.sleep(2)
        job = call("GET", f"/api/jobs/{job_id}", timeout=60)
        status = str(job.get("status") or job.get("state") or "").lower()
        print("job", job_id, status)
        if status in {"done", "success", "completed"}:
            break
        if status in {"failed", "error"}:
            raise SystemExit(f"deploy job failed: {json.dumps(job)[:800]}")
PY

echo "Verify on unraid01…"
ssh -o BatchMode=yes -o ConnectTimeout=12 unraid01 \
  'docker inspect server-manager-portal --format "rev={{index .Config.Labels \"org.opencontainers.image.revision\"}} status={{.State.Status}} health={{if .State.Health}}{{.State.Health.Status}}{{end}}"'

CODE="$(curl -sS -o /dev/null -w '%{http_code}' --connect-timeout 10 https://plex.lostwaldo.net/ || true)"
echo "portal HTTP ${CODE}"
echo "Done (no 1Password)."
