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

- Pending: rich request detail view
  - Expand the native Seerr/Jellyseerr detail modal with metadata, genres, cast, crew, production companies, external links, TV season facts, and a pinned request action.
  - Upstream PR fit: belongs with the embedded request workflow, possibly as its own frontend/backend detail-view follow-up.

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
