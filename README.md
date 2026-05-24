# Control Center

The single pane of glass for **Mindmaker OS**, the fleet of AI agents that
runs Krish Raja's business portfolio (Mindmaker, Meliora, AdFixus,
Fractionl, OnAlert, Gutted, Merciless, mm-ctrl, plus the content brands
Builder Economy, Signal & Noise, Techonomic).

**URL:** [`controlcenter.krishraja.com`](https://controlcenter.krishraja.com)
&nbsp;·&nbsp; **Deploy:** Vercel (push to `main` auto-deploys)
&nbsp;·&nbsp; **Data:** Supabase project `gojpffsrxybbpbdzzrvs`

## What this repo is

A React + TypeScript + Vite dashboard with thin Vercel serverless API
routes under `api/`. It reads Supabase directly through PostgREST + Postgres
Realtime, and writes back either with the anon key (for low-stakes
mutations) or through an `/api/*` function (when service-role context is
required, e.g. promoting a lead to a task or triggering an N8N orchestrator
webhook).

The repo does *not* contain the agents themselves. Agents are 14 Supabase
rows (`agents.brief_content`) plus ~76 N8N workflows; they live in the
broader Mindmaker OS, hosted on a VPS and N8N Cloud. The Control Center is
the dashboard slice. See [§Place in the broader OS](#place-in-the-broader-os).

## What this repo should be

The promise the dashboard exists to keep:

> **Krish opens one tab and sees every decision the OS is waiting on him
> for. He decides in one click. The rest runs in the background.**

In practice that means:

- **Home is anchored by `decisions_waiting`** — a single Postgres view
  unioning tasks, leads, guests, visibility targets, and content ideas, so
  the dashboard never has to bolt on a sibling panel when a new "waiting on
  Krish" surface gets added; new surfaces add a `UNION ALL` branch to the
  view.
- **Every actionable row is one click from done.** Approve, reject,
  promote, schedule, deep-enrich, kill — never a modal-then-form-then-save.
  The mutation writes Supabase, the realtime subscription bounces back in a
  tick, and the badge count drops.
- **Self-healing is built in, not bolted on.** The four-tier silent-failure
  system (completeness contracts → Silent Success Detector → Critical
  Infrastructure Monitor → Failure Pattern Sweep) surfaces *value*
  failures, not just exceptions; the `CriticalAlertBanner` on Home fires
  when something is meaningfully broken, and stays quiet otherwise.
- **Krish corrects, the OS adapts.** Rejections flow through
  `feedback_queue` → `corrections` → agent brief edits. Same mistake should
  not survive four occurrences.
- **Under 2 hours a day on ops.** That is the north-star metric the
  dashboard is optimised against. Every UI choice should be evaluated by
  whether it reduces Krish's time-to-decision, or whether it just looks
  good.

If a change to this repo cannot be defended against one of those goals, it
does not belong.

## Tech stack

| Layer | Tool |
|---|---|
| Frontend | React 18 + TypeScript + Vite 4 |
| Styling | Tailwind CSS 3 + Radix UI primitives |
| Icons | Lucide React |
| Realtime | `@supabase/supabase-js` (`postgres_changes` subscriptions) |
| API routes | Vercel serverless (`@vercel/node`) under `api/` |
| Data | Supabase (Postgres + PostgREST + Realtime) |
| Orchestration | N8N Cloud (~76 workflows, fired via the Orchestrator webhook on row changes) |
| AI (Skill Forge only) | OpenAI (`api/skills/*`, `api/_skill-prompt.ts`) |
| Hosting | Vercel (Vite framework, SPA rewrites, `/api/*` routes per `vercel.json`) |

## Local development

```bash
# 1. Install (npm is the committed lockfile)
npm install

# 2. Configure env
cp .env.example .env
# Fill in VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY, and the server-only
# secrets listed in .env.example.

# 3. Run
npm run dev

# Other scripts
npm run build      # Production bundle
npm run preview    # Serve the built bundle
npm run lint       # ESLint, --max-warnings 0
npx tsc --noEmit   # Type check (no emit)
```

The `api/` routes are Vercel serverless functions. Use `vercel dev` if you
need to exercise the endpoints locally; `npm run dev` alone only runs the
Vite front end.

**Environment variables.** Client-side variables are prefixed `VITE_` and
end up in the bundle. Everything else is server-only (used by `api/*`).
See `.env.example` for the canonical list; the bare minimum for a dev
server is `VITE_SUPABASE_URL` + `VITE_SUPABASE_ANON_KEY`.

## Project layout

```
api/                        Vercel serverless functions (one file per endpoint)
  _supabase.ts                Server-side Supabase client (service role)
  _skill-prompt.ts            OpenAI prompt for Skill Forge
  agents/, leads/, guests/, bets/, approvals/,
  customer-contacts/, corrections/, nell-candidates/
                              Resource-scoped subfolders
  ask-marcus.ts               /api/ask-marcus — Anthropic-backed Q&A grounded in
                              customers/leads/bets/home_intelligence
  health.ts, status.ts, refresh-health.ts
                              Health/observability endpoints
  sync.ts, sync-brief.ts      Inbound writes from the OS sync pipeline
  feedback.ts                 Routes rejections into feedback_queue
  content-ideas.ts            Cleo's idea backlog endpoint
  metrics.ts, goals.ts, today.ts, task.ts, data.ts, reject.ts,
  trigger-agent.ts, automations.ts
                              Misc dashboard endpoints

src/
  App.tsx                     Tab router (11 tabs, hash-based)
  components/
    desktop/                  Desktop tab roots (DesktopHome, DesktopLeads, ...)
    mobile/                   Mobile-equivalent roots
    flows/                    Lead/guest/visibility flow widgets
    shared/                   Shared primitives (Toast, ErrorBoundary, ...)
  contexts/                   React contexts (AgentsContext)
  hooks/                      Realtime + data hooks (useRealtimeTasks,
                              useRealtimeLeads, useRealtimeGuests,
                              useRealtimeDecisionsWaiting, useCriticalAlerts,
                              useCustomers, useVisibilityTargets, ...)
  services/                   Data services (agentBriefs, agentData)
  lib/supabase.ts             Browser Supabase client (anon key)
  types/                      Shared TS types
  utils/                      Helpers

docs/                       This documentation tree (see docs/README.md)
n8n/workflows/              N8N workflow JSON, committed for source-of-truth diffing
supabase/migrations/        Supabase migration SQL
scripts/
  cron/                       Cron definitions
  migrations/                 Database migrations
  backfill/                   One-shot backfill scripts
  n8n/                        N8N workflow source dumps
public/                     Static assets served at root

.github/workflows/          CI (lint + tsc --noEmit on every PR)
vercel.json                 Vite framework, SPA rewrites, /api/* routing
```

## Place in the broader OS

The repo is one of three things you read together to understand Mindmaker
OS:

1. **`MINDMAKER_OS_ARCHITECTURE.md`** (workspace root on the VPS, not in
   this repo) — the canonical end-to-end architecture: agent fleet,
   Supabase schema (~60 tables), data flows, self-healing tiers, cron
   topology, portfolio context. Read this if you want to understand the OS.
2. **This repo (`control-center`)** — the dashboard implementation. Read
   `docs/ARCHITECTURE.md` and `docs/PRODUCT.md` for the slice of the OS the
   dashboard owns.
3. **Agent briefs** (Supabase `agents.brief_content`, rendered to
   `~/.openclaw/skills/agent-{id}/SKILL.md` on the VPS) — what each agent
   is and what it does. Edit these in the DB, not the rendered files.

If anything in this repo's docs contradicts `MINDMAKER_OS_ARCHITECTURE.md`,
**the OS architecture doc wins** and this repo's doc is stale. File an
issue.

## Further reading

- [`docs/README.md`](./docs/README.md) — documentation index
- [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md) — Control Center
  architecture and engineering contract
- [`docs/PRODUCT.md`](./docs/PRODUCT.md) — per-tab product spec
- [`docs/AGENTS.md`](./docs/AGENTS.md) — agent roster and slug-as-key rule
- [`docs/DATABASE.md`](./docs/DATABASE.md) — Supabase tables, relationships, RLS
- [`docs/DEPLOYMENT.md`](./docs/DEPLOYMENT.md) — Vercel deployment
- [`docs/CONTRIBUTING.md`](./docs/CONTRIBUTING.md) — workflow and standards
- [`docs/DECISIONS/`](./docs/DECISIONS/) — architecture decision records

## License

Proprietary. Krish Raja / Mindmaker.
