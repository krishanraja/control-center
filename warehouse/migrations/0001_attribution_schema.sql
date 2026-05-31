-- Mindmaker OS attribution warehouse schema.
-- Target project: gojpffsrxybbpbdzzrvs (Mindmaker OS / Supabase).
-- PURELY ADDITIVE: creates a new `attribution` schema and a public ingest RPC.
-- Touches NOTHING in the existing OS tables. Idempotent.
--
-- Ownership note for the OS session: per the six-app rebuild contract, the
-- attribution schema is owned by the Mindmaker OS repo. This file was authored
-- and applied from the Merciless rebuild session (with granted access) so the
-- loop could close end to end. Commit it into the OS repo for provenance and
-- treat the OS repo as the sole future migrator of this schema. The six app
-- repos only ever EMIT to ingest-attribution; they never migrate this schema.

create schema if not exists attribution;

create table if not exists attribution.events (
  id uuid primary key default gen_random_uuid(),
  occurred_at timestamptz not null default now(),
  received_at timestamptz not null default now(),
  app text not null check (app in ('ctrl','onalert','gutted','merciless','circle','pulse')),
  event text not null check (event in (
    'landed','demo_played','demo_stalled','signed_up','chart_calculated','activated',
    'paywall_hit','purchased','refunded','churned','reactivated',
    'share_card_created','verdict_viewed','synastry_pair_minted','recipient_unblurred'
  )),
  anonymous_id text,
  user_id text,
  email text,
  utm_source text,
  utm_medium text,
  utm_campaign text,
  utm_content text,
  utm_term text,
  campaign_id text,
  agent text,
  referrer text,
  landing_path text,
  stripe_account text check (stripe_account in ('mindmaker_llc','fractionl_ai') or stripe_account is null),
  stripe_customer_id text,
  stripe_subscription_id text,
  amount_cents integer,
  currency text,
  metadata jsonb not null default '{}'::jsonb,
  dedupe_key text unique
);

create index if not exists events_app_event_idx on attribution.events (app, event, occurred_at);
create index if not exists events_campaign_idx on attribution.events (utm_campaign, occurred_at);
create index if not exists events_anon_idx on attribution.events (anonymous_id);
create index if not exists events_user_idx on attribution.events (user_id);

alter table attribution.events enable row level security;
-- No policies on purpose: service_role (which bypasses RLS) is the only writer,
-- via the SECURITY DEFINER ingest RPC below. No consumer-app read access.

-- The attribution schema is deliberately NOT exposed to PostgREST. Writes happen
-- only through this public SECURITY DEFINER function, callable by service_role.
create or replace function public.ingest_attribution_event(p jsonb) returns uuid
  language plpgsql security definer set search_path = public, attribution as $$
declare
  v_id uuid;
begin
  insert into attribution.events (
    occurred_at, app, event, anonymous_id, user_id, email,
    utm_source, utm_medium, utm_campaign, utm_content, utm_term,
    campaign_id, agent, referrer, landing_path, stripe_account,
    stripe_customer_id, stripe_subscription_id, amount_cents, currency, metadata, dedupe_key
  ) values (
    coalesce((p->>'occurred_at')::timestamptz, now()),
    p->>'app', p->>'event', p->>'anonymous_id', p->>'user_id', p->>'email',
    p->>'utm_source', p->>'utm_medium', p->>'utm_campaign', p->>'utm_content', p->>'utm_term',
    p->>'campaign_id', p->>'agent', p->>'referrer', p->>'landing_path', p->>'stripe_account',
    p->>'stripe_customer_id', p->>'stripe_subscription_id',
    nullif(p->>'amount_cents','')::int, p->>'currency',
    coalesce(p->'metadata', '{}'::jsonb), nullif(p->>'dedupe_key','')
  )
  on conflict (dedupe_key) do nothing
  returning id into v_id;
  return v_id;
end;
$$;

revoke all on function public.ingest_attribution_event(jsonb) from public, anon, authenticated;
grant execute on function public.ingest_attribution_event(jsonb) to service_role;

-- Read models for Maya (CAC by channel) and Leo (LTV / revenue), spanning both
-- Stripe accounts. Service-role read only.
create or replace view attribution.funnel_by_campaign as
  select
    app,
    coalesce(utm_source, '(none)')   as utm_source,
    coalesce(utm_medium, '(none)')   as utm_medium,
    coalesce(utm_campaign, '(none)') as utm_campaign,
    coalesce(agent, '(none)')        as agent,
    count(*) filter (where event = 'landed')           as landed,
    count(*) filter (where event = 'signed_up')        as signed_up,
    count(*) filter (where event = 'activated')        as activated,
    count(*) filter (where event = 'purchased')        as purchased,
    count(distinct anonymous_id)                       as uniques
  from attribution.events
  group by 1, 2, 3, 4, 5;

create or replace view attribution.revenue_by_campaign as
  select
    app,
    coalesce(utm_source, '(none)')   as utm_source,
    coalesce(utm_campaign, '(none)') as utm_campaign,
    coalesce(agent, '(none)')        as agent,
    stripe_account,
    count(*) filter (where event = 'purchased')                          as purchases,
    coalesce(sum(amount_cents) filter (where event = 'purchased'), 0)    as gross_cents,
    coalesce(sum(amount_cents) filter (where event = 'refunded'), 0)     as refunded_cents,
    count(*) filter (where event = 'churned')                            as churns
  from attribution.events
  group by 1, 2, 3, 4, 5;

grant usage on schema attribution to service_role;
grant select on attribution.funnel_by_campaign to service_role;
grant select on attribution.revenue_by_campaign to service_role;
