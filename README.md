# Control Center

The dashboard and the crons of **mind/make OS**, the fleet of AI agents Krish
Raja runs his businesses on. Krish opens one place, sees what is waiting on
him, decides, and the agents do the rest. Nothing in it contacts him or sends
anything on his behalf.

**Live:** [`controlcenter.krishraja.com`](https://controlcenter.krishraja.com) (behind an access code)
&nbsp;·&nbsp; **Deploy:** Vercel, auto-deployed from `main`
&nbsp;·&nbsp; **Data:** Supabase, the OS's single source of truth

## Read this first

| You want | Read |
|---|---|
| What Krish is building, the rules every agent follows, and what is true right now | [`docs/MINDMAKE_OS_ARCHITECTURE.md`](./docs/MINDMAKE_OS_ARCHITECTURE.md), section 0. It is the one OS architecture document and it wins over every other doc here |
| Where this repo is right now and what changed this month | [`NOW.md`](./NOW.md) |
| Krish himself, and his products | [`docs/KRISH.md`](./docs/KRISH.md), [`docs/PORTFOLIO.md`](./docs/PORTFOLIO.md) |
| Each tab | [`docs/PRODUCT.md`](./docs/PRODUCT.md) |
| The engineering contract | [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md) |
| How to work in this repo (house systems, tests, CI guards) | [`AGENTS.md`](./AGENTS.md) |

## What it serves

Krish's work splits in two (ruling, 2026-10-05). **Mindmake**
(mindmake.co), with its publication, is the mission. A separate **product
portfolio** is what the OS grows, in this order, set in
[`src/lib/portfolio.ts`](./src/lib/portfolio.ts):

1. Heartside (a Shopify gift store, opening 2026-10-20) and Full Time (football recaps)
2. Legibility (typed product data for AI agents)
3. CTRL (the AI brain app) and Pulse (market intelligence for fractional executives)

Circle is dormant: preserved, not worked. Retired brands and products are
listed once, in section 0c of the architecture doc. The only live revenue
across the whole portfolio, measured 2026-10-05, is two founding members of
the publication on Substack; the figures and their live sources are in
section 0.2 of the architecture doc.

## What this repo is, and is not

It **is** a React and TypeScript dashboard (Vite, Tailwind) with thin Vercel
serverless routes under `api/` and the Vercel crons in `vercel.json`. It reads
Supabase directly (PostgREST and Realtime) and writes back with the anon key
where row level security allows, or through an `/api/*` route when it needs
the service role.

It is **not** the agents. Agents are rows in the Supabase `agents` table
(their briefs in `agents.brief_content`), n8n Cloud workflows, Claude Code
agents in OpenClaw on a VPS, and a few GitHub Actions. It is not the content
control plane either: since 2026-09-08 the editorial routes, the Composer's
routes, the content crons and the video plane run from
`krishanraja/content-engine`, reached through rewrites in `vercel.json`
([ADR-019](./docs/DECISIONS/019-content-engine-owns-the-control-plane.md)).
This repo keeps the Content tab. The `compound/` app moved to its own repo on
2026-09-21.

## The promise it keeps

> Krish opens one place and sees every decision the OS is waiting on him for.
> He decides in one press. The rest runs in the background.

- **One move at a time.** Every tab meets the Growth standard (2026-10-05):
  numbers at a glance, insight only when asked, one action with its verdict
  landing where he pressed, honest emptiness said once, and a layout
  recomposed for each width. Each surface's move is chosen by
  [`src/lib/surfaceMoves.ts`](./src/lib/surfaceMoves.ts).
- **One place for what waits.** Everything waiting on Krish goes through the
  `decisions_waiting` view; a new kind adds a branch, never a sibling panel.
  Each ruling is decided in the tab that owns it.
- **Pull-only and draft-only.** The OS never contacts him, and Control Center
  never sends an email, a message or a post (CI guard
  `check-bridges-never-send`). Agents report here, never into his Drive.
- **Self-healing and honest.** Silent successes, a run that reads green and
  moved nothing, are the failure this OS fights most. An unwired number is
  never shown as zero.

## Tabs

Live registry: [`src/lib/tabs.ts`](./src/lib/tabs.ts). Old hashes (`#today`,
`#leads`, `#bets`, `#acquisition`, ...) alias into these, so old links keep
working.

| Tab | What it answers |
|---|---|
| Home | Today on one screen that never scrolls: the goal ladder, today's three, today's proposed move, what waits |
| Content | Today's calls on the publication's three subchannels, and the Composer |
| People | Network, Hunt, Visibility and Advisory |
| Growth | Is anyone finding the products, and the one thing to do now (next, week, numbers, places, buyers) |
| OS | Org, Intel, Flows and Systems: the agents, the spend, the machine's health |
| Focus, Board, Subscriptions | In the drawer: Krish's operating theory; work sessions left for him; money and the ranked portfolio board |

## Tech stack

| Layer | Tool |
|---|---|
| Frontend | React 18, TypeScript, Vite 4 |
| Styling | Tailwind CSS 3 and the Mindmake Instrument Room design system ([`docs/DESIGN_SYSTEM.md`](./docs/DESIGN_SYSTEM.md)) |
| UI primitives | Owned and vendored, Radix under the overlays ([ADR-010](./docs/DECISIONS/010-vendored-primitive-layer.md)); the house systems in [`AGENTS.md`](./AGENTS.md) |
| Realtime | `@supabase/supabase-js` `postgres_changes`, one channel per table ([ADR-002](./docs/DECISIONS/002-shared-realtime-channel.md)) |
| API routes and crons | Vercel serverless (`@vercel/node`) under `api/`, schedules in `vercel.json` |
| Data | Supabase (Postgres, PostgREST, Realtime) |
| Orchestration | n8n Cloud workflows, OpenClaw on the VPS, GitHub Actions |
| Models | Anthropic first, OpenRouter as the rescue provider only ([ADR-024](./docs/DECISIONS/024-openrouter-as-the-rescue-provider-only.md)) |

## Local development

```bash
npm install
cp .env.example .env       # fill in the Supabase URL and anon key at minimum
npm run dev                # Vite front end only

npm run build              # production bundle
npm run lint               # ESLint, --max-warnings 0
npx tsc --noEmit           # type check
npm run typecheck:api      # the api/ tree
npm run typecheck:scripts  # the scripts/ tree
npx tsx --test tests/api/*.test.ts
```

`npm run dev` does not serve `/api/*`; use `vercel dev` for that. Every
variable the code reads is named in `.env.example`, and
`scripts/check-env-example.mts` fails the build if one is missing. The
Playwright suite, the CI guards and their known traps are in
[`AGENTS.md`](./AGENTS.md).

## Project layout

```
api/                    Vercel serverless routes and crons (one file per endpoint)
  _architectureDoc.ts     the parser the weekly architecture engine uses (section 20 and the refresh stamp)
  architecture/weekly.ts  the Sunday engine run that writes section 20 of the architecture doc
  revenue/                the money read across the five Stripe accounts
  health/                 fleet reconcile and the connections sweep
src/
  App.tsx                 hash router over the tabs in src/lib/tabs.ts
  components/             one folder per surface, plus shared/ (the house primitives)
  hooks/                  realtime and data hooks
  lib/                    portfolio.ts, surfaceMoves.ts, tabs.ts, formats.ts and the other single sources
docs/                   documentation (index: docs/README.md)
  MINDMAKE_OS_ARCHITECTURE.md   the one OS architecture document
  architecture/           deep reference detail behind it
  history/                superseded text, verbatim, with banners; LOG.md is the index
scripts/                CI guards (check-*.mts), n8n mirrors and audit, steward, one-off tools
supabase/migrations/    the schema history
tests/api/              node:test suites for the api tree
e2e/                    Playwright specs
warehouse/              the attribution warehouse schema and ingest function
```

## Place in the wider OS

1. [`docs/MINDMAKE_OS_ARCHITECTURE.md`](./docs/MINDMAKE_OS_ARCHITECTURE.md),
   on `main` here and nowhere else (ruling 2026-09-07). The engine writes its
   section 20 each Sunday; people write the rulings in section 0a.
2. This repo, the dashboard slice.
3. Agent briefs in Supabase `agents.brief_content`, rendered to each agent's
   SKILL.md on the VPS. Edit the database, never the rendered file.
4. Sibling repos: `krishanraja/content-engine`, `krishanraja/ai-harness`
   (the skills and canon every AI tool loads), `krishanraja/mindmake`
   (business canon, which wins on the business), and one repo per product.

If anything in this repo's docs contradicts the architecture doc, the
architecture doc wins and the other doc is stale.

## License

Proprietary. Krish Raja / Mindmake.
