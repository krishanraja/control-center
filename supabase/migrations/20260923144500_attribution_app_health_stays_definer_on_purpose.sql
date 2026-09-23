-- Correcting 20260923143000: attribution_app_health must stay SECURITY DEFINER.
--
-- The previous migration converted it along with the rest. That was wrong, and
-- the readback caught it within a minute, which is the only reason this is a
-- correction rather than an outage. Recording it as its own migration rather
-- than editing the previous one, because the previous one is what was applied.
--
-- What I got wrong. I reasoned that service_role has rolbypassrls = true and
-- would therefore be unaffected by the conversion. rolbypassrls bypasses ROW
-- LEVEL SECURITY. It does not bypass table GRANTs. service_role holds USAGE on
-- the attribution schema but no SELECT on attribution.events, so the moment the
-- view started running as its caller, the service role lost it too:
--
--   ERROR: 42501: permission denied for table events
--   HINT:  Grant the required privileges to the current role with:
--          GRANT SELECT ON attribution.events TO service_role;
--
-- That would have broken api/fleet-funnel.ts and api/growth/council-run.ts, the
-- view's only two readers.
--
-- Why definer is correct here rather than merely tolerated. This is the house
-- pattern and it is already written down, in 20260805140000_growth_attribution_weekly:
--
--   "attribution.events is not in the PostgREST exposed schema, so the API
--    layer reads it through a public view, exactly as fleet_funnel_by_campaign
--    and fleet_revenue_by_campaign already do."
--   "Service role only: the underlying events carry emails. anon and
--    authenticated get nothing, matching the two fleet_* views."
--
-- So a definer view over the hidden attribution schema IS the access control
-- mechanism, deliberately: it publishes aggregates and never rows, and the raw
-- events stay unreachable. growth_attribution_weekly, fleet_funnel_by_campaign
-- and fleet_revenue_by_campaign are all definer for this reason and none of
-- them has ever appeared in the advisor, because the advisor flags a definer
-- view that is EXPOSED to anon or authenticated, not the property itself.
--
-- attribution_app_health was the one sibling that missed the
-- `revoke ... from anon, authenticated` line when it was written. That revoke
-- was the actual fix and it landed in 20260923143000. Restoring the definer
-- property here returns the view to the pattern its three siblings follow, and
-- it drops off the advisor anyway now that the grants are gone.
--
-- Verified after applying: anon gets `permission denied for view
-- attribution_app_health`, service_role reads 6 rows, and the advisor reports
-- zero security_definer_view findings.

alter view public.attribution_app_health reset (security_invoker);

comment on view public.attribution_app_health is
  'Per-app attribution health (last event, 24h and 7d volumes, purchases). Service role only: attribution.events carries emails and is not in the PostgREST exposed schema, so this stays SECURITY DEFINER as the controlled aggregate interface, matching growth_attribution_weekly and the two fleet_* views.';
