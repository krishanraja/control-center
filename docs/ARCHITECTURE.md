# Architecture and Engineering Contract

> **Scope.** The data contracts, control flows and deployment facts of the
> Control Center repo. It says **what** the UI is allowed to do, not how it
> looks. Surface specs live in [`PRODUCT.md`](./PRODUCT.md); schema detail in
> [`DATABASE.md`](./DATABASE.md); the house primitives and CI guards in the
> root [`AGENTS.md`](../AGENTS.md).
>
> **The OS lives elsewhere.** The whole of mind/make OS (the fleet, the rules,
> the schedulers, the money, the portfolio) is described in
> [`MINDMAKE_OS_ARCHITECTURE.md`](./MINDMAKE_OS_ARCHITECTURE.md). This file is
> its repo-scoped subset and links to it rather than repeating it. Where the
> two disagree, that file wins and this one is stale.
>
> **Last reconciled:** 2026-10-05, against the repository at `f31af50a`.

## 1. The OS in one paragraph

mind/make OS is a fleet of AI agents that runs Krish Raja's businesses so he
spends his hours on decisions, not admin (core section 0.4). **Supabase is the
single source of truth**: every piece of OS state lives in one Postgres
database. **Control Center is the dashboard slice**: this React, Vite and
TypeScript app at `controlcenter.krishraja.com`, which reads Supabase directly
and writes back through the anon key or thin Vercel functions. **The work is
done elsewhere**: n8n Cloud workflows, Claude Code agents on the VPS, Vercel
crons in this repo and the content engine, and GitHub Actions. Control Center
never talks to the VPS or n8n directly; every hand-off goes through Supabase,
or through an `/api/*` route that posts to a workflow's webhook.

## 2. Repo boundary

The repo owns:

- The React UI under `src/` (the tabs in section 4, desktop and phone
  variants, hash-routed).
- Vercel serverless functions under `api/` (reads that need the service role,
  service-role writes, webhook triggers) and the Vercel crons in `vercel.json`.
- Supabase migrations under `supabase/migrations/`.
- n8n workflow mirrors under `scripts/n8n/` and `n8n/workflows/` (direction of
  truth is decided per workflow; see `AGENTS.md`).
- The attribution warehouse source under `warehouse/`.
- The OS architecture doc (`docs/MINDMAKE_OS_ARCHITECTURE.md`, the one
  surface) and this documentation tree.

The repo does **not** own:

- The content control plane: editorial and Composer routes, the content crons,
  the video and carousel plane and the work board's `/api/workbench`. They run
  from `krishanraja/content-engine` and are reached through rewrites in
  `vercel.json`, so every URL is unchanged
  ([ADR-019](./DECISIONS/019-content-engine-owns-the-control-plane.md)).
- The `compound` app, which moved to `krishanraja/compound` on 2026-09-21.
- Agent identities (`agents.brief_content` in Supabase; edit there, never the
  rendered SKILL.md).
- The n8n runtime, the OpenClaw runtime on the VPS, and each product's own
  repo and database.
- Standards (`standards_registry` in Supabase).

## 3. Global facts

### 3.1 Single sources of truth

