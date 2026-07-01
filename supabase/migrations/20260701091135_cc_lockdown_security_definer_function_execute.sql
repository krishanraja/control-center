-- Security hardening — Supabase advisors 0028 / 0029
-- (anon_/authenticated_security_definer_function_executable).
--
-- Privileged SECURITY DEFINER functions (refresh_agent_plans, marcus_daily_pull,
-- sync_audience_contact, mark_entity_emailed, audit_*, reconcile_*/route_vera_gaps,
-- etc.) run with the definer's elevated privileges and must NOT be callable with
-- the public anon key (which ships in the browser bundle). This revokes EXECUTE
-- from PUBLIC / anon / authenticated on every user-defined SECURITY DEFINER
-- function and re-grants it to service_role only.
--
-- Safe for the app:
--   * the Control Center frontend makes ZERO .rpc() calls (anon never invokes these);
--   * the /api layer and cron use the service role, preserved by the re-grant;
--   * triggers execute their function regardless of caller EXECUTE grants, so the
--     n8n webhook trigger (notify_n8n_orchestrator) and all other triggers keep firing.
-- Follows the existing precedent migration `autoscore_revoke_anon_execute`.
-- Extension functions excluded. Fully reversible (re-grant to anon/authenticated).
do $$
declare r record;
begin
  for r in
    select p.oid::regprocedure as sig
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.prokind = 'f' and p.prosecdef
      and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e')
  loop
    execute format('revoke execute on function %s from public, anon, authenticated', r.sig);
    execute format('grant execute on function %s to service_role', r.sig);
  end loop;
end $$;
