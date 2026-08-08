# Discord integration (Requestrr replacement + member bot)

Goal: manage Discord invites and a member-facing Discord bot from this portal so Requestrr is no longer required, without replacing **Notifiarr** for media Discord posts.

**Status (beta):** Phases 1–3 plus member web-UI parity and optional natural language are implemented. Configure under Settings → Support & Announcements → Discord. Members link their Discord user ID under Preferences.

---

## Ownership split

| Concern | Owner |
|---|---|
| Browse / request in the browser | Portal → TMDB Discover + Arr |
| Discord member slash commands | Portal Discord bot (in-process) |
| New / upgraded media channel posts | Portal **member webhook** after Integrity verifies (Notifiarr optional) |
| Request approve / decline, issue replies, “now available” | Portal bot **DMs** the linked member (not the channel) |
| QC cleanup removals + integrity failures | Portal **admin webhook** (falls back to member webhook if blank) |
| Announcement / broadcast / newsletter mirrors | Portal **member webhook** |

Members must paste their Discord user ID under Preferences. Bot DMs require View Channel on the configured member channel.

---

## Bot commands (member parity)

| Command | Mirrors web |
|---|---|
| `/request query [type]` | Search → select → TV seasons / confirm → portal request |
| `/myrequests [filter]` | Request list / status for linked member |
| `/issue` (`report`, `list`, `view`, `comment`) | Media issues |
| `/stats` | Personal analytics |
| `/live` | Active streams (non-admins do not see other users’ names) |
| `/queue` | Pending / processing requests (downloads / on the way) |
| `/status` | Compact public status summary |
| `/discover [category]` | Trending / popular browse |
| `/ask text` | Natural language → same handlers |
| `/help` | Command guide |

Personal replies are ephemeral. TV multi-season flows always require confirm buttons — natural language never bypasses that.

Members must paste their Discord user ID under Preferences (Developer Mode → Copy User ID). Invite the bot with the `applications.commands` scope.

---

## Natural language + media discovery agent

Configure under **Settings → Discord** (not Support & Announcements).

| Mode | Behavior |
|---|---|
| Ops phrases | Instant fixed handlers (`my stats`, queue, live, status, issues, discover trending, help) |
| Media agent on | Discovery `/ask` uses a tool-calling agent: **web search** → TMDB resolve → answer + request buttons |
| Agent off / incomplete LLM config | Legacy phrase matchers + optional JSON intent LLM (title/person/theme shortcuts) |
| Unclear (no agent) | Bot replies with `/help` suggestions |

### LLM

OpenAI-compatible (`discordLlmUrl` + non-empty `discordLlmApiKey` + `discordLlmModel`) — Ollama on LAN or external LiteLLM/OpenAI. Prefer a **tool-calling** model (e.g. `qwen2.5:7b`). Toggle `discordAgentEnabled`.

### Web search (multi-provider)

Tried in order; first non-empty wins:

1. SearXNG — optional `discordSearxngUrl` (enable `json` in SearXNG `search.formats`)
2. Brave Search — optional `discordBraveSearchApiKey`
3. Tavily — optional `discordTavilyApiKey`
4. **DuckDuckGo** — always available, zero-config free fallback (no API key)

You do **not** need SearXNG (or any paid search) for the agent to run.

Settings fields: `discordLlmEnabled`, `discordLlmUrl`, `discordLlmApiKey`, `discordLlmModel`, `discordAgentEnabled`, `discordSearxngUrl`, `discordBraveSearchApiKey`, `discordTavilyApiKey`, `discordMentionNl`.

Optional `@bot …` mention routing requires **Message Content Intent** and “Allow @bot natural language”.

---

## Phase history

1. **Hub** — invite URL + Join Discord + labels  
2. **Optional webhook** — portal can post request/issue/available events; default for Notifiarr setups is leave webhook blank  
3. **Bot** — in-process discord.js gateway, guild slash commands, membership gate before any action  

Admin approve/decline stays in the web UI (and can auto-approve per global + per-user override). Discord-as-login is out of scope.

```text
Portal (web requests + membership)
    │
    ├─► Arr ──► Integrity ──► member webhook  (new / upgraded media)
    │
    ├─► admin webhook  (QC cleanup + integrity failures)
    │
    └─► Discord bot ──► slash commands + DMs for that member's requests/issues
            ▲
            └── invite link shown in portal
```

Operator API map (Dockhand, Notifiarr keys, etc.): see [`.local/README.md`](../.local/README.md).

---

## Manual smoke checklist

- [ ] Linked member: `/request` search → select → movie confirm  
- [ ] Linked member: TV title → season buttons → confirm  
- [ ] `/myrequests`, `/stats`, `/live`, `/queue`, `/status`, `/discover`, `/help`  
- [ ] `/issue report` + `/issue list`  
- [ ] `/ask what's downloading` (ops phrase)  
- [ ] `/ask` multi-constraint discovery with agent + SearXNG (e.g. zombie movie in a casino) → researched titles + request buttons  
- [ ] Revoked or unlinked Discord ID is denied with Preferences hint  
- [ ] Linked member gets a bot DM on approve/decline (nothing posted to the member channel)
- [ ] Portal member webhook posts media cards; admin webhook gets QC/integrity only

---

## Related docs
- [Architecture — membership ↔ request app](./architecture.md)
- [Configuration](./configuration.md)
