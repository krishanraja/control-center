-- PR 6c: audit_failure_patterns() : Vera's Tier 3 consumption side.
-- Clusters silent_failures by workflow_id over the past 7 days. For any
-- workflow with >= 3 unresolved silent failures, writes a corrections row
-- with approval_state='proposed' so Krish can approve in the Org tab.

BEGIN;

CREATE OR REPLACE FUNCTION public.audit_failure_patterns()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $fn$
DECLARE
  r              RECORD;
  results        jsonb := '[]'::jsonb;
  new_correction uuid;
  brief_edit     text;
  agent_slug     text;
BEGIN
  FOR r IN
    SELECT workflow_id,
           coalesce(max(workflow_name), workflow_id) AS workflow_name,
           count(*)                                  AS failure_count,
           array_agg(id)                              AS failure_ids,
           min(detected_at)                          AS first_at,
           max(detected_at)                          AS last_at
      FROM public.silent_failures
     WHERE detected_at > now() - interval '7 days'
       AND tier IN (2, 4)
       AND resolved_at IS NULL
     GROUP BY workflow_id
    HAVING count(*) >= 3
  LOOP
    -- Don't re-propose if there's already a proposed correction for this workflow this week
    IF EXISTS (
      SELECT 1 FROM public.corrections
       WHERE pattern_extracted   = ('workflow:' || r.workflow_id)
         AND approval_state      = 'proposed'
         AND coalesce(created_at, now()) > now() - interval '7 days'
    ) THEN
      CONTINUE;
    END IF;

    -- Pick agent from workflow name prefix when present (e.g. "Nell | ...", "Cleo | ...")
    agent_slug := lower(split_part(coalesce(r.workflow_name, ''), ' |', 1));
    IF agent_slug !~ '^(agatha|cleo|felix|maya|nell|nova|vera|zara|system)$' THEN
      agent_slug := 'system';
    END IF;

    brief_edit := format(
      'Workflow "%s" has produced %s silent failures in the past 7 days (first: %s, last: %s). Investigate the root cause: are extractor prompts failing the contract, are upstream signals empty, or is the workflow firing on schedules with no real input? Add a fallback path or tighten the input filter so the workflow either produces useful work or fails loudly.',
      r.workflow_name, r.failure_count,
      to_char(r.first_at, 'YYYY-MM-DD HH24:MI UTC'),
      to_char(r.last_at,  'YYYY-MM-DD HH24:MI UTC')
    );

    INSERT INTO public.corrections (
      detection_source, agent_id, correction_type,
      pattern_extracted, pattern_reason_code, proposed_brief_edit,
      approval_state, confidence, status, detected_at
    )
    VALUES (
      'vera-failure-pattern', agent_slug, 'silent_failure_pattern',
      'workflow:' || r.workflow_id,
      'silent_success_repeated',
      brief_edit,
      'proposed', 0.85, 'pending', now()
    )
    RETURNING id INTO new_correction;

    -- Mark the silent_failures as having contributed to a correction by stamping resolution_note.
    -- Leave resolved_at NULL until Krish approves the correction.
    UPDATE public.silent_failures
       SET resolution_note = coalesce(resolution_note, '') ||
                              format(' [batched into correction %s]', new_correction)
     WHERE id = ANY(r.failure_ids);

    results := results || jsonb_build_array(jsonb_build_object(
      'correction_id', new_correction,
      'workflow_id',   r.workflow_id,
      'workflow_name', r.workflow_name,
      'agent',         agent_slug,
      'failure_count', r.failure_count
    ));
  END LOOP;

  RETURN results;
END;
$fn$;

GRANT EXECUTE ON FUNCTION public.audit_failure_patterns() TO anon, authenticated, service_role;

COMMIT;
