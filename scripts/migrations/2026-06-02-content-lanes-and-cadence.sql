-- 2026-06-02 — Content tab: brand-lane dimension + cadence ledger.
-- Lanes are destinations (signal_noise | mindmaker | techonomic |
-- builder_economy_ig); pillars remain the orthogonal theme layer.
-- Idempotent; safe to re-run.

-- Lane dimension on content_ideas.
alter table public.content_ideas add column if not exists lane text;
alter table public.content_ideas add column if not exists lane_slot text;
alter table public.content_ideas add column if not exists cadence_due_at timestamptz;

-- Backfill lane from the existing jsonb distribution array.
-- Priority: techonomic > signal_noise > mindmaker (default thought-leadership home).
update public.content_ideas set lane = case
  when coalesce(distribution,'[]'::jsonb) ? 'techonomic'       then 'techonomic'
  when coalesce(distribution,'[]'::jsonb) ? 'signal-noise-pod' then 'signal_noise'
  else 'mindmaker'
end
where lane is null;

-- Cadence ledger: one row per lane (and slot) — the publishing commitment.
create table if not exists public.content_cadence (
  id                text primary key,
  lane              text not null,
  slot              text,
  label             text,
  interval_days     int,
  target_per_week   numeric,
  last_published_at timestamptz,
  next_due_at       timestamptz,
  status            text default 'on_pace',
  streak            int  default 0,
  created_at        timestamptz default now(),
  updated_at        timestamptz default now()
);

alter table public.content_cadence enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where tablename='content_cadence' and policyname='anon_read') then
    create policy anon_read on public.content_cadence for select using (true);
  end if;
  if not exists (select 1 from pg_policies where tablename='content_cadence' and policyname='service_all') then
    create policy service_all on public.content_cadence for all to service_role using (true) with check (true);
  end if;
end $$;

-- REFOCUSED 2026-08-11. All content now lives under the Mindmaker Live venture,
-- which has exactly two signature formats: Paid (the investigation, folding in
-- Techonomic) and Built (folding in the Builder Economy thesis). Signal & Noise
-- became a distribution channel, not a lane, and the Make Your Mind Up weekly
-- retired because that name is now the CTRL lead magnet at makeyourmindup.ai.
--
-- The two surviving ids are DELIBERATELY the old ones. This file is hand-run and
-- uses `on conflict (id) do nothing`, so reusing the ids means a re-run of any
-- older checkout of this script cannot resurrect a retired lane. Do not "tidy"
-- them to match their new lane; the mismatch is the guard.
insert into public.content_cadence (id,lane,slot,label,interval_days,target_per_week) values
 ('cadence:techonomic',              'mindmaker_live',     'paid',          'Paid',                            7, 1),
 ('cadence:builder_economy_ig',      'mindmaker_live',     'built',         'Built',                          14, 0.5)
on conflict (id) do nothing;
