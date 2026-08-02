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

### Optional: Quality Control integrity (media mounts)

Library integrity validates Arr-known files with `ffprobe` / `ffmpeg` inside the portal container. Mount media **read-only** and configure Arr→container path maps in Settings → Quality Control → Library integrity.

```yaml
# example compose additions
volumes:
  - ../config:/app/config
  - ../backup:/app/backup
  - /data/movies:/media/movies:ro
  - /data/tv:/media/tv:ro
```

Example path maps (Settings textarea):

```text
/movies=/media/movies
/tv=/media/tv
```

Without these mounts/maps, Integrity stays available in the UI but scans report paths as not visible.

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

- For LAN integrations (Sonarr, Radarr, Tautulli, Jellystat), set `ALLOW_PRIVATE_INTEGRATION_URLS=true` and use URLs reachable from inside the container (`http://host.docker.internal:8989` on Docker Desktop, or the host/LAN IP on Linux).
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

## Production / lab (Dockhand Git stacks)

Live portals should be owned by Dockhand (or your compose orchestrator), **not** by ad-hoc `docker run` / `docker compose` on the host. Homelab hostnames, stack ids, and verify URLs stay in gitignored `.local/` — do not commit them here.

| Item | Typical value |
|---|---|
| Prod image tag | `ghcr.io/<owner>/server-manager-portal:main` |
| Lab image tag | `ghcr.io/<owner>/server-manager-portal:beta` |
| Compose project (prod) | `server-manager-portal` |
| Compose project (lab) | `server-manager-portal-beta` |
| Stack has `repull_images = true` | floating tags are pulled on deploy |

### Normal production release flow

1. Merge/promote to `main` (CI builds and pushes the GHCR `:main` image).
2. Let Dockhand refresh the **prod** stack (webhook/CI or manual **Sync** then **Deploy**). Do **not** recreate the container on the host by hand.

### Lab / feature work (`beta`)

1. Push to `beta` (CI builds `:beta`).
2. Deploy the **lab** stack (see `.local/notes.md` for stack id + verify URL).

### Orphan container / name conflict

If someone runs `docker compose up` or `docker run` directly on the host, the container may lose `com.docker.compose.*` labels. Dockhand deploy then fails with *container name already in use*.

**Fix (minimal downtime):**

1. Confirm the prod stack sync is clean (`POST /api/git/stacks/<prod-stack-id>/sync`).
2. Remove only the orphan: `docker rm -f server-manager-portal` (config/backup bind mounts are untouched).
3. Immediately `POST /api/git/stacks/<prod-stack-id>/deploy` so Dockhand recreates the container with the stack `stack.yaml`, `stack.env`, and `.env.dockhand`.

**Verify:** `com.docker.compose.project=server-manager-portal` on the container, deploy succeeds twice in a row, prod URL returns 200.

**Do not use Watchtower** for this stack; use Dockhand deploy so Compose ownership stays correct.
