# AGENTS.md

Project-level guidance for coding agents. For product/architecture docs see
[`README.md`](./README.md) and the [`docs/`](./docs/) tree (note:
[`docs/AGENTS.md`](./docs/AGENTS.md) is the *agent roster* spec, unrelated to
this file).

## Cursor Cloud specific instructions

This repo contains **two independent frontends**, each with its own
`package.json` + lockfile. The update script installs both.

- **Control Center** (repo root) — the main React 18 + TypeScript + Vite 4
  dashboard. Standard scripts live in [`package.json`](./package.json)
  (`dev`, `build`, `lint`, `preview`); typecheck is `npx tsc --noEmit`.
- **compound/** (`compound/`) — a separate, isolated Vite app (its own
  `package.json`, lockfile, tsconfig). Scripts in
  [`compound/package.json`](./compound/package.json): `dev`, `build`,
  `typecheck`, `test:run` (vitest), and `verify` (boundaries + supabase
  boundary + tests + build). It must not import from the root app — see
  [`docs/plans/compound/STATE.md`](./docs/plans/compound/STATE.md).

### Running the apps (non-obvious caveats)

- **Root dev server needs Supabase env vars to boot.** `src/lib/supabase.ts`
  calls `createClient(VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY)` at module
  load, so a missing/empty `VITE_SUPABASE_URL` throws before the app renders.
  Create a root `.env` (gitignored) with at least `VITE_SUPABASE_URL` and
  `VITE_SUPABASE_ANON_KEY`. Placeholder values boot the shell and all
  client-only features (routing, command palette ⌘K, theme switch); real
  project credentials are required for live data.
- **`npm run dev` (Vite) does NOT serve the `/api/*` routes.** Those are
  Vercel serverless functions. Under the plain Vite dev server, data panels
  that fetch `/api/*` (e.g. Home's Goals panel, Growth data) fail with a toast
  like `Unexpected token 'i', "import { ..." is not valid JSON` — Vite is
  returning the raw `.ts` source, not JSON. This is expected. To exercise the
  API locally use `vercel dev` (needs the Vercel CLI plus the server-only
  secrets from [`.env.example`](./.env.example)).
- **compound runs fully offline in demo mode.** Set
  `VITE_COMPOUND_DEMO_MODE=true` in `compound/.env` and run `npm run dev` from
  `compound/`; it loads deterministic fixture data (Now dashboard, Stocks,
  stock detail, grounded Ask answers) with no Supabase or login. Live mode
  additionally needs `VITE_SUPABASE_URL` + `VITE_SUPABASE_PUBLISHABLE_KEY`.
  Run it on a different port from the root app (e.g. `npm run dev -- --port 5174`).

### Tests

- **Root Playwright e2e** (`npx playwright test`, specs in `e2e/`) runs against
  the production build via `vite preview` and mocks every `/api/*` + Supabase
  call, so no live services are needed. It requires a browser: run
  `npx playwright install chromium` once, or point
  `PLAYWRIGHT_CHROMIUM_PATH` at the system Chrome
  (`/usr/bin/google-chrome-stable`). The Playwright browser download is not in
  the update script (heavy/network-dependent), so install it on demand.
- **`e2e/growth.spec.ts` is green (9/9).** It used to be 2 of 9: the specs
  selected the Growth sections by their visible labels, and those labels were
  renamed. Selection now goes through `data-testid` and content stays as
  content:
  - `growth-section-<id>` — the five section controls
  - `growth-panel-<id>` — which panel actually mounted
  - `people-lane-<id>`, `os-sub-<id>`, `content-room-<id>` — the other switchers
  Keep it that way. If you add a switcher, give it a `testIdPrefix` (see
  `src/components/shared/SegmentedNav.tsx`) rather than letting a spec click a
  word, or the next copy change silently takes the suite out again.
- **compound** unit/component tests: `npm run test:run` (vitest, jsdom) from
  `compound/` — fast and self-contained.

### CI

[`.github/workflows/ci.yml`](./.github/workflows/ci.yml) only runs the root
`npm run lint` and `npx tsc --noEmit` on Node 18. The repo also works on newer
Node (tested on Node 22); `engines` requires `>=18`.
