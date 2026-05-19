# ADR-005 — Pipeline-first Home

> Status: **Accepted** · 2026-05-19 · Krish + Claude

## Context

Krish runs three pipelines through this OS: **Leads** (signals → outreach → meetings → revenue), **Content** (signals → drafts → approvals → published), and **Visibility** (pitch drafts → outreach → bookings → speaking). Until this change, the Home tab surfaced pipeline state only as a side-effect of agent observability — five Pulse tiles, of which exactly one (Content) was a pipeline metric and four were OS health (Plans count, Today queue, Systems status, Workflows running). Pipeline structure lived implicitly inside `tasks.workstream` and `tasks.group_label`, visible only via the Plans tab's flat list.

That arrangement violated the cross-tab prominence ladder (PRODUCT.md §23: "blocking actions → KPIs → context → history. Never invert."). It also failed the three-seconds-to-decision threshold the doc sets: a user opening Home could not answer "what's the state of my three pipelines and what should I do next?" without scrolling and clicking. Concretely, the existing Home rendered NeedsYou → Blocked → OsMissionHero → WeeklyGoals → 5-tile PulseStrip → ActivityTail, stacked vertically — overflowing the 1280×800 viewport-fit rule.

## Decision

Reframe Home to lead with three pipeline lanes and demote the OS-health Pulse to a single thin strip. Specifically:

1. **Three-lane row at the top of Home.** CSS grid `2fr 1fr 1fr` on desktop. Content occupies the left (primary) slot at double width; Leads and Visibility flank it.
2. **Content lane includes a featured "Approve in one click" card.** The oldest task in `Awaiting review` is rendered as a hero card with the inline draft preview visible — no expand step — and three buttons on the card surface: Approve, Request revisions, Open doc. This was Krish's explicit "currently takes three clicks" pain point.
3. **Visibility lane gets a separate "Pending Nell candidates" header row** above its four task stages, with a one-click Approve that promotes a `nell_candidates` row into a `tasks` row (workstream=`podcast_booking`, status=`waiting`).
4. **Needs You and Blocked move from stacked to side-by-side**, with the visible cap reduced from 6 → 4 items each. They remain prominent (still above the fold) but no longer hero.
5. **PulseStrip is replaced by `OsHealthStrip`** — a single thin row covering Plans · Today · Systems · Running · Errors, ~44px tall. Same data sources, an order of magnitude less viewport real estate.
6. **OS Mission + Weekly Goals stay on Home but render below the fold**, side-by-side in a compact 2-col row. Context, not action.

The other tabs (Today, Plans, Org, Intel, Flows, Systems) are unchanged.

### Pipeline mapping (client-side, no SQL views)

Implemented in `src/lib/pipelines.ts`. Three pure-function classifiers map `TaskRow` → stage key, plus a Nell candidates merge into the Visibility lane:

- **Leads** = `workstream IN ('advisory_sales','AdFixus Pipeline')` OR `group_label IN ('Enterprise Pipeline','Outreach Campaigns','Growth')`.
- **Content** = `workstream='content'`.
- **Visibility (tasks)** = `workstream='podcast_booking'` OR `group_label='Visibility'`.
- **Visibility (candidates)** = `nell_candidates.status='new'` — rendered as a distinct header row, not merged into a task stage.

Stage classification per pipeline is documented in PRODUCT.md and unit-test-friendly (a follow-up PR will add the tests; out of scope for this change per the brief).

### Realtime / channel discipline

Per ADR-002, all task data flows through the single shared `tasks-rt-shared` channel. The three pipeline lanes, Needs You, Blocked, and the Activity tail all consume the same cache and filter client-side. No new tasks channel was introduced.

For `nell_candidates`, we deliberately **did not** add a realtime channel. The table is low-volume (~34 rows lifetime at time of writing) and slow-lifecycle (no rows have transitioned out of `status='new'` yet). `useNellCandidates` polls every 60 seconds, with extra refreshes on `window focus` and `visibilitychange` (debounced 5s). If the volume or cadence changes substantially, revisit.

## Alternatives considered

