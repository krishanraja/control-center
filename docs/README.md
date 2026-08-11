# Control Center Documentation

> The dashboard slice of [Mindmaker OS](#what-mindmaker-os-is), the
> autonomous-organisation operating system Krish Raja runs his portfolio on.
> This index covers the slice. The full OS architecture lives in
> `MINDMAKER_OS_ARCHITECTURE.md` on the VPS workspace root — when this
> repo's docs and that file disagree, that file wins.

## Index

| Document | Description |
|---|---|
| [`PRODUCT.md`](./PRODUCT.md) | Per-tab product spec: what each surface is for, what it reads/writes, behaviour rules, SLAs |
| [`ARCHITECTURE.md`](./ARCHITECTURE.md) | Control Center's engineering contract: data flows, Vercel quirks, SSOT rules |
| [`DESIGN_SYSTEM.md`](./DESIGN_SYSTEM.md) | "Obsidian Aurora" — themes, tokens, typography, material, motion, haptics, shared primitives |
| [`AGENTS.md`](./AGENTS.md) | Agent roster, slug-as-key rule, taxonomy, lifecycle, manual trigger flow |
| [`DATABASE.md`](./DATABASE.md) | Supabase tables, relationships, RLS posture |
| [`DB_HEALTH.md`](./DB_HEALTH.md) | DB health snapshot, security remediation applied, migration-ledger notes |
| [`COMPONENTS.md`](./COMPONENTS.md) | React component patterns |
| [`DATA-PIPELINE.md`](./DATA-PIPELINE.md) | Event-driven flow: Control Center → Supabase → N8N → Supabase → UI |
| [`API.md`](./API.md) | Supabase queries and realtime subscription patterns |
| [`OBSERVABILITY.md`](./OBSERVABILITY.md) | Health model, alerts, SLIs, logging |
| [`SECURITY.md`](./SECURITY.md) | Threat model, secrets inventory, auth, rotation |
| [`GLOSSARY.md`](./GLOSSARY.md) | Canonical definitions for product / data terms |
| [`DECISIONS/`](./DECISIONS/) | Architecture decision records (numbered, immutable) |
| [`DEPLOYMENT.md`](./DEPLOYMENT.md) | Vercel deployment + env setup |
| [`CONTRIBUTING.md`](./CONTRIBUTING.md) | Dev workflow + code standards |
| [`DATA-RECOMMENDATIONS.md`](./DATA-RECOMMENDATIONS.md) | Forward-looking data pipeline improvements |
| [`TESTING.md`](./TESTING.md) | What is tested, how to run it, and the selector rule that keeps it green |

The `pr-*.md` files (e.g. `pr-7-living-plans-decisions-view.md`) and the
`visibility-followups-2026-05.md` file are rolling change notes from the
2026-05 OS rebuild (PRs #49 — #60). Treat them as a changelog supplement,
not authoritative architecture.

## What Mindmaker OS is

A fleet of AI agents running Krish's business portfolio so he spends his
hours on decisions, not admin. Two physical layers:

- **Claude Code agents** (Agatha + 6 others) — run inside OpenClaw on a VPS,
  have a workspace, a Telegram bot, and conversational memory across
  sessions. Interactive.
- **N8N workflow agents** (~76 workflows across 14 production roles) — run
  on cron, do one thing, write the result back to Supabase. One-shot.

Some agents (Vera, Marcus, Cleo, Nova, Nell, Agatha) exist in both forms by
design: the N8N side handles the routine pulse; the Claude Code side handles
ad-hoc deeper work.

**Supabase is the single source of truth** (~60 tables). Local JSON for
state is banned. SKILL.md files, `hot/standards-digest.md`, and the various
`active/*-action.md` files are output-only — they are rendered from
Supabase on a schedule and must never be edited in place.

The Control Center is the **single pane of glass** on top of all that.

## The role of this dashboard

It exists to keep one promise:

> Krish opens one tab and sees every decision the OS is waiting on him for.
> He decides in one click. The rest runs in the background.

That promise is encoded as five concrete patterns the dashboard refuses to
break:

1. **Decisions waiting is unified.** Every "thing waiting on Krish" — task,
   lead, guest, visibility target, content idea — goes through the
   `decisions_waiting` Postgres view, never a sibling panel.
2. **One click per decision.** Approve / reject / promote / schedule /
   deep-enrich / kill — never modal-then-form-then-save.
3. **Self-healing is built-in.** Four tiers of silent-failure detection
   surface *value* failures, not just exceptions, with the
   `CriticalAlertBanner` on Home as the tier-3 surface.
4. **Krish corrects, the OS adapts.** Rejections flow through
   `feedback_queue` → `corrections` → agent brief edits.
5. **Time-to-decision is the metric.** Every UI choice is evaluated against
   "does this reduce Krish's ops hours?" — not against beauty.

If a change to this dashboard cannot be defended against one of those
patterns, it does not belong.

## Tabs (current shape)

Eleven primary tabs, routed by `App.tsx` via a hash-based router.

| Tab | Hash | Purpose | Primary tables |
|---|---|---|---|
| Home | `#home` | DecisionsWaitingPanel, CriticalAlertBanner, MrrTicker, Marcus headline, StreakPills, KillListModal | `decisions_waiting`, `home_intelligence`, `silent_failures`, `customers`, `bets` |
| Today | `#today` | Active / blocked / waiting tasks with inline actions | `tasks` |
| Leads | `#leads` | Per-venture lanes of enriched leads, one per active venture | `leads`, `venture_registry` |
| Customers | `#customers` | MrrTicker, CustomerSourcesPanel, CustomerCouncilCard, ExpansionRadar, per-product feeds | `customers`, `customer_contacts` |
| Guests | `#guests` | Podcast guests + visibility targets; bulk import, pitch drafts, status lanes | `guests`, `visibility_targets` |
| Content | `#content` | Cleo's content-ideas backlog with idea capture | `content_ideas` |
| Bets | `#bets` | Live bets with time-box bars, place-bet flow, 90-day hit-rate | `bets` |
| Org | `#org` | Agent grid by pod with inline brief editor | `agents` |
| Intel | `#exec` | Marcus headline + AskMarcus chat + Zara signals + deep research | `zara_signals`, `marcus_synthesis`, `home_intelligence`, `customers`, `leads`, `bets` |
| Flows | `#workflows` | N8N workflow health, recent runs, pending proposals | `workflow_runs`, `workflow_proposals` |
| Systems | `#systems` | Infrastructure health, credential health, silent failures by tier | `system_health`, `credential_health`, `silent_failures` |

The `Intel` tab is rendered by `DesktopExec.tsx` (and `MobileIntel.tsx`)
and is routed under the `exec` tab id for historical reasons — that is
intentional and not a typo. See [`AGENTS.md`](./AGENTS.md) for why the
naming inconsistency was kept.

## Getting started

```bash
npm install
cp .env.example .env       # then fill in VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY
npm run dev                # vite dev server
npx tsc --noEmit           # type check (CI runs this on every PR)
npm run lint               # eslint --max-warnings 0
```

The `api/` routes only run under Vercel's runtime. Use `vercel dev` if you
need the serverless endpoints locally.

## Architecture at a glance

```
┌─────────────────────────────────────────────────────────────────┐
│  Control Center UI (React + TypeScript + Tailwind)             │
│  • 11 tabs (Home / Today / Leads / Customers / Guests / ...)   │
│  • Realtime via @supabase/supabase-js postgres_changes         │
│  • Mutations: anon write OR /api/* (service role) when needed  │
└──────────────────────────────┬──────────────────────────────────┘
                               │ reads (PostgREST + Realtime)
                               │ writes (anon or service role)
                               ▼
┌─────────────────────────────────────────────────────────────────┐
│  Supabase (Postgres, ~60 tables — SSOT for the entire OS)       │
│  • Identity: agents, standards_registry, ventures               │
│  • Plans: agent_plans, tasks, goals, opportunities              │
│  • Pipeline: leads, guests, visibility_targets, content_ideas   │
│  • Revenue: customers, customer_contacts, bets                  │
│  • Ops: workflow_runs, audit_log, silent_failures, ...          │
│  • View: decisions_waiting (UNION across 5 source tables)       │
└──────────────────────────────┬──────────────────────────────────┘
                               │ pg_net triggers on row change
                               ▼
┌─────────────────────────────────────────────────────────────────┐
│  N8N Orchestrator (u0kIULJBJL4dGcuR)                            │
│  Routes events to the right downstream workflow                 │
└──────────────────────────────┬──────────────────────────────────┘
                               ▼
┌─────────────────────────────────────────────────────────────────┐
│  ~76 N8N workflows + Claude Code agents on the VPS              │
│  Do the work, write the result back to Supabase.                │
└─────────────────────────────────────────────────────────────────┘
```

The dashboard never talks to N8N or the VPS directly. Every cross-system
communication goes through Supabase.

## Environment variables

Client (browser-exposed, prefixed `VITE_`):

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`
- `VITE_API_URL` (optional, defaults to same-origin `/api`)
- `VITE_N8N_FEEDBACK_URL`
- `VITE_N8N_CLEO_TRANSFORM_URL`
- `VITE_N8N_VISIBILITY_DEEP_ENRICH_URL`

Server (Vercel API routes, never exposed):

- `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`
- `SYNC_SECRET` (guards `/api/sync` from the OS sync pipeline)
- `N8N_API_KEY`, `N8N_API_BASE_URL`
- `N8N_FEEDBACK_URL`
- `OPENAI_API_KEY`, `OPENAI_MODEL` (Skill Forge under `/api/skills/*`)
- `SKILL_DELIVERY_WEBHOOK_URL`

See [`SECURITY.md`](./SECURITY.md) for rotation procedure and the threat
model around each secret.

## License

Proprietary. Krish Raja / Mindmaker.
