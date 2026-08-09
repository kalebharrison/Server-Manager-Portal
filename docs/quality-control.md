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

See [Deployment — integrity mounts](./deployment.md#optional-quality-control-integrity-media-mounts).

### Two pipelines

**Import / upgrade (Arr webhooks)**  
Playback check → optional **media trim** (MKV remux: keep configured languages + native, drop commentary / extra tracks) → playback again → quick fingerprint → optional full-file hash. Hard playback failures blocklist the release and (when automation is on) delete + re-search. Trim failures stay on the Integrity panel (no Discord) and skip the member announce. Soft decode timeouts (toggle, default on) do **not** blocklist — they queue a recheck instead.

If the portal was down for the webhook (restart, deploy), a **recent-import catch-up** runs ~3 minutes after boot and hourly: Arr history for the last 24 hours, then whatever import checks are still missing (playback, trim when rewrite is on, fingerprint, optional full hash). Already-complete stamps are left alone. It does **not** backfill the rest of the library. Member announce still fires if playback was never verified (deduped if it already posted).

**Nightly**  
If media trim is on, remux dirty MKVs first (skip Plex-playing / already-clean). Then full-library quick fingerprint vs cache. Matches move on. Mismatches escalate to playback → trim (safe remux if the file still plays) → hash. Failures alert on the admin Discord webhook and, when automation is on, replace/search **without** blocklisting (same release may come back).

The Integrity tab **Inspect a file** search shows the saved cache JSON for one title and runs playback / trim / fingerprint / hash on that file only.

### Check modes

| Mode | Label in UI | What it does |
|---|---|---|
| `playability` | Playback check | Decodes short samples at start, middle, and end via ffmpeg (retries + longer timeout) |
| `trim` | Media trim | Probes MKV tracks vs keep-rules (eng+ara+**native**; anime libraries default native to jpn). **Dry-run** (default) writes a keep/drop preview on the Integrity tab — nothing is rewritten. Remuxes only when auto-fix is on and dry-run is off. Records `trimAt` + profile so already-clean files skip next pass |
| `imohash` | Quick fingerprint | Fast spot-check (file size + small slices); catches silent swaps |
| `xxhash` | Full-file hash | Hashes the entire file; slowest — enable **Full-file hash (xxhash)** in Settings first |
| `baseline` | Run all checks | Playback + quick fingerprint together; adds full-file hash when xxhash is enabled |

Manual scans on the Integrity tab are admin tools (dry-run by default). Click **Trim** on a library for a would-remux report (track names, not just IDs). **Enable integrity automation** allows nightly escalate replace and import hard-fail replace — leave off until you trust dry-run results.

Integrity skips files currently playing on Plex. A **circuit breaker** pauses scans when too many findings appear in one cycle.

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
| Integrity | Webhooks, scans, automation, path maps, require audio, **media trim**; concurrency / xxhash / nightly under Advanced |

Presets expand to the same timer and rate-limit keys as before (`qcMaxStrikes`, `qcMetaDlMinutes`, `upgraderMaxActionsPerHour`, etc.). The engine still reads those raw values — presets are a Settings UI projection. Choosing Advanced values that diverge from a preset stores **Custom**.

Discord digest toggles for cleanup and integrity are on the Discord settings tab.

## Related docs

- [Deployment](./deployment.md) — media mounts, ffmpeg, networking
- [Configuration](./configuration.md) — Settings UI map
- [Integrity import webhooks](./integrity-webhooks.md) — Arr `/triggers/*` setup
- [Architecture](./architecture.md) — background jobs and `lib/upgrader/`
