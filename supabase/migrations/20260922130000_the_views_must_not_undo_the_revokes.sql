-- The views were quietly undoing the table revokes.
--
-- 20260922100000 and 20260922120000 revoked everything on the six new tables
-- from anon and authenticated, and that was the whole access posture: service
-- role only, nothing reachable with the key that ships in a browser bundle.
-- The Supabase advisor, run as the readback step minutes after applying them,
-- caught that it did not hold.
--
-- Postgres creates a view owned by its creator and a view is SECURITY DEFINER
-- by default: it runs with the OWNER's permissions, not the caller's. Supabase
-- separately grants public-schema objects to anon and authenticated by default.
-- So anon held SELECT on all six new views and could read straight through
-- them into tables anon had been explicitly revoked from. claims_due carries
-- investigation claims and their falsifiers. claim_scoreboard carries the hit
-- rate, which this repository's own NOW.md never_publish list names.
--
-- Worth stating plainly because it is the lesson rather than the line of SQL:
-- the revokes were correct and were not enough, and nothing in the migration
-- itself would ever have revealed that. It took reading the live object back.
-- A schema is not what the file says, it is what the database does.
--
-- Two fixes, both applied, because either one alone is a single mistake away
-- from open again:
--   1. security_invoker = true, so a view checks the CALLER's permissions and
--      the table revokes mean what they say.
--   2. Revoke the view grants anyway, so it is not reachable to begin with.
--
-- Noted and deliberately NOT touched here: fourteen views that predate this
-- change carry the same SECURITY DEFINER property, among them decisions_waiting,
-- pilot_daily, standards_efficacy and triage_queue. Several read tables holding
-- named people and scorecard figures. That is a real pre-existing exposure and
-- it deserves its own review rather than being swept into a migration about
-- something else.

alter view public.trend_observation_current_story set (security_invoker = true);
alter view public.trend_weekly_metrics_current    set (security_invoker = true);
alter view public.trend_observation_daily_yield   set (security_invoker = true);
alter view public.trend_weekly_momentum           set (security_invoker = true);
alter view public.claims_due                      set (security_invoker = true);
alter view public.claim_scoreboard                set (security_invoker = true);

revoke all on public.trend_observation_current_story from anon, authenticated;
revoke all on public.trend_weekly_metrics_current    from anon, authenticated;
revoke all on public.trend_observation_daily_yield   from anon, authenticated;
revoke all on public.trend_weekly_momentum           from anon, authenticated;
revoke all on public.claims_due                      from anon, authenticated;
revoke all on public.claim_scoreboard                from anon, authenticated;

-- A function with a mutable search_path can be pointed at a different schema by
-- whoever calls it. Two of these are trigger guards enforcing the append-only
-- rule and the third is the weekly roll-up, so all three are worth pinning.
-- Follows the pattern already set by cc_harden_function_search_path.
alter function public.trend_observations_are_append_only() set search_path = public, pg_temp;
alter function public.claim_resolutions_are_append_only()  set search_path = public, pg_temp;
alter function public.snapshot_trend_weekly_metrics(text, text) set search_path = public, pg_temp;
