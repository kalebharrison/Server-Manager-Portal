# Discord integration plan (Requestrr replacement)

Goal: manage Discord invites + (optionally) a request bot from this portal, so Requestrr is no longer required.

**Status (beta):** Phases 1–3 are implemented. Configure under Settings → Support & Announcements → Discord. Members link Discord user ID under Preferences and use Join Discord on the home Support card. `/request` slash command requires bot token + guild id; channel webhook posts are optional alongside Seerr Discord / **Notifiarr**.

Today the portal already owns the **web** request experience (Seerr/Jellyseerr proxy + membership sync). Requestrr only adds a **Discord** request surface. Discord media notifications can already live in Seerr or **Notifiarr** — that does not have to move.

---

## Current state

| Concern | Who owns it today |
|---|---|
| Browse / request in the browser | Portal → Seerr API |
| Member sync into Seerr | Portal (`Sync membership with Seerr`) |
| Discord request slash-commands | Requestrr (external) |
| “Movie ready” Discord posts / DMs | Usually **Seerr Discord** and/or **Notifiarr** |
| Portal outbound notify | SMTP email only |

There is **no** Discord bot, webhook, or invite config in this repo yet.

---

## Phase 1 — Discord hub (invites + settings)

**Ship this first.** Low risk, useful even if Seerr keeps notifications and Requestrr stays temporarily.

### Admin settings
- Discord invite URL (guild / community invite)
- Optional labels: “Chat / bot channel”, “Media notification channel” (names or channel links for members)
- Optional: bot token + guild id (stored encrypted; used later by phases 2–3)
- Connection / “save” validation where possible

### Member-facing
- “Join Discord” entry on portal home / preferences / request area
- Points at the invite URL and briefly explains chat vs media channel
- Does **not** require replacing Seerr or Requestrr

### Why
Members get a single place (the portal) for “how do I get into Discord,” without hunting for invite links.

---

## Phase 2 — Portal-posted Discord notifications (optional)

This is the confusing one if Seerr Discord is already working.

### What phase 2 means
The **portal** posts selected events to a Discord channel (webhook or bot), for example:
- request approved / declined
- issue reply
- “now available” style events the portal already knows about

### What phase 2 does **not** mean
- You must turn off Seerr Discord
- The portal must become the only notifier on day one

### Keep Seerr Discord if…
- It’s already posting the media-available events you care about
- You’re happy managing Discord agents inside Seerr
- You only wanted portal-managed **invites** + later a **request bot**

**Recommended default for your setup:** skip or defer phase 2. Keep Seerr and/or **Notifiarr** as the media notification engine. Phase 1 + phase 3 still replace Requestrr without touching those notifiers. If Notifiarr already posts grabbed/imported/available to Discord, leave the portal webhook blank.

### Consider moving (or dual-posting) if…
- You want one admin surface for “where Discord stuff is configured” (portal settings only)
- You want events Seerr doesn’t see (portal-only broadcasts, invite claims, expiry, etc.)
- You’re trying to reduce Seerr Discord agent complexity later

### If we do phase 2
Prefer a **channel webhook** first (no slash-command bot required):
1. Settings: webhook URL + which event types to post
2. Hook into existing portal notification points (`member-notifications`, request approve/decline, etc.)
3. Document: “Seerr Discord can stay on; disable overlapping event types to avoid double posts”

---

## Phase 3 — Request bot (Requestrr replacement)

This is the actual Requestrr replacement: Discord slash commands / buttons that search and request through the **same** portal → Seerr path members use in the web UI.

### Behavior
- `/request` (or equivalent) search → pick result → submit via existing `request-app` client
- Map Discord user id ↔ portal member (must be active / not expired)
- Attribute the Seerr request to the synced Seerr user (quotas/permissions stay in Seerr)
- Optional: issue reporting parity later (not required for v1)

### Runtime
- Long-lived Discord gateway (same Node process or small sidecar)
- Config from portal settings (token, guild, allowed channels, linked roles)
- Membership changes in the portal continue to drive Seerr sync; bot only checks portal session/membership

### Success criteria to drop Requestrr
- Members can request movie/TV from Discord without Requestrr
- Requests show up in Seerr and in the portal request UI like any other request
- Revoked portal members cannot keep requesting via Discord

---

## Suggested order for this server

1. **Phase 1** — invite + member “Join Discord” (always useful)
2. **Phase 3** — request bot (replaces Requestrr)
3. **Phase 2** — only if you want portal-owned Discord posts; otherwise leave Seerr Discord alone

```text
Portal (web requests + membership)
    │
    ├─► Seerr ──► Notifiarr / Seerr Discord  (keep media posts here)
    │
    └─► Discord bot (phase 3) ──► same Seerr API path
            ▲
            └── invite link shown in portal (phase 1)
```

Operator API map (Dockhand, Notifiarr keys, etc.): see [`.local/README.md`](../.local/README.md).

---

## Out of scope for v1
- Full clone of every Requestrr feature (Lidarr-from-Discord, multi-instance 4K pickers, Ombi-only flows, etc.)
- Replacing Seerr itself
- Using Discord as a login provider for the portal (separate project)

---

## Open decisions (when implementation starts)

- Phase 2: skip / webhook-only / full bot posts
- Bot process: in-process vs sidecar container
- How members link Discord id (manual paste vs OAuth “Link Discord” button)
- Which channels the bot is allowed to listen in

---

## Related docs
- [Architecture — membership ↔ request app](./architecture.md)
- [Configuration](./configuration.md)
