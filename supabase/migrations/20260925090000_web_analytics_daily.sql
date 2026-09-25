-- GA4 breakdowns written by api/growth/snapshot.ts: one row per property, day,
-- dimension (source_medium | landing_page) and value. Headline totals for the
-- same day live in growth_metrics (site_* / mymu_* keys); this table holds the
-- "where from" and "which page" behind them.
create table if not exists public.web_analytics_daily (
  id uuid primary key default gen_random_uuid(),
  property text not null,          -- 'site' (mindmake.co) | 'mymu' (makeyourmindup)
  metric_date date not null,
  dim_type text not null,          -- 'source_medium' | 'landing_page'
  dim_value text not null,
  sessions numeric not null default 0,
  users numeric not null default 0,
  key_events numeric not null default 0,
  captured_at timestamptz not null default now(),
  unique (property, metric_date, dim_type, dim_value)
);

create index if not exists web_analytics_daily_date_idx
  on public.web_analytics_daily (property, metric_date desc);

alter table public.web_analytics_daily enable row level security;

-- Written by the service role only; the app reads through /api.
revoke all on public.web_analytics_daily from anon, authenticated;
