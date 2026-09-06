# 012 — One goal canon; Home recomposed around it

**Date:** 2026-08-20 · **Status:** accepted · **Driver:** Krish ("the home
page is way too complicated… radically simplified to an overall OS
objective: this week's objectives and today's objectives that should feed
and be canon for everything, with everything else purged permanently and
rewired into this… basically no scrolling at all on any device")

## Decision

1. **The canon is three layers, and Home is the canon.** OS goals (since
   ADR-016, 2026-09-06: the single mission `horizon='os'` row; originally the
   three rows of the time) → this week's objectives (≤3
   `horizon='weekly'` rows, each `parent_id` → an OS goal, optional
   `venture` tag) → today's 3 (`daily_focus`, always exactly 3). Home
   renders exactly: critical alerts (when firing) + one vitals line
   (MRR · ships + Log · waiting count) + the three layers + ONE contextual
   CTA + the due-tests card. No scrolling at any supported viewport
   (pinned by `e2e/home-noscroll.spec.ts`).
2. **The `mid_term` and `venture_objective` rungs retire** (both held zero
   rows). The DB CHECK tightens to `('os','weekly')`; a trigger enforces
   weekly→os parentage; `goals_health` runs the two-rung cadence
   (weekly 10d, os 90d).
3. **Today is always exactly 3.** The capacity-varied target count is
   deleted — it shipped "Pick your 2" against a calibrate route that
   rejects anything ≠3 with an HTTP 400, so the daily lock was broken in
   production. Capacity keeps only its demand-suppression role.
4. **The ruling queue moves whole to OS → Queue** (inbox, one-card deck,
   ruling prompts, stale tail, backburner, calibration card). Home carries
   only the count. Rationale: under the 6-tab IA, Home was the queue's ONLY
   host, and task rulings / ⌘J capture returns / Vera gaps / growth stalls
   have no other surface — deletion would have orphaned real loops. Deep
   links: `#/today?task=`/`?decision=` alias to `os?sub=queue` with params
   intact; a bare `#/today` still means Home. `routeDecision` mirrors this;
   the Postgres view's `route_target` column still emits old targets
   (client mirror wins — accepted drift, revisit if an external consumer
   starts reading it).
5. **One wire path for goal writes:** `src/lib/goalsApi.ts`. The
   check-goal-ladder guard now enforces the module, not a single component
   (the ritual's weekly step also creates weekly goals). One read:
   `GET /api/goals/ladder`. `GET /api/objectives`, `POST /api/goals`,
   `DELETE /api/goals` are 410 tombstones.
6. **Purged permanently:** `milestones`, `weekly_focus`,
   `weekly_focus_milestones`, `goal_agent_contributions`,
   `goals_archive_2026_04` tables; `system_config.team_focus` /
   `mrr_goal_usd` / `mrr_goal_label`; the weekly slate/commit and
   milestone routes; voice objectives; the ambient fold and its residents;
   the altitude spine; the daily board; streaks UI; the home flag sprawl
   (`homeV2.ts`, `VITE_FOCUS_RITUAL/WEEKLY_FOCUS/FOCUS_MODE/DAILY_FOCUS/
   IA_V3` — committed in code). "Done" on a goal is a STATUS, never a
   percentage — the legacy progress/current/notes columns are unread and
   unwritten, and drop in the staged migration B.
7. **Rewired, not deleted:** growth scoreboard → Growth → Signals; Friday
   retro banner → Growth → Council; bets strip → OS → Intel (it was about
   to orphan BetCard/useBets); Marcus's weekly proposals surface as
   take/pass chips in the ritual via the kept nominate endpoints (the
   rejection learning loop survives); the shutdown's `tomorrow_one` still
   seeds slot 1 of the daily pick.
8. **The canon feeds everything.** `api/_goals.ts` now serves all three
   layers (os + weekly + today's 3 on the operator-civil date) to
   ask-marcus, the weekly brief, and the pilot builder. Fleet-facing
   surfaces are untouched: the `goals` table name and ids,
   `agent_plans.weekly_goal_id`, and the `north_star` derived mirror.
9. **Typography commits to one system** on the touched surfaces:
   role-named fontSize tokens (additive), one `<Eyebrow>` primitive,
   Bricolage display titles, Geist body, Geist Mono numbers only, Fraunces
   off Home.

## Migration split (A live / B staged)

Migration A (`20260820120000_home_canon_recompose.sql`) is safe on apply:
the dropped tables were empty-or-near and their whole code surface left in
the same change set. Migration B (drop `goals` legacy columns +
`tasks.milestone_id`) is STAGED in
`scripts/migrations/2026-08-20-goals-legacy-columns-staged.sql` behind a
VPS check: 14 OpenClaw agents read `goals` on wake, and a column drop
would brick a strict reader silently. The in-repo code already neither
reads nor writes those columns.

## Consequences

- The `useObjectives`/`useWeeklyFocus`/`useObjectiveTree` hooks, the
  objectives component family, TrackStep/CloseStep/DailyDriver/FocusBar,
  and both dead Home branches are gone (≈5,000 lines net deleted).
- `servedSurfaces.ts` keeps its `milestones` reject vocabulary entry as
  history (the guard reads the vocabulary; the surface no longer renders).
- The n8n `propose-milestones` workflow writes a dropped table and must be
  disabled in n8n (ops step alongside Migration A). `focus-calibrate` is
  untouched.
