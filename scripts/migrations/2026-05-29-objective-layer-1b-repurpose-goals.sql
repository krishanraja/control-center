-- Objective Layer, Phase 1, step 1b: repurpose the now-empty goals table
-- into the portfolio objective table.
--
-- Why repurpose instead of creating a new objectives table:
-- agent_plans.weekly_goal_id is already an FK to goals(id), and the agent
-- operating contract at /root/.openclaw/CLAUDE.md already tells every
-- agent to read goals on wake. The rail exists; nothing ever populated
-- it. Repurposing means the 14 agents see the objective layer the moment
-- it has data, with zero brief edits required for the wiring itself.
--
-- The legacy semantic columns (target, current, progress, notes, owner,
-- week_of) are left in place. They are no longer the canonical objective
-- fields but removing them is a separate, riskier change that this phase
-- does not need. The new objective columns are what readers consult.
--
-- Idempotent.

BEGIN;

-- 1. New columns describing a portfolio objective.
ALTER TABLE public.goals
  ADD COLUMN IF NOT EXISTS venture            text,
  ADD COLUMN IF NOT EXISTS objective_kind     text,
  ADD COLUMN IF NOT EXISTS definition_of_done text,
  ADD COLUMN IF NOT EXISTS why_now            text,
  ADD COLUMN IF NOT EXISTS target_horizon     date,
  ADD COLUMN IF NOT EXISTS primary_kpi        text,
  ADD COLUMN IF NOT EXISTS secondary_kpi      text,
  ADD COLUMN IF NOT EXISTS is_auto            boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS priority           int,
  ADD COLUMN IF NOT EXISTS created_by         text    NOT NULL DEFAULT 'krish',
  ADD COLUMN IF NOT EXISTS source             text    NOT NULL DEFAULT 'krish_declared',
  ADD COLUMN IF NOT EXISTS concept_id         text,
  ADD COLUMN IF NOT EXISTS activated_at       timestamptz,
  ADD COLUMN IF NOT EXISTS completed_at       timestamptz;

-- 2. Status vocabulary for objectives. The legacy default 'active' is
-- preserved by the existing column default; the new CHECK constrains
-- writes to the canonical objective lifecycle.
--
-- Locked statuses: proposed (Marcus nominated, awaiting Krish),
-- active (Krish accepted, work in flight), paused (parked but alive),
-- done (completed), dropped (rejected or abandoned).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'goals_status_objective_check'
  ) THEN
    ALTER TABLE public.goals
      ADD CONSTRAINT goals_status_objective_check
      CHECK (status IN ('proposed','active','paused','done','dropped'));
  END IF;
END$$;

-- 3. source vocabulary CHECK. Two writers today: Krish authored (default)
-- and Marcus nominated. Tomorrow Agatha decomposed may join when auto
-- objectives land; the constraint is permissive enough to add via a
-- later guarded ALTER without breaking rows.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'goals_source_check'
  ) THEN
    ALTER TABLE public.goals
      ADD CONSTRAINT goals_source_check
      CHECK (source IN ('krish_declared','marcus_nominated','agatha_decomposed'));
  END IF;
END$$;

-- 4. Indexes for the queries the Home tab and the agents will run.
--   goals_status_priority_idx: the active list ordered by Krish's priority.
--   goals_venture_idx: per-venture rollups.
--   goals_concept_id_idx: cross-link to concept identity when present.
CREATE INDEX IF NOT EXISTS goals_status_priority_idx
  ON public.goals (status, priority ASC NULLS LAST)
  WHERE status = 'active';

CREATE INDEX IF NOT EXISTS goals_venture_idx
  ON public.goals (venture);

CREATE INDEX IF NOT EXISTS goals_concept_id_idx
  ON public.goals (concept_id);

-- 5. RLS: anon SELECT already exists (anon_read_goals). Service-role ALL
-- is the standard convention on newer tables (customers, bets, etc.)
-- and is missing here. Add it guarded.
ALTER TABLE public.goals ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='goals' AND policyname='goals_service_all'
  ) THEN
    CREATE POLICY goals_service_all ON public.goals
      FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
END$$;

-- 6. updated_at trigger. The shared touch function is public.tg_set_updated_at()
-- (defined in 2026-05-22-pr5-leads-multitag-venture.sql, reused across newer
-- tables). The legacy goals table did not have one because nothing wrote to it.
DROP TRIGGER IF EXISTS goals_set_updated_at ON public.goals;
CREATE TRIGGER goals_set_updated_at
  BEFORE UPDATE ON public.goals
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

COMMIT;
