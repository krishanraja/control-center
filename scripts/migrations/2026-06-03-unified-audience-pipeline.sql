-- 2026-06-03 Unified audience pipeline (OS DB gojpffsrxybbpbdzzrvs)
-- Applied via the Supabase Management API (this DB's migration history is not
-- CLI-tracked); committed here as source-of-record. Replayable (CREATE OR
-- REPLACE; later function defs win).
--
-- Applied separately (NOT in this file, to keep it secret-free):
--   * App DB bkyuxvschuwngtcdhsyg: `alter table audience_contacts add column
--     synced_to_os_at timestamptz` + partial index (the bridge watermark).
--   * Vault secrets on this DB: `app_db_service_key` (app DB service role, read
--     by pull_audience_contacts) and `audience_import_secret` (read by
--     audience_import_proxy). Created via vault.create_secret.
--   * Edge functions: `audience-tick` (this DB) and `import-audience-csv`
--     (app DB). n8n workflow `System | Mindmaker OS | Audience Pipeline`
--     (7sYzU1FidUo2w1Lh) schedules the tick.
-- See section 4.11 of the architecture reference.

-- ===== os_enum.sql =====
-- OS DB: allow Mindmaker advisory + Mindmaker Live as paid customer products
-- (so paid Substack and site customers can land in Subscriptions).
alter type public.customer_product add value if not exists 'mindmaker';
alter type public.customer_product add value if not exists 'mindmaker_live';

-- ===== os_main.sql =====
-- =====================================================================
-- OS DB (gojpffsrxybbpbdzzrvs): unified audience pipeline
-- Bridge (pull) + Mover (customers trigger) + Reconciler.
-- Additive and idempotent. Audience leads are source_type='audience'.
-- =====================================================================

-- 1. Leads columns for the audience pipeline ---------------------------
alter table public.leads add column if not exists audience_sources text[] not null default '{}';
alter table public.leads add column if not exists churned_at timestamptz;
alter table public.leads add column if not exists audience_synced_at timestamptz;

-- 2. Make 'churned' a first-class lead status (so churn is clearly marked)
alter table public.leads drop constraint if exists leads_status_check;
alter table public.leads add constraint leads_status_check check (status = any (array[
  'new','enriching','ready','contacted','conversation',
  'closed_won','closed_lost','superseded','churned'
]));

-- 3. App DB connection config. URL is non-secret (system_config); the service
--    key lives encrypted in Supabase Vault (see os_vault.sql), read at runtime.
insert into public.system_config(key, value, updated_at) values
  ('app_db_url', 'https://bkyuxvschuwngtcdhsyg.supabase.co', now())
on conflict (key) do update set value = excluded.value, updated_at = now();

-- 4. sync_audience_contact: the routing brain -------------------------
-- Guard (no lead if paying) + collapse-by-email upsert. Returns outcome.
create or replace function public.sync_audience_contact(
  p_email text, p_name text, p_source text, p_metadata jsonb default '{}'::jsonb
) returns text language plpgsql security definer set search_path = public as $fn$
declare
  v_email text := lower(btrim(coalesce(p_email,'')));
  v_name  text := nullif(btrim(coalesce(p_name,'')),'');
  v_venture text;
  v_tier text;
