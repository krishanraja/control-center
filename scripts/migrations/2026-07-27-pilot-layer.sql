-- Pilot layer v1. APPLIED LIVE 2026-07-27 (migration name: pilot_layer_v1).
--
-- The dashboard monitors the agent fleet. Nothing monitored the operator. These
-- two tables are the whole state of the layer that regulates operator behaviour
-- rather than information intake. Single operator tool: no user_id, no RLS
-- beyond the house posture (anon reads, service_role writes through api/).

-- Morning and evening check-ins. The morning row gates the app and routes to
-- green or red. The evening row chooses tomorrow's ONE at higher capacity, so
-- the morning never has to choose. One row per kind per day is a convention the
-- routes enforce, not a constraint, because the civil day is America/New_York
-- and the column is a timestamptz.
create table if not exists public.pilot_checkins (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  kind text not null check (kind in ('morning', 'evening')),
  energy int check (energy between 1 and 5),
  anxiety int check (anxiety between 1 and 5),
  one_word text,
  mode text check (mode in ('green', 'red')),
  shipped_today text,
  tomorrow_one text,
  tomorrow_one_url text,
  -- Red mode escape hatch. Set when the operator taps "override to full
  -- dashboard", so the override is a fact on the row rather than a silent exit.
  override_at timestamptz
);
create index if not exists pilot_checkins_created_at_idx on public.pilot_checkins (created_at desc);
create index if not exists pilot_checkins_kind_created_idx on public.pilot_checkins (kind, created_at desc);

alter table public.pilot_checkins enable row level security;
drop policy if exists pilot_checkins_anon_read on public.pilot_checkins;
create policy pilot_checkins_anon_read on public.pilot_checkins for select to anon using (true);
drop policy if exists pilot_checkins_service_all on public.pilot_checkins;
create policy pilot_checkins_service_all on public.pilot_checkins for all to service_role using (true) with check (true);
grant select on public.pilot_checkins to anon;
grant all on public.pilot_checkins to service_role;

-- The ship ledger. A ship is something that left the machine toward another
-- human: email sent, post published, payment link created, campaign activated,
-- invoice sent, ask made. Internal work never counts and never lands here.
--
-- dedup_key makes webhook ingestion idempotent so n8n retries cannot double
-- count (gmail:<message_id>, substack:<post_id>). Manual logs leave it null.
create table if not exists public.ships (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  occurred_at timestamptz not null default now(),
  source text not null check (source in ('manual', 'webhook')),
  channel text not null,
  description text not null,
  external_ref text,
  dedup_key text unique
);
create index if not exists ships_occurred_at_idx on public.ships (occurred_at desc);

alter table public.ships enable row level security;
drop policy if exists ships_anon_read on public.ships;
create policy ships_anon_read on public.ships for select to anon using (true);
drop policy if exists ships_service_all on public.ships;
create policy ships_service_all on public.ships for all to service_role using (true) with check (true);
grant select on public.ships to anon;
grant all on public.ships to service_role;
