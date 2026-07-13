# Upstream PR Notes

Working branch: `codex/upstream-feature-ports`

Beta image branch: `beta`

## Change Ledger

- `fa42a53 fix: port upstream stability fixes`
  - Version fallback, Plex bandwidth normalization, setup and Plex discovery hardening, analytics privacy, stale trial-label cleanup, branding asset persistence.
  - Upstream PR fit: good candidate as focused reliability fixes if split by topic.

- `83367f1 fix: tighten mobile navigation`
  - Feature-aware nav, safer mobile/iOS layout, in-app navigation buttons instead of external anchors where appropriate.
  - Upstream PR fit: good candidate if isolated from local-only cleanup.

- `2fc34b6 feat: embed request app workflow`
  - Native Seerr/Jellyseerr request browsing, search, TV season selection, request submission, admin queue actions, server-side request app proxy, `REQUEST_APP_INTERNAL_URL`, safe browser ID helper, user-sync typo fix.
  - Upstream PR fit: likely useful, but should be split into request-app service/routes, frontend request UI, and standalone bug fixes.

- `7cd531d ui: unify media stack calendar`
  - Replace split Sonarr/Radarr release columns with a unified calendar filter (`All`, `TV`, `Movies`), make release rows wide enough for readable titles, and move downloads/status/history under a clearly labeled `Automation Activity` section.
  - Upstream PR fit: good UX candidate after visual review and mobile check.

- `4f78c47 feat: enrich embedded request details`
  - Expand the native Seerr/Jellyseerr detail modal with metadata, genres, cast, crew, production companies, external links, TV season facts, and a pinned request action.
  - Upstream PR fit: belongs with the embedded request workflow, possibly as its own frontend/backend detail-view follow-up.

- `0e48c23 ui: tighten request modal and media downloads`
  - Lock page scroll behind the embedded request detail modal, make the modal body scroll as one surface, and split media stack downloads into a dedicated `Downloads` tab without storage or history panels.
  - Upstream PR fit: follow-up UI polish for request workflow and media stack calendar, likely best split by screen.

- `3fec734 ui: move downloads into discover`
  - Move active TV/movie download progress to Discover as an `On The Way` poster section, keep file/release names hidden, remove download UI from Media Stack, hide app-brand labels from normal user-facing calendar/status surfaces, add list/month calendar modes, and hide already available request content.
  - Upstream PR fit: split into Discover download widget, release calendar view, and request browsing cleanup.

- `894fd97 feat: extend request browsing and issues`
  - Add embedded request browse categories for trending, popular, upcoming, movies, and TV; show genre chips from Seerr/TMDB data; and submit basic media issue reports through the request app when the title is tracked there.
  - Upstream PR fit: request-app frontend/backend follow-up after the base embedded workflow.

- `edc1fd6 ui: refine request filters`
  - Replace mutually exclusive request tabs with independent category and type toggles, make search include available/in-progress titles, add a browse toggle for existing titles, and hide generic Arr queue download cards that lack real media metadata.
  - Upstream PR fit: follow-up UX polish for embedded requests and Discover download status.

- Pending: request pagination and Discover performance
  - Hydrate Arr queue records with their media metadata, add incremental request browsing and an Anime filter, summarize same-day TV season dumps in the calendar, and defer off-screen poster rendering and image decoding.
  - Upstream PR fit: split into media-stack data/calendar work, request browsing, and generic Discover rendering performance.

- Pending: request discovery pagination correction
  - Make next-page detection work with Seerr instances that omit `pageInfo.pages`; exclude Anime and Foreign content from ordinary browsing; use supported movie-genre queries with a fallback batch scan; and add composable genre filtering.
  - Upstream PR fit: request-app service and request browsing follow-up.

- Pending: Discover cache and rendering performance
  - Separate live stream polling from cached recent-library data, cache expensive quality-tag enrichment, parallelize initial Discover data sources, strengthen poster-cache headers, and avoid waking all analytics rows at once while scrolling.
  - Upstream PR fit: standalone performance improvement with focused Plex dashboard coverage.

- `b10bc01 feat: classify active downloads`
  - Label On The Way items as new content or upgrades using Arr file-state metadata without exposing release filenames.
  - Upstream PR fit: standalone Discover download-card enhancement.

- `776dbda perf: simplify discover community analytics`
  - Reduce community analytics from nine poster rows to three deterministic core rankings, isolate ranking logic, cap oversized sections, stabilize poster keys, and preload the first visible posters.
  - Upstream PR fit: standalone analytics builder and Discover performance cleanup.

- `d4899f8 security: harden setup and upstream logging`
  - Move HTTP security policy into a dedicated module, remove setup tokens from query-string authentication, use constant-time token comparison, and stop logging upstream account response bodies.
  - Upstream PR fit: focused setup/header and sensitive-logging hardening.

- `0ce8c22 refactor: remove duplicate presentation code`
  - Extract request-detail presentation components from the modal and remove a duplicated 202-line Tailwind component block plus its generated CSS.
  - Upstream PR fit: separate request-modal organization and Discover CSS/rendering cleanup.

