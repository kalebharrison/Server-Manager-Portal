# Quality Control

Quality Control (QC) is an **admin-only** feature that hunts Sonarr/Radarr/Lidarr libraries for higher custom-format scores, monitors download clients for doomed queues, and optionally validates on-disk media for corruption.

Enable it in **Settings → Quality Control (Admin Only)**. The admin nav item **Quality Control** appears when enabled.

## Overview

| Area | What it does |
|---|---|
| **Library hunt** | Indexes Arr libraries and grabs upgrades when a release scores higher |
| **Download health** | Watches Arr queues + qBit/SAB for stalled, junk, or orphaned downloads |
| **Library integrity** | Validates Arr-known files with ffprobe/ffmpeg (playback, fingerprint, optional full hash) |

Backend code lives in [`lib/upgrader/`](../lib/upgrader/); the UI in [`client/upgrader/`](../client/upgrader/).

## Library hunt / upgrader

The hunt pipeline:

1. **Index rebuild** — pulls movies, series, and albums (with files) from connected Arr instances, scores them against quality profiles, and caches the result (~every 4 hours, or on demand from the Overview tab).
2. **Hunt** — ranks available releases and grabs upgrades that beat the current score by at least the configured minimum delta. Background hunt runs ~every 20 minutes when **Enable auto-hunt** is on; the **Hunt** tab also supports dry-run preview.
3. **Arrs** — import webhooks for Integrity, plus custom formats, quality profiles, TRaSH catalog, and CF repair helpers.

Hunt targets (Settings → Quality Control → Hunt preferences):

- **Missing aired episodes** (Sonarr)
- **Available movies** not yet in the library (Radarr)

Caps and preferences use **Hunt intensity** presets (or Advanced raw caps) plus DV/HDR/Atmos/Remux/season-pack boosts. Effective windows also appear on the **Rules** tab.

## Download health

Download health correlates Arr queue items with qBittorrent and/or SABnzbd to find downloads that are unlikely to succeed.

### Download clients

Credentials are configured in **Settings → Quality Control → Downloads** (qBittorrent URL/username/password; SABnzbd URL/API key). Blocked extensions are edited on the **Quality Control → Clients** dashboard tab.

