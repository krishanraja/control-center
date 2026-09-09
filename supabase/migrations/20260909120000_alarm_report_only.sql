-- Stop audit_failure_patterns() writing corrections rows. Keep the detection.
--
-- Krish ruled on 2026-09-09: close the eleven pending silent_failure_pattern
-- rows as superseded, and turn this alarm type off. His reasoning, and it is
-- correct: it fires one row per workflow per week, nobody reads it, and an
-- alarm that reliably reports into a void is worse than no alarm because it
-- manufactures the feeling of monitoring.
--
-- The evidence for the ruling: eleven rows had been sitting at
-- approval_state='proposed' for up to seventeen days while the fleet they were
-- describing got worse. On 2026-09-09 the underlying silent_failures table held
-- more than twenty workflows logging runtime_failing with zero resolutions ever
-- recorded, six of them failing that same day. The alarm worked perfectly and
-- changed nothing.
--
-- What changes: the function no longer INSERTs into corrections and no longer
-- stamps resolution_note on the clustered rows. It still clusters and still
-- returns the same jsonb shape, so `Vera | Mindmaker OS | Failure Pattern
-- Sweep` (workflow 5fm6HXpMSQMjn0GJ, active) keeps calling it without error and
-- the clusters remain available on demand.
--
-- What does NOT change: silent_failures itself. That table is the useful signal
-- and is how the outage was found in the first place. Detection stays, the
-- automatic queue-filling goes.
--
-- Reversal: this file is a CREATE OR REPLACE. The original body is in
-- scripts/migrations/2026-05-22-pr6c-failure-patterns.sql and can be re-applied
-- verbatim to restore the writing behaviour.

begin;

create or replace function public.audit_failure_patterns()
returns jsonb
language plpgsql
security definer
as $fn$
declare
  r       record;
  results jsonb := '[]'::jsonb;
  slug    text;
begin
  -- Report only, since Krish's ruling of 2026-09-09. No corrections row is
  -- written and no silent_failures row is stamped.
  for r in
    select workflow_id,
           coalesce(max(workflow_name), workflow_id) as workflow_name,
           count(*)                                  as failure_count,
           min(detected_at)                          as first_at,
           max(detected_at)                          as last_at
      from public.silent_failures
     where detected_at > now() - interval '7 days'
       and tier in (2, 4)
       and resolved_at is null
     group by workflow_id
    having count(*) >= 3
  loop
    slug := lower(split_part(coalesce(r.workflow_name, ''), ' |', 1));
    if slug !~ '^(agatha|cleo|felix|maya|nell|nova|vera|zara|system)$' then
      slug := 'system';
    end if;

    results := results || jsonb_build_array(jsonb_build_object(
      'workflow_id',   r.workflow_id,
      'workflow_name', r.workflow_name,
      'agent',         slug,
      'failure_count', r.failure_count,
      'first_at',      r.first_at,
      'last_at',       r.last_at,
      'correction_id', null,
      'note',          'report only since 2026-09-09 (Krish ruling): this alarm no longer writes a corrections row'
    ));
  end loop;

  return results;
end;
$fn$;

-- Service role only. anon and authenticated cannot reach a SECURITY DEFINER
-- function, which would otherwise bypass the row level security tightened in
-- 20260909110000_revoke_anon_writes.sql. Verified before writing this: no
-- SECURITY DEFINER function in this schema that writes is anon-executable.
revoke execute on function public.audit_failure_patterns() from anon;
revoke execute on function public.audit_failure_patterns() from authenticated;
grant  execute on function public.audit_failure_patterns() to service_role;

commit;
