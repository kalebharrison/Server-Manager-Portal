# Integrity import webhooks

Library Integrity can fingerprint new files **on Arr import/upgrade**, so coverage stays current without waiting for a manual or nightly scan.

That only works if Sonarr / Radarr / Lidarr notify the portal.

## What you need

1. **Quality Control** enabled, with **Library integrity** enabled  
   Settings → Quality Control (Admin Only)
2. **Webhook username + password** set in that same Integrity section
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
| Notification triggers | **On Import** / **On Upgrade** (and Import Complete if offered) |
| URL | `http://<portal-container>:2121/triggers/<sonarr\|radarr\|lidarr>` |
| Method | `POST` |
| Username / Password | Same values as Settings → Quality Control → Library integrity |

Leave other triggers off unless you intentionally want more traffic.

### Test

Use Arr’s **Test** button on the connection. A successful test returns HTTP 200 from the portal. Test events do **not** create integrity baselines (only real import/upgrade payloads do).

## What the portal does on import

1. Receives the Arr webhook
2. Builds a candidate from the imported file path / ids
3. Runs an Integrity **baseline** (playback check + quick fingerprint; full-file hash only if enabled)
4. Stores the result under the same cache key coverage uses (`sonarr:<instance>:<id>:file:<fileId>`)

If auth is missing, Integrity is disabled, or Arr cannot reach the URL, imports still succeed in Arr — the portal simply never baselines them and coverage only moves when you run scans manually.

## Related settings

- Media must be mounted into the portal container (read-only is fine); see [Deployment](./deployment.md)
- Arr→container path maps if Arr paths differ from portal paths
