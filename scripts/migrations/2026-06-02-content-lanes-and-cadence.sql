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

insert into public.content_cadence (id,lane,slot,label,interval_days,target_per_week) values
 ('cadence:signal_noise',            'signal_noise',       null,            'Signal & Noise deep-dive',       14, 0.5),
 ('cadence:mindmaker:roundup',       'mindmaker',          'roundup',       'Mindmaker: AI-leader roundup',    4, 1),
 ('cadence:mindmaker:field_learning','mindmaker',          'field_learning','Mindmaker: live field learning',  4, 1),
 ('cadence:techonomic',              'techonomic',         null,            'Techonomic investigation',        7, 1),
 ('cadence:builder_economy_ig',      'builder_economy_ig', null,            'Builder Economy (Instagram)',     1, 7)
on conflict (id) do nothing;
