-- Goal ladder integrity: capture the out-of-band objects, close the NULL
-- escape, and fix the health view's status vocabulary.
--
-- Three things were true in the live DB but in no migration file:
--
--   1. `goals_horizon_check` existed, but permitted NULL. Two readers
--      compensated in code -- api/goals/ladder.ts treats NULL as
--      venture_objective, api/objectives/index.ts filters
--      `horizon.eq.venture_objective,horizon.is.null` in three places. The
--      escape was for legacy rows that predate the ladder. There are none:
--      `goals` is empty. Both write paths already stamp a horizon
--      (api/goals.ts -> 'weekly'; api/objectives/index.ts -> validated or
--      'venture_objective'), so NOT NULL costs nothing and removes the
--      "belongs to no surface, shows up on all of them" failure mode.
--
--   2. `goals_health` existed but filtered
--      status IN ('active','in_progress','open','committed').
--      `goals_status_objective_check` only permits
--      ('proposed','active','paused','done','dropped'), so three of those
--      four values can never occur, and `proposed` -- every goal Marcus
--      nominates -- had no health row at all. api/goals/ladder.ts falls back
--      to `is_stale: false` when the row is missing, so a nomination could
--      sit for months and always report fresh.
--
--   3. Nothing recorded the judgment a goal was saved under.
--
-- Idempotent.

BEGIN;

-- 1. Horizon is mandatory. Backfill first so this is safe if a row ever
-- appears between planning and applying.
UPDATE public.goals SET horizon = 'venture_objective' WHERE horizon IS NULL;

ALTER TABLE public.goals DROP CONSTRAINT IF EXISTS goals_horizon_check;
ALTER TABLE public.goals
  ADD CONSTRAINT goals_horizon_check
  CHECK (horizon IN ('os', 'mid_term', 'weekly', 'venture_objective'));

ALTER TABLE public.goals ALTER COLUMN horizon SET NOT NULL;

-- 2. The judgment a goal was saved under, so an overridden goal stays
-- visibly overridden rather than becoming indistinguishable from a clean one.
ALTER TABLE public.goals
  ADD COLUMN IF NOT EXISTS gate_verdict    jsonb,
  ADD COLUMN IF NOT EXISTS gate_overridden boolean NOT NULL DEFAULT false;

-- 3. goals_health, on the real status vocabulary.
--
-- Covered: active (work in flight) and proposed (nominated, awaiting Krish) --
-- both are open items where age is a signal.
-- Not covered: paused (deliberately parked, so age is not decay), done, and
-- dropped. Those get no health row and the ladder's `?? false` fallback reads
-- them as not-stale, which is the correct answer for all three.
--
-- Thresholds are unchanged from the live definition.
CREATE OR REPLACE VIEW public.goals_health AS
  SELECT id,
         title,
         horizon,
         venture,
         status,
         priority,
         parent_id,
         updated_at,
         EXTRACT(day FROM now() - updated_at)::integer AS days_since_touch,
         CASE horizon
             WHEN 'weekly'            THEN 10
             WHEN 'venture_objective' THEN 30
             WHEN 'mid_term'          THEN 45
             WHEN 'os'                THEN 90
             ELSE 30
         END AS stale_after_days,
         EXTRACT(day FROM now() - updated_at)::integer >
         CASE horizon
             WHEN 'weekly'            THEN 10
             WHEN 'venture_objective' THEN 30
             WHEN 'mid_term'          THEN 45
             WHEN 'os'                THEN 90
             ELSE 30
         END AS is_stale,
         parent_id IS NULL AND horizon <> 'os' AS orphaned
    FROM public.goals g
   WHERE status IN ('active', 'proposed');

COMMIT;

NOTIFY pgrst, 'reload schema';
