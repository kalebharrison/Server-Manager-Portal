# Server modules (`lib/`)

Backend code is grouped by domain. `server/index.js` wires these modules together.

| Folder | Responsibility |
|---|---|
| `admin/` | Admin routes, backups, background jobs, kill rules, audit log |
| `analytics/` | Plex/Tautulli/Jellystat analytics, trending, personal wrap-up caches |
| `auth/` | Login/session, Jellyfin auth, impersonation, admin profile |
| `cache/` | TTL/LRU helpers and adaptive cache warmers |
| `comms/` | SMTP email, newsletter, broadcast |
| `config/` | Settings API, secrets, data paths, dashboard layout |
| `core/` | Small shared primitives (dates, JSON store, concurrency) |
| `http/` | Security headers, SSRF/network policy, rate limits, static shell |
| `jellyfin/` | Jellyfin API routes |
| `media/` | Shared media helpers (TMDB image URLs, anime/adult filters) |
| `media-stack/` | Sonarr/Radarr/Lidarr calendar/queue and media issues |
| `metadata/` | TVDB lookups and metadata health checks |
| `plex/` | Plex routes, stats, images, connections |
| `portal-request/` | Portal-native Discover, requests, issues, quotas, watchlist |
| `status/` | Public/private status page and stream monitor helpers |
| `upgrader/` | Quality Control — library index/hunt, download health (qBit/SAB), integrity scans, Arr import webhooks |
| `users/` | Membership, invites, profiles, notifications, admin user ops |

Prefer keeping new files in the matching domain folder. Cross-domain imports use relative paths (`../cache/cache.js`, etc.).
