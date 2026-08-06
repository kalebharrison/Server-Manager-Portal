# Service replacement audit

Snapshot after Wave 1–4 upstream ports on fork `beta` (lab stack; see `.local/` for hostname).

| Container | Portal coverage now | Recommendation |
|---|---|---|
| **overseerr** | Requests are fully portal-native (TMDB Discover + Arr requester tags). The external request-app integration has been removed from the portal entirely. | **Drop** — the portal no longer talks to it. |
| **requestrr** | Portal Discord `/request` bot (WIP) overlaps. | **Candidate to drop** once Discord bot is enabled and trusted on prod; confirm slash commands cover Requestrr workflows first. |
| **kometa** | ColleXions was **not** ported in this plan. | **Keep** for now. |
| **checkrr** | Quality Control covers library hunt/index, download health, and integrity (playback + fingerprint + optional full hash). CF/TRaSH profile tooling is in-portal; confirm episode/profile/search workflows match your checkrr habits before dropping. | **Keep** until QC hunt + integrity match your checkrr use cases. |
| **speedtest-tracker** | Portal Status speed test added for signed-in members. | **Keep** dedicated tracker for WAN/history; portal test is convenience only. |
| **trimarr-*** | Unrelated to Quality Control (anime/TV trim pipelines). | **Keep**. |
| **notifiarr** | Still owns Arr/Plex Discord media posts. | **Keep** (do not double-wire portal webhooks). |

## Scanner removal

The standalone **Scanner** service and nav entry are retired. **Library integrity** and Arr import webhooks now live under **Quality Control** (`/triggers/sonarr`, `/triggers/radarr`, `/triggers/lidarr` with Integrity webhook Basic Auth). See [Quality Control](./quality-control.md) and [Integrity import webhooks](./integrity-webhooks.md).

## Promote checklist

1. Smoke lab: themes, What’s New, nav hide, mobile More, Status speed test, Request Review modal, **Quality Control** page (admin) — Overview, Hunt, Integrity, Downloads tabs.
2. Smoke the portal request path end to end: Discover → request → admin approve → Arr add with requester tag.
3. Merge `beta` → `main` → Dockhand pulls `:main`.