- **Agents.** The `agents` table (`active = true`). The cross-table join key is
  the lowercase slug ([`AGENTS.md#slug-as-key`](./AGENTS.md#slug-as-key)).
- **Tabs.** `src/lib/tabs.ts` is the tab registry.
- **Products.** `src/lib/portfolio.ts` is the ranking and records every slug
  spelling a product carries per table. Labels come from `ventureLabel()` in
  `src/lib/ventureOptions.ts`.
- **Who a product is for.** `product_icp`, read through `src/lib/icp.ts` and
  `api/icp.ts`. A product with no row is blocked, never defaulted.
- **Each surface's one move.** `src/lib/surfaceMoves.ts`, pinned by
  `tests/api/surfaceMoves.test.ts`.
- **Publication formats.** `venture_formats`, mirrored by `src/lib/formats.ts`.
- **Goals.** `useGoalCanon` and `src/lib/goalsApi.ts`.

### 3.2 Deployment

- **Auto-deploy from `main`.** Push to `main` and Vercel deploys.
- **ESM imports need `.js`.** `package.json` declares `"type": "module"`, so
  every relative import inside `api/` uses the `.js` extension, or the deployed
  function fails with a silent 500.
- **Git author identity is fixed:** `Krish Raja <hello@krishraja.com>`
  (standards V-004, GIT-001).
- **CI gates merges.** `.github/workflows/ci.yml` runs lint
  (`--max-warnings 0`), three typechecks, the structural guards, the API tests
  (`npx tsx --test tests/api/*.test.ts`) and a Playwright job. The guard list
  is in the root `AGENTS.md`.
- **Docs are validated on every push and reconciled nightly** by the docs
  steward ([`steward/RUNBOOK.md`](./steward/RUNBOOK.md)).

### 3.3 Authentication

- **The UI and the write routes sit behind an access code.** The browser holds
  a cookie set from it; `hasAccess()` in `api/_auth.ts` checks it on every
  guarded route. **Open issue:** `hasAccess()` returns true when the access
  code is unset, so a misconfigured deploy would open every guarded route (core
  section 0b).
- **Reads** use the anon key and RLS. RLS is on for every table. Some tables
  are service-role only on purpose (for example `agent_plans` and
  `product_icp`), so the browser reaches them only through an API route.
- **Writes** go direct with the anon key where a policy permits, and through
  `/api/*` when the service role is needed. The service role never reaches
  browser code.
- **Inbound writes from the VPS** hit `/api/sync` and `/api/sync-brief`,
  guarded by the sync secret.
- **Crons** authenticate with the cron secret as a Bearer token, never with
  Vercel's spoofable cron header.
- **DB hardening.** User functions have a pinned `search_path`;
  `SECURITY DEFINER` functions are service-role only. See
  [`DB_HEALTH.md`](./DB_HEALTH.md) and
  [ADR-008](./DECISIONS/008-security-hardening-and-auth-rls-scope.md).

### 3.4 Realtime

One channel per table per browser session, fanned out through context and
hooks (ADR-002). Opening a second channel for the same table is a performance
bug. The shared channels include `tasks-rt-shared`, `leads-rt-shared`,
`guests-rt-shared`, `visibility-rt-shared`, `customers-rt-shared`,
`decisions-rt-shared` and `critical-alerts` (tier-3 `silent_failures`).

### 3.5 Money

- **Stripe** is one organisation with five accounts (core 0a.6). Control Center
  reads all five, read-only, with one organisation key: `api/_stripe.ts` holds
  the account registry, `api/revenue/sync.ts` pulls the ledger daily into the
  `revenue_*` tables and `customers`, and `api/revenue/index.ts` serves it to
  the UI. The verified webhook is `POST /api/revenue/webhook`; an event that
  cannot be verified is refused. `scripts/stripe-reconcile.mts` re-measures
  every account against the tables.
- **Substack** plans bill through the mind/make account and are filed under
  `publication`, never CTRL.
- **Heartside** takes payment through Shopify Payments. Control Center does not
  sync its orders; it links out to the Shopify admin analytics, reports it in
  USD as one-off orders and never as MRR.

## 4. Tab-by-tab data contracts

The live registry is `src/lib/tabs.ts`. Five primary destinations (Home,
Content, People, Growth, OS) and a drawer (Focus, Board, Subscriptions). Old
hashes (`#today`, `#leads`, `#guests`, `#bets`, `#acquisition` and others)
resolve through the alias layer in `App.tsx`.

| Tab | Reads | Writes | Notes |
|---|---|---|---|
| **Home** | `goals` (ladder), `daily_focus`, `ships`, the scorecard, today's move (`api/_dailyMove.ts`), the fresh waiting count (`src/lib/freshDecisions.ts` over `decisions_waiting`), tier-3 `silent_failures` | Goal writes through `goalsApi`, slots through `POST /api/daily-focus/slot`, the move through the strategist | Never scrolls; folds instead (`useFitFolds`, `src/lib/homeFolds.ts`) |
| **Content** | Today's calls from the content engine, `content_ideas`, `intake_items`, `venture_formats` | Each call's one primary action or "Not now"; capture through the one + button and the capture pill | Routes served by `krishanraja/content-engine` |
| **People** | Network: `contacts`, `contact_identities`, `contact_intelligence`. Hunt: the hunter tables. Visibility: `visibility_targets`, `guests`. Advisory: `pilot_deals`. Pipeline (`?lane=pipeline`, out of the nav since 2026-09-07): `leads` | Drafts only; contact merges only through `merge_contacts` | Lanes behind one `SegmentedNav` (`people-lane-<id>`) |
| **Growth** | The growth read model (`src/lib/growthModel.ts`) over `growth_*` tables, `growth_geo_probes`, the site check, Google rank, `product_icp` | Touchpoints, clips, review rulings, buyer definitions (`api/icp.ts`) | Views next, week, numbers, places, buyers (`src/lib/growthSections.ts`) |
| **OS** | Org: `agents`, the agent's plan, tasks and runs through `/api/agents/[name]`, `corrections`. Intel: `/api/spend`, `/api/revenue`, the meter. Flows: `workflow_runs`, `workflow_proposals`. Systems: `system_health`, `credential_health`, `silent_failures` | Rulings answered in place on Org; proposal approve or reject on Flows | Subtabs `os-sub-<id>`; Intel routes under `exec` for historical reasons |
| **Focus** | `pilot_asks` and the committed Focus corpus | The day's answers | No scores, nothing that watches him back ([`FOCUS-PURPOSE.md`](./FOCUS-PURPOSE.md)) |
| **Board** | `/api/workbench` (served by the content engine) | Krish's reply to an item, with his cookie only | Written by Claude and Codex sessions |
| **Subscriptions** | `/api/revenue`, `customers`, the portfolio board (`src/lib/portfolioBoard.ts`, the same inputs as Growth) | A check-in drafted in Gmail (never sent); the Substack CSV import | Every unwired number says what is missing, never 0 |

## 5. The control flow (Krish acts, the OS reacts)

1. **Krish acts** on a surface's one move or a row.
2. **Supabase changes**, directly where RLS allows or through an `/api/*`
   route when the service role is needed.
3. **A trigger or the route posts** to the n8n Orchestrator or to a workflow's
   own webhook, when the action needs an agent.
4. **The workflow runs** and writes its result back to Supabase.
5. **Realtime echoes** the change and the surface re-renders.

**Hard rule: Control Center never sends.** No route sends an email, a message
or a post on its own (`check-bridges-never-send` in CI). Email is Gmail drafts
only; publishing, including to LinkedIn, is manual (core 0a.4).

## 6. Background services the dashboard reads

None of these run inside the browser. Live lists: `vercel.json`, the n8n API,
and the VPS crontab and OpenClaw registry (core section 9).

| Service | Where | Cadence | What it does |
|---|---|---|---|
| Fleet reconcile | Vercel, `/api/health/fleet-reconcile` | Every 6 hours | Every workflow against the n8n API |
| Connections sweep | Vercel, `/api/health/connections-sweep` | Every 6 hours | Cheapest live probe of every key Vercel holds; strict checks on the Stripe organisation key and Heartside's Shopify credential, so a rejected credential reads failed, never green |
| Revenue sync | Vercel, `/api/revenue/sync` | Daily 08:00 UTC | The five Stripe accounts into the revenue tables |
| `cc-sync-engine.sh` | VPS | Every 5 minutes | Refreshes `home_intelligence`, flags stale tasks |
| `openclaw-runs-to-cc.py` | VPS | Every 15 minutes | Copies finished OpenClaw runs into `workflow_runs` (added 2026-10-05) |
| `render-identity.py` | VPS | Every 15 minutes | `agents.brief_content` into each agent's SKILL.md |
| `write-system-health.py` | VPS | Every 15 minutes | Writes `system_health` |
| Silent Success Detector, Vera's weekly sweeps | n8n | Every 8 hours; Sundays | Value failures into `silent_failures` and `corrections` |
| Agatha Weekly Plan Refresh | n8n | Mondays | Refreshes `agent_plans` |

Retired: `cc-doc-creator.sh` and `sync-to-drive.py` (2026-10-05, agents never
write into Drive), Kai and its Dependency Mapper (2026-09-07), Priya
(2026-09-14). Core section 0c is the full retired list.

## 7. Invariants

Each must hold; a violation is a bug.

1. **The Growth standard on every tab (2026-10-05).** Numbers compressed to a
   glance; insight only when asked; one action at a time through
   `shared/DoThisNextHero`, the verdict landing where he pressed; honest
   emptiness, said once; recomposed per layout by `useContainerWidth`, not
   shrunk. Each surface's move order is `src/lib/surfaceMoves.ts`.
2. **No window scroll.** Every tab is a `shared/AppFrame`: a fixed header over
   one bounded scroller that reaches the bottom of the frame. Home may not
   scroll at all. Guarded by the no-scroll, home-fit and frame-reach specs.
3. **Empty is not broken.** Every empty state says whether nothing happened or
   loading failed. A spinner is never an empty state.
4. **An unwired number is never a zero.** It names its missing source
   (`src/lib/portfolio.ts`).
5. **Slug as key** for every cross-table agent reference.
6. **One realtime channel per table** (ADR-002).
7. **Waiting is unified.** A new kind of thing waiting on Krish adds a branch to
   the `decisions_waiting` view, never a sibling panel.
8. **Control Center never sends** (section 5).
9. **Action provenance.** Every Krish action writes an `audit_log` row with
   `actor='krish'`.
10. **No silent legacy-column drop.** A rename reads both columns until the old
    one is dropped.

## 8. Failure modes

The OS-wide list, the silent-success shapes and the debugging order are in core
section 13 of [`MINDMAKE_OS_ARCHITECTURE.md`](./MINDMAKE_OS_ARCHITECTURE.md).
Repo-specific ones:

| Symptom | First place to look | Fix |
|---|---|---|
| A tab will not load | Browser console and Vercel logs | Push a fix to `main` |
| ESM 500 on a function | Vercel log shows `ERR_MODULE_NOT_FOUND` | Add `.js` to the relative import |
| An action fails silently | `audit_log`, the route's log, the RLS policy | Route it through `/api/*` if it needs the service role |
| A surface reads empty but data exists | Is the table service-role only? | Read it through its API route |
| Realtime stops updating | Supabase status, browser console | Re-subscribe on `visibilitychange` |
| `/api/*` returns raw TypeScript under `npm run dev` | Expected: Vite does not serve the functions | Use `vercel dev` |
