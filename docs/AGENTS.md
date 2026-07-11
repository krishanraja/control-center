# Agents

> **Scope.** Source of truth for the agent roster surfaced by Control
> Center, the taxonomy that classifies them, and the rules that govern how
> their identity flows through the system.
>
> **Not in this document.** The `agents` table schema lives in
> [`DATABASE.md`](./DATABASE.md). The N8N execution model and webhook
> chain live in [`DATA-PIPELINE.md`](./DATA-PIPELINE.md). System
> architecture (event loop, realtime, error boundaries) lives in
> [`ARCHITECTURE.md`](./ARCHITECTURE.md). UI surfaces consuming agent data
> are specified in [`PRODUCT.md`](./PRODUCT.md). The canonical fleet
> description (agent purpose, KPIs, cron cadence) lives in
> `MINDMAKER_OS_ARCHITECTURE.md` §2 on the VPS workspace root.

---

## Slug-as-Key {#slug-as-key}

The single most important rule in the codebase:

> **Every cross-table reference to an agent uses the lowercase slug stored
> in `agents.id`.**

| Table | Column | Value |
|---|---|---|
| `tasks` | `agent` | slug (e.g. `cleo`) |
| `tasks` | `owner` | slug, or `krish` |
| `audit_log` | `actor` | slug, `krish`, `system`, or `vps-pipeline` |
| `workflow_runs` | `agent_id` | slug (legacy `agent` for pre-2026-04-15 rows) |
| `leads` | `assignee_agent` | slug |
| `google_drive_sync` | `agent_id` | slug |

### Consequences

- **Writers must lowercase before insert.** `sync.ts`, `trigger-agent.ts`
  and `/api/agents/[name].ts` all normalise. New writers must do the same.
  Mixed-case writes are a bug even if they "look fine" because they
  fragment join results.
- **Readers expand tolerantly.** When a single user-visible token (e.g.
  selecting "Cleo" in the UI) might match `cleo` (slug) or `Cleo` (display
  name in legacy rows), the reader expands to the set of variants and
  queries with `.in()`. See `DesktopOrg.tsx` for the canonical pattern.
- **Display name is *only* for display.** `agents.name` is for human eyes,
  never for joins.

---

## Pod Hierarchy

Pods are an organisational concept, not a database constraint. They drive
visual grouping and section ordering on the Org tab.

| Pod | Slug | Purpose | Accent |
|---|---|---|---|
| Executive | `executive` | Sets direction. Owns cross-venture decisions. | Purple |
| Operations | `ops` | Runs the machine. Quality, infrastructure, product, revenue ops. | Blue |
| Growth | `growth` | Revenue motion, pipeline, visibility, content. | Emerald |

**Render order is fixed**: Executive → Operations → Growth → any
unrecognised pod. This is enforced in `DesktopOrg.POD_ORDER` and is a
product decision (the CEO scans top-down, and Executive blockers always
trump Growth experiments).

---

## Agent Taxonomy

### By execution role

| Type | Behaviour | Example |
|---|---|---|
| **Coordinator** | Plans, delegates, reviews. Does not execute N8N workflows directly. | Agatha (COO), Cleo (Content) |
| **Executor** | Runs scheduled N8N workflows; produces artefacts. | Maya (Marketing/SEO), Marcus (Synthesis) |
| **Monitor** | Continuous health/audit; rarely surfaces unless something is wrong. | Vera (Audit/Standards), Arlo (Infra), Kai (Integrations) |

A coordinator with zero `workflow_runs` is **expected behaviour**, not a
data-pipeline failure. A coordinator with stale `audit_log` activity *is*
a problem — they should still be logging coordination events.

### By cadence

`agents.expected_runs_per_day` defines the freshness ladder used by
`api/health.ts`:

| Ratio | Health |
|---|---|
| `last_run` within 1 expected interval | healthy |
| `last_run` within 2 expected intervals | degraded |
| `last_run` older than 2 expected intervals, or null | stale (failed) |

Coordinators have `expected_runs_per_day = null` and are exempt from this
check.

---

## Roster

The canonical fleet is 14 tracked production agents, 12 active (Felix and
Hunter retired 2026-07-10, `active = false`; rows kept for history).
Supabase `agents` (where `active = true`) is authoritative; the roster
below mirrors that list and is the definitive product reference. The same list is hard-coded as a
fallback in `api/agents/[name].ts:available_agents` — **the table and the
fallback list must agree.**

### Executive

| Slug | Display | Role |
|---|---|---|
| `agatha` | Agatha | Chief Operating Officer |
| `marcus` | Marcus | Business Development Intelligence / Synthesis |

### Operations

| Slug | Display | Role |
|---|---|---|
| `vera` | Vera | Chief of Staff & Quality |
| `leo` | Leo | Chief Revenue Officer |
| `priya` | Priya | Product Strategy |
| `arlo` | Arlo | Technical Operations & Infrastructure |
| `kai` | Kai | Technical Architecture / Integrations |

### Growth

