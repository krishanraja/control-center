# Testing

What exists, how to run it, and the one rule that keeps it from rotting.

## What runs where

| Suite | Command | In CI? |
|---|---|---|
| Lint | `npm run lint` (`--max-warnings 0`) | yes |
| Types | `npx tsc --noEmit` + `npm run typecheck:api` + `npm run typecheck:scripts` | yes |
| Structural guards | every `- run:` line in `ci.yml`, verbatim | yes (25 of them) |
| e2e (Playwright) | `npx playwright test` | five specs at 1280x800, plus every `*-desk.spec.ts` at 1440 and 1920 |
| Contract tests | `npx tsx scripts/network/verify-contracts.ts` | no |
| Scorer probes | `psql "$DATABASE_URL" -f scripts/network/probes.sql` | no |

A lint **warning** blocks merge, because `--max-warnings 0`.

The guards in CI, as of 2026-09-17, read out of `ci.yml` rather than from
memory: `check-goal-ladder`, `check-goal-gate`, `check-type-tokens`,
`check-icons`, `check-icon-stroke`, `check-content-window`,
`check-served-surfaces`, `check-bridges-never-send`,
`check-enrichment-honesty`, `check-fleet-classifier`, `check-theme-tokens`,
`check-mindmake-design`, `check-mindmake-gate`, `check-env-example`,
`check-no-secrets`, `check-agent-stamps`, `check-model-prices`,
`check-anthropic-fallback`, plus `check-n8n-sync-guard` behind its own
condition — and SIX steps that are `npm run` scripts rather than `.mts`
files, which a `scripts/check-*.mts` glob does not see:
`check:harness-events`, `check:harness-mcp`, `check:editorial-text`,
`check:content-spine`, `check:aeo-read`, `check:cache-metering`. Running
the glob and calling it "all the guards" turned main red on 2026-09-17.
**Parse every `- run:` line out of `ci.yml` and execute it verbatim.**

Each one statically pins an invariant that already shipped broken once, or
that drifts silently (one goal editor, the type scale, the icon system,
honest enrichment, an Anthropic call site whose spend nobody can attribute,
a model the price table has never heard of, ...) — the current list with
rationale lives as comments in
[`.github/workflows/ci.yml`](../.github/workflows/ci.yml). More `check-*`
guards exist outside CI; see the root `AGENTS.md`.

## e2e

Against the production build via `npm run preview`. All `/api/*`,
`**/rest/v1/**` and `**/realtime/**` traffic is
mocked, so panels settle on their honest empty states without a live
database and no spec spends an embedding or a model call.

| Spec | Covers | Viewport |
|---|---|---|
| `e2e/growth.spec.ts` | the merged Growth tab, its five sections and the governance control plane | 1280x800 |
| `e2e/network.spec.ts` | the Network search lifecycle: ask, read, clear, ask again | 1280x800, one at 390x844 |
| `e2e/network-add-person.spec.ts` | add-a-person from a screenshot: scan, confirm, provenance honesty, blocked providers | 1280x800 |
| `e2e/pilot-gate.spec.ts` | when the morning check-in appears, skipping, and the device clock | per-test `timezoneId` + fixed clock |
| `e2e/home-noscroll.spec.ts` | Home's structural no-scroll contract | 1440x900 / 1280x800 / 390x844 / 360x800 |
| `e2e/pilots-noscroll.spec.ts` | Pilots' structural no-scroll contract, the draft sheet, the stored-intent trigger, the `TriageDeck` swipe verdicts (driven via `ArrowLeft`/`ArrowRight`, 2026-09-16, replacing the pager this spec drove before), and the short-viewport degradation | 390x844 / 360x800 (strict); 360x640 (degrades) |
| `e2e/composer.spec.ts` | the brief editor: canvas, citations toggle, the mobile edits sheet, the edit palette | default + one at 390x844 |
| `e2e/focus-purpose.spec.ts` | the Focus tab: tools, the daily ask flow | default |
| `e2e/loading.spec.ts` | the loading ladder's restraint rules | default |
| `e2e/queue-relocation.spec.ts` | the ruling queue at OS → Queue and the `#today` aliases | default |
| `e2e/market-signals.spec.ts` | the head-space split: the Market signals door appears only for a fresh hot digest, Home's face carries no signal text, the drawer acts without navigating, the Intel door lands on the console | default + 360x800 |
| `e2e/intel-zoom.spec.ts` | OS → Intel does not steal focus or overflow the zoom root, **and the whole phone column fits two screen-lengths** | 390x844 + 1280x800 |
| `e2e/spend-panel.spec.ts` | the money and connections answers on the interrogation, the prepaid-line state (past the $29 included outranks the month-vs-usual line, in the answer AND the token), the ranked service + spender sheet with each provider in the unit it bills in, the sweep trigger, the Home door dot | 390x844 + 1280x800 |
| `e2e/content-queue-window.spec.ts` | the content queue's ageing window and the archive an aged-out card lands in | default |
| `e2e/content-rooms.spec.ts` | Built vs Paid: own shifts lead, cross-cutting ones are labelled | default |
| `e2e/content-desk.spec.ts` | the Content desk above 1400px, populated: no scroll, no nested scrollers, no hole, no squeezed text, no machine strings | **desk-1440 + desk-1920** |
| `e2e/advisory-desk.spec.ts` | the Advisory two-pane card and the draft that no longer scrolls in a box | **desk-1440 + desk-1920** |
| `e2e/network-desk.spec.ts` | one venture control, Where\|Venture over Role\|Tier, and the country overflow as a popover rather than a phone sheet | **desk-1440 + desk-1920** |

