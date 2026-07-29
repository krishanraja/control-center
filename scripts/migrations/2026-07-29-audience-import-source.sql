-- Parameterize the Substack CSV import for both publications.
--
-- audience_import_proxy previously hardcoded source='mindmaker_live'. With
-- tech0nomic.substack.com joining the audience pipeline, the source becomes a
-- parameter (default preserves the old behaviour for existing callers).
--
-- EXTERNAL DEPENDENCY (flagged in the PR): the app-DB edge function
-- `import-audience-csv` (project bkyuxvschuwngtcdhsyg, not this repo) must
-- honor the `source` field it already receives, and `sync_audience_contact`
-- must map 'tech0nomic' to a product/venture. Until that lands, tech0nomic
-- imports are rejected at the edge function; mindmaker_live imports are
-- unaffected. Scoreboard counts do not depend on this path (they come from the
-- public-count snapshot cron).

drop function if exists public.audience_import_proxy(text);

create or replace function public.audience_import_proxy(p_csv text, p_source text default 'mindmaker_live')
returns jsonb language plpgsql security definer set search_path = public as $fn$
declare
  v_secret text := (select decrypted_secret from vault.decrypted_secrets where name = 'audience_import_secret');
  v_url text := 'https://bkyuxvschuwngtcdhsyg.supabase.co/functions/v1/import-audience-csv';
  v_resp public.http_response;
  v_import jsonb;
  v_sync jsonb;
begin
  if v_secret is null then
    return jsonb_build_object('ok', false, 'error', 'import secret not in vault');
  end if;
  if coalesce(btrim(p_csv),'') = '' then
    return jsonb_build_object('ok', false, 'error', 'empty csv');
  end if;
  if p_source not in ('mindmaker_live', 'tech0nomic') then
    return jsonb_build_object('ok', false, 'error', 'unknown source ' || coalesce(p_source, 'null'));
  end if;

  select * into v_resp from http((
    'POST', v_url,
    array[http_header('x-import-secret', v_secret)],
    'application/json',
    json_build_object('csv', p_csv, 'source', p_source)::text
  )::public.http_request);

  if v_resp.status not in (200, 201) then
    return jsonb_build_object('ok', false, 'error', 'importer ' || v_resp.status, 'body', left(v_resp.content, 500));
  end if;
  v_import := v_resp.content::jsonb;

  -- Pull the freshly-imported rows into Leads/Subscriptions right away.
  v_sync := pull_audience_contacts(1000);

  return jsonb_build_object('ok', true, 'import', v_import, 'sync', v_sync);
end $fn$;

revoke all on function public.audience_import_proxy(text, text) from public;
grant execute on function public.audience_import_proxy(text, text) to service_role;
