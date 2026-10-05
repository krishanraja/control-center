# Agents

> **Scope.** The agent roster surfaced by Control Center, the taxonomy that
> classifies the agents, and the rules that govern how their identity flows
> through the system.
>
> **Not in this document.** The `agents` table schema lives in
> [`DATABASE.md`](./DATABASE.md). The n8n execution model and webhook chain
> live in [`DATA-PIPELINE.md`](./DATA-PIPELINE.md). The engineering contract
> lives in [`ARCHITECTURE.md`](./ARCHITECTURE.md). The tabs that show agent
> data are specified in [`PRODUCT.md`](./PRODUCT.md). What each agent is for
> in the OS as a whole is section 3 of
> [`MINDMAKE_OS_ARCHITECTURE.md`](./MINDMAKE_OS_ARCHITECTURE.md) on GitHub
> `main`, with deep detail in
> [`architecture/03-agent-fleet.md`](./architecture/03-agent-fleet.md). Where
> this file and that core disagree, the core wins.
>
> Last checked 2026-10-05 against the live `agents` table and
> `api/agents/[name].ts`.

---

## The rules every agent works under

These come from section 0a of the architecture core. Each holds for every
agent below.

- **Agents report to Control Center, never into Drive (Krish, 2026-10-05).**
  An agent writes its runs, status and output to tables Control Center reads
  (`workflow_runs`, `tasks`, `agents.last_run` and `last_output`, and the
  output tables it owns). No agent creates or edits a Google Doc in Krish's
  Drive. OpenClaw runs reach `workflow_runs` through `openclaw-runs-to-cc.py`
  on the VPS (every 15 minutes, `workflow_id = 'openclaw:<jobId>'`).
- **Pull-only (2026-09-06).** No agent contacts Krish. No Telegram, no push.
  He reads Control Center when he chooses.
- **Draft for approval.** Agents draft; Krish sends or publishes. Control
  Center never sends (CI guard `check-bridges-never-send`).
- **The priority and reporting block (2026-10-05).** Every active
  `agents.brief_content` and every live OpenClaw template opens with the same
  block: 1. Heartside and Full Time. 2. Legibility. 3. CTRL and Pulse.
  Mindmake and its publication run alongside. Circle is dormant: preserved,
  never purged, not worked. The one code source of the ranking is
  `src/lib/portfolio.ts`.
- **No retired or dormant work.** Section 0c of the core is the only list of
  retired things.

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

`google_drive_sync.agent_id` also used the slug. That table's rows were all
deleted on 2026-10-05 when the per-agent Drive mirrors were retired; nothing
reads it now.

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
visual grouping and section ordering on OS > Org.

| Pod | Slug | Purpose | Accent |
|---|---|---|---|
| Executive | `executive` | Sets direction. Owns cross-venture decisions. | Purple |
| Operations | `ops` | Runs the machine. Quality, infrastructure, revenue reporting. | Blue |
| Growth | `growth` | Content, acquisition, visibility, guests, signals, jobs. | Emerald |

**Render order is fixed**: Executive, then Operations, then Growth, then any
unrecognised pod. This is enforced in `DesktopOrg.POD_ORDER` and is a
product decision (the CEO scans top-down, and Executive blockers always
trump Growth experiments).

---

## Agent Taxonomy

### By execution role

| Type | Behaviour | Example |
|---|---|---|
| **Coordinator** | Plans, delegates, reviews. Does not execute n8n workflows directly. | Agatha (COO), Cleo (Content) |
| **Executor** | Runs scheduled jobs; produces artefacts. | Maya (Acquisition), Marcus (Synthesis) |
| **Monitor** | Continuous health and audit; rarely surfaces unless something is wrong. | Vera (Quality), Arlo (Infrastructure) |

A coordinator with zero `workflow_runs` is **expected behaviour**, not a
data-pipeline failure. A coordinator with stale `audit_log` activity *is*
a problem: it should still be logging coordination events.

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

Read live from Supabase `agents` on 2026-10-05: **14 tracked, 11 active**.
Three are retired with `active = false` and their rows kept for history:
Felix (2026-07-10), Kai (2026-09-07) and Priya (2026-09-14). The `agents`
table is the only source of truth; the tables below mirror it. Since PR #386
(2026-10-05), `api/agents/[name].ts` reads its 404 roster live from the table
instead of a hardcoded list, so a new or retired agent needs no code change
there.

### Executive

| Slug | Display | What it does now |
|---|---|---|
| `agatha` | Agatha | Chief operating officer: the strategic chat, the weekly plan refresh, decomposing objectives |
| `marcus` | Marcus | Synthesis: the daily brief and `home_intelligence`, the Friday retro, the Monday pre-mortem |

### Operations

| Slug | Display | What it does now |
|---|---|---|
| `vera` | Vera | Quality and standards: audits, feedback aggregation into `corrections`, the gap-closure loop, skill induction from wins |
| `leo` | Leo | Revenue reporting, weekly |
| `arlo` | Arlo | Mechanical liveness of the VPS and the build. Diagnoses a failed Vercel build and writes the cause and the fix it would make into `workflow_runs`; it changes nothing. **Arlo cannot push to `main`** (2026-10-05): the VPS clone's push URL is anonymous, so a fetch works and a push fails |
| `priya` | Priya | RETIRED 2026-09-14. Product health is covered by `/api/health/fleet-reconcile` and the Vercel deploy checks |
| `kai` | Kai | RETIRED 2026-09-07. Superseded by `/api/health/fleet-reconcile` and `/api/health/connections-sweep` |

### Growth

