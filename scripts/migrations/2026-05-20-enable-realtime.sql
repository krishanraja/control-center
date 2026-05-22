-- Enable Postgres realtime for tables the Control Center subscribes to.
-- Without these in `supabase_realtime`, useRealtimeLeads /
-- useRealtimeContentIdeas / useRealtimeTasks etc. silently degrade to a
-- one-shot fetch on mount — N8N writes never animate into the UI.
--
-- Found during 2026-05-20 end-to-end validation: only agent_plans was in
-- the publication. The drag-and-drop lead import and ⌘+I idea capture both
-- depend on realtime for the "cards appear in 2-5s" UX promised in the plan.
--
-- Idempotent.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND tablename='leads') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.leads;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND tablename='content_ideas') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.content_ideas;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND tablename='tasks') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.tasks;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND tablename='goals') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.goals;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND tablename='agents') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.agents;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND tablename='home_intelligence') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.home_intelligence;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND tablename='nova_target_conferences') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.nova_target_conferences;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND tablename='nell_candidates') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.nell_candidates;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND tablename='approvals') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.approvals;
  END IF;
END $$;
