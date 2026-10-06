-- Full Time's pilot listeners: their own job, their own rows, their own check.
--
-- Rulings (Krish, 2026-10-06):
--   "yes and 100": copy Full Time sign-ups into Control Center so pilot
--   listeners can be counted, and the target is 100 pilot listeners.
--   "those two are TOTALLY unrelated and cannot be confused with one another":
--   Full Time's pilot listeners and Mindmake's pilot customers.
--
-- Four things, all additive and safe to run twice:
--   1. The job CHECKs on goals and daily_focus accept fill_listeners, Full
--      Time's job, beside the five jobs of the OS. Without it, "Put on today"
--      on a Full Time action would be refused by the database.
--   2. The fulltime.fm site actions the daily check already stored under
--      fill_pilots (from the few hours on 2026-10-06 when the site shared
--      Mindmake's job) move to fill_listeners, so no stored row files Full
--      Time work under pilot customers.
--   3. One listener row per Full Time account: a unique index on the Full
--      Time user id inside customers, so two overlapping runs of the copy
--      cannot write the same account twice. Rows carry no email and no name
--      (src/lib/pilotListeners.ts says why).
--   4. The connections sweep watches the read key the copy uses, STRICT in
--      api/_connections.ts, so a dead key reads as failed, never green.

-- 1. The job CHECKs ----------------------------------------------------------
alter table public.goals drop constraint if exists goals_job_check;
alter table public.goals add constraint goals_job_check
  check (job is null or job in ('fill_pilots','keep_honest','run_pilots','feed_demand','keep_edge','fill_listeners'));

alter table public.daily_focus drop constraint if exists daily_focus_job_check;
alter table public.daily_focus add constraint daily_focus_job_check check (
  (target_1_job is null or target_1_job in ('fill_pilots','keep_honest','run_pilots','feed_demand','keep_edge','fill_listeners')) and
  (target_2_job is null or target_2_job in ('fill_pilots','keep_honest','run_pilots','feed_demand','keep_edge','fill_listeners')) and
  (target_3_job is null or target_3_job in ('fill_pilots','keep_honest','run_pilots','feed_demand','keep_edge','fill_listeners'))
);

-- 2. Stored fulltime.fm actions move to Full Time's own job -------------------
update public.web_property_insights
   set action = jsonb_set(action, '{job}', '"fill_listeners"')
 where property = 'fulltime'
   and action is not null
   and action->>'job' = 'fill_pilots';

update public.web_property_insights
   set action = jsonb_set(action, '{alternate,job}', '"fill_listeners"')
 where property = 'fulltime'
   and action is not null
   and jsonb_typeof(action->'alternate') = 'object'
   and action->'alternate'->>'job' = 'fill_pilots';

-- 3. One row per Full Time account -------------------------------------------
create unique index if not exists customers_fulltime_listener_key
  on public.customers (product, (raw->>'fulltime_user_id'))
  where source = 'fulltime_accounts';

-- 4. Watch the read key -------------------------------------------------------
insert into public.service_registry (key, display_name, category, criticality, env_key_name, check_kind, dashboard_url, active)
values
  ('supabase-fulltime', 'Supabase (Full Time, read for pilot listeners)', 'infra', 'standard', 'FULLTIME_SUPABASE_SERVICE_ROLE_KEY', 'ping', 'https://supabase.com/dashboard', true)
on conflict (key) do update set
  display_name  = excluded.display_name,
  category      = excluded.category,
  criticality   = excluded.criticality,
  env_key_name  = excluded.env_key_name,
  check_kind    = excluded.check_kind,
  dashboard_url = excluded.dashboard_url,
  active        = excluded.active,
  updated_at    = now();