| Slug | Display | What it does now |
|---|---|---|
| `cleo` | Cleo | Content production and voice (coordinator). Its last two n8n workflows, `Draft Post on Demand` and `LinkedIn Distribution`, were retired on 2026-10-05; drafting lives in the Content tab and the content engine, and publishing to LinkedIn is manual |
| `maya` | Maya | Customer acquisition and SEO. Its B2B prospecting reads who a product is for from `product_icp` only; a product with no row there is blocked with the reason shown, never prospected against another product's buyer. On 2026-10-05 only `mindmake` had a row |
| `nell` | Nell | Podcast guest booking and briefings. The guest briefing lands in `guests.briefing_md` and opens in Control Center (2026-10-05); older guests keep their old Doc link, labelled as such |
| `nova` | Nova | Visibility and speaking, held to Nova's standard (2026-10-05): the room, standing and only-him must all be true; the score is the lowest of the three; every refusal is written with its reason (`api/_visibilityScore.ts`) |
| `zara` | Zara | Signal intelligence and market research |
| `hunter` | Hunter | Job sourcing, packages and warm intros; the Hunt lane on People. **Kept** (un-parked 2026-09-07, confirmed 2026-10-05). Runs from GitHub Actions and the `/api/hunter/tick` Vercel cron, not from n8n or OpenClaw, and reports into Control Center. Setting `active = false` is Krish's call alone |
| `felix` | Felix | RETIRED 2026-07-10 |

**Personal-life agents.** Four personal-life agents live only in the
OpenClaw config on the VPS, outside the Mindmake business. They are not in
the `agents` table and never appear in Control Center.

---

## Briefs

Each agent has a long-form brief that defines voice, mandate and operating
envelope. **`agents.brief_content` in Supabase is the only canonical brief
surface.** It is rendered to `~/.openclaw/skills/agent-{id}/SKILL.md` on the
VPS by `render-identity.py` (every 15 minutes). Edit in the database, never in
the rendered files: the renderer overwrites them.

**Never run `sync-briefs-to-skills.sh`.** It copied per-agent Google Docs into
SKILL.md and then into Supabase. Those Google Doc sources were retired with the
Drive mirrors on 2026-10-05, so a run would gut every brief.

| Field on `agents` | Source of truth | Purpose |
|---|---|---|
| `personality` | Brief intro paragraph | Voice and tone shown in the Org drawer |
| `mission` | Brief mission section | One-paragraph north star |
| `mandate` | Brief mandate section | Operating charter |
| `brief_content` | Full brief text | Excerpted in the Org drawer |
| `brief_updated_at` | Last write | Used to detect drift |
| `brief_checksum` | Content hash | Used to detect drift |

The Org tab's inline brief editor writes to `/api/sync-brief`, which PATCHes
`agents.brief_content`. The render runs independently and picks up the edit
on its next 15-minute tick. The per-agent Identity and Action Google Doc
mirrors (`sync-to-drive.py`, `google_drive_sync`) are retired (2026-10-05);
there is no Drive copy of a brief.

---

## Lifecycle

### Activation
- New agents are inserted into `agents` with `active = true`.
- The slug must be chosen at insert time and never renamed (it is a join
  key; see [Slug-as-Key](#slug-as-key)).
- Add an entry to the [Roster](#roster) table in this file.
- Add the priority and reporting block to the top of its brief.
- Add the rendered SKILL.md output path to the VPS render list.

### Deactivation
- Set `active = false`. Do not delete: historic `tasks`, `audit_log`,
  `workflow_runs` and `leads.assignee_agent` rows are still meaningful.
- OS > Org filters on `active = true`, so deactivated agents disappear
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

OS > Org exposes a run button on agent cards (visible on hover) for agents
with `expected_runs_per_day != null`.

| Step | Behaviour |
|---|---|
| 1 | UI sends `POST /api/trigger-agent { agent: <slug-or-name> }` |
| 2 | Server lowercases and trims the agent token |
| 3 | Server inserts a row into `tasks` with `agent: <slug>`, `status: 'active'`, `source: 'manual'` |
| 4 | Supabase webhook (pg_net) fires; n8n picks up and runs the workflow |
| 5 | Workflow logs into `workflow_runs` keyed by `agent_id = <slug>` |
| 6 | UI receives the realtime update; the Org drawer's runs section refreshes |

If step 3 succeeds but step 5 never happens, the failure is in the
agent's n8n workflow, not in Control Center.

---

## Rulings and corrections

The OS Queue was removed on 2026-10-04. A ruling that waits on Krish is
answered in the tab that owns it; agent rulings and Vera's corrections lead
OS > Org's one move (`src/lib/surfaceMoves.ts`), answered in place with
Approve or Reject.

---

## Data Quality Invariants

The following must hold at all times. If any is violated, record it where
Control Center shows it (a task or an `audit_log` row).

1. Every `agents.id` is lowercase, alphanumeric, no spaces.
2. Every `tasks.agent` value either equals an `agents.id` or is null.
3. Every `tasks.owner` value equals an `agents.id`, `krish`, or null.
4. Every `audit_log.actor` value equals an `agents.id`, `krish`,
   `system`, or `vps-pipeline`.
5. Every `workflow_runs.agent_id` value equals an `agents.id` (legacy
   `agent` column may carry historical mixed-case values; new writes must
   not). OpenClaw runs carry the owning agent's slug.
6. Every `leads.assignee_agent` value equals an `agents.id` or is null.
7. The Roster table in this document and `SELECT id FROM agents WHERE active`
   agree. (`api/agents/[name].ts` reads the table live, so it cannot drift.)

A periodic audit (Vera is the natural owner) verifies these and writes a
single `audit_log` row per check, healthy or otherwise.
