-- audit-2026-05-26: restore anon-SELECT + service_role-ALL RLS policies on
-- visibility_targets and guests. Both tables had RLS enabled with 0 policies,
-- so the SPA's anon-key queries returned empty (Visibility + Guests tabs
-- appeared empty despite 12 visibility_targets + many guests in the DB).
--
-- Pattern matches every peer table (leads, tasks, content_ideas, agents).
-- Idempotent via DO blocks.

BEGIN;

DO $$ BEGIN
  CREATE POLICY visibility_targets_anon_read
    ON public.visibility_targets FOR SELECT TO anon USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY visibility_targets_service_role_all
    ON public.visibility_targets FOR ALL TO service_role USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY guests_anon_read
    ON public.guests FOR SELECT TO anon USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY guests_service_role_all
    ON public.guests FOR ALL TO service_role USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

COMMIT;
