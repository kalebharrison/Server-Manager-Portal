# Architecture

Server Portal is a single Node.js process that serves:

1. A React SPA (built into `static/`)
2. Authenticated JSON APIs for members and admins
3. Background jobs (user sync, expiry, analytics caches, backups)

## Composition root

[`server/index.js`](../server/index.js) creates shared services (cache, email, media-user sync, request-app, analytics, status) and registers route modules from `lib/`.

There is no separate API microservice. Integrations (Plex, Jellyfin, Seerr, Arr, Tautulli/Jellystat) are called server-side with stored credentials.

## Domains

Backend modules live under `lib/` by responsibility — auth, users, analytics, plex, request-app, media-stack, status, comms, admin, http, cache, config, core. See [`lib/README.md`](../lib/README.md).

Frontend code lives under `client/` with feature folders (`settings`, `requests`, `setup`, `home`, `screens`, `shared`).

## Auth model

- Plex OAuth or Jellyfin login / Quick Connect
- JWT session cookie
- Admin vs member gates on routes
- Optional admin “View As” impersonation with a short-lived user token
- Revoked/expired members are rejected on session/member paths

## Membership ↔ request app

When Seerr/Jellyseerr is configured and **Sync membership with Seerr** is enabled:

- Active portal members are imported into Seerr (for request attribution / Discord media events)
- Revoked/deleted members are removed from Seerr (admin id `1` is protected)

Members do not use the Seerr UI; the portal proxies request browsing and submission.

Discord invite / request-bot work is planned separately; see [Discord integration plan](./discord-integration-plan.md). Seerr can keep owning Discord “media ready” notifications even if the portal later hosts a request bot.

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
