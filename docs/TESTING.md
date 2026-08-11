# Testing

What exists, how to run it, and the one rule that keeps it from rotting.

## What runs where

| Suite | Command | In CI? |
|---|---|---|
| Lint | `npm run lint` (`--max-warnings 0`) | yes |
| Types | `npx tsc --noEmit` | yes |
| e2e (Playwright) | `npx playwright test` | **no** |
| Contract tests | `npx tsx scripts/network/verify-contracts.ts` | no |
| Scorer probes | `psql "$DATABASE_URL" -f scripts/network/probes.sql` | no |
| compound units | `npm run test:run` from `compound/` | no |

`.github/workflows/ci.yml` runs lint and types only. A lint **warning** blocks
merge, because `--max-warnings 0`.

## e2e

`e2e/growth.spec.ts`, 9 specs, desktop viewport only (1280x800), against the
production build via `npm run preview`. All `/api/*`, `**/rest/v1/**` and
`**/realtime/**` traffic is mocked, so panels settle on their honest empty
states without a live database.

```bash
VITE_SUPABASE_URL=https://placeholder.supabase.co \
VITE_SUPABASE_ANON_KEY=placeholder npx vite build
PLAYWRIGHT_CHROMIUM_PATH=/opt/pw-browsers/chromium npx playwright test
```

The app needs `VITE_SUPABASE_*` to boot at all (`src/lib/supabase.ts` calls
`createClient` at module load). Placeholders are enough.

## The selector rule

**Select on `data-testid`. Assert on content.**

This suite was 2 of 9 passing for months. The specs clicked the Growth sections
by their visible labels, the labels were renamed, and every navigation step
broke at once. `AGENTS.md` carried a note about it rather than a fix.

Stable ids in use:

| Prefix | Surface |
|---|---|
| `growth-section-<id>` | the five Growth section controls |
| `growth-panel-<id>` | which Growth panel actually mounted |
| `people-lane-<id>` | Pipeline / Network / Visibility |
| `os-sub-<id>` | Org / Intel / Flows / Systems |
| `content-room-<id>` | the Content v2 rooms |

`shared/SegmentedNav` emits these from a `testIdPrefix` prop. **If you add a
switcher, pass one.** An id is not user-facing, so it cannot drift with copy.

Content assertions are still text, and should be. The point is not to remove
text from tests, it is to stop *navigation* depending on it.

## Contract tests

`scripts/network/verify-contracts.ts` covers the two pieces of `/api/network/*`
that are security-shaped and testable without a database: the access gate
(including token prefixes, appended junk, and a cookie minted from a different
code) and the sanitiser that stands between a language model's output and a
database call.

```bash
SUPABASE_URL=x SUPABASE_SERVICE_ROLE_KEY=x npx tsx scripts/network/verify-contracts.ts
```

The env vars are only needed because `api/_supabase.ts` throws at import time;
nothing here connects to anything.

## Scorer probes

`scripts/network/probes.sql` is the assertion suite for `network_search`. Each
probe exists because it caught something. **P4 is the one that must never
regress:** a ridiculous query must still return people, at zero
`query_relevance`.

Run it against any database with the two network migrations applied.

## Known gaps

- **CI runs no tests.** Playwright and the compound vitest suite are local-only.
- **e2e covers one tab.** Growth. Nothing tests Home, Content, People, OS, the
  command palette, theming or mobile.
- **Desktop viewport only.** No mobile project in `playwright.config.ts`, so the
  `zoom: 1.2` shell is verified by hand.
