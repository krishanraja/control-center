-- Weekly cadence for the goal canon (2026-09-08).
--
-- Before this, "which week does this objective belong to" was a heuristic in
-- the browser: a weekly row touched inside the current ISO week counted as
-- this week's. Nothing closed a week, nothing recorded whether an objective
-- was done or missed, and old objectives lingered on Home tagged "from last
-- week" until someone dropped them by hand.
--
-- Three things change, all reversible by status and none of them deletes:
--   1. goals.week_start: the Monday of the operator's civil week the objective
--      was set for. Written by POST /api/objectives; the Carry action clones a
--      missed row into the new week rather than moving it, so the old row
--      keeps its outcome.
--   2. status 'missed': what a Saturday close (api/goals/week-close.ts) writes
--      on a weekly objective still active when its week ended. Done stays
--      done. The goals table IS the archive; the ladder simply stops reading
--      missed rows.
--   3. closed_at and carried_from: when the week closed the row, and which
--      row a carried objective came from, so a week's history can be traced.
--
-- goals_health keeps its filter (active, proposed), so a missed row is never
-- flagged stale and never counts as an orphan.

-- 1. Columns --------------------------------------------------------------
ALTER TABLE public.goals
  ADD COLUMN IF NOT EXISTS week_start date,
  ADD COLUMN IF NOT EXISTS closed_at timestamptz,
  ADD COLUMN IF NOT EXISTS carried_from text REFERENCES public.goals(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS goals_horizon_week_start_idx
  ON public.goals (horizon, week_start);

-- 2. The status vocabulary gains 'missed' ---------------------------------
-- Keep in step with ALLOWED_STATUS in api/goals.ts and api/objectives/index.ts.
ALTER TABLE public.goals DROP CONSTRAINT IF EXISTS goals_status_objective_check;
ALTER TABLE public.goals ADD CONSTRAINT goals_status_objective_check
  CHECK (status IN ('proposed','active','paused','done','dropped','missed'));

-- 3. Backfill week_start for existing weekly rows -------------------------
-- The Monday of the operator's civil week the row was activated (or created)
-- in. public.operator_tz() is the same setting the API and the browser read.
UPDATE public.goals
   SET week_start = (
     date_trunc('week', (COALESCE(activated_at, created_at) AT TIME ZONE public.operator_tz()))
   )::date
 WHERE horizon = 'weekly'
   AND week_start IS NULL;

-- 4. Any weekly row still active from a week that has already ended is
--    closed as missed, so the first Saturday run starts from a clean ledger.
UPDATE public.goals
   SET status = 'missed',
       closed_at = now(),
       updated_at = now()
 WHERE horizon = 'weekly'
   AND status = 'active'
   AND week_start IS NOT NULL
   AND week_start < (date_trunc('week', (now() AT TIME ZONE public.operator_tz())))::date;

COMMENT ON COLUMN public.goals.week_start IS
  'Weekly rows only: the Monday (operator civil week) this objective was set for. api/_week.ts weekStartIn.';
COMMENT ON COLUMN public.goals.closed_at IS
  'When the Saturday close (api/goals/week-close.ts) sealed this row, or when a done row was closed.';
COMMENT ON COLUMN public.goals.carried_from IS
  'Weekly rows only: the missed row this objective was carried from, when the Monday ritual carried it.';
