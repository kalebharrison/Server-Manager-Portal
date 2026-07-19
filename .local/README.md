# Private local stack (gitignored)

Drop **your** credentials and service map here. Everything under `.local/` is ignored by git except this README and `*.example*` templates.

## Why this exists

Agents (and you) need a single place for:

- How your stack is wired (portal → Seerr → Arr → Notifiarr → Discord)
- API access for ops tools (Dockhand redeploy, Notifiarr, etc.)

## Files to create (copy from examples)

| File | Purpose |
|---|---|
| `stack.env` | Secrets + base URLs as env vars (copy from `stack.example.env`) |
| `stack.json` | Non-secret inventory: hosts, roles, which notifier owns Discord (copy from `stack.example.json`) |
| `notes.md` | Freeform “how I run this” notes |

```bash
cp .local/stack.example.env .local/stack.env
cp .local/stack.example.json .local/stack.json
```

Fill in real values in the copies. **Never commit `stack.env`.**

## Local Cursor (desktop / this machine)

Agents with the workspace on disk can read `.local/stack.env` and `.local/stack.json` directly.

## Cloud agents (cursor.com)

Gitignored files are **not** in the clone. For cloud agents to use Dockhand / Notifiarr / etc.:

1. Create a **Cursor Cloud Environment** for this repo.
2. Add the same keys from `stack.env` as **environment secrets / env vars**.
3. Optionally allow egress to those LAN/VPN hostnames if the environment is restricted.

Until that environment exists, cloud agents only see the committed `*.example*` templates — not your live keys.

## Recommended ownership split (this server)

| Concern | Owner |
|---|---|
| Web requests + membership | Portal → Seerr |
| Discord `/request` bot + invite | Portal Discord settings |
| Media Discord posts (grabbed / imported / available) | **Notifiarr** (leave portal webhook blank) |
| Container redeploy | **Dockhand** API |
