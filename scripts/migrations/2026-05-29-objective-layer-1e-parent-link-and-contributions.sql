-- Objective Layer, Phase 1, step 1e: parent link and contributions.
--
-- Two things in this step:
--
-- 1. Confirm the FK from agent_plans.weekly_goal_id to goals.id.
--    Grounding showed this FK already exists as
--    agent_plans_weekly_goal_id_fkey (ON DELETE SET NULL), but a guarded
--    block runs anyway so the migration is safe in environments where
--    the FK was somehow dropped or never created (e.g. a fresh branch).
--
-- 2. Create goal_agent_contributions, a many-to-many table linking an
--    objective to the agents that contribute to it. The single
--    weekly_goal_id pointer on agent_plans is a one-to-one path
--    (the agent's primary objective); contributions are the many-to-many
--    side (an objective can have several contributing agents, each with
--    a different contribution note).
--
-- Idempotent.

BEGIN;

-- 1. Confirm or add the parent-link FK.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'agent_plans_weekly_goal_id_fkey'
  ) THEN
    ALTER TABLE public.agent_plans
      ADD CONSTRAINT agent_plans_weekly_goal_id_fkey
      FOREIGN KEY (weekly_goal_id) REFERENCES public.goals(id)
      ON DELETE SET NULL;
    RAISE NOTICE 'Added missing agent_plans_weekly_goal_id_fkey.';
  ELSE
    RAISE NOTICE 'agent_plans_weekly_goal_id_fkey already present. No-op.';
  END IF;
END$$;

-- 2. goal_agent_contributions: many-to-many bridge.
CREATE TABLE IF NOT EXISTS public.goal_agent_contributions (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  goal_id            text NOT NULL REFERENCES public.goals(id) ON DELETE CASCADE,
  agent_id           text NOT NULL,
  contribution_note  text,
  created_at         timestamptz NOT NULL DEFAULT now(),
  UNIQUE (goal_id, agent_id)
);

CREATE INDEX IF NOT EXISTS goal_agent_contributions_goal_idx
  ON public.goal_agent_contributions (goal_id);

CREATE INDEX IF NOT EXISTS goal_agent_contributions_agent_idx
  ON public.goal_agent_contributions (agent_id);

-- RLS: standard pair.
ALTER TABLE public.goal_agent_contributions ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public'
      AND tablename='goal_agent_contributions'
      AND policyname='gac_anon_read'
  ) THEN
    CREATE POLICY gac_anon_read ON public.goal_agent_contributions
      FOR SELECT TO anon USING (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public'
      AND tablename='goal_agent_contributions'
      AND policyname='gac_service_all'
  ) THEN
    CREATE POLICY gac_service_all ON public.goal_agent_contributions
      FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
END$$;

COMMIT;
