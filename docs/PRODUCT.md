# Product Specification

> **Scope.** What each surface of Control Center is for, what data it
> reads / writes, and how it must behave. The contract between product
> intent and implementation.
>
> **Not in this document.** System-level concerns (file structure, data
> flow, Vercel quirks, error-boundary plumbing, shared-channel performance)
> live in [`ARCHITECTURE.md`](./ARCHITECTURE.md). Schema details live in
> [`DATABASE.md`](./DATABASE.md). Both are authoritative; this document
> references them rather than restating them.

---

## Audience and intent

| Field | Value |
|---|---|
| Primary user | Krish (CEO, single operator) |
| Secondary user | Future ops staff with read-only oversight |
| Never the user | Agents - they read briefs and Supabase rows, never this UI |
| Operating mode | Glanceable status + decisive action. No exploration UI, no analytics-style dashboards. |
| Decision velocity | Every tab must answer its core question in < 3 seconds. |

If a feature does not change a CEO decision within minutes, it does not
belong.

---

## Cross-tab behaviour contracts

These rules apply to every tab and override per-tab styling decisions
when in conflict.

| Rule | Description |
|---|---|
| **Viewport fit** | At ≥ 1280×800 every primary tab must fit the viewport without page scroll. Sub-panels scroll internally. |
| **Realtime first** | Any value derived from a realtime-subscribed table must update without a page reload. New rows appear within one realtime tick. |
| **Slug-as-key** | Joins between agents and any other table use the lowercase slug (`agents.id`, e.g. `cleo`). Mixed-case writes are a bug. See [`AGENTS.md#slug-as-key`](./AGENTS.md#slug-as-key). |
| **Empty ≠ broken** | Every empty state must distinguish "nothing happened yet" from "failed to load." Empty states use a calm phrase, not a loading spinner. |
| **Action provenance** | Every Krish action writes an `audit_log` row with `actor='krish'` and a meaningful `event_type`. |
| **No silent legacy-column drop** | Schema migrations that rename columns must read both old and new until the legacy column is dropped. |
| **Prominence ladder** | Within a tab: blocking actions → KPIs → context → history. Never invert. |
| **Mobile parity** | Below 900px every tab surfaces the same primary information; only secondary panels collapse. |
| **One channel per table** | Realtime subscriptions reuse the shared channel (`tasks-rt-shared`, `leads-rt-shared`, etc.). Opening a second channel for the same table is a performance bug. ADR-002. |
| **Adaptive theme** | Every surface must read correctly in light AND dark - use design tokens, never hardcoded hues. Theme = System/Light/Dark, switchable at will; the experimental ambient layer is toggleable off. ADR-007, [`DESIGN_SYSTEM.md`](./DESIGN_SYSTEM.md). |

---

## Tab: Home

### Purpose
> *In three seconds, tell me every decision the OS is waiting on me for,
> show me the live revenue pulse, and flag anything actually broken.*

### Above-the-fold ladder (1280×800)
1. **CriticalAlertBanner** - subscribed to `silent_failures` tier 3. Hidden
   when nothing is critical. When present, it pre-empts everything else
   visually.
2. **DailyBriefBanner** - Marcus's daily COO brief; the Friday weekly retro
   takes priority over the daily brief until Krish acks (`weekly_retro_ack_at`).
3. **MrrTicker** - live MRR + path-to-$100k delta.
4. **StreakPills** - Content / Leads / Waiting-on-you streaks.
5. **Marcus headline** + Signals + "Needs you" panels.
6. **DecisionsWaitingPanel** - unified across tasks / leads / guests /
   visibility / ideas, reading the `decisions_waiting` Postgres view.
   Rendering anchored by this panel; everything else is context.
7. **KillListModal** - auto-opens when ≥ 5 tasks are untouched for 21+ days.

Below the fold (context, not action):
- **OS Mission** (north star + this week's focus) + **Weekly Goals**.
- **Activity** - collapsed `<details>` rolling `audit_log`.

### Inputs

| Element | Table / source | Hook |
|---|---|---|
| DecisionsWaitingPanel | `decisions_waiting` view (UNION of `tasks`, `leads`, `guests`, `visibility_targets`, `content_ideas`) | `useRealtimeDecisionsWaiting` |
| CriticalAlertBanner | `silent_failures` filtered to tier 3 | `useCriticalAlerts` |
| DailyBriefBanner | `home_intelligence.daily_brief`, `weekly_retro`, `weekly_retro_ack_at`, `monday_premortem` | one-shot on mount + 5m refresh |
| MrrTicker | `customers` (sum of `mrr_usd` where `kind='paid'`) | `useCustomers` |
| StreakPills | `tasks`, `leads`, `content_ideas` aggregated client-side | shared channels |
| Marcus headline + signals | `home_intelligence.summary`, `external_signals`, `customer_signals` | `home_intelligence` realtime |
| Needs You panel | `tasks` where `status='waiting'`, `leads` where `deep_enriched_at IS NOT NULL AND promoted_task_id IS NULL` | shared channels |
| Activity feed | `audit_log` latest 40, realtime INSERT subscription | `home-activity` channel |
| OS Mission · north star + team focus | `goals` via `GoalLadder` (`GET /api/goals/ladder`) | current, week label derived |
| Goal ladder · all four horizons | `goals` via `GoalLadder` | every non-terminal row, grouped by `horizon` |

### Writes
Home itself owns very few mutations - every actionable row in the
DecisionsWaitingPanel routes to the appropriate tab's handler (Approve,
Promote, Confirm, Deep enrich, etc.). The exceptions:
- **OS Mission · Save focus** → `PATCH /api/goals` (`team_focus`).
- **DailyBriefBanner · Ack weekly retro** → sets
  `home_intelligence.weekly_retro_ack_at`.
- **KillListModal · Kill task** → `tasks.status='superseded'`.

### Behaviour rules

- **`decisions_waiting` is the single source.** New "waiting on Krish"
  surfaces add a `UNION ALL` branch to the view; they do not add a sibling
  panel to Home.
- **One shared realtime channel per source table.** Lanes, panels, and
  pills all read from the same channel and filter client-side. Do not open
  a second `tasks` (or `leads`, or `guests`) channel for Home.
- **CriticalAlertBanner is exclusive.** When present, it sits above the
  fold and dims everything else; when absent, it takes zero space.
- **DailyBriefBanner priority order.** Weekly retro (Friday) until acked
  → daily brief (weekdays) → Monday pre-mortem (Mondays only). Only one
  banner renders at a time.
- **DecisionsWaitingPanel ranking.** Within the unified view: priority
  weight (high/urgent/overdue > normal) → age (oldest first). Rich enrichment
  meta (pitch_draft preview, suggested angles, fit_score, tier) is shown
  inline so Krish can decide without opening the row.

### States
| State | Visual |
|---|---|
| No critical alerts | Banner absent (zero height). |
| No decisions waiting | Panel renders "Nothing waiting. Clear mind." |
| `decisions_waiting` view unreachable | Panel renders empty state with "view unreachable" caption - not a spinner. |
| Empty activity | "Quiet. Activity will appear here in real time." inside the collapsed `<details>`. |
| Loading > 500ms | Calm. Never a full-page spinner. |

### SLAs
| Signal | Freshness target |
|---|---|
| DecisionsWaitingPanel | Realtime, one tick |
| CriticalAlertBanner | Realtime, one tick |
| MrrTicker | Realtime, one tick |
| DailyBriefBanner | Within 5 min |
| Activity feed | Realtime |
| OS Mission / Weekly Goals | Within 24h |

---

## Tab: Today

### Purpose
> *What needs my attention before EOD?*

### Sections
1. **Due** - `tasks` with `due_date` today or in the past, status not
   `done`. Accent: rose.
2. **Waiting on You** - `tasks` with `status='waiting'` not already in Due.
   Accent: amber.

### Inputs
- `tasks` via `useRealtimeTasks` (shared `tasks-rt-shared` channel).
  Client-side date filtering via `date-fns/isToday`, `isPast`.

### Writes
Inline action surface (`InlineActions`):
- **Approve** → `tasks.status='in_progress'`, optional `krish_reviewed=true`.
  Triggers webhook → N8N.
- **Reject** → `tasks.status='blocked'`, write `feedback_text`.
  Audit-logged.
- **Done** → `tasks.status='done'`. The DB trigger stamps `completed_at`.
- **Flag** → opens `FlagAgentModal`; persists a flag against the agent.

### Behaviour rules
- A task in "Due" cannot also appear in "Waiting" - Due wins.
- Selecting a task on desktop opens the right pane; on mobile it pushes a
  detail view with a back button.
- Empty *both* groups → "Nothing scheduled for today. Clear mind."

### SLAs
- Action latency ≤ 1 second perceived. Optimistic update is acceptable
  but must reconcile against Supabase within 5 seconds or revert + toast.

---

## Tab: Leads (PR #53 multi-tag venture-aware)

### Purpose
> *Which leads are enriched and ready for me to promote, reassign, schedule
> follow-up on, or kill - sliced by venture?*

### Layout
- **Per-venture lanes** - one column per active venture in `venture_registry`
  (the active rows, from the shared `src/lib/ventureOptions.ts`), rendered by
  `LeadVentureLane`. The `assignee_agent` column is independent and can
  route a row to any agent regardless of the venture lane.
- **LeadCard** - each card shows venture pill + per-venture ICP chips
  (sourced from `icp_scores` jsonb), with inline Promote / Reassign /
  Schedule follow-up / Deep enrich.

### Inputs
- `leads` via `useRealtimeLeads` (shared `leads-rt-shared` channel).
- `venture_registry` for lane definitions.

### Writes
- **Promote** → `POST /api/leads/promote`. Creates a `tasks` row owned by
  `leads.assignee_agent`; sets `leads.promoted_task_id` (idempotent).
- **Reassign** → updates `leads.assignee_agent`.
- **Schedule follow-up** (1d / 3d / 7d / 14d) → writes `leads.follow_up_at`.
  Marcus's next synthesis surfaces it in `external_signals[]` with
  `urgency='high'`.
- **Deep enrich** → POST `/webhook/lead-deep-enrich` via the Orchestrator.
  Mutates `leads.fit_score`, `icp_scores`, `attainability_score`,
  `why_relevant`, `primary_tension`, `next_step`, `deep_enriched_at`.

### Behaviour rules
- **`primary_venture` drives the lane, `tags[]` drives ICP / outreach
  scoring.** A media exec who is both a Mindmake buyer and a Signal & Noise
  podcast guest is one row with `tags=['mindmake_buyer','signal_noise_guest']`
  and `primary_venture='mindmake'`.
- **ICP chips render the per-venture score from `icp_scores` jsonb**, not
  the legacy single-value `icp_score` column.
- Leads with `assignee_agent` outside Felix's remit are visible to Felix
  but visually muted; the canonical assignee owns Promote.

### States
- Lane empty → "No leads in this venture lane."
- Lead unenriched (`deep_enriched_at IS NULL`) → card shows "Awaiting
  enrich" with a manual Deep enrich button. The hourly Deep Enrich Retry
  Sweep will pick it up automatically.

---

## Tab: Customers (PR #43 / #45)

### Purpose
> *Where is revenue coming from this month, which paid customers are at
> risk, and which warrant an expansion conversation?*

### Sections
1. **MrrTicker** - live MRR + delta vs path-to-$100k.
2. **CustomerSourcesPanel** - revenue by `attribution_channel`
   (cold-email / podcast / content / referral / direct).
3. **CustomerCouncilCard** - exit-interview-overdue customers + tenured
   customers due for a check-in.
4. **ExpansionRadar** - long-tenured starter-plan customers ready to
   upsell.
5. **Per-product feeds** - per `customer_product` (mm-ctrl, Fractionl
   Circle, Fractionl Pulse, OnAlert, Gutted, Merciless): recent signups,
   churns, MRR delta.

### Inputs
- `customers` via `useCustomers`.
- `customer_contacts` for CustomerCouncilCard.
- `home_intelligence.customer_signals` for the cross-product roll-up.

### Writes
- **Log conversation** → inserts a `customer_contacts` row.
- No direct mutations to `customers` (owned by Stripe webhooks + Maya
  Customer Acquisition Sweeper).

### Behaviour rules
- `kind` enum: `paid` / `free_signup` / `trial` / `waitlist` /
  `churned`. MrrTicker sums only `paid`.
- `attribution_channel` may be `unknown` - render that as a labelled
  bucket, never hide.
- Churned customers stay in the table; ExpansionRadar excludes them.

---

## Tab: Guests (PR #52)

### Purpose
> *Which podcast guests have pitch drafts ready for me to approve, and
> which visibility / PR opportunities are waiting?*

### Layout
- **GuestImportDropzone** - flexible-format paste/drop (mirrors
  LeadImportDropzone). POSTs to `/webhook/guest-doc-ingest`.
- **GuestCard** - Confirm / Skip / Deep enrich / Edit pitch.
- **GuestStatusLane** - `new` / `enriched` / `confirmed` / `skipped` /
  `done`.
- **VisibilityTargetCard** - speaking + PR opportunities with deep-enrich
  + edit (replaces legacy `useNovaConferences` / `VisibilityEventCard`,
  retained in the source tree for safety-window only).

### Inputs
- `guests` via `useRealtimeGuests`.
- `visibility_targets` via `useVisibilityTargets`.

### Writes
- **Confirm** → `POST /api/guests/confirm`. Sets `guests.status='confirmed'`
  then POSTs `/webhook/guest-confirmed-cascade` (3 tasks + 3 promo drafts
  + Gmail thank-you draft + `contacted_persons` upsert + stamps
  `cascade_fired_at`).
- **Skip** → `guests.skipped_at = now()`.
- **Deep enrich** → `/webhook/guest-deep-enrich` (Nell Guest Pitch Draft
  workflow, canonicalised in PR #60). Sets `pitch_draft`,
  `suggested_angles`, `status='enriched'`, `deep_enriched_at`.
- **Edit pitch** → updates `guests.pitch_draft`.

### Behaviour rules
- `podcast_target` enum: `builder-economy` / `signal-and-noise`. Each
  guest is bound to one target.
- The cascade is idempotent. Re-confirming a guest re-fires it (useful
  when a transient failure left tasks missing).
- `decisions_waiting` view includes `guests.status='enriched'` with the
  full pitch preview + suggested_angles in the meta jsonb so Krish can
  decide on Home without opening the tab.

---

## Tab: Content

### Purpose
> *What content ideas have been captured, which are ready to send to a
> stream, which should I kill?*

### Inputs
- `content_ideas` (status enum: `pending` / `accepted` / `rejected` /
  `published`).

### Writes
- **Accept** → `status='accepted'`. May also create a `tasks` row owned
  by Cleo.
- **Reject** → `status='rejected'`, write `feedback_text`.
- **Promote to task** → creates a `tasks` row in the `content` workstream.

### Capture surface
- **Cmd+I (QuickCaptureIdea)** - rendered at the app root, available on
  every tab. POSTs to the Cleo idea-capture webhook (Sonnet 4.6
  extractor; see PR #51). Hard contract on insert: `is_idea=true`,
  `confidence >= 0.5`. Below bar → write to `audit_log` as
  `idea_below_quality_bar`, do not insert.

### Behaviour rules
- Quality scoring (`green` / `amber` / `red`) is shown on the card.
- Distribution channels (whitelist: `linkedin`, `newsletter`,
  `signal-noise-pod`, `builder-economy-pod`, `x`) are shown as chips.
  `techonomic` is a legacy value on older rows only; the brand was retired
  2026-08-06 and folded into Mindmake LIVE.

---

## Tab: Bets (PR #44)

### Purpose
> *What falsifiable hypotheses am I running, what's the 90-day hit rate,
> and how much MRR have my bets actually delivered?*

### Sections
1. **Bet Board** - live bets with time-box fill bars (`time_box_days`
   countdown).
2. **Place a bet** - inline form: title, hypothesis, time-box,
   `est_mrr_impact_usd`.
3. **90-day hit rate** - won / (won + lost + partial) over the last 90
   days.
4. **MRR impact panel** - `sum(actual_mrr_impact_usd)` of bets closed in
   the last 90 days.

### Inputs
- `bets` (title, hypothesis, `time_box_days`, `est_mrr_impact_usd`,
  `status` enum: `live` / `won` / `lost` / `partial`, learning text,
  `actual_mrr_impact_usd`).

### Writes
- **Place** → insert.
- **Close** → updates `status`, `learning`, `actual_mrr_impact_usd`.

---

## Tab: Org

### Purpose
> *Show me every agent, who they report into, what they're working on,
> whether they're healthy, and let me edit a brief inline.*

### Layout
- **Left list**: pods in strict order Executive → Operations → Growth →
  other. Each pod card shows description, count, member tiles.
- **Right detail drawer** (when an agent is selected):
  - Identity: avatar, name, role, pod chip, **Flag** button.
  - **Personality** (italic, voice-of-agent).
  - **Mission** (one-paragraph north star).
  - **Mandate** (operating charter).
  - **Brief** (line-clamped excerpt; inline editor writes via
    `/api/sync-brief`).
  - **Recent Activity** (latest 5 `audit_log` rows).
  - **N8N Runs** (latest 5 `workflow_runs` rows).

### Inputs

| Element | Table | Filter |
|---|---|---|
| Agent list | `agents` | `active=true`, ordered by `pod` |
| Recent Activity | `audit_log` | `actor in {id, name, lowercased variants}` |
| N8N Runs | `workflow_runs` | `agent_id in {id, name, lowercased variants}` with legacy `agent` fallback |
| Tasks (used for badges) | `tasks` | `owner OR agent in {variants}`, `status != done` |

### Writes
- **Trigger** (▶︎ on hover) → `POST /api/trigger-agent` body `{ agent: <slug> }`.
  Slug is lowercased server-side. Inserts a `tasks` row → pg_net → N8N.
- **Flag** → opens `FlagAgentModal`.
- **Edit brief** → inline editor → `PATCH /api/sync-brief` → updates
  `agents.brief_content`.

### Behaviour rules
- The slug-as-key rule applies absolutely. If an agent's runs don't
  appear, the bug is in the writer, not the reader. The reader does
  best-effort token expansion - see [`AGENTS.md`](./AGENTS.md).
- Empty drawer states ("No recent activity", "No workflow runs") must not
  be confused with "agent is broken." Cross-reference Systems tab for
  health.
- Coordinator agents (Cleo, Agatha) legitimately have
  `expected_runs_per_day=null` and zero `workflow_runs`. That is not a
  bug. See [`AGENTS.md#agent-taxonomy`](./AGENTS.md#agent-taxonomy).

### SLAs
- Selecting an agent populates the right drawer in ≤ 500ms cold.

---

## Tab: Intel (routed as `exec`)

### Purpose
> *Show me strategic numbers, ask Marcus a question grounded in real OS
> state, and read the signal stream.*

### Sections
1. **AskMarcus** - chat surface backed by `/api/ask-marcus`. Anthropic-
   backed Q&A grounded in `customers` / `leads` / `bets` /
   `home_intelligence`.
2. **Revenue & Pipeline** - line chart of `home_intelligence.metrics[].progress_pct`.
3. **Agent Cost** - bar chart, total in the corner. Sourced from
   `workflow_runs.cost_usd` (with legacy `cost` fallback). Grouped by
   `agent_id` (with legacy `agent` fallback). Unattributed rows roll up to
   `system`.
4. **Intelligence Feed** - chronological `audit_log`, latest 20.
5. **Zara Signals** - top recent rows from `zara_signals`.

### Inputs
- `home_intelligence` (singleton, `id='current'`).
- `audit_log` latest 20.
- `workflow_runs` latest 20.
- `zara_signals` latest 20.

### Writes
- AskMarcus POST is read-only on the DB side (does not mutate).

### Behaviour rules
- Cost roll-up must include legacy-column rows. The fallback exists
  because `agent → agent_id` and `cost → cost_usd` were renamed on
  2026-04-15; the Intel cost number must remain truthful across that
  migration.
- The line chart is illustrative, not actuarial. Hover tooltip is the
  authoritative number for any specific metric.

---

## Tab: Flows

### Purpose
> *Show me every N8N workflow, which agent owns it, how often it runs,
> what it costs in failures, and which agent-proposed improvements are
> waiting on my approval.*

### Sections
1. **Workflows** - grouped by `workflow_id`. Columns: workflow, agent
   chip, last run, status, runs, errors.
2. **Pending Proposals** - workflow improvements awaiting approval.

### Inputs
- `workflow_runs` latest 50, normalised to backfill
  `agent_id ||= agent` for pre-2026-04-15 legacy rows.
- `workflow_proposals` where `status='pending'`.

### Writes
- **Approve / Reject** on a proposal updates `workflow_proposals.status`,
  `approved_by='krish'`, `approved_at=now()`.

### Behaviour rules
- Workflows display the *latest* status of the most recent run, not the
  worst-case status.
- Errors column is bold-rose when > 0; never green-on-zero (zero is the
  default, not a celebration).
- Mobile renders cards instead of the table - same data, no truncation
  of the workflow name.

---

## Tab: Systems

### Purpose
> *Show me what infrastructure is healthy, degraded, or down, plus
> credential health and silent failures by tier.*

### Inputs
- `system_health` rows.
- `credential_health` rows.
- `silent_failures` grouped by tier (1 / 2 / 3 / 4).
- Live `/api/health` snapshot for derived overall status.

### Writes
None. Remediation is owned by Arlo / Kai out-of-band.

### Behaviour rules
- Status ladder: `healthy` → `degraded` → `failed`. Overall status is the
  worst component (excluding `unknown`).
- Badge colour: green / amber / red. Never invent intermediate colours.
- Silent failures list is sorted by tier (3 first), then by detected_at
  desc.

---

## Surface: Command Palette (⌘K)

### Purpose
> *Keyboard-first navigation and quick actions without leaving the
> current tab.*

### Inputs
- Static action registry + dynamic agent/task name search against
  `agents` and `tasks`.

### Writes
- Routes to a tab or invokes the same action endpoints used by
  `InlineActions`.

### Behaviour rules
- Always reachable via ⌘K / Ctrl+K. Esc closes.
- Fuzzy match (cmdk default).
- Action verbs match the inline-action verbs exactly (Approve, Reject,
  Done, Flag) - never invent synonyms in the palette.

---

## Surface: Quick Capture Idea (⌘I)

### Purpose
> *Capture a content idea without leaving the current tab.*

### Behaviour
- Always available; rendered at the App root.
- POSTs body to the Cleo idea-capture webhook.
- The webhook's Sonnet 4.6 extractor either inserts into `content_ideas`
  (when `is_idea=true` and `confidence >= 0.5`) or logs a skip row to
  `audit_log` as `cleo_idea_capture_skipped` with `skip_reason`.

---

## Surface: Appearance (theme)

### Purpose
> *Read the cockpit however I want - dark at night, light by day, or follow the
> system - and turn the "magic" off if I want it flat.*

### Behaviour
- Two persisted switches: **theme** (`system` / `light` / `dark`, `system`
  live-follows the OS) and **ambient** (the experimental aurora/grain/mood layer,
  on by default, toggleable off for a clean flat theme).
- Reachable from the desktop sidebar footer, the mobile "More" drawer
  (Appearance row), and ⌘K → Appearance. No flash of the wrong theme on load.
- Full spec: [`DESIGN_SYSTEM.md`](./DESIGN_SYSTEM.md); rationale: ADR-007.

---

## Cross-cutting surfaces

### Modals
- `FlagAgentModal`: triggered from Org and from the Today inline actions.
  Persists a flag tied to the agent slug.
- `PendingFlagModal`: rendered at the App root; surfaces unresolved flags
  on session start.
- `KillListModal`: auto-opens on Home when ≥ 5 tasks are 21+ days stale.

### Toasts
- `ToastProvider` wraps the app. Toast on action success/failure, never
  on routine reads.

---

## Definition of product quality

A change to any tab is *complete* only when:

1. The viewport-fit rule still holds at 1280×800.
2. Every empty/loading/error state has been verified, not assumed.
3. Realtime updates flow within one tick of an INSERT to the source table.
4. The change includes a screenshot of the golden path and at least one
   non-golden state.
5. The data feeding each visible element is documented in this file.
6. No new mixed-case writes to slug-keyed columns are introduced.
7. If the change adds a new "waiting on Krish" surface, the
   `decisions_waiting` view gains a corresponding `UNION ALL` branch.
