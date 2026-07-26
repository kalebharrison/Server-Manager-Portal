# Service replacement audit (unraid01)

Snapshot after Wave 1–4 upstream ports on fork `beta` (lab: `plex-beta.lostwaldo.net`).

| Container | Portal coverage now | Recommendation |
|---|---|---|
| **overseerr** | Still default request backend (`requestEngine=seerr`). Portal engine is opt-in dual-path; Discord/Ask remain Seerr-backed. | **Keep** until Discord/Ask facade + portal Discover UI are complete. |
| **requestrr** | Portal Discord `/request` bot (WIP) overlaps. | **Candidate to drop** once Discord bot is enabled and trusted on prod; confirm slash commands cover Requestrr workflows first. |
| **kometa** | ColleXions was **not** ported in this plan. | **Keep** for now. |
| **checkrr** | Library Upgrader browse/index landed (standalone); advanced ARR CF/TRaSH actions still incomplete vs upstream. | **Keep** until Upgrader episode/profile/search actions match your checkrr use cases. |
| **speedtest-tracker** | Portal Status speed test added for signed-in members. | **Keep** dedicated tracker for WAN/history; portal test is convenience only. |
| **trimarr-*** | Unrelated to Upgrader (anime/TV trim pipelines). | **Keep**. |
| **notifiarr** | Still owns Arr/Plex Discord media posts. | **Keep** (do not double-wire portal webhooks). |
| **Autoscan** | Not running; Scanner port adds Arr→Plex/JF partial refresh in-portal. | **No container to drop** — configure Arr webhooks to portal `/triggers/*` on lab first. |

## Promote checklist

1. Smoke lab: themes, What’s New, nav hide, mobile More, Scanner settings, Status speed test, Request Review modal, Upgrader page (admin).
2. Confirm `requestEngine` remains `seerr` on prod after promote.
3. Merge `beta` → `main` → Dockhand pulls `:main`.
