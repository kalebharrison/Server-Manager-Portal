# Configuration

Most day-to-day settings live in the **Settings** UI after first-run setup. Environment variables cover secrets, networking, and container behavior.

## Required / recommended env

| Variable | Required | Description |
|---|---|---|
| `JWT_SECRET` | Yes | Session signing secret (min 32 characters) |
| `CONFIG_ENCRYPTION_KEY` | Recommended | Encrypts stored credentials and backups. Falls back to `JWT_SECRET` if unset — preserve whichever key you use across restores |
| `PUBLIC_BASE_URL` | Recommended | Public URL used in emails/links (include subpath when used) |
| `FORCE_SECURE_COOKIES` | Recommended behind HTTPS | Set `true` only when the portal is served over HTTPS |

See [`.env.example`](../.env.example) for the full template.

## Common optional env

| Variable | Description |
|---|---|
| `PORT` | Listen port inside the container (default `2121`) |
| `BIND_HOST` | Bind address (default `0.0.0.0`) |
| `CONFIG_DIR` | Runtime data directory (default `/app/config` in Docker) |
| `BASE_PATH` | URL prefix for subpath hosting (e.g. `/portal`) |
| `ALLOW_PRIVATE_INTEGRATION_URLS` | Allow LAN/private integration URLs |
| `PLEX_PREFER_REMOTE_CONNECTION` | Prefer non-localhost Plex connections in Docker |
| `PUID` / `PGID` | Run-as user/group after entrypoint drop (default `1000` / `1000`). **Must match Arr/downloaders** for `/media` QC remux/trim ownership. Do **not** set Docker `user:` — see [Deployment → Permissions](./deployment.md#permissions-puid--pgid) |
| `IMAGE_CACHE_MAX_MB` | Per-proxy in-memory image cache cap (default `64`) |
| `SETUP_TOKEN` | Optional one-time remote setup token |
| `CLIENT_ID` | Optional fixed Plex OAuth client id |

## Settings UI (high level)

| Area | What it controls |
|---|---|
| Media server | Plex or Jellyfin connection |
| Apps & automation | Sonarr / Radarr / Lidarr, Tautulli / Jellystat |
| Access & privacy | Referrals, public login stats, status page visibility, stream privacy |
| Branding | Theme, logo, animations, poster badges |
| Discord | Invite, bot token/guild, member/admin channels. Media + QC post as the bot (webhook fallback). Request/issue updates are email + bot DMs. See [Discord bot](./discord.md) |
| Home layout | Section order/visibility for member home |
| SMTP / newsletter | Master email toggle, admins-only testing mode, outbound SMTP, and newsletter schedule |
| Status | Monitored services and public status page |
| Quality Control | Master switch, auto-hunt, download cleanup thresholds, integrity scans, path maps, webhook auth. Download client URLs/credentials live under **Apps & Automation** (qBit/SAB). See [Quality Control](./quality-control.md) and [Integrity webhooks](./integrity-webhooks.md) |
| System | Backups, diagnostics, background tasks |

## Private homelab stack map (optional)

For operator notes and API keys that should never hit git (Dockhand, Notifiarr, etc.), use [`.local/`](../.local/README.md). Copy the `*.example*` templates to `stack.env` / `stack.json`.

Cloud agents only see committed examples unless the same values are added as **Cursor Cloud Environment** secrets.

Library totals and the public status page require explicit admin opt-in. Member APIs remain authenticated regardless of those display toggles.

## Secrets at rest

Integration credentials and generated backups use authenticated AES-256-GCM. Changing `CONFIG_ENCRYPTION_KEY` / the active `JWT_SECRET` without restoring the original key makes encrypted config and backups unreadable.
