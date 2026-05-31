-- Objective Layer, Phase 1, step 1f: helper RPCs.
--
-- Two read-only functions the Control Center and the agents will call:
--
--   get_objective_tree(p_goal_id text) returns the objective row plus
--     its milestones (ordered by sequence), each milestone enriched
--     with task_count and tasks_done counts. One round trip for the
--     full objective view.
--
--   count_active_objectives() returns the count of objectives with
--     status='active'. Drives the 6 to 10 soft-cap warning in the UI
--     (Phase 4) and any agent-side heuristic that wants to know how
--     many fronts Krish is fighting on.
--
-- Both are STABLE and read-only. Phase 1 ends here; nothing yet calls
-- these.
--
-- Idempotent via CREATE OR REPLACE.

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
          )
      )
    END;
$$;

CREATE OR REPLACE FUNCTION public.count_active_objectives()
RETURNS int
LANGUAGE sql
STABLE
AS $$
  SELECT count(*)::int FROM public.goals WHERE status = 'active';
$$;

-- Make sure anon can call both (matches the SELECT-only RLS posture on goals).
GRANT EXECUTE ON FUNCTION public.get_objective_tree(text)   TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.count_active_objectives()  TO anon, authenticated, service_role;