| Slug | Display | Role |
|---|---|---|
| `cleo` | Cleo | Content Production & Voice (Coordinator) |
| `felix` | Felix | Enterprise Sales Pipeline. RETIRED 2026-07-10 (advisory sales dropped; `active = false`, Opportunity Pipeline Tracker unpublished) |
| `maya` | Maya | Customer Acquisition (Marketing / SEO) |
| `nell` | Nell | Outbound + Podcast Guest Booking |
| `nova` | Nova | Visibility & Speaking |
| `zara` | Zara | Signal Intelligence & Market Research |
| `hunter` | Hunter | Job Sourcing & Application Specialist. RETIRED 2026-07-10 (job search complete: Amperity CoS; `active = false`, Job Sweep unpublished) |

> **Source of truth.** The Supabase `agents` table is authoritative. The
> roster above must match `api/agents/[name].ts:available_agents`. If the
> table grows or shrinks, update both in the same commit.

**Personal-life agents** (Lozatron, Aria, Finno, Devi) live only in
OpenClaw config on the VPS, outside the Mindmaker business. They are not
in the `agents` table and never appear in Control Center.

---

## Briefs

Each agent has a long-form brief that defines voice, mandate, and
operating envelope. Briefs are authored either by Krish or by Agatha and
stored in Supabase as `agents.brief_content`. They are rendered to
`~/.openclaw/skills/agent-{id}/SKILL.md` on the VPS by
`render-identity.py` (every 15 min). **Edit in the DB, not the rendered
files** — the renderer overwrites the file on every tick.

| Field on `agents` | Source of truth | Purpose |
|---|---|---|
| `personality` | Brief intro paragraph | Voice + tone shown in the Org drawer |
| `mission` | Brief mission section | One-paragraph north star |
| `mandate` | Brief mandate section | Operating charter |
| `brief_content` | Full brief text | Excerpted in the Org drawer; full text via the linked Doc |
| `brief_updated_at` | Last write | Used to detect drift |
| `brief_checksum` | Content hash | Used to detect drift |

Drive sync is owned by `google_drive_sync` (joined on `agent_id`). When a
brief edit lands in Supabase, the sync writes content to Drive and bumps
the timestamp; the Org drawer shows the updated brief on next mount.

The Org tab's inline brief editor writes to `/api/sync-brief` which then
PATCHes `agents.brief_content`. The render pipeline runs independently
and will pick up the edit on its next 15-minute tick.

---

## Lifecycle

### Activation
- New agents are inserted into `agents` with `active = true`.
- The slug must be chosen at insert time and never renamed (it is a join
  key — see [Slug-as-Key](#slug-as-key)).
- Add the slug to `api/agents/[name].ts:available_agents`.
- Add an entry to the [Roster](#roster) table in this file.
- Add the rendered SKILL.md output path to the VPS cron's render list.

### Deactivation
- Set `active = false`. Do not delete — historic `tasks`, `audit_log`,
  `workflow_runs`, and `leads.assignee_agent` rows are still meaningful.
- The Org tab filters on `active = true` so deactivated agents disappear
  from the list, but their history remains queryable from Intel and
  Flows.

### Renaming
- `name` may change freely (display only).
- `id` (slug) **must not change**. If renaming the slug is unavoidable,
  run a migration that updates every join column atomically and bumps
  the legacy-column note in
  [`DATABASE.md`](./DATABASE.md#workflow_runs).

---

## Manual Triggering

The Org tab exposes a ▶︎ button on agent cards (visible on hover) for
agents with `expected_runs_per_day != null`.

| Step | Behaviour |
|---|---|
| 1 | UI sends `POST /api/trigger-agent { agent: <slug-or-name> }` |
| 2 | Server lowercases and trims the agent token |
| 3 | Server inserts a row into `tasks` with `agent: <slug>`, `status: 'active'`, `source: 'manual'` |
| 4 | Supabase webhook (pg_net) fires; N8N picks up and runs the workflow |
| 5 | Workflow logs into `workflow_runs` keyed by `agent_id = <slug>` |
| 6 | UI receives the realtime update; Org drawer's N8N Runs section refreshes |

If step 3 succeeds but step 5 never happens, the failure is in the
agent's N8N workflow, not in Control Center.

---

## Flagging and Escalation

Krish can flag an agent from:
- The Org drawer (`Flag` button).
- Any inline action in Today / Plans (`Flag` verb).

Flags persist in the flag store and are surfaced on the next session
start via `PendingFlagModal`. The intent is *unmissable accountability* —
a flag should never be silently dismissed; it is either acknowledged
with notes or resolved with a corrective action.

---

## Data Quality Invariants

The following must hold at all times. If any is violated, file an issue.

1. Every `agents.id` is lowercase, alphanumeric, no spaces.
2. Every `tasks.agent` value either equals an `agents.id` or is null.
3. Every `tasks.owner` value equals an `agents.id`, `krish`, or null.
4. Every `audit_log.actor` value equals an `agents.id`, `krish`,
   `system`, or `vps-pipeline`.
5. Every `workflow_runs.agent_id` value equals an `agents.id` (legacy
   `agent` column may carry historical mixed-case values; new writes must
   not).
6. Every `leads.assignee_agent` value equals an `agents.id` or is null.
7. The Roster table in this document, `api/agents/[name].ts:available_agents`,
   and `SELECT id FROM agents WHERE active` must all agree.

A periodic audit (Vera is the natural owner) verifies these and writes a
single `audit_log` row per check, healthy or otherwise.
