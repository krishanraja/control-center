-- Home canon recompose (2026-08-20): the goal vocabulary reduces to two rungs
-- (os -> weekly), the subsystems that fell on top of it retire, and today's
-- picks gain an optional link to the weekly goal they serve.
--
-- Context: seven goal-shaped systems had accumulated (ladder, mission hero +
-- team_focus, venture objectives, milestones, weekly_focus slate/commit, daily
-- focus, capacity targets). The recompose commits to ONE canon — OS goals ->
-- this week's objectives -> today's 3 — and this migration retires the stores
-- the code no longer reads. mid_term and venture_objective had ZERO rows;
-- milestones / weekly_focus / weekly_focus_milestones / goal_agent_contributions
-- were empty or near-empty and their entire read/write surface was removed in
-- the same change set (api/weekly-focus/*, api/milestones/*, the objectives
-- voice/nominate-milestone arms, useObjectives/useWeeklyFocus).
--
-- KEPT on purpose: system_config.north_star (derived mirror for readers
-- outside the repo — OpenClaw agents, n8n), the goals table name and ids
-- (agent_plans.weekly_goal_id FKs into it and the fleet reads it on wake),
-- and every goals row. The legacy goals columns (owner, week_of, target,
-- current, progress) are NOT dropped here — that is the separate STAGED
-- migration (scripts/migrations/2026-08-20-goals-legacy-columns-staged.sql),
-- applied only after the OpenClaw wake queries are verified on the VPS.

-- ── 0. Safety: the retired horizons must actually be empty ──────────────────
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.goals WHERE horizon IN ('mid_term','venture_objective')) THEN
    RAISE EXCEPTION 'goals still has mid_term/venture_objective rows; move or retire them before tightening the canon';
  END IF;
  IF EXISTS (SELECT 1 FROM public.goals WHERE horizon IS NULL) THEN
    RAISE EXCEPTION 'goals has NULL-horizon rows; assign them before tightening the canon';
  END IF;
END $$;

-- ── 1. Two-rung horizon vocabulary ──────────────────────────────────────────
ALTER TABLE public.goals DROP CONSTRAINT IF EXISTS goals_horizon_check;
ALTER TABLE public.goals ADD CONSTRAINT goals_horizon_check
  CHECK (horizon IN ('os','weekly'));

-- ── 2. A weekly goal serves an existing OS goal (belt + braces) ─────────────
-- The API enforces this (api/objectives/index.ts); the trigger makes it true
-- for every writer, including ones outside this repo.
CREATE OR REPLACE FUNCTION public.goals_validate_parent()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  parent_horizon text;
BEGIN
  IF NEW.horizon = 'weekly' THEN
    IF NEW.parent_id IS NULL THEN
      RAISE EXCEPTION 'a weekly goal needs a parent_id: which OS goal does it serve?';
    END IF;
    SELECT horizon INTO parent_horizon FROM public.goals WHERE id = NEW.parent_id;
    IF parent_horizon IS DISTINCT FROM 'os' THEN
      RAISE EXCEPTION 'a weekly goal must serve an OS goal (parent % has horizon %)', NEW.parent_id, parent_horizon;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS goals_parent_guard ON public.goals;
CREATE TRIGGER goals_parent_guard
  BEFORE INSERT OR UPDATE OF parent_id, horizon ON public.goals
  FOR EACH ROW EXECUTE FUNCTION public.goals_validate_parent();

-- ── 3. goals_health on the two-rung cadence ─────────────────────────────────
-- weekly stale after 10 untouched days; os after 90. Same orphan rule.
CREATE OR REPLACE VIEW public.goals_health AS
  SELECT
    id, title, horizon, venture, status, priority, parent_id, updated_at,
    EXTRACT(day FROM now() - updated_at)::int AS days_since_touch,
    CASE horizon WHEN 'weekly' THEN 10 ELSE 90 END AS stale_after_days,
    EXTRACT(day FROM now() - updated_at)::int
      > CASE horizon WHEN 'weekly' THEN 10 ELSE 90 END AS is_stale,
    (parent_id IS NULL AND horizon <> 'os') AS orphaned
  FROM public.goals
  WHERE status IN ('active','proposed');

-- ── 4. Today's picks may name the weekly goal they serve ────────────────────
-- The canon chain made explicit: OS -> week -> today. Optional (free daily
-- picks stay legal); ON DELETE SET NULL so retiring a goal never breaks a day.
ALTER TABLE public.daily_focus
  ADD COLUMN IF NOT EXISTS target_1_goal_id text REFERENCES public.goals(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS target_2_goal_id text REFERENCES public.goals(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS target_3_goal_id text REFERENCES public.goals(id) ON DELETE SET NULL;

-- ── 5. Retired subsystem tables ─────────────────────────────────────────────
-- Children before parents. `milestones CASCADE` also clears the
-- tasks.milestone_id FK constraint; that column stays (inert) until the staged
-- legacy-columns migration.
DROP TABLE IF EXISTS public.weekly_focus_milestones;
DROP TABLE IF EXISTS public.weekly_focus;
DROP TABLE IF EXISTS public.goal_agent_contributions;
DROP TABLE IF EXISTS public.milestones CASCADE;
DROP TABLE IF EXISTS public.goals_archive_2026_04;

-- ── 6. Retired config keys ──────────────────────────────────────────────────
-- team_focus: the weekly rung IS "what is this week about" (writes now 400).
-- mrr_goal_usd / mrr_goal_label: a revenue target belongs on the ladder,
-- judged by the gate, not in a display setting. north_star is NOT deleted:
-- it is the derived mirror kept for readers outside the repo.
DELETE FROM public.system_config
  WHERE key IN ('team_focus','mrr_goal_usd','mrr_goal_label');
