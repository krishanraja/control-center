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
| [`PILOT-LAYER.md`](./PILOT-LAYER.md) | The operator layer: morning gate, red mode, ship ledger, worry compiler, and its non-negotiables |
| [`FOCUS-PURPOSE.md`](./FOCUS-PURPOSE.md) | The Focus & Purpose home: the operator's theory on tap (daily ask, traps, scripts, decision rules) and its non-negotiables |
| [`focus-purpose/`](./focus-purpose/) | The committed corpus behind it: the operating manual and the purpose workbook distillation |
| [`GLOSSARY.md`](./GLOSSARY.md) | Canonical definitions for product / data terms |
| [`DECISIONS/`](./DECISIONS/) | Architecture decision records (numbered, immutable) |
| [`DEPLOYMENT.md`](./DEPLOYMENT.md) | Vercel deployment + env setup |
| [`CONTRIBUTING.md`](./CONTRIBUTING.md) | Dev workflow + code standards |
| [`DATA-RECOMMENDATIONS.md`](./DATA-RECOMMENDATIONS.md) | Forward-looking data pipeline improvements |
| [`TESTING.md`](./TESTING.md) | What is tested, how to run it, and the selector rule that keeps it green |
| [`plans/compound/STATE.md`](./plans/compound/STATE.md) | Current production truth for the private COMPOUND sibling application |
| [`plans/compound/RELEASE_GATE.md`](./plans/compound/RELEASE_GATE.md) | Completed release evidence and genuinely open operational gates for COMPOUND |

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

Six destinations plus a drawer, routed by `App.tsx` via a hash-based router.
The registry is `src/lib/tabs.ts`; the simplified IA is committed
(2026-08-20), and legacy hashes (`#leads`, `#guests`, `#today`, `#bets`,
`#acquisition`, ...) alias into these destinations, so old bookmarks keep
working.

| Tab | Hash | Purpose | Primary tables |
|---|---|---|---|
| Home | `#home` | The canon, one screen, no scrolling: OS goals → this week's ≤3 objectives → today's 3, one vitals line (MRR · ships · waiting), ONE contextual CTA, the Focus doorway row | `goals`, `daily_focus`, `ships`, `decisions_waiting`, `silent_failures` |
| Content | `#content` | Content Engine v2: Built / Paid / Library rooms + the mobile Queue decision deck; the brief editor | `content_ideas`, `weekly_briefs`, `shifts`, `content_decisions` |
| People | `#people` | Every human pipeline: Pipeline / **Network** (default lane) / Visibility | `leads`, `contacts`, `contact_intelligence`, `guests`, `visibility_targets` |
| Growth | `#growth` | The weekly growth loop: Map, Work, Signals, Council, Governance ([`GROWTH_TAB_RUNBOOK.md`](./GROWTH_TAB_RUNBOOK.md)) | growth + governance tables per the runbook |
| OS | `#os` | Queue (the ruling deck) + Org / Intel / Flows / Systems subtabs | `tasks`, `agents`, `workflow_runs`, `system_health`, `zara_signals` |
| Focus | `#focus` | The operator's hub: daily ask, steadying moves, scripts, decision rules ([`FOCUS-PURPOSE.md`](./FOCUS-PURPOSE.md)) | `pilot_asks` |
| Subscriptions | `#customers` (drawer) | Watch-only revenue: MRR, sources, council, expansion radar | `customers`, `customer_contacts` |

Intel still routes under the `exec` id inside OS for historical reasons —
intentional, not a typo (see [`AGENTS.md`](./AGENTS.md)).

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
│  • 6 destinations (Home / Content / People / Growth / OS /     │
│    Focus) + Subscriptions in the drawer                        │
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
