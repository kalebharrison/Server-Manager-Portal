# Client (`client/`)

React UI source. Bundled by esbuild from `main.tsx` into `static/`.

| Path | Role |
|---|---|
| `main.tsx` | React entry |
| `index.html` | SPA shell stamped at build time |
| `styles/` | Tailwind input CSS + config |
| `screens/` | Top-level routed pages (home, admin, discover, status, …) |
| `settings/` | Admin settings tabs and hooks |
| `requests/` | Embedded request-app UI |
| `setup/` | First-run wizard |
| `home/` | Member dashboard layout/widgets |
| `issues/` | Issue conversation UI |
| `shared/` | API helpers, theme, types, shared components |

Prefer feature folders over growing `screens/` further when adding large surfaces.
