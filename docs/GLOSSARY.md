# Glossary

> **Scope.** One place for the terms used across the codebase, the UI and the
> documentation. Where a term is defined in detail elsewhere, that doc is
> linked; the entry here is the short form. Section 18 of
> [`MINDMAKE_OS_ARCHITECTURE.md`](./MINDMAKE_OS_ARCHITECTURE.md) points here
> and carries no glossary of its own. Where this file and that core disagree,
> the core wins and this file is fixed. Retired names are listed in the
> core's section 0c; an entry below that names one says so.
>
> Last checked 2026-10-05.

---

## A

**ADR** - Architecture Decision Record. A short markdown file in
[`docs/DECISIONS/`](./DECISIONS/) capturing one architectural choice and
the trade-offs considered. Numbered sequentially.

**Advisory (People lane)** - The People lane for Mindmake conversations,
labelled by `ADVISORY_LABEL` in `src/hooks/usePilots.ts`. Called the Room
until 2026-09-16 and Pilots after (ADR-023); `?lane=pilots` and `?lane=room`
still land on it. Its one move: a reply first, then a drafted note to send,
then the people just found.

**Agent** - A non-human actor in the OS. Has a slug, display name, pod and
brief. May be a Coordinator, Executor or Monitor (see
[`AGENTS.md`](./AGENTS.md#agent-taxonomy)). Agents report to Control Center,
never into Drive.

**`agent_id`** - The owning-agent column on `workflow_runs`. Stores the
lowercase slug. Renamed from `agent` on 2026-04-15.

**`agents.id`** - Primary key of the `agents` table. The lowercase slug
(e.g. `cleo`). The canonical join key for every cross-table agent
reference. See [Slug-as-Key](./AGENTS.md#slug-as-key).

**Agatha** - The COO agent: the strategic chat, the weekly plan refresh,
decomposing objectives. Never messages Krish (pull-only).

**Arlo** - The infrastructure agent. Diagnoses a failed build into
`workflow_runs` and changes nothing. Cannot push to `main` (2026-10-05).

**Audit log** - The `audit_log` table. Append-only stream of every
significant event. Drives live activity and the Intel feed.

---

## B

**Bet** - A row in the `bets` table: a falsifiable business hypothesis with
a time box, `est_mrr_impact_usd` and a status (`live`/`won`/`lost`/`partial`).
The Bets tab is retired; bets are read under OS > Intel.

**Board** - A drawer tab (`#/board`, 2026-10-03). Work that Claude and Codex
sessions wrote for Krish: waiting on him, in progress, done. One waiting item
at a time, answered in place.

**Brief** - Long-form text defining an agent's voice, mission and mandate.
Stored only as `agents.brief_content` and rendered to
`~/.openclaw/skills/agent-{id}/SKILL.md` on the VPS every 15 minutes by
`render-identity.py`. There is no Google Doc copy. Every active brief opens
with the priority and reporting block.

**Blocker** - A task with `status='blocked'` whose progress depends on an
external action.

**Built, Paid** - RETIRED publication formats. Paid and Built (2026-08-11)
became The Money of AI and Built with AI, which were retired on 2026-09-17 in
favour of the three subchannels. `PUBLIC_SERIES` in `src/lib/publicSeries.ts`
stays keyed `built` / `paid` only because those are the two wordmark images
that exist.

---

## C

**Circle** - Fractionl's thesis-validation product at circle.fractionl.ai.
**Dormant** since 2026-10-05: preserved, never purged, not worked. Dormant is
not retired; the two words must not collapse into each other.

**Cleo** - The content coordinator agent. Its last two n8n workflows
(`Draft Post on Demand`, `LinkedIn Distribution`) were retired on 2026-10-05;
content work happens in the Content tab and the content engine.

**Completeness Contract** - A row in `completeness_contracts` declaring the
minimum acceptable output of a workflow. Tier 1 of the self-healing system.

**Concept** - The durable identity of a piece of work (a company, a guest, a
visibility target) that may show up as many rows across tables. Identified by
a slug like `concept:org:<name>` in `concept_id`. Closed with `close_concept`,
recorded in `concept_decisions`, never by patching rows one by one.

**Connections sweep** - `/api/health/connections-sweep`, a Vercel cron every
6 hours that sends the cheapest live request proving each key Vercel holds
still works. Since 2026-10-05 it watches the Stripe organisation key and
Heartside's Shopify credential with strict checks, so a rejected credential
reads as failed, never green. It replaced Kai.

**Content engine** - The sibling repo `krishanraja/content-engine`, which
runs the editorial routes, the Composer's routes, the content crons and the
video control plane (ADR-019). Control Center keeps the Content tab and
reaches the rest through `vercel.json` rewrites.

**Control Center** - This product: the dashboard of mind/make OS at
controlcenter.krishraja.com. Formerly "org-os-dashboard" (name banned).

**Coordinator** - An agent that plans and reviews but does not execute n8n
workflows directly. Has `expected_runs_per_day = null`.

**Corrections** - Rows in `corrections`. Patterns Vera extracts from
`feedback_queue` or `silent_failures`; once approved they edit agent briefs
or `standards_registry`.

**CTRL** - The AI brain app at ctrl.mindmake.co, repo `mm-ctrl`. Sells one
thing, **CTRL Pro at $49 a month** (renamed from Edge Pro on 2026-10-05),
charged by Supabase edge functions in that repo. Zero paying customers as of
2026-10-05. Priority 3.

**Customer** - A row in `customers`: the cross-product ledger keyed by
product and Stripe customer id. `customer_kind`:
`paid`/`free_signup`/`trial`/`waitlist`/`churned`. Stripe is its ground truth.

**`customer_contacts`** - One row per logged conversation with a customer.

---

## D

**Decisions Waiting** - The `decisions_waiting` view: one union of
everything waiting on Krish. A new kind of waiting item adds a branch to the
view, never a sibling panel. Home shows its fresh count; each ruling is
answered in the tab that owns it (the OS Queue was removed 2026-10-04).

**Deep enrich** - Running a model-backed enrichment over a freshly captured
lead, guest or visibility row.

**Deliver Gate** - `deliver_gate.py` on the VPS. Enforces standards before
agent output leaves the workspace.

**Dormant** - Preserved and not worked. Circle is dormant. Compare retired
(section 0c of the core).

**Drive sync** - RETIRED 2026-10-05. `sync-to-drive.py` and the
`google_drive_sync` rows are gone; agents never write into Krish's Drive.
The Content tab's "Send to Google Docs", pressed by Krish, is not agent
writing.

---

## E

**Executor** - An agent that runs scheduled jobs and produces artefacts.

**Event** - A row in `events`, the one event table for attending and
speaking. Scored on two axes, Draw (peer density) and Demand (buyer density).
See core section 0a.3.

---

## F

**Feedback Queue** - `feedback_queue`. Krish's rejections and comments, fuel
for the learning loop.

**Felix** - RETIRED 2026-07-10 (enterprise sales pipeline).

**Five Questions** - The shape of OS > Intel since 2026-08-26: what is it
costing, what is coming in, what is broken, is anything converting, what
should I decide. The sixth is AskMarcus.

**Flag** - A note Krish raises against an agent. Surfaced via
`PendingFlagModal` on next session start; cannot be silently dismissed.

**Fleet reconcile** - `/api/health/fleet-reconcile`, a Vercel cron every 6
hours that reconciles every workflow against the n8n API.

**Flow** - An n8n workflow. OS > Flows lists them.

**Full Time** - Football recaps read by a pundit you pick, at fulltime.fm.
Full Time Pro is $4.99 a month; it has never collected a payment
(2026-10-05). Priority 1.

---

## G

**Goal** - A row in `goals`, the one goal table, with four horizons (`os`,
`mid_term`, `weekly`, `venture_objective`) laddered by `parent_id`. Entered
only through `GoalLadder`.

**Growth (pod)** - Cleo, Maya, Nell, Nova, Zara, Hunter.

**Growth gold standard** - Krish's ruling of 2026-10-05: the Growth tab is
the standard for how data becomes insight becomes action, and every tab now
meets it. Five rules: numbers at a glance; insight only when asked; one move
at a time with the verdict where he pressed; honest emptiness said once;
recomposed per layout.

**Guest** - A row in `guests`: a podcast guest candidate. The briefing lands
in `guests.briefing_md` and opens in Control Center (2026-10-05).

---

## H

**Heartside** - Gifts written by your dog. A Shopify store at heartside.io
opening on 2026-10-20. Takes payment through Shopify Payments, not Stripe;
reported in USD as one-off orders (orders, revenue, average order value,
repeat customers), never MRR. Krish reads its numbers in the Shopify admin,
which Control Center links to. Priority 1.

**Home Intelligence** - The singleton row in `home_intelligence`
(`id='current'`), refreshed by Marcus.

**Hunter** - The job sourcing, packages and warm intros agent; the Hunt lane
on People. Kept (confirmed 2026-10-05). Runs from GitHub Actions and
`/api/hunter/tick`.

---

## I

**Intel** - The OS subtab titled Business Intelligence, also routed under
the legacy `exec` id. See **Five Questions**.

**Intake** - `intake_items`: one row per thing that arrived from any source,
before it becomes an idea or is dropped with a reason.

---

## K

**Kai** - RETIRED 2026-09-07. Replaced by fleet reconcile and the
connections sweep.

**Krish** - The CEO and the only intended user of Control Center. Audit-log
actor for every manual action (`actor='krish'`).

---

## L

**Lead** - A row in `leads`: a prospect with `assignee_agent`, `tags[]`,
per-venture `icp_scores`, `primary_venture`, `fit_score`.

**Legibility** - Typed product data for AI agents, over REST and MCP, at
legibility.io. Private beta, $0 revenue (2026-10-05). Priority 2.

---

## M

**Maya** - The acquisition and SEO agent. Its prospecting reads `product_icp`
only and is blocked, with the reason shown, for a product with no row.

**Marcus** - The synthesis agent: Home Intelligence, the daily brief, the
Friday retro, the Monday pre-mortem.

**Meter (usage meter)** - `meter_daily`, one row per provider, unit, day
and sub-dimension: which unit of the OS spent the money. Surfaces in
`/api/spend`.

**mind/make OS** - The operating system Krish runs his businesses on.
Architecture: `docs/MINDMAKE_OS_ARCHITECTURE.md` on GitHub `main`, the one
copy.

**mind.the.gap** - The publication's hero subchannel, due on Fridays. Notice
the pattern and say what it means is coming. Mandate in `venture_formats`.

**Mindmake** - The business and the mission, at mindmake.co. Two doors,
Build your AI brain and Build your AI GTM, lead into one privately scoped
paid proof. Canon: `github.com/krishanraja/mindmake`.

**Monitor (agent type)** - An agent whose job is continuous health or audit:
Vera, Arlo.

**MRR** - Monthly recurring revenue. Never used for Heartside, which sells
one-off orders.

---

## N

**n8n** - The workflow engine that hosts many agent jobs, on n8n Cloud.
The live list is the n8n API; mirrors live in `scripts/n8n/`.

**Nell** - The podcast guest booking and briefing agent.

**Nova** - The visibility and speaking agent.

**Nova's standard** - Ruling of 2026-10-05: a visibility target passes only
when three conditions are all true: the room (someone who can move a decision
is in it), standing (naming the platform later helps him) and only-him (the
angle rests on his own operating record). The score is the lowest of the
three, not the mean, and a refusal is written with its reason
(`api/_visibilityScore.ts`).

---

## O

**`openclaw-runs-to-cc.py`** - VPS script, every 15 minutes, that copies
finished OpenClaw cron runs into `workflow_runs` as `openclaw:<jobId>`, so
those runs show in OS > Org (2026-10-05).

**Operations (pod)** - Vera, Leo, Arlo. (Kai and Priya retired.)

**Orchestrator** - The central n8n webhook router that dispatches Control
Center events to the right agent workflow.

---

## P

**Pod** - Organisational grouping for agents: Executive, Operations, Growth.

**Portfolio ladder** - Krish's product ranking of 2026-10-05: 1 Heartside
and Full Time; 2 Legibility; 3 CTRL and Pulse; Circle dormant. The one code
source is `src/lib/portfolio.ts`. It ranks products against each other, not
the portfolio against the Mindmake mission (core section 0.3).

**Prepaid line** - The usage a plan price already covers
(`service_registry.included_usd`) and the point past it where the vendor
charges early (`overage_trigger_usd`).

**Priority and reporting block** - The block at the top of every active
agent brief and OpenClaw template since 2026-10-05, carrying the portfolio
ladder and the rule that agents report to Control Center.

**`product_icp`** - The one place a product's buyer is defined: one row per
`venture_registry.slug`, edited on Growth > Buyers, read through
`src/lib/icp.ts` and `api/icp.ts`. A product with no row is blocked, never
defaulted. On 2026-10-05 only `mindmake` was defined.

**Proposal** - A workflow improvement an agent suggests, in
`workflow_proposals`.

**Publication** - Mindmake's publication on Substack (makeyourmindup), slug
`publication`. Three subchannels. Its two founding members are the only live
revenue in the portfolio (2026-10-05).

**Pull-only** - The rule since 2026-09-06: the OS never contacts Krish. No
Telegram, no push. He reads Control Center when he chooses.

**Pulse** - Market intelligence for fractional executives at
pulse.fractionl.ai. Pulse Pro $99 a month or $948 a year, kept as the data
feed licence. Cannot take a payment yet: no button calls `startCheckout()`.
Priority 3.

---

## Q

**Quick Capture Idea** - The Cmd+I surface, available on every tab. Captures
an idea into the content pipeline.

---

## R

**Realtime** - Supabase `postgres_changes` subscriptions. One shared
channel per table, fanned out (ADR-002).

**Retired** - Gone for good unless Krish rules again. The only list is
section 0c of the core.

**RLS** - Row Level Security. On every table. Anon reads where a policy
allows; service role writes through `/api/*`.

---

## S

**Self-metering** - Recording an API's cost from the OS's own side of the
call, because the vendor will not report it to this account.

**Signal & Noise** - A podcast distribution channel only, not a venture
(since 2026-08-11). Nothing is commissioned for it.

**Silent Failure** - A row in `silent_failures`: a run that did not error
but produced nothing. The tell is a non-zero scanned count beside a zero
written count.

**Slug** - The lowercase identifier for an agent, stored as `agents.id`.

**Standards Registry** - `standards_registry`, the behavioural rules every
agent loads through the nightly standards digest. Count it live.

**Stripe organisation key** - One read-only key that reads all five Stripe
accounts in Krish's organisation (mind/make, Full Time, Legibility,
Heartside, Fractionl) when each request names the account. Used by
`api/_stripe.ts` and `api/revenue/sync.ts` since 2026-10-05.

**Subscriptions** - The drawer tab for money: tiles, the Substack line, the
ranked portfolio board and what to wire next.

**Substack plans** - The publication's paid plans, created and owned by
Substack and billed through the mind/make Stripe account. Filed under
`publication`, not CTRL (migration `20261005140000`). Never rename them.

**Surface moves** - `src/lib/surfaceMoves.ts`: the rules that pick each
surface's one move, shared by desk and phone and tested without a browser.

**Sync pipeline** - The VPS process that pushes task state into Supabase via
`POST /api/sync`.

---

## T

**Tab** - A top-level section of the UI. The registry is `src/lib/tabs.ts`:
Home, Content, People, Growth, OS, and in the drawer Focus, Board and
Subscriptions. Today, Leads, Bets, Plans and the OS Queue are retired.

**Task** - A unit of work in `tasks`.

---

## U

**under.the.hood** - The publication's subchannel due on Wednesdays. Take a
shipped thing apart and draw the build lesson.

**Unknown (health)** - The status used when a component cannot be checked.

**Unwired** - A metric nothing reads yet. It says what is missing, never
shows a zero (`src/lib/portfolio.ts`).

---

## V

**Venture** - A business project. Two tables carry ventures:
`venture_registry` (canonical, drives lanes and keys `product_icp`) and the
older `ventures`. Update both. Read `active` rather than assuming a row is
live; inactive rows are kept so history resolves.

**Venture formats** - `venture_formats`: each publication subchannel's
mandate, cadence and status. The only source of what a subchannel is for.

**Vera** - The quality and standards agent.

**Vercel** - Hosts the UI, the `/api/*` functions and this repo's crons.

**Visibility Target** - A row in `visibility_targets`: a speaking, press or
podcast opportunity, held to Nova's standard.

---

## W

**Workflow** - An automation owned by an agent, identified by `workflow_id`.

**`workflow_runs`** - Append-only log of every run, from n8n and (since
2026-10-05) OpenClaw.

---

## Z

**Zara** - The signal intelligence and market research agent.