begin
  if v_email = '' or position('@' in v_email) = 0 then
    return 'invalid_email';
  end if;

  v_venture := case when p_source = 'builder_economy' then 'builder_economy' else 'mindmaker' end;
  v_tier := case
    when p_source = 'mindmaker_site'
      and coalesce(p_metadata->>'capture','') in ('scoping_request','lead_email','contact_form')
      then 'warm'
    else 'watch' end;

  perform set_config('app.changed_by','audience-bridge', true);
  perform set_config('app.source','rpc:sync_audience_contact', true);

  -- GUARD: a paying customer is never a lead.
  if exists (select 1 from customers c where lower(c.email) = v_email and c.kind = 'paid') then
    update leads set status = 'superseded', updated_at = now()
      where lower(email) = v_email and source_type = 'audience'
        and status not in ('closed_won','closed_lost','superseded');
    update customers set full_name = coalesce(full_name, v_name), updated_at = now()
      where lower(email) = v_email and full_name is null and v_name is not null;
    return 'customer_skip';
  end if;

  -- Upsert as a lead, collapsed by email.
  insert into leads as l (
    email, full_name, source_type, source_ref, status, tier,
    audience_sources, primary_venture, tags, icp_scores, raw_extraction,
    why_relevant, audience_synced_at, assignee_agent
  ) values (
    v_email, v_name, 'audience', 'audience_sync', 'new', v_tier,
    array[p_source], v_venture, '{}'::text[], '{}'::jsonb,
    jsonb_build_object('audience', true, 'first_source', p_source, 'audience_metadata', p_metadata),
    'Inbound ' || p_source || ' signup', now(),
    case when v_venture = 'mindmaker' then 'felix' else 'nell' end
  )
  on conflict (lower(email)) where (email is not null) do update set
    audience_sources = (
      select array(select distinct e from unnest(l.audience_sources || excluded.audience_sources) e where e is not null)
    ),
    full_name = coalesce(l.full_name, excluded.full_name),
    tier = case when l.source_type = 'audience' and excluded.tier = 'warm' then 'warm' else l.tier end,
    raw_extraction = case when l.source_type = 'audience'
      then jsonb_set(coalesce(l.raw_extraction,'{}'::jsonb), '{audience_metadata}', coalesce(excluded.raw_extraction->'audience_metadata','{}'::jsonb))
      else l.raw_extraction end,
    status = case when l.source_type = 'audience' and l.status = 'superseded' then 'new' else l.status end,
    audience_synced_at = now(),
    updated_at = now();

  return 'lead_upserted';
end $fn$;

-- 5. pull_audience_contacts: cross-DB pull via http extension ----------
create or replace function public.pull_audience_contacts(p_limit int default 200)
returns jsonb language plpgsql security definer set search_path = public as $fn$
declare
  v_url text := (select value from system_config where key = 'app_db_url');
  v_key text := (select decrypted_secret from vault.decrypted_secrets where name = 'app_db_service_key');
  v_resp public.http_response;
  v_row jsonb;
  v_outcome text;
  v_total int := 0; v_leads int := 0; v_custs int := 0; v_invalid int := 0;
begin
  if v_url is null or v_key is null then
    return jsonb_build_object('ok', false, 'error', 'missing app_db config');
  end if;

  select * into v_resp from http((
    'GET',
    v_url || '/rest/v1/audience_contacts?synced_to_os_at=is.null&select=id,email,name,source,metadata&order=created_at.asc&limit=' || p_limit,
    array[http_header('apikey', v_key), http_header('Authorization', 'Bearer ' || v_key)],
    NULL, NULL
  )::public.http_request);

  if v_resp.status <> 200 then
    return jsonb_build_object('ok', false, 'error', 'app_db fetch ' || v_resp.status, 'body', left(v_resp.content, 500));
  end if;

  for v_row in select * from jsonb_array_elements(v_resp.content::jsonb) loop
    v_total := v_total + 1;
    v_outcome := sync_audience_contact(
      v_row->>'email', v_row->>'name', v_row->>'source', coalesce(v_row->'metadata','{}'::jsonb)
    );
    if v_outcome = 'lead_upserted' then v_leads := v_leads + 1;
    elsif v_outcome = 'customer_skip' then v_custs := v_custs + 1;
    else v_invalid := v_invalid + 1; end if;

    perform http((
      'PATCH',
      v_url || '/rest/v1/audience_contacts?id=eq.' || (v_row->>'id'),
      array[http_header('apikey', v_key), http_header('Authorization', 'Bearer ' || v_key), http_header('Prefer','return=minimal')],
      'application/json',
      json_build_object('synced_to_os_at', now())::text
    )::public.http_request);
  end loop;

  return jsonb_build_object('ok', true, 'total', v_total, 'leads', v_leads, 'customers', v_custs, 'invalid', v_invalid, 'ran_at', now());
