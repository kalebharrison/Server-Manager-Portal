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