- **New dedicated `Pipelines` tab + leave Home as-is.** Rejected: it doesn't solve the brief's core complaint, which is that *opening Home* should answer the pipeline question. A new tab would just hide the answer behind another click.
- **Keep the 5-tile PulseStrip and add three new pipeline tiles next to it.** Rejected: dilutes both. The point of the reframe is that OS health is not equivalent to pipeline state — they have different prominence in Krish's day.
- **Drag-and-drop Kanban for the three lanes.** Out of scope per the brief; static lanes are sufficient for v1.
- **Server-side SQL views for pipeline rollups.** Considered, rejected for v1 because (a) `useRealtimeTasks` already caches every task client-side, so the rollup is essentially free, and (b) adding views couples the UI to schema decisions that are still in flux (`workstream` and `group_label` overlap). Pure-function classification keeps the mapping in TypeScript where it's easy to change.
- **Backfill `contacted_persons`, `opportunities`, `hunter_seen_roles` before building the UI.** Rejected per the brief's option (a): the redesign surfaces what's real today. Backfill is Phase 6 agent work.
- **CFP-deadline tracking on the Visibility lane.** Rejected: `nova_target_conferences` doesn't have a `cfp_deadline` column. When/if Nova adds it, the lane gains a new stage.

## Consequences

### Wins
- The three-second pipeline question is now answerable at a glance.
- Above-the-fold content fits 1280×800 with headroom — viewport-fit rule re-honoured.
- One-click Approve on a Content draft replaces what was previously: open Home → click Pulse Content tile → open Plans → find the task → click into it → Approve.
- Nell's drafted candidates are now visible without leaving Home, and promoting one is a single click that lights up the entire downstream pipeline.
- The shared task cache picks up every pipeline change in one realtime tick.

### Trade-offs
- The visible cap on Needs You and Blocked drops from 6 to 4. Krish has a one-click "Open Today" / "Open Plans" affordance to see the rest. Acceptable: Needs You's primary job is to surface *what's next*, not the entire queue.
- OS Mission and Weekly Goals lose hero placement. They remain on Home below the fold; Krish's decision (recorded in the planning conversation) is that they're context, not action.
- The pipeline classifiers are intentionally permissive — they accept either `workstream` or `group_label` as a membership signal. Tasks with neither are not surfaced on Home. If a task should be on Home but isn't, the fix is to tag its `workstream` or `group_label`; it's not a UI bug.
- The Visibility lane has a third source (`nell_candidates`) on a different freshness cadence (60s polling vs realtime). This is invisible to Krish unless he's racing the poll interval; documented for future maintainers.

### Risks
- If Nell starts adding candidates faster than once per minute, the polling cadence may feel laggy. Mitigation: window-focus refresh; or escalate to realtime if cadence justifies.
- The featured Content card writes outside the canonical `InlineActions` flow (it has its own Approve / Note buttons). The writes are functionally equivalent (same supabase update + same `logKrishAction` call), but the duplication is a maintenance risk. If `InlineActions` evolves (e.g. optimistic updates), the featured card needs to track. Out of scope for this PR to extract a shared write hook.
- Pipeline `group_label` values include the literal strings `'Enterprise Pipeline'`, `'Outreach Campaigns'`, `'Growth'`, and `'Visibility'` (mixed case, spaces). This is the data ground truth as of 2026-05-19; if the schema ever normalises to lowercase slugs, `src/lib/pipelines.ts` membership sets need to follow.

## Phase 6 backlog (out of scope for this change)

- Stripe → opportunity stage automation (DATA-RECOMMENDATIONS priority 4).
- Backfill of `contacted_persons`, `opportunities`, `hunter_seen_roles` (n8n workstream).
- Task velocity metrics (DATA-RECOMMENDATIONS priority 2).
- CFP-deadline tracking on `nova_target_conferences` (requires schema add).
- Drag-and-drop Kanban for the lanes.
- Migration: normalise `tasks.group_label` to lowercase slugs.
- Unit tests for `src/lib/pipelines.ts` classifiers.
- Extract a shared write hook so `InlineActions` and the featured Content card share an implementation.
