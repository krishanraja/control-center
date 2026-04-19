# Agents

> **Scope.** This document is the source of truth for the agent roster, the
> taxonomy that classifies them, and the rules that govern how their identity
> flows through the system.
>
> **Not in this document.** The `agents` table schema lives in
> [`DATABASE.md`](./DATABASE.md). The N8N execution model and webhook chain
> live in [`DATA-PIPELINE.md`](./DATA-PIPELINE.md). System architecture
> (event loop, realtime, error boundaries) lives in
> [`ARCHITECTURE.md`](./ARCHITECTURE.md). UI surfaces consuming agent data
> are specified in [`PRODUCT.md`](./PRODUCT.md). This file references those
> rather than restating them.

---

## Slug-as-Key {#slug-as-key}

The single most important rule in the codebase:

> **Every cross-table reference to an agent uses the lowercase slug stored in `agents.id`.**

| Table | Column | Value |
|---|---|---|
| `tasks` | `agent` | slug (e.g. `cleo`) |
| `tasks` | `owner` | slug, or `krish` |
| `audit_log` | `actor` | slug, `krish`, `system`, or `vps-pipeline` |
| `workflow_runs` | `agent_id` | slug (legacy `agent` for pre-2026-04-15 rows) |
| `google_drive_sync` | `agent_id` | slug |

### Consequences

- **Writers must lowercase before insert.** `sync.ts` and `trigger-agent.ts`
  both normalise. New writers must do the same. Mixed-case writes are a bug
  even if they "look fine" because they fragment join results.
- **Readers should expand tolerantly.** When a single user-visible token
  (e.g. selecting "Cleo" in the UI) might match either `cleo` (slug) or
  `Cleo` (display name in legacy rows), the reader expands to the set of
  variants and queries with `.in()`. See `DesktopOrg.tsx` for the canonical
  pattern.
- **Display name is *only* for display.** `agents.name` is for human eyes,
  never for joins.

---

## Pod Hierarchy

Pods are an organisational concept, not a database constraint. They drive
visual grouping and section ordering on the Org tab.

| Pod | Slug | Purpose | Accent |
|---|---|---|---|
| Executive | `executive` | Sets direction. Owns cross-venture decisions. | Purple |
| Operations | `ops` | Runs the machine. Quality, infrastructure, product. | Blue |
| Growth | `growth` | Revenue, pipeline, visibility. | Emerald |

**Render order is fixed**: Executive → Operations → Growth → any
unrecognised pod. This is enforced in `DesktopOrg.POD_ORDER` and is a
product decision (the CEO scans top-down, and Executive blockers always
trump Growth experiments).

---

## Agent Taxonomy

### By execution role

| Type | Behaviour | Example |
|---|---|---|
| **Coordinator** | Plans, delegates, reviews. Does not execute N8N workflows directly. | Cleo (Content Production) |
| **Executor** | Runs scheduled N8N workflows; produces artefacts. | Felix (Enterprise BD), Maya (Marketing/SEO) |
| **Monitor** | Continuous health/audit; rarely surfaces unless something is wrong. | Vera (Audit/Standards), Arlo (Infra) |

A coordinator with zero `workflow_runs` is **expected behaviour**, not a data
pipeline failure. A coordinator with stale `audit_log` activity *is* a
problem — they should still be logging coordination events.

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

The canonical list (14 agents) is enforced by `api/agents/[name].ts`. The
table below mirrors that list and is the definitive product reference.

### Executive

| Slug | Display | Role |
|---|---|---|
| `agatha` | Agatha | Chief Operating Officer |
| `marcus` | Marcus | Business Development |

### Operations

| Slug | Display | Role |
|---|---|---|
| `leo` | Leo | Chief Revenue Officer |
| `kai` | Kai | Technical Architecture |
| `arlo` | Arlo | Technical Operations & Infrastructure |
| `vera` | Vera | Chief of Staff & Quality |
| `priya` | Priya | Product Strategy |
| `marty` | Marty | Operations |

### Growth

| Slug | Display | Role |
|---|---|---|
| `cleo` | Cleo | Content Production & Voice (Coordinator) |
| `felix` | Felix | Enterprise Business Development |
| `maya` | Maya | Marketing & SEO |
| `nell` | Nell | Growth |
| `nova` | Nova | Visibility & Podcasts |
| `zara` | Zara | BD Signals |

> **Source of truth.** The Supabase `agents` table is authoritative. The
> roster above must match `api/agents/[name].ts:available_agents`. If the
> table grows or shrinks, update both in the same commit.

---

## Briefs

Each agent has a long-form brief that defines their voice, mandate, and
operating envelope. Briefs are authored in Google Docs and synced into
Supabase.

| Field on `agents` | Source of truth | Purpose |
|---|---|---|
| `personality` | Brief intro paragraph | Voice + tone shown in the Org drawer |
| `mission` | Brief mission section | One-paragraph north star |
| `mandate` | Brief mandate section | Operating charter |
| `brief_content` | Full brief text | Excerpted in the Org drawer; full text via the linked Doc |
| `brief_updated_at` | Drive sync timestamp | Used to detect drift |
| `brief_checksum` | Drive sync hash | Used to detect drift |

Drive sync is owned by `google_drive_sync` (joined on `agent_id`). When a
doc edit is detected, the sync writes new content + bumps the timestamp;
the Org drawer then shows the updated brief on next mount.

---

## Lifecycle

### Activation
- New agents are inserted into the `agents` table with `active = true`.
- The slug must be chosen at insert time and never renamed (it is a join
  key — see [Slug-as-Key](#slug-as-key)).
- Add the slug to `api/agents/[name].ts:available_agents`.
- Add an entry to the [Roster](#roster) table in this file.

### Deactivation
- Set `active = false`. Do not delete — historic `tasks`, `audit_log`, and
  `workflow_runs` rows are still meaningful.
- The Org tab filters on `active = true` so deactivated agents disappear
  from the list, but their history remains queryable from Intel and Flows.

### Renaming
- `name` may change freely (display only).
- `id` (slug) **must not change**. If renaming the slug is unavoidable, run
  a migration that updates every join column atomically and bumps the
  legacy-column note in [`DATABASE.md`](./DATABASE.md#workflow_runs).

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

The CEO can flag an agent from:
- The Org drawer (`Flag` button).
- Any inline action in Today / Plans (`Flag` verb).

Flags persist in the flag store and are surfaced on the next session start
via `PendingFlagModal`. The intent is *unmissable accountability* — a flag
should never be silently dismissed; it is either acknowledged with notes
or resolved with a corrective action.

---

## Data Quality Invariants

The following must hold at all times. If any is violated, file an issue.

1. Every `agents.id` is lowercase, alphanumeric, no spaces.
2. Every `tasks.agent` value either equals an `agents.id` or is null.
3. Every `audit_log.actor` value equals an `agents.id`, `krish`, `system`, or `vps-pipeline`.
4. Every `workflow_runs.agent_id` value equals an `agents.id` (legacy `agent` column may carry historical mixed-case values; new writes must not).
5. The Roster table in this document, `api/agents/[name].ts:available_agents`, and `SELECT id FROM agents WHERE active` must all agree.

A periodic audit (Vera is the natural owner) should verify these and write
a single `audit_log` row per check, healthy or otherwise.