end $fn$;

-- 6. Mover: customers trigger enforces never-both + churn marking ------
create or replace function public.enforce_audience_invariant_on_customer()
returns trigger language plpgsql security definer set search_path = public as $fn$
declare v_email text := lower(btrim(coalesce(NEW.email,'')));
begin
  if v_email = '' then return NEW; end if;
  perform set_config('app.changed_by','audience-mover', true);
  perform set_config('app.source','trg:enforce_audience_invariant', true);

  if NEW.kind = 'paid' then
    -- paying: out of Leads entirely
    update leads set status = 'superseded', updated_at = now()
      where lower(email) = v_email and source_type = 'audience'
        and status not in ('closed_won','closed_lost','superseded');

  elsif NEW.kind = 'churned' then
    -- churned: a clearly-tagged churned lead for re-engagement
    update leads set status = 'churned', churned_at = coalesce(NEW.churned_at, now()), updated_at = now()
      where lower(email) = v_email and source_type = 'audience' and status <> 'churned';
    if not found then
      insert into leads (email, full_name, source_type, source_ref, status, tier,
        audience_sources, primary_venture, tags, icp_scores, raw_extraction, why_relevant, churned_at, assignee_agent)
      values (v_email, NEW.full_name, 'audience', 'churn_reentry', 'churned', 'warm',
        array['churn:' || NEW.product::text], 'mindmaker', '{}'::text[], '{}'::jsonb,
        jsonb_build_object('audience', true, 'churned_from', NEW.product::text),
        'Churned ' || NEW.product::text || ' customer, re-engagement target', coalesce(NEW.churned_at, now()), 'felix')
      on conflict (lower(email)) where (email is not null) do update set
        status = 'churned', churned_at = coalesce(NEW.churned_at, now()), updated_at = now();
    end if;
  end if;
  return NEW;
end $fn$;

drop trigger if exists trg_enforce_audience_invariant on public.customers;
create trigger trg_enforce_audience_invariant
  after insert or update of kind on public.customers
  for each row execute function public.enforce_audience_invariant_on_customer();

-- 7. Reconciler: assert + heal "never both" ---------------------------
create or replace function public.reconcile_audience_invariant()
returns jsonb language plpgsql security definer set search_path = public as $fn$
declare v_offenders int := 0; v_healed int := 0;
begin
  perform set_config('app.changed_by','audience-reconciler', true);
  perform set_config('app.source','rpc:reconcile_audience_invariant', true);

  select count(*) into v_offenders
  from leads l
  where l.email is not null
    and l.status not in ('closed_won','closed_lost','superseded','churned')
    and exists (select 1 from customers c where lower(c.email) = lower(l.email) and c.kind = 'paid');

  update leads set status = 'superseded', updated_at = now()
    where email is not null
      and status not in ('closed_won','closed_lost','superseded','churned')
      and exists (select 1 from customers c where lower(c.email) = lower(leads.email) and c.kind = 'paid');
  get diagnostics v_healed = row_count;

  return jsonb_build_object('ok', true, 'offenders', v_offenders, 'healed', v_healed, 'ran_at', now());
end $fn$;

-- ===== os_sourcetype.sql =====
-- Allow 'audience' as a lead source_type (unified audience pipeline).
alter table public.leads drop constraint if exists leads_source_type_check;
alter table public.leads add constraint leads_source_type_check check (source_type = any (array[
  'podcast_audience','drive_import','manual','apollo','nell_candidate','signal_inbox','audience'
]));

