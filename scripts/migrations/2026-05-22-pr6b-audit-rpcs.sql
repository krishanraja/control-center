-- PR 6b: audit RPCs (Tier 2 silent-success detection + Tier 4 critical infra ping).
-- Both functions return JSON arrays of any newly-detected failures and ALSO insert
-- rows into silent_failures. Idempotent within their own detection window.

BEGIN;

-- ------------------------------------------------------------------
-- audit_silent_failures(): Tier 2.
-- For each active contract, count successful workflow_runs in last 4h
-- vs target_table rows with all required_fields populated in same window.
-- If runs >= 1 and useful_rows == 0, insert a silent_failures row.
-- Returns a jsonb array of newly-inserted failures.
-- ------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.audit_silent_failures()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $fn$
DECLARE
  c               RECORD;
  rec_runs        integer;
  rec_rows        integer;
  field           text;
  where_parts     text[];
  dyn_sql         text;
  results         jsonb := '[]'::jsonb;
  new_failure_id  uuid;
BEGIN
  FOR c IN SELECT * FROM public.completeness_contracts WHERE active LOOP
    SELECT count(*) INTO rec_runs
      FROM public.workflow_runs
     WHERE workflow_id = c.workflow_id
       AND status      = 'success'
       AND run_at      > now() - interval '4 hours';

    where_parts := ARRAY['created_at > now() - interval ''4 hours'''];
    FOREACH field IN ARRAY c.required_fields LOOP
      where_parts := where_parts || (quote_ident(field) || ' IS NOT NULL');
    END LOOP;

    BEGIN
      dyn_sql := 'SELECT count(*) FROM public.' || quote_ident(c.target_table)
              || ' WHERE ' || array_to_string(where_parts, ' AND ');
      EXECUTE dyn_sql INTO rec_rows;
    EXCEPTION WHEN OTHERS THEN
      rec_rows := -1;
    END;

    IF rec_runs >= 1 AND rec_rows = 0 THEN
      IF NOT EXISTS (
        SELECT 1 FROM public.silent_failures
         WHERE workflow_id = c.workflow_id
           AND tier        = 2
           AND resolved_at IS NULL
           AND detected_at > now() - interval '4 hours'
      ) THEN
        INSERT INTO public.silent_failures
          (workflow_id, workflow_name, tier, failure_type, detail, run_count)
        VALUES
          (c.workflow_id, c.workflow_name, 2, 'silent_success',
           format('Workflow ran %s times in last 4h but wrote 0 useful rows to %s', rec_runs, c.target_table),
           rec_runs)
        RETURNING id INTO new_failure_id;

        results := results || jsonb_build_array(jsonb_build_object(
          'id',            new_failure_id,
          'workflow_id',   c.workflow_id,
          'workflow_name', c.workflow_name,
          'target_table',  c.target_table,
          'runs',          rec_runs,
          'useful_rows',   rec_rows
        ));
      END IF;
    END IF;
  END LOOP;

  RETURN results;
END;
$fn$;

GRANT EXECUTE ON FUNCTION public.audit_silent_failures() TO anon, authenticated, service_role;

-- ------------------------------------------------------------------
-- audit_critical_infra(): Tier 4.
-- Reads from system_health (live ping table; populated by Workflow Monitor
-- and other surfaces). Any component with status='failing' or 'critical'
-- triggers a tier 4 silent_failure, idempotent within 5m. Stale rows
-- (last_check older than 30m) are also tier 4.
-- ------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.audit_critical_infra()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $fn$
DECLARE
  r               RECORD;
  results         jsonb := '[]'::jsonb;
  new_failure_id  uuid;
  detail_msg      text;
BEGIN
  FOR r IN
    SELECT component, status, last_check, details, message
      FROM public.system_health
     WHERE status IN ('failing','critical','down')
       AND last_check > now() - interval '24 hours'
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM public.silent_failures
       WHERE workflow_id = 'infra:' || r.component
         AND tier        = 4
         AND resolved_at IS NULL
         AND detected_at > now() - interval '5 minutes'
    ) THEN
      detail_msg := coalesce(r.message, 'component ' || r.component || ' status=' || r.status);
      INSERT INTO public.silent_failures
        (workflow_id, workflow_name, tier, failure_type, detail, run_count)
      VALUES
        ('infra:' || r.component, 'Critical infra: ' || r.component, 4, 'critical_infra_down', detail_msg, 1)
      RETURNING id INTO new_failure_id;

      results := results || jsonb_build_array(jsonb_build_object(
        'id',         new_failure_id,
        'component',  r.component,
        'status',     r.status,
        'last_check', r.last_check,
        'detail',     detail_msg
      ));
    END IF;
  END LOOP;

  RETURN results;
END;
$fn$;

GRANT EXECUTE ON FUNCTION public.audit_critical_infra() TO anon, authenticated, service_role;

COMMIT;
