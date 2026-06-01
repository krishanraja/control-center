-- Objective Layer, Phase 6: objective-altitude review + OS-vs-you split.
--
-- Three milestone columns let Marcus express, per milestone, what the OS can
-- drive automatically vs what needs Krish, and whether the milestone is a real
-- weekly accomplishment (vs a task that leaked up a level):
--
--   owner_split          jsonb  { "os": [{ "agent": "nell", "does": "..." }],
--                                 "krish": ["the booking calls"] }
--   is_accomplishment    bool   false => task-altitude; excluded from the weekly
--                                slate so "Consolidate & score leads" style chores
--                                never masquerade as a week's move.
--   auto_executable_pct  int    0..100, rough share the OS can do unattended.
--
-- Also extends get_objective_tree to surface those columns PLUS the objective's
-- contributing agents (goal_agent_contributions) -- populated since Phase 1e but
-- never read until now. One round trip still powers the whole objective view.
--
-- Idempotent: ADD COLUMN IF NOT EXISTS + CREATE OR REPLACE.

BEGIN;

ALTER TABLE public.milestones
  ADD COLUMN IF NOT EXISTS owner_split         jsonb,
  ADD COLUMN IF NOT EXISTS is_accomplishment   boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS auto_executable_pct int;

-- The weekly-slate read: accomplishment-altitude milestones eligible to commit.
CREATE INDEX IF NOT EXISTS milestones_slate_idx
  ON public.milestones (goal_id, sequence)
  WHERE is_accomplishment AND status IN ('proposed','accepted','active');

-- Extend the objective tree: new milestone columns flow through via to_jsonb(mr);
-- contributions are added as a third top-level key.
CREATE OR REPLACE FUNCTION public.get_objective_tree(p_goal_id text)
RETURNS jsonb
LANGUAGE sql
STABLE
AS $$
  WITH milestone_rows AS (
    SELECT
      m.id,
      m.title,
      m.description,
      m.sequence,
      m.status,
      m.source,
      m.est_deep_work_hours,
      m.proposed_at,
      m.accepted_at,
      m.completed_at,
      m.marcus_reasoning,
      m.concept_id,
      m.created_at,
      m.updated_at,
      m.owner_split,
      m.is_accomplishment,
      m.auto_executable_pct,
      (
        SELECT count(*)
          FROM public.tasks t
         WHERE t.milestone_id = m.id
      ) AS task_count,
      (
        SELECT count(*)
          FROM public.tasks t
         WHERE t.milestone_id = m.id
           AND t.status = 'done'
      ) AS tasks_done
    FROM public.milestones m
    WHERE m.goal_id = p_goal_id
    ORDER BY m.sequence ASC, m.created_at ASC
  ),
  objective_row AS (
    SELECT g.* FROM public.goals g WHERE g.id = p_goal_id
  ),
  contribution_rows AS (
    SELECT c.agent_id, c.contribution_note
      FROM public.goal_agent_contributions c
     WHERE c.goal_id = p_goal_id
     ORDER BY c.created_at ASC
  )
  SELECT
    CASE
      WHEN NOT EXISTS (SELECT 1 FROM objective_row) THEN NULL
      ELSE jsonb_build_object(
        'objective', to_jsonb((SELECT o FROM objective_row o)),
        'milestones',
          COALESCE(
            (SELECT jsonb_agg(to_jsonb(mr)) FROM milestone_rows mr),
            '[]'::jsonb
          ),
        'contributions',
          COALESCE(
            (SELECT jsonb_agg(to_jsonb(cr)) FROM contribution_rows cr),
            '[]'::jsonb
          )
      )
    END;
$$;

GRANT EXECUTE ON FUNCTION public.get_objective_tree(text) TO anon, authenticated, service_role;

COMMIT;