The portal must reach Arr **and** the configured download client(s) from inside the container. Use Docker-reachable hostnames (see [Deployment](./deployment.md#docker-networking-tips)).

### What it detects

| Reason | Typical cause |
|---|---|
| metaDL | qBit stuck fetching metadata |
| stalled / slowDownload | No progress or sustained low speed |
| completedNotImporting | Finished in the client but Arr has not imported |
| orphan | Download not linked to an Arr queue item |
| duplicate | Same title grabbed more than once |
| blockedExtension | Junk payload (e.g. `.exe` inside a torrent) |
| failedImport / qualityDowngrade | Clear junk import or resolution downgrade vs existing file |

Items earn **strikes** across cleanup cycles; after **max strikes** the cleanup pass blocklists the Arr item, removes it from qBit/SAB, and triggers one re-search (throttled). **Enable cleanup automation** runs this on a ~5 minute timer; manual cleanup on the **Downloads** tab works even when automation is off.

The **Clients** tab can push recommended qBit/SAB settings and sync blocked-extension lists to the live clients.

## Library integrity

Integrity validates files Arr already knows about. It requires:

- `ffmpeg` / `ffprobe` in the portal image (included in the Docker build)
- Media mounted **read-only** into the container
- **Arr → container path maps** when Arr paths differ from mount paths

See [Deployment — integrity mounts](./deployment.md#optional-quality-control-integrity-media-mounts). Remux/trim writes must run as the same `PUID`/`PGID` as Arr/downloaders — see [Permissions](./deployment.md#permissions-puid--pgid).

**Path safety (portable):**
- Prefer **Arr → container path maps** when Arr paths differ from portal mounts.
- Optional **Media roots** allowlist (Settings) when you want a strict root list without remapping.
- With neither maps nor media roots, Integrity uses a **system-path denylist** so identity mounts (`/movies`, `/data`, …) work on any host — `/etc`, `/proc`, etc. stay blocked.

### Two pipelines

**Import / upgrade (Arr webhooks)**  
Playback check → optional **media trim** (MKV remux: keep configured languages + native, drop commentary / extra tracks) → playback again → quick fingerprint → optional full-file hash. Hard playback failures blocklist the release and (when automation is on) delete + re-search. Trim failures stay on the Integrity panel (no Discord) and skip the member announce. Soft decode timeouts (toggle, default on) do **not** blocklist — they queue a recheck instead. Expected runtime for duration mismatch comes from Arr **catalog** fields (TMDb/TVDB via episode/movie `runtime`), not file MediaInfo; probed `durationSec` still comes from ffprobe. For movies, Integrity also remembers the **longest probed length** on that file (after a successful playback pass) and treats edition hints in the path/release name (`Extended`, `Director's Cut`, etc.) as longer-than-catalog cuts — TMDb does not expose separate runtimes per edition. For **TV episodes**, catalog runtimes are often wrong (specials, variable-length shows) — Integrity only fails when the delta is large (±50% or ≥20 minutes). **Movies** use ±15 minutes or 15% (whichever is larger), with a higher ceiling when a longer cut is detected; absurd inflation (stuck-at-4h style) still fails. Use **Accept runtime** on a runtime drift row to store the probed file length as the baseline for that file (clears the finding; future scans compare against the longer of catalog and accepted length). Orphan `*.portal-trim.tmp.mkv` files from a mid-remux restart are removed on Integrity boot and before the next remux of that file. Remux concurrency defaults to **1** (hard max 2) and is gated process-wide so scans, rechecks, and imports cannot stampede the array. When **Plex refresh after import** is on (default), the portal asks Plex to path-scan the finished folder once Integrity completes — turn off Arr → Plex **On Import / On Upgrade** so Plex does not analyze the pre-remux file and then again after remux.

If the portal was down for the webhook (restart, deploy), a **recent-import catch-up** runs ~3 minutes after boot and about every **10 minutes**: Arr history for the last 24 hours, then whatever import checks are still missing (playback, trim when rewrite is on, fingerprint, optional full hash). After each import/upgrade webhook it also **debounces a forced catch-up (~90s)** so season-pack siblings that never got their own webhook still baseline. Already-complete stamps are left alone. It does **not** backfill the rest of the library. Member announce still fires if playback was never verified (deduped if it already posted).

**Nightly**  
If media trim is on, remux dirty MKVs first (skip Plex-playing / already-clean). Then full-library quick fingerprint vs cache. Matches move on. Mismatches escalate to playback → trim (safe remux if the file still plays) → hash. Failures alert on the admin Discord webhook and, when automation is on, replace/search **without** blocklisting (same release may come back).

The Integrity tab **Inspect a file** search shows the saved cache JSON for one title and runs playback / trim / fingerprint / hash on that file only.

### Check modes

| Mode | Label in UI | What it does |
|---|---|---|
| `playability` | Playback check | Decodes short samples at start, middle, and end via ffmpeg (retries + longer timeout) |
| `trim` | Media trim | Probes MKV tracks vs keep-rules (eng+ara+**one** native). Native is TMDb/TVDB `originalLanguage` from Arr/NFO IDs — movies TMDb→IMDb id, shows TVDB→TMDb→IMDb id — or a **manual override** from Findings when lookup fails. IMDb spoken-language lists are not used. If no original language is found, remux is skipped and the file is alerted. **Dry-run** / **Trim audit** write a keep/drop preview and never remux. Live remuxes only when auto-fix is on and Settings dry-run is off (or a manual Recheck forces rewrite). |
| `imohash` | Quick fingerprint | Fast spot-check (file size + small slices); catches silent swaps |
| `xxhash` | Full-file hash | Hashes the entire file; slowest — enable **Full-file hash (xxhash)** in Settings first |
| `baseline` | Run all checks | Playback + quick fingerprint together; adds full-file hash when xxhash is enabled |

Manual scans on the Integrity tab are admin tools (replace is dry-run by default). Click **Trim** on a library for a would-remux report (track names, not just IDs). Use **Trim audit** (or per-library **Audit**) to force-rescan keep-rules with remux permanently disabled, then download CSV/JSON. **Enable integrity automation** plus per-category auto-replace toggles allow nightly escalate replace and import hard-fail replace — leave Medium (shorter) off until you trust those findings.

Findings are kept **per check family**: a fingerprint (imohash) pass does not clear playback (`duration_mismatch` / decode) rows, and vice versa. Only a recheck, Accept runtime, Set native, Replace, Snooze, or a full baseline / import drops that finding. Severity is **Critical** (won't play), **High** (hash / path), **Medium** (shorter than catalog), **Low** (longer than catalog, trim soft skips). Auto-replace requires the master **Enable integrity automation** switch plus a **per-category** toggle (Medium / shorter defaults off; trim stays off because remux is not Arr Replace). On `trim_native_unknown`, set a language code in Findings — that override is trusted for remux keep-rules. The Integrity tab has Coverage / Findings / Lookup / Trim / Snoozed sub-views (URL `view=` + filters including `severity=`). The findings list holds up to **2000** rows.

Integrity skips files currently playing on Plex. A **circuit breaker** pauses **live replace** when findings hit **50** or **10%** of the cycle (configurable).

### Coverage

The Integrity tab shows per-library coverage for each check tier (playback, trim, fingerprint, optional hash). Trim uses the same Integrity cache as the other checks: size + mtime + keep-rule profile (Trimarr-style skip). Changing keep-rules or replacing the file invalidates the stamp. Webhook baselines and manual/nightly scans all write to the same cache.

## Arr import webhooks

To fingerprint files **on import/upgrade** (without waiting for a manual or nightly scan), configure Arr webhook notifications pointing at the portal.

Full setup: **[Integrity import webhooks](./integrity-webhooks.md)**.

## Settings reference

All QC settings are under **Settings → Quality Control (Admin Only)** (subtabs: Overview, Hunt, Downloads, Integrity):

| Section | Controls |
|---|---|
| Overview | Master switch + auto-hunt |
| Hunt | Missing episodes/movies, min size, **Hunt intensity** (Relaxed / Balanced / Aggressive), preference boosts; rate caps under Advanced |
| Downloads | qBit/SAB credentials, cleanup automation, **Cleanup aggression** presets; raw strike timers under Advanced. Blocked extensions live on **Quality Control → Clients** (not Settings) |
| Integrity | Webhooks, scans, automation, path maps, require audio, **media trim**, **Plex refresh after import**; fingerprint / playback / **trim remux** concurrency, xxhash / nightly under Advanced |

Presets expand to the same timer and rate-limit keys as before (`qcMaxStrikes`, `qcMetaDlMinutes`, `upgraderMaxActionsPerHour`, etc.). The engine still reads those raw values — presets are a Settings UI projection. Choosing Advanced values that diverge from a preset stores **Custom**.

Discord digest toggles for cleanup and integrity are on the Discord settings tab.

## Related docs

- [Deployment](./deployment.md) — media mounts, ffmpeg, networking
- [Configuration](./configuration.md) — Settings UI map
- [Integrity import webhooks](./integrity-webhooks.md) — Arr `/triggers/*` setup
- [Architecture](./architecture.md) — background jobs and `lib/upgrader/`
