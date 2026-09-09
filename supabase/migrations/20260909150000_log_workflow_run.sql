-- Create public.log_workflow_run, which one workflow has been calling for months
-- and which has never existed.
--
-- Found 2026-09-09 while auditing detection coverage. The caller is
-- "System | Mindmaker OS | Silent Success Detector" (F6srw1yE9uH67q14), which
-- POSTs to /rest/v1/rpc/log_workflow_run at the end of every run. There is no
-- such function. There is no function in this schema with "workflow" in its
-- name at all.
--
-- So the workflow whose entire job is to catch jobs that run and do nothing has
-- itself been running and doing nothing, and could not even record that it ran.
-- That is the circular failure this estate keeps producing, in its purest form.
--
-- Signature taken from the caller's own body rather than invented:
--   {"p_workflow_id": "...", "p_status": "success", "p_outcome": "audit complete"}
--
-- workflow_runs.agent_id is NOT NULL with no default, so the function derives it
-- from the workflow name prefix the fleet already uses ("Vera | ...", "Cleo | ..."),
-- falling back to 'system'. The name is looked up from the most recent prior run
-- for that id, so callers keep passing only the three arguments they already pass.
--
-- SECURITY INVOKER deliberately, not DEFINER. The caller authenticates with an
-- n8n stored credential whose key cannot be read through the n8n API, so it may
-- be the anon key. A definer function would let an anonymous caller write rows
-- that row level security would otherwise refuse, which is exactly the hole
-- closed in 20260909110000 earlier today. As an invoker function it inherits the
-- caller's privileges and the existing policies on workflow_runs decide, so this
-- adds no capability that the table does not already grant.

begin;

create or replace function public.log_workflow_run(
  p_workflow_id text,
  p_status      text default 'success',
  p_outcome     text default null
)
returns bigint
language plpgsql
security invoker
as $fn$
declare
  v_name  text;
  v_agent text;
  v_id    bigint;
begin
  if p_workflow_id is null or length(trim(p_workflow_id)) = 0 then
    raise exception 'log_workflow_run requires p_workflow_id';
  end if;

  -- Reuse the name this workflow was last seen under. A heartbeat should not
  -- have to know its own display name, and the fleet renames workflows freely.
  -- Prefer the last name this workflow ran under; fall back to workflow_health,
  -- which is the externally reconciled register and carries a name even for a
  -- workflow that has never logged a run. Without the fallback the very first
  -- heartbeat from any workflow lands nameless, which is precisely the run you
  -- most want to be able to read later. Verified: the first live call returned a
  -- row with workflow_name null, the second with the name resolved.
  select workflow_name into v_name
    from public.workflow_runs
   where workflow_id = p_workflow_id and workflow_name is not null
   order by run_at desc nulls last limit 1;

  if v_name is null then
    select workflow_name into v_name
      from public.workflow_health
     where workflow_id = p_workflow_id and workflow_name is not null
     limit 1;
  end if;

  v_agent := lower(split_part(coalesce(v_name, ''), ' |', 1));
  if v_agent !~ '^(agatha|arlo|cleo|felix|hunter|kai|leo|marcus|maya|nell|nova|priya|vera|zara|system)$' then
    v_agent := 'system';
  end if;

  insert into public.workflow_runs (workflow_id, workflow_name, agent_id, status, outcome)
  values (p_workflow_id, v_name, v_agent, coalesce(p_status, 'success'), p_outcome)
  returning id into v_id;

  return v_id;
end;
$fn$;

comment on function public.log_workflow_run(text, text, text) is
  'Heartbeat for an n8n workflow run. Created 2026-09-09 after an audit found the Silent Success Detector had been calling a function that never existed. SECURITY INVOKER on purpose: policies on workflow_runs decide, not this function.';

grant execute on function public.log_workflow_run(text, text, text) to anon, authenticated, service_role;

commit;
