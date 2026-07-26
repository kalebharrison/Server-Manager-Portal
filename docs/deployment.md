# Deployment

Bog-standard Docker. Dockerfile and Compose live under `docker/`.

## Quick start (Compose)

```bash
cp .env.example .env
# set JWT_SECRET to >= 32 random characters
npm run docker:up
# or: docker compose -f docker/compose.yml up -d --build
```

Open `http://localhost:2121` and complete the setup wizard.

## Volumes

| Host path | Container path | Purpose |
|---|---|---|
| `./config` | `/app/config` | Settings, users, caches, logs |
| `./backup` | `/app/backup` | Rolling backup snapshots |

## Published image

Images publish from the `beta` and `main` branches:

```bash
docker pull ghcr.io/<owner>/server-manager-portal:beta
```

Run example:

```bash
docker run -d \
  --name server-manager-portal \
  -p 2121:2121 \
  -e JWT_SECRET='replace-with-32+-char-secret' \
  -e PUBLIC_BASE_URL='https://portal.example.com' \
  -v "$(pwd)/config:/app/config" \
  -v "$(pwd)/backup:/app/backup" \
  ghcr.io/<owner>/server-manager-portal:beta
```

## Docker networking tips

- For LAN integrations (Sonarr, Radarr, Seerr, Tautulli, Jellystat), set `ALLOW_PRIVATE_INTEGRATION_URLS=true` and use URLs reachable from inside the container (`http://host.docker.internal:8989` on Docker Desktop, or the host/LAN IP on Linux).
- If the public Request App URL is not reachable from the container, set `REQUEST_APP_INTERNAL_URL` (for example `http://seerr:5055`).
- Set `PLEX_PREFER_REMOTE_CONNECTION=true` when the portal runs in Docker and should not use a localhost Plex URL.

## Reverse proxy

Terminate TLS at Nginx / Caddy / Traefik and proxy to `http://portal:2121` (or the published host port).

Recommended env when behind HTTPS:

```env
PUBLIC_BASE_URL=https://portal.example.com
FORCE_SECURE_COOKIES=true
```

### Subpath hosting

Either:

```env
PUBLIC_BASE_URL=https://media.example.com/portal
```

or:

```env
BASE_PATH=/portal
PUBLIC_BASE_URL=https://media.example.com/portal
```

## Permissions

The entrypoint optionally runs as `PUID`/`PGID` (default `1000:1000`) and ensures `/app/config` + `/app/backup` are writable by that user.

## Production (Dockhand Git stack, unraid01)

The live portal at `https://plex.lostwaldo.net` is **not** updated by manual `docker run` / `docker compose` on the host. Dockhand (git stack **151**, environment `unraid01-mtls`) owns the container via Compose project `server-manager-portal`.

| Item | Value |
|---|---|
| Host | `unraid01` |
| Container name | `server-manager-portal` |
| Image tag | `ghcr.io/kalebharrison/server-manager-portal:main` |
| Compose source | `docker_stacks` → `stacks/unraid01/enabled/server-manager-portal/` |
| Stack has `repull_images = true` | floating `:main` tag is pulled on deploy |
| Lab hostname | `https://plex-beta.lostwaldo.net` → stack `server-manager-portal-beta` (`:beta`) |

### Normal production release flow

1. Merge/promote to `main` (CI builds and pushes the GHCR `:main` image).
2. Let Dockhand refresh stack **151** (webhook/CI or manual **Sync** then **Deploy**). Do **not** recreate the container on unraid01 by hand.

### Lab / feature work (`beta`)

1. Push to `beta` (CI builds `:beta`).
2. Dockhand refreshes `server-manager-portal-beta` at `plex-beta.lostwaldo.net` (separate config under `/mnt/user/docker/server-manager-portal-beta/`).

### Orphan container / name conflict

If someone runs `docker compose up` or `docker run` directly on unraid01, the container may lose `com.docker.compose.*` labels. Dockhand deploy then fails with *container name already in use*.

**Fix (minimal downtime):**

1. Confirm stack 151 sync is clean (`POST /api/git/stacks/151/sync`).
2. Remove only the orphan: `docker rm -f server-manager-portal` on unraid01 (config/backup/bind mounts under `/mnt/user/docker/server-manager-portal/` are untouched).
3. Immediately `POST /api/git/stacks/151/deploy` so Dockhand recreates the container with the stack `stack.yaml`, `stack.env`, and `.env.dockhand`.

**Verify:** `com.docker.compose.project=server-manager-portal` on the container, deploy succeeds twice in a row, `https://plex.lostwaldo.net` returns 200.

**Do not use Watchtower** for this stack; use Dockhand deploy so Compose ownership stays correct.
