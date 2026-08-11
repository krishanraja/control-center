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
| COMPOUND full verification | `npm run verify` from `compound/` | no |

`.github/workflows/ci.yml` runs lint and types only. A lint **warning** blocks
merge, because `--max-warnings 0`.

## e2e

15 specs against the production build via `npm run preview`. All `/api/*`,
`**/rest/v1/**` and `**/realtime/**` traffic is mocked, so panels settle on
their honest empty states without a live database and no spec spends an
embedding or a model call.

| Spec | Covers | Viewport |
|---|---|---|
| `e2e/growth.spec.ts` | the merged Growth tab, its five sections and the governance control plane | 1280x800 |
| `e2e/network.spec.ts` | the Network search lifecycle: ask, read, clear, ask again | 1280x800, one at 390x844 |
| `e2e/pilot-gate.spec.ts` | when the morning check-in appears, skipping, and the device clock | per-test `timezoneId` + fixed clock |

`pilot-gate.spec.ts` is the one suite that owns its own context per test, because
its subject **is** the clock: it pairs `browser.newContext({ timezoneId })` with
`page.clock.setFixedTime()` so `Intl.DateTimeFormat().resolvedOptions().timeZone`
and the wall clock are both pinned. Nothing about that gate is testable without
controlling those two.

```bash
VITE_UI_V2_ENABLED=true \
VITE_SUPABASE_URL=https://placeholder.supabase.co \
VITE_SUPABASE_ANON_KEY=placeholder npx vite build
PLAYWRIGHT_CHROMIUM_PATH=/opt/pw-browsers/chromium npx playwright test
```

Both build-time vars are load-bearing:

- `VITE_SUPABASE_*` because the app will not boot without them
  (`src/lib/supabase.ts` calls `createClient` at module load). Placeholders are
  enough; nothing connects.
- `VITE_UI_V2_ENABLED=true` because the Network lane falls back to the pre-v2
  substring list when the flag is off, and `network.spec.ts` would then be
  asserting against a surface that is not there. The symptom is every spec in
  that file failing on a missing search field, which reads like an app crash
  and is not one.

`playwright.config.ts` sets `reuseExistingServer: true`, so a preview server
you left running serves a **stale `dist`**. Rebuild before you re-run, or kill
the server and let Playwright start its own.

## Route mocks: register broadest first

`page.route` handlers match in **reverse** registration order, so a
`'**/api/**'` catch-all registered last silently outranks every specific route
before it. This is not theoretical: three specs in `pilot-gate.spec.ts` passed
against the catch-all's `{ ok: true }` before the ordering was fixed, and two of
them would have passed against the very bug they were written to catch.

Register the catch-all first, then the specific routes.

## Prove the test fails without the fix

The corollary of the above. A new regression spec is not finished until you have
watched it go **red** against the old behaviour. The clear-across-loads spec in
`pilot-gate.spec.ts` passed against a faithful stub of the bug it was written
for, because a single page load could not observe damage that only landed in
localStorage for the *next* load. It needed a `page.reload()` to have any teeth,
and nothing but a negative check would have revealed that.

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
| `network-search-input` / `-submit` / `-clear` | the Network search field and its two buttons |
| `network-recommender` | the venture picker, which is also the marker for "back to the starting state" |
| `network-recommend-venture-<slug>` / `-intent-<id>` / `network-recommend-go` | the recommend path |

The Network ids are not optional politeness. The filter bar and the recommender
both render a chip reading "Mindmaker", and the clear button's accessible name
("Clear search") contains the submit button's ("Search"), so every plausible
role-and-name selector on this surface is ambiguous by construction.

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
- **e2e covers two tabs.** Growth and Network. Nothing tests Home, Content,
  Pipeline, OS, the command palette or theming.
- **No mobile project.** `playwright.config.ts` has a single desktop project;
  the one phone-sized spec sets its own viewport with `page.setViewportSize`.
  That still runs outside the `zoom: 1.2` wrapper's real device conditions, so
  the mobile shell is verified by hand.
- **The scorer is not in the e2e suite.** `network.spec.ts` mocks
  `/api/network/*` outright. Ranking quality lives in `probes.sql`, and the two
  suites are deliberately disjoint: one asserts the UI never traps you, the
  other asserts the answer is right.
