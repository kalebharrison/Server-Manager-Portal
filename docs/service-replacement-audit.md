# Service replacement audit

Snapshot after Wave 1–4 upstream ports on fork `beta` (lab stack; see `.local/` for hostname).

| Container | Portal coverage now | Recommendation |
|---|---|---|
| **overseerr** | Requests are fully portal-native (TMDB Discover + Arr requester tags). The external request-app integration has been removed from the portal entirely. | **Drop** — the portal no longer talks to it. |
| **requestrr** | Portal Discord `/request` bot (WIP) overlaps. | **Candidate to drop** once Discord bot is enabled and trusted on prod; confirm slash commands cover Requestrr workflows first. |
| **kometa** | ColleXions was **not** ported in this plan. | **Keep** for now. |
| **checkrr** | Library Upgrader browse/index landed (standalone); advanced ARR CF/TRaSH actions still incomplete vs upstream. | **Keep** until Upgrader episode/profile/search actions match your checkrr use cases. |
| **speedtest-tracker** | Portal Status speed test added for signed-in members. | **Keep** dedicated tracker for WAN/history; portal test is convenience only. |
| **trimarr-*** | Unrelated to Upgrader (anime/TV trim pipelines). | **Keep**. |
| **notifiarr** | Still owns Arr/Plex Discord media posts. | **Keep** (do not double-wire portal webhooks). |
| **Autoscan** | Not running; Scanner port adds Arr→Plex/JF partial refresh in-portal. | **No container to drop** — configure Arr webhooks to portal `/triggers/*` on lab first. |

## Promote checklist

1. Smoke lab: themes, What’s New, nav hide, mobile More, Scanner settings, Status speed test, Request Review modal, Upgrader page (admin).
2. Smoke the portal request path end to end: Discover → request → admin approve → Arr add with requester tag.
3. Merge `beta` → `main` → Dockhand pulls `:main`.
