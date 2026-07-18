# Development

## Prerequisites

- Node.js 22+
- npm
- Docker (optional, for container smoke runs)

## Setup

```bash
cp .env.example .env
# set JWT_SECRET
npm ci
npm run build
npm start
```

`npm start` rebuilds frontend assets, then runs `server/index.js` with `.env` loaded.

Production-style (assets already built):

```bash
npm run build
npm run start:prod
```

## Scripts

| Script | Purpose |
|---|---|
| `npm run build` | CSS + JS bundles + version stamp |
| `npm run typecheck` | TypeScript check for the React client |
| `npm test` | Node test runner over `tests/**` |
| `npm run check` | build + typecheck + test (CI gate) |
| `scripts/local-container.sh` | Build/run a local Docker smoke container |

## Layout

```
.
├── server/index.js          # Express entry / composition root
├── client/
│   ├── main.tsx             # React entry
│   ├── index.html           # SPA shell
│   └── styles/              # Tailwind input + config
├── lib/                     # Backend domains (see lib/README.md)
├── docker/                  # Dockerfile + Compose
├── static/                  # Built assets + logos/fonts
├── tests/                   # Mirrors lib domains
├── docs/                    # Human docs
├── scripts/                 # Build / docker-entrypoint / local helpers
└── .env.example
```

## Tests

```bash
npm test
# or one folder:
node --test tests/request-app/*.test.js
```

Add new tests under the matching `tests/<domain>/` folder and import from `../../lib/<domain>/...`.

## Container smoke (local)

```bash
./scripts/local-container.sh
```

## Contribution notes

- Prefer small, domain-scoped changes under `lib/<domain>/` and `client/...`.
- Keep Docker files at the repo root.
- Do not commit generated `static/bundle.js`, `static/chunks/`, or `static/tailwind.css`.
- Run `npm run check` before pushing.
