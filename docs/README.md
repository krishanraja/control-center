# Control Center documentation

> Control Center is the dashboard slice of mind/make OS, the fleet of AI
> agents Krish Raja runs his businesses on. The whole OS, its rules and its
> current truth live in one file:
> [`MINDMAKE_OS_ARCHITECTURE.md`](./MINDMAKE_OS_ARCHITECTURE.md), on `main`
> and nowhere else (ruling 2026-09-07). Read its section 0 first. When any
> document here disagrees with it, it wins and the other document is stale.

## Start here

| Document | What it settles |
|---|---|
| [`MINDMAKE_OS_ARCHITECTURE.md`](./MINDMAKE_OS_ARCHITECTURE.md) | The OS: who Krish is, the products and their priority, the canon (0a), open issues (0b), the retired list (0c), and every system |
| [`architecture/`](./architecture/) | Deep reference detail behind the architecture doc, one file per section, each with its known stale points listed first |
| [`KRISH.md`](./KRISH.md), [`krish/IKIGAI_v4.md`](./krish/IKIGAI_v4.md) | Krish himself and his ikigai in full |
| [`PORTFOLIO.md`](./PORTFOLIO.md) | Each product's objectives and detail |
| [`../NOW.md`](../NOW.md) | Where Control Center is right now and what changed this month. Kept current by the docs steward |
| [`history/LOG.md`](./history/LOG.md) | The chronological record of everything superseded or rolled. Nothing in `history/` is current |

## The dashboard

| Document | What it settles |
|---|---|
| [`PRODUCT.md`](./PRODUCT.md) | Each tab: what it is for, what it reads and writes, how it behaves |
| [`ARCHITECTURE.md`](./ARCHITECTURE.md) | The engineering contract: data flows, auth, deployment, invariants |
| [`DESIGN_SYSTEM.md`](./DESIGN_SYSTEM.md) | The Mindmake Instrument Room: themes, type roles, material, motion and the shared primitives |
| [`COMPONENTS.md`](./COMPONENTS.md) | React component patterns |
| [`GROWTH_TAB_RUNBOOK.md`](./GROWTH_TAB_RUNBOOK.md) | Operating the Growth tab |
| [`FOCUS-PURPOSE.md`](./FOCUS-PURPOSE.md), [`focus-purpose/`](./focus-purpose/) | The Focus tab and the corpus behind it |
| [`PILOT-LAYER.md`](./PILOT-LAYER.md) | The operator layer: morning gate, red mode, ship ledger, worry compiler |
| [`CONTENT-ENGINE-OPERATING-GUIDE.md`](./CONTENT-ENGINE-OPERATING-GUIDE.md) | How to drive the Content tab and the content engine |
| [`CONTENT-ENGINE-BUILD-SIGNALS.md`](./CONTENT-ENGINE-BUILD-SIGNALS.md) | How commits become content and the architecture doc's weekly record |
| [`TESTING.md`](./TESTING.md) | What is tested, how to run it, and the selector rule |

## Data, agents and operations

| Document | What it settles |
|---|---|
| [`AGENTS.md`](./AGENTS.md) | The agent roster, slug as key, lifecycle and briefs (the repo-root `AGENTS.md` is the separate guide for coding agents) |
| [`GLOSSARY.md`](./GLOSSARY.md) | Every term, table and product noun, defined once |
| [`ICP.md`](./ICP.md), [`icp.json`](./icp.json) | The inbound lead scoring rubric. Who each product is for is `product_icp`, on Growth > Buyers |
| [`DATABASE.md`](./DATABASE.md), [`DB_HEALTH.md`](./DB_HEALTH.md) | Supabase tables, relationships, row level security, migration notes |
| [`API.md`](./API.md), [`DATA-PIPELINE.md`](./DATA-PIPELINE.md) | Query and realtime patterns; the flow from Control Center through Supabase and n8n |
| [`OBSERVABILITY.md`](./OBSERVABILITY.md), [`SECURITY.md`](./SECURITY.md) | Health, alerts, the threat model and rotation procedure |
| [`MODEL_ROUTING_AUDIT.md`](./MODEL_ROUTING_AUDIT.md) | Which model each route and workflow uses, and why |
| [`DEPLOYMENT.md`](./DEPLOYMENT.md), [`CONTRIBUTING.md`](./CONTRIBUTING.md) | Vercel deployment; workflow and code standards |
| [`DECISIONS/`](./DECISIONS/) | Architecture decision records, numbered and immutable |
| [`plans/`](./plans/) | Live and past build plans; `plans/one-swing/STATE.md` is the operating ledger |
| [`steward/`](./steward/) | The docs steward: procedure, the NOW.md contract, the fleet and the run ledger |

Dated build notes (`pr-*.md`, `visibility-followups-2026-05.md`,
`CONTENT_TAB_SPEC.md`, the `audits/` folder and the dated audit files) are a
record of how things were built. They are not current architecture.

## Getting started

```bash
npm install
cp .env.example .env       # the Supabase URL and anon key are the minimum
npm run dev                # Vite front end; use `vercel dev` for /api/*
npx tsc --noEmit
npm run lint
```

Every variable the code reads is named in `.env.example`, and
`scripts/check-env-example.mts` fails the build if one is missing. What each
secret guards and how it is rotated is in [`SECURITY.md`](./SECURITY.md).

## License

Proprietary. Krish Raja / Mindmake.