- Pending: queue accuracy, status reliability, and settings cleanup
  - Hydrate Arr queue movie/episode state before labeling downloads as New or Upgrade; use stable poster placeholders without per-image React renders; resolve built-in portal/Plex monitors through local/runtime connection paths; validate status configuration limits and URLs; reorganize settings, mark admin-only navigation, defer tab-specific data, and remove duplicate task/audit views.
  - Upstream PR fit: split into Arr queue enrichment, status monitor reliability/security, Discover poster rendering, and settings information architecture.

- Pending: analytics privacy and safe admin impersonation
  - Always anonymize analytics and active-stream identities for non-admins; remove peer account IDs from personal leaderboard data; remove the unsafe username-sharing setting; restore audited admin View As with short-lived tokens, cache clearing, explicit exit UI, and mutation blocking; split Analytics data loading and trending content into focused modules.
  - Upstream PR fit: split into privacy enforcement, impersonation restoration/hardening, and Analytics component organization.

- Pending: user-facing status reliability and account preference visibility
  - Replace redundant status analytics with a concise overview and daily history; calculate accurate 30-day uptime; distinguish uncollected history from outages; stop counting portal downtime as service downtime; migrate invalid legacy history; and show persisted newsletter preferences on admin user cards.
  - Upstream PR fit: split into status history correctness, status page UX, and admin user preference visibility.

- Pending: member preferences and clean request artwork
  - Remove the unnecessary dark overlay from request posters and give members a stable Preferences route for their local theme and persisted newsletter subscription, independent of dashboard widget visibility.
  - Upstream PR fit: split into request-card visual cleanup and member preference navigation.

- Pending: settings architecture and public exposure hardening
  - Reorganize admin settings by ownership; move access, privacy, cleanup, support, and announcement controls out of connection/appearance forms; remove the obsolete external Request URL UI; add member-local time, poster, motion, and request defaults; fix masked-token Plex discovery; require explicit opt-in for public status and library totals; protect diagnostics; minimize public branding data; and enforce a route-classification regression test.
  - Upstream PR fit: split into Plex discovery correctness, settings information architecture, member preferences, and public API hardening.

- Pending: resilient request browsing and focused Discover views
  - Retry transient request-app reads, serve recently cached browse data during short Seerr outages, keep errors actionable, preserve custom Status page group/service labels, split Discover into Library and Community views, and remove compounded spacing between download and recently added sections.
  - Upstream PR fit: split into request-app resilience, Status page label customization, and Discover view/component organization.

- Pending: instant media surfaces and simplified Home activity
  - Persist and refresh recent Plex library data every five minutes; separate cached library reads from live sessions; use stale-while-refresh caches; prewarm request discovery and release-calendar data; add a configurable seven-day Home calendar; simplify Discover navigation; collapse recent TV episodes into one series entry; and remove obsolete loading skeletons.
  - Upstream PR fit: split into Plex dashboard cache service/routes, generic cache behavior, Home calendar, and recent-history aggregation.

- Pending: persisted personal summaries and shared live streams
  - Persist per-user Plex wrap-up snapshots across restarts with background refresh; remove Home analytics loading placeholders; keep one privacy-aware live-stream panel above both Discover views and on the admin Home; add a sessions-only Jellyfin endpoint; and abstract default request-provider branding on member Status pages while clarifying public display-name settings.
  - Upstream PR fit: split into personal analytics caching, shared streams UI/Jellyfin sessions, and Status label abstraction.

- Pending: encrypted configuration, protected backups, and metadata/music integrations
  - Encrypt all stored credentials with authenticated AES-256-GCM using environment-held key material; migrate plaintext config and rolling backups; enforce owner-only permissions; add TVDB fallback enrichment for TV details; and add Lidarr connection, status, and active-download support without bypassing request-app permissions.
  - Upstream PR fit: split encryption/storage hardening from TVDB metadata and Lidarr automation support.

- Pending: metadata health and multi-instance automation
  - Separate TMDB/TVDB settings from application connections; monitor both APIs with cached authenticated probes; support named Sonarr, Radarr, and Lidarr instances while preserving legacy defaults; and allow Seerr/Jellyseerr to coexist with a secondary Ombi music-request connection.
  - Upstream PR fit: split metadata settings/status probes from the multi-instance Arr port and dual-requester configuration.

- Pending: accurate request states and adaptive media caches
  - Show accepted media as Requested until Sonarr/Radarr reports an active download; prefer TVDB show metadata with IMDb fallback matching; add a configurable background cache interval; and prewarm authenticated, bounded TMDB poster bytes with strict outbound host validation.
  - Upstream PR fit: split request-state correlation, TVDB metadata priority, and generic cache scheduling/poster proxying into focused changes.

## Split Candidates

- Reliability/security fixes: low-risk upstream PR.
- Mobile navigation polish: standalone UI PR.
- Embedded Seerr/Jellyseerr request workflow: larger feature PR, needs docs and permission notes.
- Media stack calendar UX: standalone UI PR after screenshots.
- Library Upgrader from `testing`: separate high-risk feature port, not mixed with the above.

## Local/Fork-Specific Notes

- Do not push experimental work directly to upstream.
- Use the fork `beta` branch for GHCR image testing.
- Keep `REQUEST_APP_INTERNAL_URL` documented for Docker/Unraid deployments where public Seerr URLs do not work from inside the portal container.