### Desk projects, and the fixtures that make them mean anything

`playwright.config.ts` defines three projects. `default` is 1280x800 and
ignores `*-desk.spec.ts`; `desk-1440` and `desk-1920` run only those files.

A desk spec **never calls `setViewportSize`** — its width comes from the
project, and a spec that sets its own makes the project's width a lie.

Two fixtures exist so a layout claim can be worth something:

- `e2e/fixtures/populated.ts` — 22 ideas, 8 arcs, a weekly brief, six
  proposals and a run ledger carrying all three statuses plus a job with no
  row at all. Registration order is load-bearing and the file says so:
  Playwright matches the LAST registered handler first, so a
  `**/rest/v1/**` catch-all registered late shadows every specific table and
  the page renders empty while every assertion still passes. Call
  `assertFixturesLanded` before measuring.
- `e2e/fixtures/layout.ts` — the probes. `assertRendered` first, always: an
  error boundary passes every other probe in the file, because a crashed tab
  has no scroll boxes, no squeezed text and no holes worth the name.

`largestHole` is cropped to the bounding box of what is painted, not to the
frame. Empty space BELOW the last card of a one-item list is not waste;
empty space BESIDE it is. Gridding the whole frame conflates them and fails
a correct layout for being short — a metric that teaches padding.

**The rule this replaces:** the previous measure was "percent of viewport
width occupied", taken from the bounding box of all content. A full-width
header above one narrow card scores 96% and still looks half empty, which is
exactly what Advisory looked like in the screenshot that came back.

`pilot-gate.spec.ts` is the one suite that owns its own context per test, because
its subject **is** the clock: it pairs `browser.newContext({ timezoneId })` with
`page.clock.setFixedTime()` so `Intl.DateTimeFormat().resolvedOptions().timeZone`
and the wall clock are both pinned. Nothing about that gate is testable without
controlling those two.

```bash
# .env: VITE_SUPABASE_URL=https://placeholder.supabase.co
#       VITE_SUPABASE_ANON_KEY=placeholder
#       VITE_UI_V2_ENABLED=true
VITE_UI_V2_ENABLED=true VITE_VIDEO_ENGINE_ENABLED=true npm run build
PLAYWRIGHT_CHROMIUM_PATH=<your chromium binary> npx playwright test
```

The build-time vars are load-bearing:

- `VITE_SUPABASE_*` because the app will not boot without them
  (`src/lib/supabase.ts` calls `createClient` at module load). Placeholders are
  enough; nothing connects.
- `VITE_UI_V2_ENABLED=true` because the Network lane falls back to the pre-v2
  substring list when the flag is off, and `network.spec.ts` would then be
  asserting against a surface that is not there. The symptom is every spec in
  that file failing on a missing search field, which reads like an app crash
  and is not one.
- `VITE_VIDEO_ENGINE_ENABLED=true` because `video-engine-mobile.spec.ts`
  asserts the reviewer. The Content surface itself no longer has a flag.
  Pass build-time vars on the build command (see the `.env.production.local`
  trap in the root `AGENTS.md`: a pulled env file can silently override `.env`).

The four content and video specs also run in CI (`e2e` job in
`.github/workflows/ci.yml`) against the production build with every network
call mocked. `tests/api/*.test.ts` are `node --test` behaviour tests for the
pure halves of the content-to-production bridge and the run ledger; run them
with `npx tsx --test tests/api/*.test.ts`.

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
both render a chip reading "Mindmake", and the clear button's accessible name
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

- **CI runs five browser tests, not the suite** (corrected 2026-09-10; this
  file and `AGENTS.md` previously said CI runs no browser tests at all, which
  was wrong). The `e2e` job in `.github/workflows/ci.yml` runs
  `content-rooms.spec.ts`, `content-queue-window.spec.ts`, `composer.spec.ts`,
  `video-engine-mobile.spec.ts` and `growth-scroll.spec.ts`. Everything else
  is local-only. Run the full e2e suite
  yourself before merging UI work.
- **e2e coverage is broad but not total.** Growth, Network (search +
  add-person), Home's no-scroll contract, the pilot gate, the brief
  composer, Focus, the loading ladder, and the queue relocation are covered.
  Nothing tests the People triage boards, Subscriptions, the OS subtab
  bodies, the command palette or theming.
- **No mobile project.** `playwright.config.ts` has a single desktop project;
  the one phone-sized spec sets its own viewport with `page.setViewportSize`.
  That still runs outside the `zoom: 1.2` wrapper's real device conditions, so
  the mobile shell is verified by hand.
- **The scorer is not in the e2e suite.** `network.spec.ts` mocks
  `/api/network/*` outright. Ranking quality lives in `probes.sql`, and the two
  suites are deliberately disjoint: one asserts the UI never traps you, the
  other asserts the answer is right.
