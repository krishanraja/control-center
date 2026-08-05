-- Weekly attribution rollup for the growth council cron.
--
-- The council needs a per-week read of the attribution warehouse (landed,
-- signed_up, activated, purchased, churned) plus how much of that traffic
-- carried any UTM at all, so a review can say "N landed this week" instead of
-- guessing. attribution.events is not in the PostgREST exposed schema, so the
-- API layer reads it through a public view, exactly as fleet_funnel_by_campaign
-- and fleet_revenue_by_campaign already do.
--
-- Service role only: the underlying events carry emails. anon and authenticated
-- get nothing, matching the two fleet_* views.

create or replace view public.growth_attribution_weekly as
select
  e.app,
  (date_trunc('week', (e.occurred_at at time zone 'utc')))::date as week_start,
  e.event,
  count(*)::bigint                                              as events,
  count(distinct e.anonymous_id)::bigint                        as uniques,
  count(*) filter (where e.utm_source is not null)::bigint      as tagged_events,
  coalesce(sum(e.amount_cents), 0)::bigint                      as amount_cents
from attribution.events e
group by 1, 2, 3;

revoke all on public.growth_attribution_weekly from anon, authenticated;
grant select on public.growth_attribution_weekly to service_role;

comment on view public.growth_attribution_weekly is
  'Per-week attribution rollup by app and event, read by the growth council cron (/api/growth/council-run). Service role only.';
