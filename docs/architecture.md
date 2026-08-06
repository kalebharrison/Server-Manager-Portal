# Architecture

Server Portal is a single Node.js process that serves:

1. A React SPA (built into `static/`)
2. Authenticated JSON APIs for members and admins
3. Background jobs (user sync, expiry, analytics caches, backups)

## Composition root

[`server/index.js`](../server/index.js) creates shared services (cache, email, media-user sync, portal requests, analytics, status) and registers route modules from `lib/`.

There is no separate API microservice. Integrations (Plex, Jellyfin, Arr, Tautulli/Jellystat) are called server-side with stored credentials.

## Domains

Backend modules live under `lib/` by responsibility — auth, users, analytics, plex, portal-request, media-stack, status, comms, admin, http, cache, config, core, upgrader. See [`lib/README.md`](../lib/README.md).

Frontend code lives under `client/` with feature folders (`settings`, `requests`, `setup`, `home`, `screens`, `shared`, `upgrader`).

## Auth model

- Plex OAuth or Jellyfin login / Quick Connect
- JWT session cookie
- Admin vs member gates on routes
- Optional admin “View As” impersonation with a short-lived user token
- Revoked/expired members are rejected on session/member paths

## Requests

Requests are portal-native. Discover browsing comes straight from TMDB, and approvals are pushed to Sonarr/Radarr/Lidarr with a requester tag so ownership survives outside the portal.

Discord invite / request-bot work is planned separately; see [Discord integration plan](./discord-integration-plan.md).

## Data

Runtime JSON lives in `CONFIG_DIR` (default `./config` or `/app/config`):

- settings / secrets (encrypted fields)
- users, invites, audit log
- analytics / trending / stats caches
- status history, kill rules, etc.

Rolling backups write to `./backup` (or `/app/backup`).

## Caching

- In-process TTL/LRU caches for hot API responses
- Adaptive warmers for discovery/posters/stats
- Bounded image proxy caches (Plex / Jellyfin / TMDB)

## Background tasks

Managed through Settings → Background Tasks / System diagnostics:

- Media-server user sync
- Expiry email + revoke
- Inactive cleanup
- Analytics / trending rebuilds
- Plex library stats (Plex mode)
- Auto rolling backup

When Quality Control is enabled ([`lib/upgrader/`](../lib/upgrader/)), additional jobs start at portal boot:

| Job | Interval | Requires |
|---|---|---|
| Library index rebuild | ~4 hours | QC enabled + ready Arr instances |
| Auto-hunt | ~20 minutes | QC + auto-hunt enabled |
| Download cleanup | ~5 minutes | QC + cleanup automation enabled; Arr + qBit/SAB reachable |
| Integrity baseline backfill | on boot + nightly rechecks | QC + integrity enabled; media mounts + path maps for file access |

See [Quality Control](./quality-control.md) for hunt, download health, and integrity behavior.
