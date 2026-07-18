-- Direction Studio: the layer Krish authors and locks; the system propagates
-- from the single locked version per lane. Supersedes venture_registry.voice_profile
-- (kept as fallback; directions are canonical once locked).
-- APPLIED LIVE 2026-07-17 (migration name: lane_directions_control_layer).

create table if not exists public.lane_directions (
  id uuid primary key default gen_random_uuid(),
  lane text not null references public.venture_registry(slug),
  version integer not null,
  status text not null default 'draft' check (status in ('draft','locked','superseded')),
  -- The authored direction (all Krish-controlled):
  positioning text,
  messaging_pillars jsonb not null default '[]'::jsonb,   -- [{pillar, proof}]
  offers jsonb not null default '[]'::jsonb,               -- [{name, price, url}]
  icp text,
  voice text,
  never_say text[] not null default '{}',
  creative_direction jsonb not null default '{}'::jsonb,   -- {sender, mailbox, palette_ref, canva_template_ids[], image_style, video_style}
  channel_priorities text[] not null default '{}',
  notes text,
  locked_at timestamptz,
  locked_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (lane, version)
);

-- Exactly one locked version per lane (partial unique index).
create unique index if not exists lane_directions_one_locked
  on public.lane_directions (lane) where status = 'locked';

alter table public.lane_directions enable row level security;
drop policy if exists lane_directions_anon_read on public.lane_directions;
create policy lane_directions_anon_read on public.lane_directions for select to anon using (true);
drop policy if exists lane_directions_service_all on public.lane_directions;
create policy lane_directions_service_all on public.lane_directions for all to service_role using (true) with check (true);
grant select on public.lane_directions to anon;
grant all on public.lane_directions to service_role;

-- Version stamps: every generated artifact records which locked direction produced it.
alter table public.acquisition_sends      add column if not exists direction_version integer;
alter table public.acquisition_sequences  add column if not exists direction_version integer;
alter table public.content_ideas          add column if not exists direction_version integer;

do $$ begin
  alter publication supabase_realtime add table public.lane_directions;
exception when duplicate_object then null; end $$;

-- Seed v1 LOCKED directions from the existing voice profiles (review-and-adjust).
insert into public.lane_directions
  (lane, version, status, positioning, icp, voice, never_say, channel_priorities, creative_direction, locked_at, locked_by, notes)
select
  v.slug, 1, 'locked',
  v.voice_profile->>'strategy',
  v.voice_profile->>'icp',
  v.voice_profile->>'voice',
  coalesce((select array_agg(x) from jsonb_array_elements_text(coalesce(v.voice_profile->'never_say','[]'::jsonb)) x), '{}'),
  coalesce((select array_agg(x) from jsonb_array_elements_text(coalesce(v.voice_profile->'channels','[]'::jsonb)) x), '{}'),
  jsonb_build_object('sender', v.voice_profile->>'sender', 'mailbox', v.voice_profile->>'mailbox'),
  now(), 'krish',
  'Seeded from voice_profile v1 (2026-07-17). Review + relock to make it yours.'
from public.venture_registry v
where v.slug in ('mm_ctrl','fractionl_pulse','fractionl_circle','plinth','full_time')
  and v.voice_profile is not null
  and not exists (select 1 from public.lane_directions d where d.lane = v.slug);
