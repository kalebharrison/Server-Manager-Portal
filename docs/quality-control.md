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
3. **Profiles** — manage Sonarr/Radarr custom formats and quality profiles, browse the TRaSH catalog, and run CF repair helpers from the dashboard chrome.

Hunt targets (Settings → Quality Control → Hunt preferences):

- **Missing aired episodes** (Sonarr)
- **Available movies** not yet in the library (Radarr)

Caps and preferences (max actions/hour, max downloads per library, min score delta, DV/HDR/Atmos/Remux/season-pack boosts) live in the same settings section and on the **Rules** tab.

## Download health

Download health correlates Arr queue items with qBittorrent and/or SABnzbd to find downloads that are unlikely to succeed.

### Download clients

Credentials are configured in **Settings → Apps & Automation** (qBittorrent URL/username/password; SABnzbd URL/API key). Quality Control reads those values — it does not duplicate them under the QC tab (the QC settings panel shows configured/not-configured status only).

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

### Check modes

| Mode | Label in UI | What it does |
|---|---|---|
| `playability` | Playback check | Decodes short samples at start, middle, and end via ffmpeg |
| `imohash` | Quick fingerprint | Fast spot-check (file size + small slices); catches silent swaps |
| `xxhash` | Full-file hash | Hashes the entire file; slowest — enable **Full-file hash (xxhash)** in Settings first |
| `baseline` | Run all checks | Playback + quick fingerprint together; adds full-file hash when xxhash is enabled |

Manual scans run from the **Integrity** tab (dry-run by default). **Enable integrity automation** allows nightly rechecks to delete bad files and trigger Arr re-search — leave off until you trust dry-run results.

Integrity skips files currently playing on Plex. A **circuit breaker** pauses scans when too many findings appear in one cycle.

### Coverage

The Integrity tab shows per-type coverage (movies, shows, albums) for each check tier. Webhook baselines and manual/nightly scans all write to the same cache.

## Arr import webhooks

To fingerprint files **on import/upgrade** (without waiting for a manual or nightly scan), configure Arr webhook notifications pointing at the portal.

Full setup: **[Integrity import webhooks](./integrity-webhooks.md)**.

## Settings reference

All QC settings are under **Settings → Quality Control (Admin Only)**:

| Section | Controls |
|---|---|
| Enable Quality Control | Master switch + auto-hunt |
| Download clients | Status + default blocked extensions (credentials in Apps & Automation) |
| Download cleanup | Automation, strike thresholds, timing per reason |
| Hunt preferences | Missing episodes/movies, caps, score delta, preference boosts |
| Library integrity | Enable scans, automation, path maps, webhook auth, xxhash, concurrency, nightly hour, circuit breaker |

Discord digest toggles for cleanup and integrity are in the same panel.

## Related docs

- [Deployment](./deployment.md) — media mounts, ffmpeg, networking
- [Configuration](./configuration.md) — Settings UI map
- [Integrity import webhooks](./integrity-webhooks.md) — Arr `/triggers/*` setup
- [Architecture](./architecture.md) — background jobs and `lib/upgrader/`
