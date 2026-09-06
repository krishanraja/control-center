# AGENTS.md

Project-level guidance for coding agents. For product/architecture docs see
[`README.md`](./README.md) and the [`docs/`](./docs/) tree (note:
[`docs/AGENTS.md`](./docs/AGENTS.md) is the *agent roster* spec, unrelated to
this file).

## The house systems — extend, never fork

One capability, one system. The 2026-08-20→22 recomposition collapsed years of
parallel variants (2,154 ad-hoc text sizes, 20 icon sizes at inconsistent
stroke, six eyebrow recipes, a dozen hand-rolled overlays, three create
buttons per tab, native `<select>`s carrying two options) into the primitives
below. **When a task seems to need a new variant of one of these, extend the
primitive in place — a new prop, tone, kind, or bus action — never a sibling
component, a local re-implementation, or a one-off style.** If a primitive
genuinely cannot carry the case, change the primitive and record the change in
[`docs/DESIGN_SYSTEM.md`](./docs/DESIGN_SYSTEM.md), which is the authority on
all of these. Rationale for the lock: [ADR-013](./docs/DECISIONS/013-one-system-per-job.md).

| Capability | The one system | Guarded by |
|---|---|---|
| Text sizes + section labels | Role tokens `text-micro…text-hero`; uppercase labels are `shared/Eyebrow` | `scripts/check-type-tokens.mts` (CI) |
| Icons | `@/lib/icons` wrapper (constant 1.75px physical stroke, snapped sizes); circled icons are `shared/IconTile` | `scripts/check-icons.mts` (CI) |
| Overlays | `shared/Modal` / `shared/SlideOver` / `mobile/BottomSheet` (all on `ui/dialog`, which owns the keyboard inset) | convention |
| Editing a piece of text on a phone | `shared/FocusedEditor` — sheet, voice beside keyboard, one full-width Save, danger behind "…" | convention |
| Choosing from a small set | Chips, never a native `<select>`: `goals/GoalPickers` (`OptionChips` / `ServesPicker` / `VentureChips`); `shared/ChipOverflow` when the set outgrows a line | convention |
| Creating anything on a phone | The one + button: `CreateSheet` + the `src/lib/quickCreate.ts` bus. Never a new inline create button on a narrow viewport | convention |
| Tab / section switching | `shared/SegmentedNav`, always with `testIdPrefix` | e2e selects on it |
| Goal reads/writes | `useGoalCanon` + `src/lib/goalsApi.ts` | `check-goal-ladder` / `check-goal-gate` (CI) |
| Loading states | The ladder in `docs/DESIGN_SYSTEM.md`; every string in `src/lib/loadingVoice.ts` | convention |
| Copy | Plain English a 12-year-old can follow: no stacked two-word fragments, no insider metaphors, no preachy meta-lines, no em dashes. Product nouns stay (shifts, ventures, ships, Built/Paid, MRR) | review |

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
- **The preview build needs `.env` before any spec will pass, and `e2e/network.spec.ts`
  needs a feature flag on top of that.** Both failure modes look like a broken app
  rather than a missing variable, so they cost a debugging cycle each time:
  - No `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` and `src/lib/supabase.ts`
    throws at module load, before anything renders. **Every** spec then fails with
    `element(s) not found`. Placeholder values are enough; the specs mock the network.
  - No `VITE_UI_V2_ENABLED=true` and the network lane renders the pre-v2 substring
    list instead of the search surface, so all 17 network specs fail the same way
    while every other spec passes. The flag is read at build time, so set it before
    `npm run build`, not before `playwright test`.
  A working local `.env` for the suite:
  ```
  VITE_SUPABASE_URL=https://placeholder.supabase.co
  VITE_SUPABASE_ANON_KEY=placeholder
  VITE_UI_V2_ENABLED=true
  ```
  Note this repo's CI does not run Playwright at all (see `.github/workflows/ci.yml`),
  so a broken spec will not be caught for you.
- **`.env.production.local` silently wins over `.env`, and its values are masked.**
  `vercel env pull` writes every secret as the literal string `[SENSITIVE]`, and
  Vite loads `.env.production.local` *after* `.env` in a production build, so a
  flag you set in `.env` is overwritten with `[SENSITIVE]` rather than used.
  Nothing errors: `contentV2Enabled()` just compares `"[SENSITIVE]" === 'true'`,
  gets false, and the app renders the pre-v2 surface. It looks exactly like a
  broken feature. Force the flag on the build command instead, which takes
  precedence over both files:
  ```
  VITE_CONTENT_V2_ENABLED=true VITE_UI_V2_ENABLED=true npm run build
  ```
- **Playwright checks `page.route` handlers in REVERSE registration order.**
  Register the catch-alls (`**/api/**`, `**/rest/v1/**`) FIRST and the specific
  routes after them. The other way round, the catch-all shadows the specific
  mock, the component renders against a null row forever, and it reads as a
  broken component rather than a missing fixture. `e2e/composer.spec.ts` has the
  working order.
- **Browser version drift.** `PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers` may hold a
  different build than the pinned `@playwright/test` wants ("Executable doesn't exist
  at .../chromium_headless_shell-<n>"). Point at what is actually there rather than
  downloading: `PLAYWRIGHT_CHROMIUM_PATH=/opt/pw-browsers/chromium-<n>/chrome-linux/chrome`.
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
- **`e2e/composer.spec.ts` covers the content composer** (the brief opening in
  it, the rail, and the full edit palette). There was no content coverage at all
  before it, which is part of how the brief surface came to have four one-click
  edits while `src/lib/contentEngine.ts` held twenty-six. `scripts/check-edit-palette.mts`
  guards the same invariants statically and runs without a browser.
- **compound** unit/component tests: `npm run test:run` (vitest, jsdom) from
  `compound/` — fast and self-contained.

### CI

[`.github/workflows/ci.yml`](./.github/workflows/ci.yml) runs, on Node 18:
`npm run lint`, `npx tsc --noEmit`, `npm run typecheck:api`,
`npm run typecheck:scripts`, and the structural guards —
`check-goal-ladder`, `check-goal-gate`, `check-type-tokens`, `check-icons`,
`check-content-expiry`, `check-content-window`, `check-anchor-attribution`,
`check-card-lint`, `check-content-vocabulary`, `check-arc-scoring`,
`check-slate-calibration`, `check-content-chain`, `check-served-surfaces`, `check-enrichment-honesty`,
`check-fleet-classifier`, `check-no-secrets`, `check-theme-tokens`
(all `scripts/check-*.mts`, run with `npx tsx`). Each guard encodes an
invariant that already shipped broken once; run them locally before pushing.
No Playwright in CI (see Tests above). The repo also works on newer Node
(tested on Node 22); `engines` requires `>=18`.

More `check-*.mts` guards exist outside CI (`check-edit-palette`,
`check-content-taxonomy`, `check-select-columns`, `check-selection`,
`check-teardown-beat`, `check-video-formats`); run the one nearest your
change. Known: `check-content-taxonomy` has a failing baseline on main —
fix the baseline before wiring it into CI.
