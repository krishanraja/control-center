# Product Specification

> **Scope.** This document defines *what each surface of Control Center is for, what data it reads/writes, and how it must behave.* It is the contract between the product intent and the implementation.
>
> **Not in this document.** System-level concerns — file structure, the read/write data flow, responsive breakpoint mechanics, error-boundary plumbing, and shared-channel performance — live in [`ARCHITECTURE.md`](./ARCHITECTURE.md). Schema details live in [`DATABASE.md`](./DATABASE.md). Both are authoritative; this document references them rather than restating them.

---

## Audience and Intent

| Field | Value |
|---|---|
| Primary user | Krish (CEO, single operator) |
| Secondary user | Future operations staff with read-only oversight |
| Never the user | Agents — they read briefs, not this UI |
| Operating mode | Glanceable status + decisive action. No exploration UI, no analytics-style dashboards. |
| Decision velocity | Every tab must answer its core question in < 3 seconds of looking. |

If a feature does not change a CEO decision within minutes, it does not belong in Control Center.

---

## Cross-Tab Behaviour Contracts

These rules apply to every tab and override per-tab styling decisions when in conflict.

| Rule | Description |
|---|---|
| **Viewport fit** | At ≥ 1280×800 every primary tab must fit the viewport without page scroll. Sub-panels scroll internally. |
| **Realtime first** | Any value derived from `tasks`, `audit_log`, or `workflow_runs` must update without a page reload. New rows appear within one realtime tick. |
| **Slug-as-key** | Joins between agents and any other table use the lowercase slug (`agents.id`, e.g. `cleo`). Mixed-case writes are a bug. See [`AGENTS.md#slug-as-key`](./AGENTS.md#slug-as-key). |
| **Empty ≠ broken** | Every empty state must distinguish "nothing happened yet" from "failed to load." Empty states use a calm phrase, not a loading spinner. |
| **Action provenance** | Every CEO action (approve, reject, flag, trigger) writes a row to `audit_log` with `actor: 'krish'` and a meaningful `event_type`. |
| **No silent dropdown of legacy data** | Schema migrations must read both old and new columns until the legacy columns are dropped. Owner: whoever ran the migration. |
| **Prominence ladder** | Within a tab, visual weight must follow: blocking actions → KPIs → context → history. Never invert. |
| **Mobile parity** | Below 900px every tab must surface the same primary information; only secondary panels collapse. |

---

## Tab: Home

### Purpose
> *In three seconds, tell me whether revenue is on track and what's blocking it.*

### Above-the-fold information ladder
1. **KPI strip** — Monthly revenue, Outreach pipeline, Visibility, Content engine. Most prominent.
2. **Needs You** — count + ranked list of the top 6 waiting items.
3. **Revenue Pulse** — current intel headline + recommended focus.
4. **Live Activity** — chronological agent activity for context.
5. **Weekly Goals** — progress bars for the active period.

### Inputs
| Element | Table / source | Filter |
|---|---|---|
| KPI strip | `home_intelligence.metrics` | `id = 'current'` |
| Revenue Pulse headline | `home_intelligence.summary` | `id = 'current'` (parsed JSON) |
| Needs You count + list | `tasks` via shared realtime channel | `status in ('waiting','blocked')` |
| Live Activity | `audit_log` | latest 30, realtime INSERT subscription |
| Weekly Goals | `goals` | latest 6 by `updated_at`, current period |

### Writes
None. Home is read-only.

### Behaviour rules
- **Needs You ranking**: priority (`critical|urgent` > `high` > default > `low`) → manual override (`priority_override` desc) → due date asc → updated_at desc. Documented here because it is a product decision; the implementation lives in `DesktopHome.rankWaiting()`.
- If `metrics` is empty, the KPI strip collapses entirely (do not show placeholder tiles).
- If `summary` parsing fails, fall back to the empty-tile state — never render raw JSON.

### States
| State | Visual |
|---|---|
| Empty waiting list | "Inbox zero." subtitle "Nothing is waiting on you." |
| No intel | "No revenue pulse yet" with explainer copy |
| Quiet activity | "Quiet." subtitle "Activity will appear here in real time." |
| Realtime disconnected | (TODO — surface a small dot in the Live Activity header. Not yet implemented.) |

### SLAs
| Signal | Freshness target |
|---|---|
| KPI strip | within 1 hour of latest agent run |
| Needs You | realtime |
| Live Activity | realtime |
| Weekly Goals | within 24 hours |

### Screenshots
- `docs/img/home-golden.png` — populated state (TODO)
- `docs/img/home-empty.png` — empty inbox (TODO)

---

## Tab: Today

### Purpose
> *What needs my attention before end of day?*

### Sections
1. **Due** — tasks with `due_date` today or in the past, status not `done`. Accent: rose.
2. **Waiting on You** — tasks with `status = 'waiting'` not already in Due. Accent: amber.

### Inputs
- `tasks` via shared realtime channel; client-side date filtering via `date-fns/isToday`, `isPast`.

### Writes
Inline action surface (`InlineActions`):
- **Approve** → `tasks.status = 'in_progress'`, optional `krish_reviewed = true`. Triggers webhook → N8N.
- **Reject** → `tasks.status = 'blocked'`, write `feedback_text`. Audit-logged.
- **Done** → `tasks.status = 'done'`, sets `completed_at = now()`.
- **Flag** → opens `FlagAgentModal`; persists a flag against the agent.

### Behaviour rules
- A task in "Due" cannot also appear in "Waiting" — Due wins.
- Selecting a task on desktop opens the right pane (`SplitPane`); on mobile it pushes a detail view with a back button.
- Empty *both* groups → "Nothing scheduled for today. Clear mind."

### States
| State | Visual |
|---|---|
| Loading | "Loading…" caption, no skeleton (acceptable for the volume) |
| Empty | "Nothing scheduled for today. Clear mind." |
| Action failure | Toast (`ToastProvider`) — no inline error in the row |

### SLAs
- Action latency ≤ 1 second perceived; optimistic update is acceptable but must reconcile against Supabase within 5 seconds or revert + toast.

---

## Tab: Plans

### Purpose
> *Show me every active task, sliced by status, so I can plan the week.*

### Inputs
- `tasks` via shared realtime channel (no status filter).

### Writes
Same `InlineActions` surface as Today, plus filter controls (status filter, agent filter, search).

### Behaviour rules
- Default sort: `updated_at` desc.
- Filters do not persist across navigations (intentional — Plans is a "right-now" view).
- Document links (`link_primary`, `link_secondary`) open in new tabs and never inline.

### States
| State | Visual |
|---|---|
| Empty after filter | "No tasks match." |
| Empty (no tasks at all) | "Backlog is empty." |

---

## Tab: Org

### Purpose
> *Show me every agent, who they report into, what they're working on, and whether they're healthy.*

### Layout
- **Left list**: pods rendered in strict order Executive → Operations → Growth → other. Each pod card shows description, count, member tiles.
- **Right detail drawer** (when an agent is selected):
  - Identity: avatar, name, role, pod chip, **Flag** button.
  - **Personality** (italic, voice-of-agent).
  - **Mission** (one-paragraph north star).
  - **Mandate** (operating charter).
  - **Brief** (line-clamped excerpt; full text via the Google Doc link).
  - **Recent Activity** (latest 5 audit_log rows).
  - **N8N Runs** (latest 5 workflow_runs rows).

### Inputs
| Element | Table | Filter |
|---|---|---|
| Agent list | `agents` | `active = true`, ordered by `pod` |
| Recent Activity | `audit_log` | `actor in {id, name, lowercased variants}` |
| N8N Runs | `workflow_runs` | `agent_id in {id, name, lowercased variants}` **with legacy `agent` column fallback** |
| Tasks (used for badges) | `tasks` | `owner OR agent in {variants}`, `status != done` |

### Writes
- **Trigger** (▶︎ on hover) → `POST /api/trigger-agent` body `{ agent: <slug> }`. Slug is lowercased server-side.
- **Flag** → opens `FlagAgentModal`.

### Behaviour rules
- The slug-as-key rule applies absolutely. If an agent's runs do not appear, the bug is in the writer, not the reader. UI does best-effort token expansion — see `AGENTS.md` for the canonical token list.
- The right drawer empty states ("No recent activity", "No workflow runs") must not be confused with "agent is broken." Cross-reference Systems tab for health.

### States
| State | Visual |
|---|---|
| No agents | "No active agents." |
| Agent has no activity | "No recent activity." inline |
| Agent has no runs | "No workflow runs." inline |
| Agent stale | (Future: red dot on the avatar — drives off `expected_runs_per_day` vs `last_run`.) |

### SLAs
- Selecting an agent should populate the right drawer in ≤ 500ms cold.

---

## Tab: Intel (also routed as `exec`)

### Purpose
> *Show me strategic numbers — KPI progress, agent cost economics, and the intelligence stream.*

### Sections
1. **Revenue & Pipeline** — line chart of `home_intelligence.metrics[].progress_pct`.
2. **Agent Cost** — bar chart, total in the corner. Sourced from `workflow_runs.cost_usd` (with legacy `cost` fallback). Grouped by `agent_id` (with legacy `agent` fallback) — defaults to "system" when neither is set.
3. **Intelligence Feed** — chronological `audit_log`, latest 20.

### Inputs
- `home_intelligence` (singleton).
- `audit_log` latest 20.
- `workflow_runs` latest 20.

### Writes
None.

### Behaviour rules
- Cost roll-up must include legacy-column rows. The fallback exists because `agent → agent_id` and `cost → cost_usd` were renamed on 2026-04-15; the Intel cost number must remain truthful across that migration.
- The line chart is illustrative, not actuarial. Hover tooltip is the authoritative number for any specific metric.

### States
- "No KPIs yet." inside the chart container.
- "No workflow runs yet." inside the cost chart.
- "Feed is quiet." in the intelligence feed.

---

## Tab: Flows

### Purpose
> *Show me every N8N workflow, which agent owns it, how often it runs, and what it costs in failures.*

### Sections
1. **Workflows** — grouped by `workflow_id`. Columns: workflow, agent (chip), last run, status, runs, errors.
2. **Pending Proposals** — workflow improvements awaiting approval.

### Inputs
- `workflow_runs` latest 50, normalised to backfill `agent_id ||= agent` for legacy rows.
- `workflow_proposals` where `status = 'pending'`.

### Writes
- **Approve / Reject** on a proposal updates `workflow_proposals.status`, `approved_by = 'krish'`, `approved_at = now()`.

### Behaviour rules
- Workflows display the *latest* status of the most recent run, not the worst-case status.
- Errors column is bold-rose when > 0; never green-on-zero (zero is the default, not a celebration).
- Mobile renders cards instead of the table — same data, no truncation of the workflow name.

---

## Tab: Systems

### Purpose
> *Show me what infrastructure is healthy, degraded, or down. Surface alerts I have to act on.*

### Inputs
- `system_health` rows.
- Live `/api/health` snapshot for derived overall status.

### Writes
None directly. Manual remediation is out of scope for the UI.

### Behaviour rules
- Status ladder: `healthy` → `degraded` → `failed`. Overall status is the worst component (excluding `unknown`).
- Badge colour: green / amber / red. Never invent intermediate colours.
- Alerts list is sorted by severity desc, then time desc.

### States
- "No services tracked." (genuine empty)
- "All services healthy." (positive empty)
- "N alerts." (action required)

---

## Surface: Command Palette (⌘K)

### Purpose
> *Keyboard-first navigation and quick actions without leaving the current tab.*

### Inputs
- Static action registry, plus dynamic agent/task name search against `agents` and `tasks`.

### Writes
Routes to a tab or invokes the same action endpoints used by `InlineActions`.

### Behaviour rules
- Always reachable via ⌘K / Ctrl+K. Esc closes.
- Fuzzy match (cmdk default).
- Action verbs match the inline-action verbs exactly (Approve, Reject, Done, Flag) — never invent synonyms in the palette.

---

## Cross-Cutting Surfaces

### Modals
- `FlagAgentModal`: triggered from Org and from the Today inline actions. Persists a flag tied to the agent slug.
- `PendingFlagModal`: rendered at the App root; surfaces unresolved flags on session start.

### Toasts
- `ToastProvider` wraps the app. Toast on action success/failure, never on routine reads.

---

## Definition of Product Quality

A change to any tab is *complete* only when:

1. The viewport-fit rule still holds at 1280×800.
2. Every empty/loading/error state has been verified, not assumed.
3. Realtime updates flow within one tick of an INSERT to the source table.
4. The change includes a screenshot of the golden path and at least one non-golden state.
5. The data feeding each visible element is documented in this file.
6. No new mixed-case writes to slug-keyed columns are introduced.