-- ===== os_paid.sql =====
-- Extend the routing brain: a source that signals payment (metadata.paid=true,
-- e.g. a paid Substack subscriber from the CSV) becomes a paid CUSTOMER
-- (Subscriptions), never a lead. The customers trigger then supersedes any
-- lingering lead, preserving never-both.
create or replace function public.sync_audience_contact(
  p_email text, p_name text, p_source text, p_metadata jsonb default '{}'::jsonb
) returns text language plpgsql security definer set search_path = public as $fn$
declare
  v_email text := lower(btrim(coalesce(p_email,'')));
  v_name  text := nullif(btrim(coalesce(p_name,'')),'');
  v_venture text;
  v_tier text;
  v_product customer_product;
begin
  if v_email = '' or position('@' in v_email) = 0 then
    return 'invalid_email';
  end if;

  perform set_config('app.changed_by','audience-bridge', true);
  perform set_config('app.source','rpc:sync_audience_contact', true);

  -- PAID signal -> Subscriptions (customer), not Leads.
  if lower(coalesce(p_metadata->>'paid','')) in ('true','t','1','yes') then
    v_product := case p_source
      when 'mindmaker_live' then 'mindmaker_live'::customer_product
      when 'ctrl' then 'mm_ctrl'::customer_product
      when 'mindmaker_site' then 'mindmaker'::customer_product
      else null end;
    if v_product is not null then
      insert into customers as c (product, kind, email, full_name, source, signed_up_at, became_paid_at, mrr_usd, raw)
      values (v_product, 'paid', v_email, v_name, p_source, now(), now(),
              nullif(p_metadata->>'mrr_usd','')::numeric,
              jsonb_build_object('audience', true, 'from_source', p_source, 'audience_metadata', p_metadata))
      on conflict (product, lower(email)) where (email is not null) do update set
        kind = 'paid',
        full_name = coalesce(c.full_name, excluded.full_name),
        became_paid_at = coalesce(c.became_paid_at, excluded.became_paid_at),
        updated_at = now();
      return 'customer_upserted';
    end if;
  end if;

  v_venture := case when p_source = 'builder_economy' then 'builder_economy' else 'mindmaker' end;
  v_tier := case
    when p_source = 'mindmaker_site'
      and coalesce(p_metadata->>'capture','') in ('scoping_request','lead_email','contact_form')
      then 'warm'
    else 'watch' end;

  -- GUARD: a paying customer is never a lead.
  if exists (select 1 from customers c where lower(c.email) = v_email and c.kind = 'paid') then
    update leads set status = 'superseded', updated_at = now()
      where lower(email) = v_email and source_type = 'audience'
        and status not in ('closed_won','closed_lost','superseded');
    update customers set full_name = coalesce(full_name, v_name), updated_at = now()
      where lower(email) = v_email and full_name is null and v_name is not null;
    return 'customer_skip';
  end if;

  -- Upsert as a lead, collapsed by email.
  insert into leads as l (
    email, full_name, source_type, source_ref, status, tier,
    audience_sources, primary_venture, tags, icp_scores, raw_extraction,
    why_relevant, audience_synced_at, assignee_agent
  ) values (
    v_email, v_name, 'audience', 'audience_sync', 'new', v_tier,
    array[p_source], v_venture, '{}'::text[], '{}'::jsonb,
    jsonb_build_object('audience', true, 'first_source', p_source, 'audience_metadata', p_metadata),
    'Inbound ' || p_source || ' signup', now(),
    case when v_venture = 'mindmaker' then 'felix' else 'nell' end
  )
  on conflict (lower(email)) where (email is not null) do update set
    audience_sources = (
      select array(select distinct e from unnest(l.audience_sources || excluded.audience_sources) e where e is not null)
    ),
    full_name = coalesce(l.full_name, excluded.full_name),
    tier = case when l.source_type = 'audience' and excluded.tier = 'warm' then 'warm' else l.tier end,
    raw_extraction = case when l.source_type = 'audience'
      then jsonb_set(coalesce(l.raw_extraction,'{}'::jsonb), '{audience_metadata}', coalesce(excluded.raw_extraction->'audience_metadata','{}'::jsonb))
      else l.raw_extraction end,
    status = case when l.source_type = 'audience' and l.status = 'superseded' then 'new' else l.status end,
    audience_synced_at = now(),
    updated_at = now();

  return 'lead_upserted';
