-- Growth metrics snapshot table: the substrate for the Home Growth Scoreboard
-- and the stall detector. One row per (metric_key, metric_date), upserted by
-- the daily /api/growth/snapshot cron (05:30 UTC) or by a manual "log counts"
-- entry. Follows the product_metrics idiom (2026-07-18 migration).
--
-- Seed metric keys (documented, not inserted; the cron writes them):
--   substack_mindmakerlive_total  - mindmakerlive.substack.com subscriber count
--   substack_tech0nomic_total     - tech0nomic.substack.com subscriber count
--   maven_students                - maven.com/mindmaker student count
--   app_paid_subs                 - customers kind='paid', not churned
--   app_mrr_usd                   - sum mrr_usd of the same set
--   guests_confirmed_30d          - guests status='confirmed', updated last 30d
--   visibility_accepted_30d       - visibility_targets status='accepted', last 30d
--
-- source: 'snapshot' (cron), 'manual' (log-counts fallback), 'reconcile' (CSV).
-- A failed external fetch writes NOTHING (no fake zeros); staleness of
-- metric_date is the signal the scoreboard renders.

create table if not exists public.growth_metrics (
  id uuid primary key default gen_random_uuid(),
  metric_key text not null,
  metric_date date not null,
  value numeric not null,
  source text not null default 'snapshot',
  meta jsonb not null default '{}'::jsonb,
  captured_at timestamptz not null default now(),
  unique (metric_key, metric_date)
);
alter table public.growth_metrics enable row level security;
drop policy if exists growth_metrics_anon_read on public.growth_metrics;
create policy growth_metrics_anon_read on public.growth_metrics for select to anon using (true);
drop policy if exists growth_metrics_service_all on public.growth_metrics;
create policy growth_metrics_service_all on public.growth_metrics for all to service_role using (true) with check (true);
grant select on public.growth_metrics to anon;
grant all on public.growth_metrics to service_role;

create index if not exists growth_metrics_key_date_idx
  on public.growth_metrics (metric_key, metric_date desc);

-- Register the two new zero-cost fetchers in the integrations registry so
-- their (zero) cost and status are visible alongside every other tool.
insert into public.growth_integrations (tool, category, job, status, lanes, monthly_usd)
values
  ('substack_public_counts', 'analytics', 'Daily scrape of public Substack subscriber counts for the Growth Scoreboard', 'wired', '{}', 0),
  ('maven_profile_scrape',   'analytics', 'Daily scrape of the Maven profile student count for the Growth Scoreboard',   'wired', '{}', 0)
on conflict (tool) do nothing;
