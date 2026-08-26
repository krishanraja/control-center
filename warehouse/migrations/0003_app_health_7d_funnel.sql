-- 0003: 7-day funnel window on the per-app health view.
-- Applied to gojpffsrxybbpbdzzrvs 2026-08-25 for the Business Intelligence
-- console's funnel tile: the band needs a recent window, and the only exposed
-- funnel view (fleet_funnel_by_campaign) is all-time. Recreates
-- attribution_app_health with landed_7d / purchased_7d added; existing
-- columns and the service-role-only grant are unchanged.

create or replace view public.attribution_app_health as
  select e.app,
         max(e.received_at)                                                                       as last_event_at,
         count(*) filter (where e.received_at > now() - interval '24 hours')                      as events_24h,
         count(*) filter (where e.received_at > now() - interval '7 days')                        as events_7d,
         count(*) filter (where e.event = 'purchased' and e.received_at > now() - interval '30 days') as purchases_30d,
         count(*) filter (where e.event = 'landed'    and e.received_at > now() - interval '7 days')  as landed_7d,
         count(*) filter (where e.event = 'purchased' and e.received_at > now() - interval '7 days')  as purchased_7d
  from attribution.events e
  group by e.app;
grant select on public.attribution_app_health to service_role;

notify pgrst, 'reload schema';
