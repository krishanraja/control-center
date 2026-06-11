-- 2026-06-11 — Content Engine auto-score trigger.
-- Applied to project gojpffsrxybbpbdzzrvs via Supabase Management API (migration
-- name: content_autoscore_trigger). Recorded here for diff review / recovery.
--
-- When a content_ideas row first gets a draft body and has not been scored, fire
-- the Five Standards gate asynchronously via pg_net -> /api/content-ideas/:id/score
-- with model=haiku (MT-003 cost-safe). Fires once: never re-runs while quality_score
-- stays set, so re-edits don't churn LLM spend. Manual re-score (Sonnet) remains
-- available via the Standards button in the Content Engine panel.

create or replace function public.autoscore_content_idea()
returns trigger
language plpgsql
security definer
set search_path = public, net
as $$
begin
  if NEW.body is not null
     and length(btrim(NEW.body)) > 40
     and NEW.quality_score is null
     and (TG_OP = 'INSERT' or NEW.body is distinct from OLD.body)
  then
    perform net.http_post(
      url := 'https://controlcenter.krishraja.com/api/content-ideas/' || NEW.id::text || '/score',
      body := jsonb_build_object('model', 'haiku'),
      headers := jsonb_build_object('Content-Type', 'application/json'),
      timeout_milliseconds := 8000
    );
  end if;
  return NEW;
end;
$$;

drop trigger if exists trg_autoscore_content_idea on public.content_ideas;
create trigger trg_autoscore_content_idea
  after insert or update of body on public.content_ideas
  for each row execute function public.autoscore_content_idea();

-- Harden: the SECURITY DEFINER function is otherwise exposed by PostgREST as a
-- callable RPC to anon. Trigger functions fire under the owner context regardless
-- of EXECUTE grants, so revoking removes the API exposure without affecting the
-- trigger (Supabase linter 0028_anon_security_definer_function_executable).
revoke execute on function public.autoscore_content_idea() from anon, authenticated, public;
