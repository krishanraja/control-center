-- The usage meter: which unit of the OS actually spent the money.
--
-- The Control Center could say "Apify cost $130 this month" but not "the
-- LinkedIn profile scraper cost $130 and the podcast finder cost nothing".
-- Invoices answer HOW MUCH; nothing answered WHO. meter_daily is that answer,
-- in one shape for every provider so the UI ranks actors, workflows and agents
-- against each other without three code paths:
--
--   provider  'apify' | 'n8n' | 'anthropic'
--   unit_kind 'actor' | 'workflow' | 'agent'   -- what a row is one of
--   unit_key  the provider's stable id (actor id, workflow id, agent slug)
--   day       UTC calendar day
--   bucket    the one sub-dimension worth splitting by, per provider:
--             apify = run origin (WEB/API/SCHEDULER/DEVELOPMENT),
--             n8n   = execution mode, anthropic = model.
--
-- TWO WRITE PATHS, deliberately different:
--   * Provider-derived truth (Apify, n8n) is REPLACED. The collector recomputes
--     a whole day from the provider and upserts over it, so re-running a sync
--     — or overlapping windows — can never double-count.
--   * Self-metered events (Anthropic) are ADDED, one call at a time, through
--     meter_add(). Replacing there would lose every call but the last.
--
-- `usd` is real money where the provider reports it (Apify prices each run) and
-- computed from real token counts where we meter ourselves (Anthropic). n8n
-- Cloud bills by execution, not by dollar, so n8n rows carry units and leave
-- usd at 0 rather than inventing a rate. A zero there means "not priced by the
-- vendor", which is why unit_name says what `units` counts.
--
-- Access rule: service-role only, mirroring service_registry / spend_invoices.
-- The browser reads the computed summary through GET /api/spend.

BEGIN;

create table if not exists public.meter_daily (
  provider   text not null,
  unit_kind  text not null,
  unit_key   text not null,
  day        date not null,
  bucket     text not null default '',
  -- Human name for unit_key, resolved once by the collector and kept here so
  -- steady-state syncs need no extra provider round trips.
  unit_label text,
  -- Provider-side grouping: Apify task_category from apify_actor_registry,
  -- null for an actor that has run but is not in the curated registry.
  category   text,
  usd        numeric(14,6) not null default 0,
  runs       integer       not null default 0,
  failed     integer       not null default 0,
  units      numeric(20,4) not null default 0,
  unit_name  text,
  updated_at timestamptz   not null default now(),
  primary key (provider, unit_kind, unit_key, day, bucket)
);

-- The read path is always "this provider, this window", newest first.
create index if not exists meter_daily_provider_day_idx
  on public.meter_daily (provider, day desc);

/* Increment one meter cell. For self-metered events only: every Anthropic call
   lands here as it happens, so the row must accumulate rather than replace.
   Labels overwrite only when the caller supplies one, so a later unstamped
   call cannot erase a name an earlier stamped call resolved. */
create or replace function public.meter_add(
  p_provider   text,
  p_unit_kind  text,
  p_unit_key   text,
  p_day        date,
  p_bucket     text    default '',
  p_unit_label text    default null,
  p_category   text    default null,
  p_usd        numeric default 0,
  p_runs       integer default 1,
  p_failed     integer default 0,
  p_units      numeric default 0,
  p_unit_name  text    default null
) returns void
language sql
security definer
set search_path = public
as $$
  insert into public.meter_daily as m (
    provider, unit_kind, unit_key, day, bucket,
    unit_label, category, usd, runs, failed, units, unit_name, updated_at
  ) values (
    p_provider, p_unit_kind, p_unit_key, p_day, coalesce(p_bucket, ''),
    p_unit_label, p_category, coalesce(p_usd, 0), coalesce(p_runs, 0),
    coalesce(p_failed, 0), coalesce(p_units, 0), p_unit_name, now()
  )
  on conflict (provider, unit_kind, unit_key, day, bucket) do update set
    usd        = m.usd    + excluded.usd,
    runs       = m.runs   + excluded.runs,
    failed     = m.failed + excluded.failed,
    units      = m.units  + excluded.units,
    unit_label = coalesce(excluded.unit_label, m.unit_label),
    category   = coalesce(excluded.category,   m.category),
    unit_name  = coalesce(excluded.unit_name,  m.unit_name),
    updated_at = now();
$$;

-- One row per money line already crossed, so a crossing emails once and not
-- once per sweep. alert_key encodes the line AND the cycle it was crossed in
-- ('apify:over-prepaid:2026-08-14'), which lets the same line fire again next
-- cycle without a cleanup job.
create table if not exists public.spend_alerts_sent (
  alert_key text primary key,
  sent_at   timestamptz not null default now(),
  channel   text,
  detail    text
);

/* The prepaid truth the tracker was missing.
   Apify's plan includes $29 of usage and charges early past $50; the sweep was
   reporting headroom to the HARD CAP instead, so the dot stayed green while
   overage accrued. These columns make "past the prepaid" and "near the early-
   charge trigger" states the classifier can actually see. cycle_* are written
   by the meter sync from the vendor's own billing cycle, never guessed from
   the calendar month. */
alter table public.service_registry
  add column if not exists included_usd        numeric,
  add column if not exists overage_trigger_usd numeric,
  add column if not exists cycle_usd           numeric,
  add column if not exists cycle_start         date,
  add column if not exists cycle_end           date;

comment on column public.service_registry.included_usd is
  'Usage included in the plan price (Apify: $29 prepaid). NULL = plan has no included allowance.';
comment on column public.service_registry.overage_trigger_usd is
  'Overage at which the vendor charges early rather than waiting for the invoice (Apify: $50).';

update public.service_registry
   set included_usd = 29, overage_trigger_usd = 50
 where key = 'apify' and included_usd is null;

alter table public.meter_daily       enable row level security;
alter table public.spend_alerts_sent enable row level security;

drop policy if exists meter_daily_service_all on public.meter_daily;
create policy meter_daily_service_all on public.meter_daily
  for all to service_role using (true) with check (true);

drop policy if exists spend_alerts_sent_service_all on public.spend_alerts_sent;
create policy spend_alerts_sent_service_all on public.spend_alerts_sent
  for all to service_role using (true) with check (true);

revoke all on public.meter_daily       from anon, authenticated;
revoke all on public.spend_alerts_sent from anon, authenticated;
grant  all on public.meter_daily       to service_role;
grant  all on public.spend_alerts_sent to service_role;

revoke all     on function public.meter_add(text,text,text,date,text,text,text,numeric,integer,integer,numeric,text) from public, anon, authenticated;
grant  execute on function public.meter_add(text,text,text,date,text,text,text,numeric,integer,integer,numeric,text) to service_role;

COMMIT;
