# Glossary

> **Scope.** Single source of truth for terms used across the codebase, the
> UI, and the documentation. Where a term is defined in detail in another
> doc, that doc is linked — the entry here is the short form.

---

## A

**ADR** — Architecture Decision Record. A short markdown file in
[`docs/DECISIONS/`](./DECISIONS/) capturing one architectural choice and
the trade-offs considered. Numbered sequentially.

**Agent** — A non-human actor in the organisation. Has a slug, display
name, pod, and brief. May be a Coordinator, Executor, or Monitor (see
[`AGENTS.md`](./AGENTS.md#agent-taxonomy)).

**`agent_id`** — The owning-agent column on `workflow_runs`. Stores the
lowercase slug. Renamed from `agent` on 2026-04-15.

**`agents.id`** — Primary key of the `agents` table. The lowercase slug
(e.g. `cleo`). The canonical join key for every cross-table agent
reference. See [Slug-as-Key](./AGENTS.md#slug-as-key).

**Audit log** — The `audit_log` table. Append-only stream of every
significant event in the system. Drives Live Activity and the Intelligence
Feed.

---

## B

**Brief** — Long-form Google Doc defining an agent's voice, mission, and
mandate. Synced into Supabase as `agents.brief_content` plus structured
`personality`, `mission`, `mandate` fields.

**Blocker** — A task with `status = 'blocked'` whose progress depends on
an external action. Blockers age and are surfaced on Home / Today.

---

## C

**Coordinator** — An agent that plans and reviews but does not execute
N8N workflows directly. Has `expected_runs_per_day = null`. A coordinator
with no `workflow_runs` is expected, not broken.

**Control Center** — This product. The CEO-facing dashboard for the
multi-venture autonomous organisation.

---

## D

**Drive sync** — The background job that pulls agent briefs from Google
Drive into Supabase. Logged via `audit_log` `event_type = 'drive_sync_run'`.

---

## E

**Executor** — An agent that runs scheduled N8N workflows and produces
artefacts. Has `expected_runs_per_day != null` and contributes to the
agent-freshness health check.

**Event-driven** — The platform's overall pattern. State changes write to
Supabase, Supabase fires webhooks, agents react, agents write back. See
[`ARCHITECTURE.md`](./ARCHITECTURE.md#core-principles).

---

## F

**Flag** — A CEO-initiated note against an agent indicating something
needs attention. Surfaced via `PendingFlagModal` on next session start.
Cannot be silently dismissed.

**Flow** — Synonym for an N8N workflow. The Flows tab lists them grouped
by `workflow_id`.

---

## G

**Goal** — A row in the `goals` table representing a measurable target
for a period (weekly / monthly / quarterly). Surfaced on Home with a
progress bar.

**Growth (pod)** — One of the three primary pods. Owns revenue,
pipeline, and visibility. Members include Felix, Maya, Cleo, Nova, Zara,
Nell.

---

## H

**Home Intelligence** — The singleton row in `home_intelligence` keyed by
`id = 'current'`. Contains the Revenue Pulse summary and the KPI metrics
strip. Refreshed by a coordinating agent (typically Agatha or Vera).

---

## I

**Intel (tab)** — User-facing name for the strategic-metrics tab.
Implemented as `DesktopExec.tsx` and routed under the `exec` tab id.

**Intelligence feed** — The chronological stream of `audit_log` rows
shown on the Intel tab. Same source as Live Activity, different framing.

---

## K

**KPI strip** — The four-tile metric row at the top of Home. Sourced
from `home_intelligence.metrics`. Collapses entirely when empty (no
placeholder tiles).

**Krish** — The CEO. The only intended user. Audit-log actor for every
manual action.

---

## L

**Live Activity** — The realtime activity feed on Home. Subscribes to
`audit_log` INSERTs.

---

## M

**Mandate** — The operating charter section of an agent's brief. Defines
what the agent is allowed and required to do.

**MindMaker OS** — The broader autonomous-organisation platform.
Control Center is the human interface layer of MindMaker OS v3.

**Mission** — The one-paragraph north star of an agent's brief.

**Monitor (agent type)** — An agent whose job is continuous health or
audit. Examples: Vera, Arlo. Monitors should rarely surface unless
something is wrong.

---

## N

**N8N** — The workflow orchestration engine that hosts agent automations.
Reachable via webhooks fired from Supabase.

**Needs You** — The Home centre column. Counts and lists tasks with
`status in ('waiting', 'blocked')`. Ranked by priority → manual override
→ due date → updated_at.

---

## O

**Operations (pod)** — One of the three primary pods. Runs the machine —
infrastructure, quality, product. Members include Leo, Kai, Arlo, Vera,
Priya, Marty.

---

## P

**Pod** — Organisational grouping for agents. Three primary pods:
Executive, Operations, Growth. Render order is fixed top-to-bottom on the
Org tab.

**Priority** — Task urgency tier. Recognised values: `critical`,
`urgent`, `high`, `medium`, `normal`, `low`. Drives the Needs You ranking.

**`priority_override`** — Integer column on `tasks` for manual CEO
boosting. Higher values rank earlier within the same priority tier.

**Proposal** — A workflow improvement suggested by an agent. Lives in
`workflow_proposals`. Awaits CEO approve / reject on the Flows tab.

---

## R

**Realtime** — Supabase `postgres_changes` subscriptions. The UI joins
the `tasks-rt-shared` channel once per browser session and fans updates
out to every consumer. See ADR-002.

**Revenue Pulse** — The headline + body + recommended-focus block on
Home. Sourced from `home_intelligence.summary`. Stored as JSON-encoded
text and parsed defensively.

**RLS** — Row Level Security. Postgres-level access control. Not yet
enabled in this project; planned per ADR-006.

---

## S

**Slug** — The lowercase, alphanumeric identifier for an agent. Stored
as `agents.id`. The single canonical token used to join across tables.
See [Slug-as-Key](./AGENTS.md#slug-as-key).

**SLI** — Service Level Indicator. A measurable signal of system
behaviour. Listed in [`OBSERVABILITY.md`](./OBSERVABILITY.md#slis-and-slos).

**Split pane** — Master-detail layout primitive used by Today, Plans,
and Org. See [`COMPONENTS.md`](./COMPONENTS.md).

**Sync pipeline** — The VPS-hosted process that pushes a snapshot of
external task state into Supabase via `POST /api/sync`. Authenticated
with `SYNC_SECRET`.

**System (actor)** — The `audit_log.actor` value used for unattended
jobs that are not attributable to an individual agent. Example: drive
sync runs.

**Systems (tab)** — The infrastructure-health tab. Renders from
`system_health` and the live `/api/health` snapshot.

---

## T

**Tab** — A top-level section of the UI: Home, Today, Plans, Org, Intel,
Flows, Systems. Routed via `App.tsx` tab state.

**Task** — A unit of work. The primary row in the `tasks` table. Lives
through statuses `active → in_progress → waiting → blocked → done`.

**Today** — The "what needs you before EOD" tab. Splits into Due and
Waiting on You.

**Token** — In the slug-expansion sense: any of the candidate strings
(`id`, `name`, lowercased variants) the UI uses when querying with
`.in()` to tolerate legacy data.

---

## U

**Unknown (health)** — The fourth status value used when a component
cannot be checked. Excluded from the worst-component overall rollup.

---

## V

**Venture** — A business project. Tasks are tagged with `venture_id` so
work can be sliced by venture.

**Verify (CI job)** — The single CI job (`.github/workflows/ci.yml`).
Runs `npm ci`, `npm run lint`, `npx tsc --noEmit`.

**Vercel** — The hosting platform. Provides the Vite-built static UI and
the `/api/*` serverless functions.

---

## W

**Webhook (pg_net)** — Supabase's outbound HTTP mechanism. Fires N8N
workflows in response to row changes.

**Workflow** — An N8N automation owned by an agent. Identified by
`workflow_id`; many runs per workflow over time.

**`workflow_runs`** — Append-only log of every N8N execution. Joined to
agents via `agent_id` (legacy `agent` for pre-2026-04-15 rows).
