-- Add skill_proposals to the realtime publication so the Control Center
-- decisions panel auto-refreshes when the Vera sweep writes a proposal or
-- Krish approves one. Guarded so re-runs are safe.
do $$ begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname='supabase_realtime' and schemaname='public' and tablename='skill_proposals'
  ) then
    execute 'alter publication supabase_realtime add table public.skill_proposals';
  end if;
end $$;
