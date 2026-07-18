-- Retention engine tables. APPLIED LIVE 2026-07-18 (retention_engine_tables).
-- Every save/recovery/win-back touch logged (cooldown source of truth), plus a
-- per-customer health score feeding the churn surface.

create table if not exists public.retention_events (
  id uuid primary key default gen_random_uuid(),
  product text not null,
  email text,
  stripe_customer_id text,
  kind text not null check (kind in ('dunning','cancel_save','winback','health_alert')),
  channel text not null default 'email',
  resend_id text,
  status text not null default 'sent',
  meta jsonb not null default '{}',
  sent_at timestamptz not null default now()
);
create index if not exists retention_events_email_kind_idx on public.retention_events (email, kind, sent_at desc);
alter table public.retention_events enable row level security;
drop policy if exists retention_events_anon_read on public.retention_events;
create policy retention_events_anon_read on public.retention_events for select to anon using (true);
drop policy if exists retention_events_service_all on public.retention_events;
create policy retention_events_service_all on public.retention_events for all to service_role using (true) with check (true);
grant select on public.retention_events to anon;
grant all on public.retention_events to service_role;

create table if not exists public.customer_health (
  id uuid primary key default gen_random_uuid(),
  product text not null,
  email text,
  stripe_customer_id text,
  health_score integer,            -- 0-100
  status text,                     -- healthy | at_risk | critical
  signals jsonb not null default '{}',
  scored_at timestamptz not null default now(),
  unique (product, email)
);
alter table public.customer_health enable row level security;
drop policy if exists customer_health_anon_read on public.customer_health;
create policy customer_health_anon_read on public.customer_health for select to anon using (true);
drop policy if exists customer_health_service_all on public.customer_health;
create policy customer_health_service_all on public.customer_health for all to service_role using (true) with check (true);
grant select on public.customer_health to anon;
grant all on public.customer_health to service_role;