end $fn$;

-- ===== fix_count.sql =====
create or replace function public.pull_audience_contacts(p_limit int default 200)
returns jsonb language plpgsql security definer set search_path = public as $fn$
declare
  v_url text := (select value from system_config where key = 'app_db_url');
  v_key text := (select decrypted_secret from vault.decrypted_secrets where name = 'app_db_service_key');
  v_resp public.http_response;
  v_row jsonb;
  v_outcome text;
  v_total int := 0; v_leads int := 0; v_custs int := 0; v_invalid int := 0;
begin
  if v_url is null or v_key is null then
    return jsonb_build_object('ok', false, 'error', 'missing app_db config');
  end if;

  select * into v_resp from http((
    'GET',
    v_url || '/rest/v1/audience_contacts?synced_to_os_at=is.null&select=id,email,name,source,metadata&order=created_at.asc&limit=' || p_limit,
    array[http_header('apikey', v_key), http_header('Authorization', 'Bearer ' || v_key)],
    NULL, NULL
  )::public.http_request);

  if v_resp.status <> 200 then
    return jsonb_build_object('ok', false, 'error', 'app_db fetch ' || v_resp.status, 'body', left(v_resp.content, 500));
  end if;

  for v_row in select * from jsonb_array_elements(v_resp.content::jsonb) loop
    v_total := v_total + 1;
    v_outcome := sync_audience_contact(
      v_row->>'email', v_row->>'name', v_row->>'source', coalesce(v_row->'metadata','{}'::jsonb)
    );
    if v_outcome = 'lead_upserted' then v_leads := v_leads + 1;
    elsif v_outcome in ('customer_skip','customer_upserted') then v_custs := v_custs + 1;
    else v_invalid := v_invalid + 1; end if;

    perform http((
      'PATCH',
      v_url || '/rest/v1/audience_contacts?id=eq.' || (v_row->>'id'),
      array[http_header('apikey', v_key), http_header('Authorization', 'Bearer ' || v_key), http_header('Prefer','return=minimal')],
      'application/json',
      json_build_object('synced_to_os_at', now())::text
    )::public.http_request);
  end loop;

  return jsonb_build_object('ok', true, 'total', v_total, 'leads', v_leads, 'customers', v_custs, 'invalid', v_invalid, 'ran_at', now());
end $fn$;

-- ===== os_import_proxy.sql =====
-- audience_import_proxy: the OS reaches the app-DB Substack importer via the http
-- extension using the Vault-held gate secret, then syncs immediately. The Control
-- Center calls this RPC with the raw CSV and holds no secret itself.
create or replace function public.audience_import_proxy(p_csv text)
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

  select * into v_resp from http((
    'POST', v_url,
    array[http_header('x-import-secret', v_secret)],
    'application/json',
    json_build_object('csv', p_csv, 'source', 'mindmaker_live')::text
  )::public.http_request);

  if v_resp.status not in (200, 201) then
    return jsonb_build_object('ok', false, 'error', 'importer ' || v_resp.status, 'body', left(v_resp.content, 500));
  end if;
  v_import := v_resp.content::jsonb;

  -- Pull the freshly-imported rows into Leads/Subscriptions right away.
  v_sync := pull_audience_contacts(1000);

  return jsonb_build_object('ok', true, 'import', v_import, 'sync', v_sync);
end $fn$;

revoke all on function public.audience_import_proxy(text) from public;
grant execute on function public.audience_import_proxy(text) to service_role;

