-- 0002: OS-side fleet attribution support objects (owned by the OS repo).
-- Applied to gojpffsrxybbpbdzzrvs 2026-05-30 during the six-app commerce wiring.
-- See docs/MINDMAKER_OS_ARCHITECTURE.md section 11.4.

-- Per-app product-truth cache. Agents fetch each app's product-truth live first
-- (PRODTRUTH-001); this table is the daily-refreshed fallback so a momentarily
-- down app surface does not blind the fleet.
create table if not exists public.product_truth (
  app         text primary key,
  url         text not null,
  http_status int,
  fetched_at  timestamptz default now(),
  ok          boolean,
  payload     jsonb
);
alter table public.product_truth enable row level security;
drop policy if exists pt_anon_read on public.product_truth;
create policy pt_anon_read   on public.product_truth for select to anon         using (true);
drop policy if exists pt_service_all on public.product_truth;
create policy pt_service_all on public.product_truth for all    to service_role using (true) with check (true);

-- Per-app emit freshness (monitoring + Control Center).
create or replace view public.attribution_app_health as
  select e.app,
         max(e.received_at)                                                                       as last_event_at,
         count(*) filter (where e.received_at > now() - interval '24 hours')                      as events_24h,
         count(*) filter (where e.received_at > now() - interval '7 days')                        as events_7d,
         count(*) filter (where e.event = 'purchased' and e.received_at > now() - interval '30 days') as purchases_30d
  from attribution.events e
  group by e.app;
grant select on public.attribution_app_health to service_role;

-- Public wrappers so the Control Center service-role API (/api/fleet-funnel) can
-- read the attribution-schema views without exposing the attribution schema to
-- PostgREST. Revenue stays service-role only (never anon/authenticated).
create or replace view public.fleet_funnel_by_campaign  as select * from attribution.funnel_by_campaign;
create or replace view public.fleet_revenue_by_campaign as select * from attribution.revenue_by_campaign;
revoke all on public.fleet_funnel_by_campaign  from anon, authenticated;
revoke all on public.fleet_revenue_by_campaign from anon, authenticated;
grant  select on public.fleet_funnel_by_campaign  to service_role;
grant  select on public.fleet_revenue_by_campaign to service_role;

notify pgrst, 'reload schema';
