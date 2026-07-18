-- Measurement spine tables. APPLIED LIVE 2026-07-18
-- (product_metrics_and_podcast_downloads).

-- PostHog product analytics roll up here. One shared PostHog project (free tier
-- caps at one); the `product` super-property, registered in each app's PostHog
-- init, separates ventures. The Maya PostHog Product Sync (daily) upserts a
-- 7-day rolling window per product.
create table if not exists public.product_metrics (
  id uuid primary key default gen_random_uuid(),
  product text not null,
  metric_date date not null,
  window_days integer not null default 7,
  active_users integer,
  pageviews integer,
  events integer,
  captured_at timestamptz not null default now(),
  unique (product, metric_date, window_days)
);
alter table public.product_metrics enable row level security;
drop policy if exists product_metrics_anon_read on public.product_metrics;
create policy product_metrics_anon_read on public.product_metrics for select to anon using (true);
drop policy if exists product_metrics_service_all on public.product_metrics;
create policy product_metrics_service_all on public.product_metrics for all to service_role using (true) with check (true);
grant select on public.product_metrics to anon;
grant all on public.product_metrics to service_role;

-- OP3 podcast downloads (Full Time). The op3.dev enclosure prefix is live in the
-- feed; this table receives the counts once the OP3 read-back sync runs (needs
-- an OP3 API token).
create table if not exists public.podcast_downloads (
  id uuid primary key default gen_random_uuid(),
  product text not null default 'full_time',
  metric_date date not null,
  window_days integer not null default 7,
  downloads integer,
  episodes integer,
  captured_at timestamptz not null default now(),
  unique (product, metric_date, window_days)
);
alter table public.podcast_downloads enable row level security;
drop policy if exists podcast_downloads_anon_read on public.podcast_downloads;
create policy podcast_downloads_anon_read on public.podcast_downloads for select to anon using (true);
drop policy if exists podcast_downloads_service_all on public.podcast_downloads;
create policy podcast_downloads_service_all on public.podcast_downloads for all to service_role using (true) with check (true);
grant select on public.podcast_downloads to anon;
grant all on public.podcast_downloads to service_role;
