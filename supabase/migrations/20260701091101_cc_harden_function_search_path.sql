-- Security hardening — Supabase advisor 0011 (function_search_path_mutable).
--
-- Pins an explicit, safe search_path on every USER-DEFINED function that lacked
-- one (39 functions). Extension-owned functions (pgvector / http) are excluded —
-- they are managed by their extension and must not be altered here. Every
-- targeted function was audited to reference only `public` objects (no
-- cross-schema references), so `public, pg_temp` is behavior-preserving.
--
-- Applied to project gojpffsrxybbpbdzzrvs on 2026-07-01. Idempotent: re-running
-- only re-pins the same paths. Reversible via `alter function ... reset search_path`.
do $$
declare r record;
begin
  for r in
    select p.oid::regprocedure as sig
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.prokind = 'f'
      and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e')
      and not exists (select 1 from unnest(coalesce(p.proconfig, '{}')) c where c like 'search_path=%')
  loop
    execute format('alter function %s set search_path = public, pg_temp', r.sig);
  end loop;
end $$;
