# Discord bot and notifications

Private community bot: slash commands, member DMs, and channel cards after Integrity. Notifiarr is optional and separate.

Configure day-to-day options under **Settings → Discord**. Create the Discord application once in the [Developer Portal](https://discord.com/developers/applications), then lock it down as below.

Agent / natural-language details: [Discord integration plan](./discord-integration-plan.md).

## What posts where

| Event | How it ships |
|---|---|
| New / upgraded media (after Integrity) | Bot message in the **member channel** (webhook fallback) |
| Announcement / broadcast / newsletter mirrors | Same member channel, bot first |
| Request approved / available, issue reply / resolved | Email (when SMTP is on) + **bot DM** if the member linked a Discord ID |
| QC cleanup + integrity failures | Bot message in the **admin channel** (admin webhook fallback) |

Slash commands are registered **per guild** (what the server picker shows) plus a **DM-only** global copy so `/help` works in bot DMs. You should not see each `/command` twice in Server Settings → Integrations.

Members paste their Discord user ID under **Preferences**. DMs are allowed only if that user can view the configured member channel.

## Developer Portal

Use one application. Keep it **private** (not App Directory).

### General Information

| Field | Set to |
|---|---|
| Interactions Endpoint URL | **Blank.** This portal uses a Gateway bot (`discord.js`), not HTTP interactions. A URL here breaks slash commands. |
| Linked Roles Verification URL | **Blank.** Linked Roles are not implemented. |
| Terms of Service URL | Blank unless you publish real `/terms` on the portal. |
| Privacy Policy URL | Blank unless you publish real `/privacy` on the portal. |

### Installation

| Setting | Set to |
|---|---|
| User Install | **Off** |
| Guild Install | **On** |
| Install Link | **None** (bot is already in the server). If Discord refuses to save None + Guild Install, use Discord Provided Link and turn **Public Bot** off. |
| Guild scopes | `bot` and `applications.commands` |
| Guild permissions | View Channel, Send Messages, Embed Links, Attach Files, Read Message History, Add Reactions, Use External Emojis, Use Slash Commands. Never Administrator. |

Do not share the OAuth2 authorize URL. Client id is visible on the bot user; Public Bot off is what stops strangers installing it.

### OAuth2

- Redirects: **none** (portal login is Plex/Jellyfin, not Discord).
- Ignore client secret unless you add Discord OAuth later.

### Bot

| Setting | Set to |
|---|---|
| Public Bot | **Off** — only the app owner/team can install |
| Requires OAuth2 Code Grant | Off |
| Presence Intent | Off |
| Server Members Intent | Off |
| Message Content Intent | **On** (DMs and optional `@bot` natural language) |
| Reset Token | Only if the token leaked |

The Bot Permissions checkbox grid is an **invite-link calculator**. It does not change permissions on a server where the bot already lives. Integer `0` is fine while Install Link is None.

## Discord server

Invite once with `bot` + `applications.commands`. Then set **channel** overwrites (Server Settings → Roles is optional backup).

**Member media channel** (the snowflake saved as Member channel ID):

- View Channel, Send Messages, Embed Links, Read Message History
- Optional: Attach Files, Add Reactions, Use External Emojis

**Admin ops channel** (QC / integrity — wherever the admin webhook points):

- Same send/view/embed/history overwrites
- Requesty must be a member of this channel or posts stay on the webhook

Confirm a post is from the bot: full bot username, **BOT** badge, clickable bot profile. Webhook leftovers have no real profile.

Test member cards: Settings → Discord → **Post test movie + TV announce**.

## Portal Settings → Discord

| Field | Role |
|---|---|
| Enable Discord / member bot | Master switches |
| Invite URL | Shown to members as Join Discord |
| Guild ID | Server snowflake |
| Bot token | Developer Portal → Bot (store in Settings; encrypted at rest) |
| Member channel ID | DM gate + where media/announce cards post as the bot |
| Member webhook URL | Fallback if the bot cannot send in that channel |
| Admin webhook URL | QC + integrity destination; bot posts here when it can see the channel |
| Notify toggles | DMs, announcement mirrors, media-ready cards |
| Media announce wait | Groups TV season episodes before posting |

Arr **Portal Integrity** Connect hooks are unrelated to Discord posting. They hit `/triggers/{sonarr,radarr,lidarr}` so Integrity can verify files before a media card goes out.

## Smoke checklist

- [ ] Developer Portal: Public Bot off, User Install off, no interactions/linked-roles URLs, Message Content on, other privileged intents off
- [ ] Bot can view + send in member and admin channels
- [ ] Integrations shows each slash command **once**
- [ ] Linked member: `/help`, `/request`, `/myrequests`
- [ ] Test media announce posts as the **bot**, not a webhook name
- [ ] Next QC cleanup / integrity failure in the admin channel is the bot (after Requesty is in that channel)
- [ ] Unlinked Discord ID is denied with a Preferences hint
- [ ] Approve/decline DMs a linked member; nothing extra lands in the member channel for that event
