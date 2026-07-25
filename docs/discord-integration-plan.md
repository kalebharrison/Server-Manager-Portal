# Discord integration (Requestrr replacement + member bot)

Goal: manage Discord invites and a member-facing Discord bot from this portal so Requestrr is no longer required, without replacing **Notifiarr** / Seerr for media Discord posts.

**Status (beta):** Phases 1–3 plus member web-UI parity and optional natural language are implemented. Configure under Settings → Support & Announcements → Discord. Members link their Discord user ID under Preferences.

---

## Ownership split

| Concern | Owner |
|---|---|
| Browse / request in the browser | Portal → Seerr API |
| Member sync into Seerr | Portal (`Sync membership with Seerr`) |
| Discord member slash commands | Portal Discord bot (in-process) |
| “Movie ready” Discord posts / DMs | **Notifiarr** and/or Seerr Discord (keep these) |
| Portal channel webhook | Optional — leave blank when Notifiarr owns media posts |

---

## Bot commands (member parity)

| Command | Mirrors web |
|---|---|
| `/request query [type]` | Search → select → TV seasons / confirm → Seerr |
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

| Mode | Behavior |
|---|---|
| Ops phrases | Instant fixed handlers (`my stats`, queue, live, status, issues, discover trending, help) |
| Media agent on | Discovery `/ask` uses a tool-calling agent: **SearXNG web search** → Seerr/TMDB resolve → answer + request buttons |
| Agent off / incomplete config | Legacy phrase matchers + optional JSON intent LLM (title/person/theme shortcuts) |
| Unclear (no agent) | Bot replies with `/help` suggestions |

The agent needs:

1. **OpenAI-compatible LLM** (`discordLlmUrl` + non-empty `discordLlmApiKey` + `discordLlmModel`) — Ollama on LAN (`http://jetson01…:11434/v1`) or external LiteLLM/OpenAI. Prefer a **tool-calling** model (e.g. `qwen2.5:7b`).
2. **SearXNG** (`discordSearxngUrl`) — free self-hosted search. Enable JSON in SearXNG `settings.yml`:

```yaml
search:
  formats:
    - html
    - json
```

Portal container must reach SearXNG (use LAN hostname, not `localhost` from inside Docker). No SearXNG API key.

Settings: `discordLlmEnabled`, `discordLlmUrl`, `discordLlmApiKey`, `discordLlmModel`, `discordAgentEnabled`, `discordSearxngUrl`, `discordMentionNl`.

Optional `@bot …` mention routing requires **Message Content Intent** and “Allow @bot natural language”.

---

## Phase history

1. **Hub** — invite URL + Join Discord + labels  
2. **Optional webhook** — portal can post request/issue/available events; default for Notifiarr setups is leave webhook blank  
3. **Bot** — in-process discord.js gateway, guild slash commands, membership gate before any action  

Admin approve/decline stays in the web UI. Discord-as-login is out of scope.

```text
Portal (web requests + membership)
    │
    ├─► Seerr ──► Notifiarr / Seerr Discord  (media posts stay here)
    │
    └─► Discord bot ──► same Seerr / issues / analytics / status services
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
- [ ] Portal webhook blank while Notifiarr posts media events (no double posts)

---

## Related docs
- [Architecture — membership ↔ request app](./architecture.md)
- [Configuration](./configuration.md)
