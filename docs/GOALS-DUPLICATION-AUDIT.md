# Goals and focus: what is duplicated

Audit date 2026-08-11. Written while deduplicating the two OS-goal
surfaces on Home. **Nothing here is deleted.** Each item is a decision,
and several have external consumers this repo cannot see.

## A. Goal stores

Four stores held something goal-shaped. This pass retired one.

| Store | Holds | Status |
|---|---|---|
| `goals` table, 4 rungs | The ladder | Canonical |
| `system_config.north_star` | One free-text string | **Retired.** Now a derived mirror (`api/_northStar.ts`) |
| `system_config.mrr_goal_usd` + `mrr_goal_label` | `100000`, "Path to $100k MRR" | **Live, outside the ladder** |
| `system_config.team_focus` | The weekly focus line | Live, overlaps the `weekly` rung |

**The revenue goal contradicts itself across stores.** `mrr_goal_usd` is
$100k (written 2026-05-21) while the retired `north_star` said "$20K MRR
within 60 days" (written 2026-04-14). Both rendered on Home at the same
time, in different cards, and nothing reconciled them. `MrrTicker` still
draws "Path to $100k" from `system_config`, not from the ladder.

Decision needed: does the revenue target become a `mid_term` goal on the
ladder, with `MrrTicker` reading it from there, or does `mrr_goal_usd`
stay a display setting that is explicitly not a goal?

**`team_focus` has no row in production.** That is why the hero shows the
"Set team focus for this week…" placeholder rather than a value.

## B. Two read endpoints over one table, one of them dead

- `GET /api/goals` filters `.eq('horizon','weekly')`, joins tasks, and
  computes `calculated_progress`. **Zero callers in `src/`.** It is
  documented in `docs/API.md:397`, so external consumers (n8n, agents)
  are possible and unverified.
- `GET /api/goals/ladder` returns all four rungs joined to
  `goals_health`. The only read the app performs.
- `PATCH /api/goals` is live and load-bearing: `team_focus` from the
  hero, and every goal mutation from the ladder.

Folding the GET into the ladder read is safe inside this repo and
unverified outside it. Check n8n before removing.

## C. `objectives` is `goals` under a second noun

One table, two route trees, two words in the UI:

- `api/goals.ts`, `api/goals/ladder.ts`, `api/goals/gate.ts`, `api/goals/digest.ts`
- `api/objectives/index.ts`, `api/objectives/[id].ts`, `api/objectives/[id]/*`,
  `api/objectives/voice.ts`, `api/objectives/propose-milestones.ts`

The split is not along a concept boundary. The ladder **creates** a goal
via `POST /api/objectives` and **mutates** the same goal via
`PATCH /api/goals`. One user action, two nouns, decided by history rather
than meaning. This is the same condition that produced the original OS
label collision (`83b7499`).

## D. Four focus subsystems

All four exist in the tree. Flag values below are from `.env.example` and
are **indicative only**; the deployed values live in Vercel env.

| Flag | `.env.example` | Code |
|---|---|---|
| `VITE_DAILY_FOCUS_ENABLED` | `true` | `useDailyFocus` (125), `DailyDriver` (57), 5 routes under `api/daily-focus/` |
| `VITE_WEEKLY_FOCUS_ENABLED` | `false` | `useWeeklyFocus` (117), `WeeklyFocusTakeover` (388), 2 routes under `api/weekly-focus/` |
| `VITE_FOCUS_MODE_ENABLED` | `false` | `useFocusMode` (37) |
| `VITE_FOCUS_RITUAL_ENABLED` | `false` | `homeV2.ts`, `pilotCapacity.ts`; gates an entire alternate Home branch |

Two of them read `goals` directly: `api/daily-focus/suggestions.ts` and
`api/weekly-focus/slate.ts`. So "what am I focused on" is answered by the
ladder's `weekly` rung, by `team_focus`, and by two independent focus
engines, depending on which flag is on.

`team_focus` having two editors (hero on desktop, ladder on mobile) is
**deliberate** and now asserted by `scripts/check-goal-ladder.mts`. Leave it.

## E. A flag that is probably always off

`isHomeV2Enabled()` in `src/lib/homeV2.ts:7` reads
`VITE_HOME_V2_ENABLED`. That name appears **nowhere in
`.env.example`**, which documents `VITE_UI_V2_ENABLED` instead. If the
name drifted, `v2` is false in every environment and the branches it
gates are dead: `GlanceHeader` (`DesktopHome.tsx:227`) and part of the
`DecisionsInbox` condition (`:248`).

Worth one check against the Vercel env before assuming either way.

## F. Hardcoded lists that duplicate the database

- `src/components/goals/GoalLadder.tsx` `VENTURES` is maintained by hand
  and its own comment says it mirrors `venture_registry where active=true`.
- `api/fleet-funnel.ts:14` `APPS` still lists `gutted`, `merciless` and
  `onalert`, retired from the control plane 2026-07-06.
- `api/agents/[name].ts` carries an `available_agents` array duplicating
  the `agents` table.

## G. The headline MRR is pinned, and that matters for goals

`src/lib/mrrDisplay.ts` sets `MRR_DISPLAY_OVERRIDE = 16500`, so Home
shows $16.5k. The `customers` table sums to roughly $29 across 4 paying
rows. The override is documented as display-only and deliberate.

It matters here because any goal about revenue is judged against one of
those two numbers. The gate (`api/_goalMetrics.ts`) deliberately reads
the real table, so a target will be assessed against ~$29 while the
dashboard beside it reads $16.5k. That is the honest behaviour, and the
discrepancy is worth resolving rather than absorbing.

## Suggested order

1. Decide where the revenue target lives (A). It is the one users see.
2. Check `VITE_HOME_V2_ENABLED` against Vercel (E). Cheap, and it either
   deletes two branches or fixes a broken flag name.
3. Check n8n for `GET /api/goals` consumers, then fold it (B).
4. Pick one noun, goals or objectives, and move the routes (C). Largest,
   and safest once B is settled.
5. Focus subsystems (D) last, and as a product decision, not a cleanup.
