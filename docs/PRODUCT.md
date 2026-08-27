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

### Purpose (recomposed 2026-08-20)
> *Lock me in on what matters: the OS goals, this week's objectives, and
> today's 3 — the whole thing on one screen, no scrolling, on any device.
> Everything else lives elsewhere.*

Home is the canon, not a dashboard. The bigger picture, not the tiny tasks:
the ruling queue lives on **OS → Queue**, venture health on **Growth →
Signals**, the Friday retro on **Growth → Council**, bets on **OS → Intel**.

### The whole screen (there is no fold)
1. **CriticalAlertBanner** - `silent_failures` tier 3. Hidden when nothing
   is critical; pre-empts everything else visually when present.
2. **VitalsLine** - one quiet strip: MRR (mono) · ships this week with the
   one-tap **Log** (ship-ledger facts live in the modal) · decisions
   **Waiting** count linking to OS → Queue. Neutral rendering, always
   (pilot rule: no conditional colour/copy on any number).
3. **DueTestsCard** - renders nothing unless a worry-test is due.
4. **GoalLadder** - the top two layers of the canon: **OS** (display-type
   goal titles, inline edit, quiet stale markers) and **THIS WEEK** (≤3
   single-line objectives, done toggles, serves-chip, optional venture tag).
   Still the ONE goal editor; writes travel `src/lib/goalsApi.ts`.
5. **TodayList** - the third layer: exactly 3 slots from `daily_focus`,
   done toggles, weekly-goal chip when linked. Three quiet empty slots when
   unset — the CTA is the ask, the layer never begs.
6. **CanonCta** - THE one contextual ask, under the layer it serves:
   "Set this week's 3" or "Pick your 3 for today" → opens the Focus Ritual.
   Hidden when the canon is fresh.
7. **The doors** (2026-08-22, seated together 2026-08-25) - Focus and Intel
   side by side at the bottom of both shells, never numbers (counting
   anything about the operator in ambient chrome breaks the Focus
   doctrine). One sanctioned exception, Krish's explicit call 2026-08-25: a
   status dot on the Intel door - a dot, still never a number - rose when a
   critical API connection is broken, amber when money needs a look (low
   credits, an annual renewal inside 14 days, spend ballooning), fed by
   `useSpend`. On mobile the doors are adjacent compact pills sharing the
   + button's band (`home/FocusDoor.tsx` pill variant + `home/IntelDoor.tsx`),
   always visible - the old under-840px hiding gate is gone because the
   pills live in the band the FAB already reserved. On desktop the Intel
   pill takes the left slot of the doors row and the Focus row fills the
   rest: the bottom-right corner is owned by the fixed ⌘I capture pill,
   which floats over anything placed under it. The Intel door NAVIGATES
   (2026-08-26) - straight to OS → Intel, so the money dot and the money
   are one tap apart.
