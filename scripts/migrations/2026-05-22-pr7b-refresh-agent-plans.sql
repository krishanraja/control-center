-- PR 7b: refresh_agent_plans() RPC.
-- For each agent_plans row, compute activity in last 7d from workflow_runs and
-- tasks, and append a "Snapshot {date}: ..." line into next_milestone so the
-- plan is no longer frozen at the April 22 snapshot. Sets updated_at +
-- last_rendered_at. Returns jsonb array of per-agent summaries.

BEGIN;

CREATE OR REPLACE FUNCTION public.refresh_agent_plans()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $fn$
DECLARE
  ap                RECORD;
  successes_7d      integer;
  failures_7d       integer;
  tasks_completed_7d integer;
  tasks_open_now    integer;
  silent_failures_7d integer;
  snapshot_line     text;
  results           jsonb := '[]'::jsonb;
BEGIN
  FOR ap IN SELECT * FROM public.agent_plans LOOP
    SELECT count(*) INTO successes_7d
      FROM public.workflow_runs
     WHERE coalesce(agent_id, '') = ap.agent_id
       AND status = 'success'
       AND run_at > now() - interval '7 days';

    SELECT count(*) INTO failures_7d
      FROM public.workflow_runs
     WHERE coalesce(agent_id, '') = ap.agent_id
       AND status IN ('error','failed','failure')
       AND run_at > now() - interval '7 days';

    SELECT count(*) INTO tasks_completed_7d
      FROM public.tasks
     WHERE coalesce(agent, owner) = ap.agent_id
       AND status = 'completed'
       AND coalesce(completed_at, updated_at) > now() - interval '7 days';

    SELECT count(*) INTO tasks_open_now
      FROM public.tasks
     WHERE coalesce(agent, owner) = ap.agent_id
       AND status IN ('waiting','in_progress','blocked','new');

    SELECT count(*) INTO silent_failures_7d
      FROM public.silent_failures sf
      JOIN public.completeness_contracts cc ON cc.workflow_id = sf.workflow_id
     WHERE lower(coalesce(cc.workflow_name, '')) LIKE lower('%' || ap.agent_id || '%')
       AND sf.detected_at > now() - interval '7 days'
       AND sf.resolved_at IS NULL;

    snapshot_line := format(
      'Snapshot %s: %s successful runs, %s failed runs, %s tasks completed, %s tasks open, %s unresolved silent failures (last 7d).',
      to_char(now(), 'YYYY-MM-DD'),
      successes_7d, failures_7d, tasks_completed_7d, tasks_open_now, silent_failures_7d
    );

    UPDATE public.agent_plans
       SET next_milestone   = coalesce(next_milestone || E'\n\n', '') || snapshot_line,
           updated_at       = now(),
           last_rendered_at = now(),
           last_rendered_by = 'refresh_agent_plans',
           blockers         = CASE
                                WHEN silent_failures_7d > 0 THEN
                                  format('%s unresolved silent failure(s) attributed to %s workflows. See silent_failures table.', silent_failures_7d, ap.agent_id)
                                WHEN failures_7d > 0 AND successes_7d = 0 THEN
                                  format('All %s workflow runs in last 7d failed. Investigate before next scheduled run.', failures_7d)
                                ELSE NULL
                              END
     WHERE agent_id = ap.agent_id;

    results := results || jsonb_build_array(jsonb_build_object(
      'agent_id',            ap.agent_id,
      'successful_runs_7d',  successes_7d,
      'failed_runs_7d',      failures_7d,
      'tasks_completed_7d',  tasks_completed_7d,
      'tasks_open_now',      tasks_open_now,
      'silent_failures_7d',  silent_failures_7d
    ));
  END LOOP;

  RETURN results;
END;
$fn$;

GRANT EXECUTE ON FUNCTION public.refresh_agent_plans() TO anon, authenticated, service_role;

COMMIT;
