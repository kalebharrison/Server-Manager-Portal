# Integrity import webhooks

Library Integrity can fingerprint new files **on Arr import/upgrade**, so coverage stays current without waiting for a manual or nightly scan.

That only works if Sonarr / Radarr / Lidarr notify the portal.

## What you need

1. **Quality Control** enabled, with **Library integrity** enabled  
   Settings → Quality Control → Integrity
2. **Arr import hook username + password** set in Settings → Discord
3. An Arr **Webhook** notification per app pointing at the portal

## Portal endpoints

| App | Method | Path |
|---|---|---|
| Sonarr | `POST` | `/triggers/sonarr` |
| Radarr | `POST` | `/triggers/radarr` |
| Lidarr | `POST` | `/triggers/lidarr` |

Use HTTP Basic Auth with the Integrity webhook username/password.

### URL to use from Arr

Prefer a URL Arr can resolve from **inside Docker**:

```text
http://server-manager-portal-beta:2121/triggers/sonarr
http://server-manager-portal-beta:2121/triggers/radarr
http://server-manager-portal-beta:2121/triggers/lidarr
```

Replace the hostname with your portal container name on production (for example `server-manager-portal`), and the port if you changed `PORT`.

Public HTTPS hostnames only work if Arr containers can resolve and reach them. Many homelab DNS setups cannot.

## Arr notification settings

In each Arr app → Settings → Connect → Add → **Webhook**:

| Field | Value |
|---|---|
| Name | `Portal Integrity` (or similar) |
| Notification triggers | **On Import** / **On Upgrade** (Sonarr/Radarr). Lidarr: **On Release Import** / **On Upgrade**. |
| URL | `http://<portal-container>:2121/triggers/<sonarr\|radarr\|lidarr>` |
| Method | `POST` |
| Username / Password | Same values as Settings → Discord → Arr import hooks |

Leave other triggers off unless you intentionally want more traffic.

### Test

Use Arr’s **Test** button on the connection. A successful test returns HTTP 200 from the portal. Test events do **not** create integrity baselines (only real import/upgrade payloads do).

## What the portal does on import

1. Receives the Arr webhook
2. Builds a candidate from the imported file path / ids
3. Runs Integrity **baseline** in order: **playback → media trim (if enabled) → playback → quick fingerprint → optional full-file hash**
4. On hard failure: stores a finding, blocklists the release, and (if integrity automation is on) deletes + re-searches
5. On soft decode timeout (when enabled): stores a finding and queues a recheck — **no blocklist**
6. On success: stores the result under the same cache key coverage uses (`sonarr:<instance>:<id>:file:<fileId>`). When Discord **Post new media / upgrades after Integrity verifies** is enabled, the portal also queues a **member-channel** announce (TV seasons are debounced into one post). Soft timeouts do **not** announce until a later recheck passes.

If auth is missing, Integrity is disabled, or Arr cannot reach the URL, imports still succeed in Arr — the portal simply never baselines them and coverage only moves when you run scans manually.

## Related settings

- Media must be mounted into the portal container (read-only is fine); see [Deployment](./deployment.md)
- Arr→container path maps if Arr paths differ from portal paths
- Discord **admin issues webhook** for integrity **failures** (Settings → Discord); falls back to the member notifications webhook if blank
- Discord **member notifications webhook** for post-integrity media/upgrade announces (and email mirrors)
