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

- Pending: focused security and Discover analytics cleanup
  - Move HTTP security policy into a dedicated module, remove setup tokens from query-string authentication, use constant-time token comparison, stop logging upstream account response bodies, classify On The Way items as new or upgrades, and reduce community analytics from nine poster rows to three deterministic core rankings.
  - Upstream PR fit: split into setup/header hardening, download classification, and analytics builder/UI simplification.

- Pending: presentation and stylesheet cleanup
  - Extract request-detail presentation components from the modal, remove a duplicated 202-line Tailwind component block, cap Discover sections at 50 items, use stable poster keys, and preload the first visible posters.
  - Upstream PR fit: separate request-modal organization and Discover CSS/rendering cleanup.

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