8. **SignalsDoor + SignalsDrawer** (2026-08-26, `home/SignalsDoor.tsx`) -
   the external head space, and the only place it appears. Internal and
   external intelligence must not share a surface (Krish's call), so Home
   carries doorway language only: a "Market signals" pill with no signal
   text and no counts, present ONLY when Marcus's digest is fresh and
   carries a high or critical signal - its arrival IS the message, the
   same conditional-presence contract as the critical alert banner. A
   quiet week renders nothing at all. It opens `home/SignalsDrawer.tsx`:
   Marcus's whole ranked digest plus Zara's market feed with data-derived
   venture chips and an honest dormancy line, each row opening the shared
   `intel/SignalSheet` (Create task / Add to bets). Reads the
   `useHomeIntelligence` singleton - no new channel.

### Inputs

| Element | Table / source | Hook |
|---|---|---|
| GoalLadder + TodayList chips | `goals` via `GET /api/goals/ladder` | `useGoalCanon` (shared singleton + `goals` realtime) |
| TodayList | `daily_focus` (today, operator-civil date) | `useDailyFocus` |
| CanonCta | derived staleness across the three layers | `useAltitudes` |
| VitalsLine · MRR | Stripe-derived revenue | `useRevenueAttribution` |
| VitalsLine · ships | `ships` via `GET /api/pilot/ships` | `useShipSummary` |
| VitalsLine · waiting | `decisions_waiting` view | `useRealtimeDecisionsWaiting` |
| CriticalAlertBanner | `silent_failures` tier 3 | `useCriticalAlerts` |
| DueTestsCard | `worries` via `GET /api/pilot/worries` | local fetch |
| SignalsDoor / SignalsDrawer | `home_intelligence.external_signals` + `zara_signals` | `useHomeIntelligence`, `useZaraSignals` |

### Writes
- **GoalLadder** → `POST /api/objectives` (gated create) and
  `PATCH /api/goals` (title / status), both via `src/lib/goalsApi.ts`.
- **TodayList · done toggle** → `POST /api/daily-focus/complete`.
- **VitalsLine · Log** → `POST /api/pilot/ships` (manual).

### Behaviour rules

- **No page scroll, ever.** At every supported viewport the whole surface
  fits; short viewports compress spacing (`max-height` variants), rows
  stay single-line, nothing gains an inner scrollbar. Pinned by
  `e2e/home-noscroll.spec.ts` at 1440×900 / 1280×800 / 390×844 / 360×800.
- **One ask per screen.** Exactly one CanonCta may render, under the
  highest stale layer. An empty OS rung is asked for by the ladder's own
  empty state, never by a second CTA.
- **The canon feeds everything.** The same `goals` + `daily_focus` state
  Home shows is what `api/_goals.ts` serves to ask-marcus, the weekly
  brief, and the pilot builder; there is no second goal store anywhere.
- **CriticalAlertBanner is exclusive.** When present, it sits on top;
  when absent, it takes zero space.
- **One shared realtime channel per source table** (unchanged).

### States
| State | Visual |
|---|---|
| No critical alerts | Banner absent (zero height). |
| Cold start (no OS goals) | The ladder's empty state carries the ask: "Set your OS goals." |
| New week, nothing set | "No objectives set for this week." + the one CTA. |
| Day not locked | Three quiet numbered slots + the one CTA. |
| Loading | One HomeSkeleton in the page's real proportions; a warm cache paints straight through. |

### SLAs
| Signal | Freshness target |
|---|---|
| Canon (goals / daily_focus) | Realtime, one tick |
| VitalsLine · waiting count | Realtime, one tick |
| VitalsLine · MRR / ships | Within 5 min |
| CriticalAlertBanner | Realtime, one tick |

---

## Tab: Today

> **Retired (2026-08-20).** The Today tab's ruling queue lives at **OS →
> Queue** (`#/os?sub=queue`); a bare `#/today` aliases to Home and ruling
> deep links (`?task=` / `?decision=`) alias to the queue. The section
> below is historical.

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

## Tab: People

### Purpose
> *Every human pipeline behind one nav entry: Pipeline (deal leads), Network
> (the 10k-contact pool), Visibility (podcast guests + PR targets).*

The three lanes are the former standalone tabs, rendered by
`people/PeopleTab` behind one `SegmentedNav` (test ids `people-lane-<id>`);
the per-lane specs below still hold. **Network is the default lane**
(2026-08-22): the network is what the tab is opened for day to day, so
`#people` with no params lands there, while `?lane=`, `?lead=` and
`?guest=` / `?target=` deep links land on their own lane. On mobile the +
create sheet carries the tab's create action (Add a person).

---

## Lane: People → Pipeline (formerly the Leads tab; PR #53 multi-tag venture-aware)

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
  scoring.** A media exec who is both a Mindmaker buyer and a Signal & Noise
  podcast guest is one row with `tags=['mindmaker_buyer','signal_noise_guest']`
  and `primary_venture='mindmaker'`.
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

## Tab: Subscriptions (formerly Customers; PR #43 / #45)

> **Relocated (2026-08-20).** Lives in the drawer under the simplified IA as
> a watch-only surface; the Home scoreboard carries its headline. Same
> surface, `#customers` still routes to it.

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

## Lane: People → Visibility (formerly the Guests tab; PR #52)

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

> **Live shape: Content Engine v2** (`VITE_CONTENT_V2_ENABLED`, ON in prod):
> rooms Built / Paid / Library plus the mobile-first Queue decision deck.
> Spec: [`CONTENT-ENGINE-V2-SPEC.md`](./CONTENT-ENGINE-V2-SPEC.md) and
> `MINDMAKER_OS_ARCHITECTURE.md` §5.8. The v1 description below holds
> behind the flag.

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
  2026-08-06 and folded into Mindmaker LIVE.

---

## Tab: Growth

One tab, five sections in the order of the weekly loop (Map, Work, Signals,
Council, Governance), both device classes via `growth/GrowthTab`. On a phone
it leads with one line (the number of map questions waiting) and each
touchpoint row collapses to a single readable line that expands on tap; the
+ create sheet carries "Add a touchpoint". Full spec and runbook:
[`GROWTH_TAB_RUNBOOK.md`](./GROWTH_TAB_RUNBOOK.md).

---

## Tab: Focus & Purpose

The operator's own hub: the daily ask, the steadying moves, the
conversation scripts, the decision rules. Non-negotiables and full spec:
[`FOCUS-PURPOSE.md`](./FOCUS-PURPOSE.md) — no archive, no scores, no
streaks, theory only at the point of action, and nothing on the surface is
ever truncated.

---

## Tab: Bets (PR #44)

> **Relocated (2026-08-20, reshaped 2026-08-26).** Bets answer "What
> should I decide?" on **OS → Intel**: overdue ones are ranked act rows
> there, and the full deck with Won / Lost / Extend lives in the bets
> sheet behind them. The standalone tab, the Home strip and the collapsed
> BetsStrip are all gone. Historical below.

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

> **Now an OS subtab (2026-08-20):** OS → Org, beside Queue / Intel / Flows /
> Systems (`os/OsTab`, test ids `os-sub-<id>`). The ruling queue that Home
> used to host lives at OS → Queue. The four subtab specs below still hold.

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

## Tab: Business Intelligence (OS → Intel, routed as `exec`)

### Purpose
> *Answer the five questions I would ask about my own system, and let me
> act on the answer without leaving the page.*

The tab is an interrogation, not a dashboard (Krish's call, 2026-08-26,
after the stacked-card console was rejected twice as "walls and walls of
disconnected things"). Five fixed questions in an unchanging order, each
answered live in one line with a one-word state token. This is the
INTERNAL head space only: what the outside world is doing lives off Home
behind the Market signals door (see IntelDoor / SignalsDoor above).

### The five questions (`intel/questions.tsx`)
Each hook owns one question's token, its one-line answer, and the full
answer it expands into. Every closed answer is deterministic system truth.

| Question | Answer from | Expands to |
|---|---|---|
| What is it costing? | `GET /api/spend` (receipts truth + the usage meter) | The prepaid state of each plan, the top three metered spenders, the 6-month sparkline, unreadable-receipt honesty, and a door into the ranked service + spender sheet |
| What is coming in? | `GET /api/revenue` (Stripe) | Committed MRR per currency, collected 30d/90d/all-time, the one-off share note |
| What is broken? | the connections sweep in `/api/spend` | Every broken or low service with its who-spent-it attribution line, its top-up link, and "Check now" |
| Is anything converting? | `GET /api/fleet-funnel` | Per-app 7-day and all-time funnel, emit health, top campaigns |
| What should I decide? | `bets` + spend + `home_intelligence` | Marcus's focus line, then overdue bets, top-ups and renewals as ranked act rows |

The sixth question is the open one: `AskMarcus` is a single serif input
that becomes the conversation once asked. No autofocus on mount
(2026-08-25): stealing focus popped the phone keyboard into the fixed
no-scroll zoom shell, so the tab always opened "zoomed in".

### Who is spending it (the usage meter)
Receipts answer *how much a provider cost*. Until 2026-08-27 nothing
answered *which unit of the OS spent it* — and the two columns that looked
like they did were fiction (`workflow_runs.cost_usd` was $0.00 across 1,419
runs; `api_call_log` held eighteen rows, all written by the sweep itself).

`meter_daily` is one shape for three providers, so an Apify actor, an n8n
workflow and an Anthropic agent rank in a single list:

| Provider | Unit | Measured in | How |
|---|---|---|---|
| Apify | actor | dollars | `/v2/actor-runs`, per-run `usageTotalUsd`, split by run origin (WEB / API / SCHEDULER / DEVELOPMENT) and joined to `apify_actor_registry` for `task_category` |
| n8n | workflow | executions | n8n Cloud bills per execution and reports no rate, so dollars stay at 0 rather than being invented |
| Anthropic | agent | dollars, from tokens | Every OS-made call records the token counts on its own response, priced, stamped with the calling agent |

**Anthropic is self-metered because it has to be.** The usage and cost
reports are Admin-key endpoints and an individual account cannot hold an
Admin key, so the API key genuinely cannot read its own billing. The
invoice therefore stays the truth for TOTAL Anthropic spend; the meter
answers the narrower question of which agent, of the ones the OS runs, is
spending. n8n workflows that go through `/api/internal/sonnet-proxy` are
covered (their `X-Internal-Caller` header is the stamp); an n8n node holding
its own Anthropic credential is not, and the sheet says so.

### The prepaid line
Apify's plan includes $29 of usage and charges early once the extra passes
$50. The tracker used to report headroom to the vendor's HARD cap, which
sits far above the prepaid — so it read "Apify: $130.53, ok" in the same
week Apify emailed to say the prepaid was spent and the overage was
accruing. `service_registry.included_usd` / `overage_trigger_usd` make
"past the prepaid" and "being charged early" real states: they outrank the
month-vs-usual line in the costing answer, drive the token
(`OVER PREPAID` / `CHARGING`), and light the Intel door dot.

When a line is crossed, `/api/meter/apify-sync` **emails** Krish — his call,
explicitly, over the Telegram framing: money alerts belong in the inbox the
invoices land in. Claimed in `spend_alerts_sent` before the send, so an
hourly cron turns one crossing into one email. A single unit whose week
costs 3× its own normal (and clears $5) gets the same treatment, once per
week — the "who used it, and could it have been avoided" question, answered
while it is still this week's problem.

### Marcus, the marked voice
His headline and dateline crown the page in serif ("MARCUS · WRITTEN WED
26 AUG · NEXT READ FRI"); the dateline opens his full brief as a sheet
(`intel/MarcusReadSheet.tsx`): the deduped read, org focus, content
recommendation, focus this week, and **his own scoreboard**. His authored
numbers live only there — they are never mixed with the deterministic
answers on the tab. `dedupeMarcusRead` kills the old double-render, where
`assessment` (the insights pipe-joined) printed above the same insights.

### Shells
- **Phone**: an accordion. Five closed rows plus the ask fit about one
  screen; one opened answer stays inside two. `e2e/intel-zoom.spec.ts`
  pins that cap against a full fixture — depth lives behind taps, never
  behind truncation.
- **Desktop**: a rail of the five questions beside a pane for the open
  one, defaulting to "What should I decide?".

### Inputs
- `home_intelligence` (singleton, `id='current'`) via `useHomeIntelligence`.
- `marcus_synthesis` latest row via `useMarcusSynthesis`.
- `GET /api/spend`, `GET /api/revenue`, `GET /api/fleet-funnel`.
- `meter_daily` via `/api/spend` (`spenders`, `cycles`) — never read directly.
- `bets` via `useBets`.

### Writes
- AskMarcus POST is read-only on the DB side (does not mutate).
- "Check now" POSTs `/api/health/connections-sweep`.
- The bets sheet PATCHes `/api/bets/:id` (Won / Lost / Extend).

### Behaviour rules
- A question's answer must be a full sentence with the number inside it,
  never a bare metric. If the honest answer is "Nothing", it says so.
- Marcus can be days stale; the deterministic answers never are. The
  dateline drops "NEXT READ" past four days rather than promising a run
  that did not happen.
- The tab renders no market signals, ever.

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
- Always available; rendered at the App root. On a phone the same capture is
  the "Capture an idea" row in the + create sheet (`CreateSheet`).
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
