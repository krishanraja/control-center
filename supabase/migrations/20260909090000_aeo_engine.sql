-- AEO engine landing (2026-09-09): the weekly answer-engine research machine.
--
-- krishanraja/AEO-Engine runs every Sunday 04:00 UTC on GitHub Actions. For
-- every active subject (a venture Krish sells, a company he wants to sell to,
-- a company he wants to be like) it reads the week's calls, proposes the
-- queries that subject's buyers or leaders ask the answer engines, asks the
-- engines, scores demand honestly (proxies, labelled), and writes one digest:
-- the strongest signal, three to five article recommendations, a watch list
-- and the biggest competitor gap. Control Center is the only surface: the
-- engine POSTs one packet per subject per week to api/aeo/ingest.ts and this
-- migration is where that packet lands.
--
-- The growth_* tables (growth_touchpoints, growth_geo_probes,
-- growth_council_reviews, growth_creative_queue, growth_social_accounts) were
-- applied live in July and August 2026 and have no file under
-- supabase/migrations. Their columns and CHECK constraints are recorded in
-- docs/MINDMAKE_OS_ARCHITECTURE.md section 4.2 and were read back from the
-- database on 2026-09-08 before this file was written. Every ALTER below is
-- idempotent so the file can be re-applied.
--
-- Five changes:
--   1. growth_aeo_subjects: the one registry of what the machine researches.
--   2. growth_geo_probes extended in place (never a sibling probe table): the
--      subject, the kind, the run and the query each answer belongs to. The
--      product_slug CHECK is re-declared so venture rows keep the old
--      invariant and prospect or aspiration rows carry the subject slug.
--   3. growth_aeo_queries and growth_aeo_digests: the scored corpus and the
--      weekly read, one per subject per week.
--   4. aeo_commands: the Run-now ledger, the twin of hunter_commands.
--   5. content_ideas: 'aeo_signal' joins the source_type CHECK (full list
--      re-declared; canon before this: 20260907160000_build_signals.sql) with
--      its own live source_ref index, so a re-run refreshes the week's rows
--      instead of duplicating them.

begin;

-- 1. Subjects ---------------------------------------------------------------

create table if not exists public.growth_aeo_subjects (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('venture', 'prospect', 'aspiration')),
  slug text not null check (slug ~ '^[a-z0-9][a-z0-9-]{0,79}$'),
  name text not null check (char_length(name) between 1 and 120),
  domains text[] not null default '{}'::text[],
  competitor_domains text[] not null default '{}'::text[],
  icp_line text check (char_length(icp_line) <= 400),
  seed_topics text[] not null default '{}'::text[],
  never_say text[] not null default '{}'::text[],
  -- Ventures only: the Growth product slug the council and the probes key on.
  product_slug text check (product_slug in ('ctrl', 'circle', 'pulse', 'full-time', 'mindmake')),
  -- Prospects only: the Room target this company's leader sits on.
  room_target_id uuid references public.room_targets(id) on delete set null,
  active boolean not null default true,
  notes text check (char_length(notes) <= 2000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (kind, slug),
  constraint growth_aeo_subjects_venture_has_product check ((kind = 'venture') = (product_slug is not null)),
  constraint growth_aeo_subjects_room_is_prospect check (room_target_id is null or kind = 'prospect')
);
create unique index if not exists growth_aeo_subjects_product_slug_uq
  on public.growth_aeo_subjects (product_slug) where product_slug is not null;

-- The five ventures, seeded from OUR_DOMAINS in api/growth/geo-probe.ts.
-- Competitor lists start empty on purpose: an invented competitor is worse
-- than none, and the Growth tab lets Krish name them.
insert into public.growth_aeo_subjects (kind, slug, name, domains, product_slug, icp_line, seed_topics)
values
  ('venture', 'ctrl', 'CTRL', array['ctrl.mindmake.co', 'mindmake.co'], 'ctrl',
   'A leader who wants their own decisions to stay theirs while AI does the work',
   array['AI decision tools for leaders', 'building a personal AI brain', 'decision clarity for founders']),
  ('venture', 'circle', 'Fractionl Circle', array['circle.fractionl.ai', 'fractionl.ai'], 'circle',
   'A senior operator going fractional who needs their first clients',
   array['how to get fractional clients', 'fractional executive networks', 'going fractional']),
  ('venture', 'pulse', 'Fractionl Pulse', array['pulse.fractionl.ai', 'fractionl.ai'], 'pulse',
   'A company deciding whether to hire a fractional leader',
   array['fractional vs full-time executive', 'hiring a fractional CMO', 'fractional leadership demand']),
  ('venture', 'full-time', 'Full Time', array['fulltime.fm'], 'full-time',
   'A football fan who wants the day recapped without the noise',
   array['daily football recap', 'AI football news', 'football podcast daily']),
  ('venture', 'mindmake', 'Mindmake', array['mindmake.co', 'mindmakerlive.substack.com'], 'mindmake',
   'A senior leader at a PE or VC backed media, adtech, publishing or data business, quietly behind on what is coming',
   array['AI strategy for media businesses', 'build your AI brain', 'AI GTM for non-AI-native companies', 'the money of AI'])
on conflict (kind, slug) do nothing;

-- 2. Probes: extend in place -------------------------------------------------

alter table public.growth_geo_probes add column if not exists subject_id uuid references public.growth_aeo_subjects(id) on delete set null;
alter table public.growth_geo_probes add column if not exists subject_kind text not null default 'venture';
alter table public.growth_geo_probes add column if not exists run_id uuid;
alter table public.growth_geo_probes add column if not exists query_id uuid;

alter table public.growth_geo_probes drop constraint if exists growth_geo_probes_subject_kind_check;
alter table public.growth_geo_probes add constraint growth_geo_probes_subject_kind_check
  check (subject_kind in ('venture', 'prospect', 'aspiration'));

-- Venture rows keep the exact list the live CHECK carried (read back
-- 2026-09-08). A prospect or aspiration row carries its subject slug here so
-- the column stays NOT NULL and every existing reader keeps working.
alter table public.growth_geo_probes drop constraint if exists growth_geo_probes_product_slug_check;
alter table public.growth_geo_probes add constraint growth_geo_probes_product_slug_check
  check (
    subject_kind <> 'venture'
    or product_slug in ('ctrl', 'circle', 'pulse', 'full-time', 'mindmake', 'publication', 'signal-noise', 'mindmaker')
  );

create index if not exists growth_geo_probes_run_id_idx on public.growth_geo_probes (run_id) where run_id is not null;
create index if not exists growth_geo_probes_subject_run_at_idx on public.growth_geo_probes (subject_id, run_at desc);

-- Historic venture rows join their subject so the first engine run compares
-- against them as the baseline.
update public.growth_geo_probes p
set subject_id = s.id
from public.growth_aeo_subjects s
where p.subject_id is null and p.subject_kind = 'venture' and s.kind = 'venture' and s.product_slug = p.product_slug;

-- 3. The scored corpus and the weekly digest ---------------------------------

create table if not exists public.growth_aeo_queries (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null,
  query_id uuid not null,
  subject_id uuid not null references public.growth_aeo_subjects(id) on delete cascade,
  week_start date not null,
  query text not null check (char_length(query) between 3 and 400),
  source text not null check (source in ('transcript', 'gap', 'seed', 'striking_distance', 'watch_carry', 'room_signal')),
  demand_score integer not null check (demand_score between 0 and 100),
  demand_basis jsonb not null default '{}'::jsonb check (jsonb_typeof(demand_basis) = 'object'),
  call_evidence jsonb not null default '[]'::jsonb check (jsonb_typeof(call_evidence) = 'array'),
  gap jsonb not null default '{}'::jsonb check (jsonb_typeof(gap) = 'object'),
  trend text check (trend in ('new', 'up', 'flat', 'down')),
  status text not null check (status in ('watch', 'recommend', 'drop')),
  touchpoint_id uuid references public.growth_touchpoints(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (subject_id, week_start, query_id)
);
create index if not exists growth_aeo_queries_week_idx on public.growth_aeo_queries (subject_id, week_start desc, demand_score desc);

create table if not exists public.growth_aeo_digests (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null,
  subject_id uuid not null references public.growth_aeo_subjects(id) on delete cascade,
  week_start date not null,
  themes jsonb not null default '[]'::jsonb check (jsonb_typeof(themes) = 'array'),
  themes_status text not null check (themes_status in ('ok', 'no_calls', 'no_attributed_calls', 'fireflies_unavailable', 'not_applicable')),
  strongest_signal text check (char_length(strongest_signal) <= 240),
  -- Each item: n, title, target_query, query_id, angle, evidence[], engines[],
  -- demand, plus content_idea_id and dismissed_at written by Control Center.
  recommendations jsonb not null default '[]'::jsonb check (jsonb_typeof(recommendations) = 'array'),
  watch_list jsonb not null default '[]'::jsonb check (jsonb_typeof(watch_list) = 'array'),
  competitor_gap jsonb not null default '{}'::jsonb check (jsonb_typeof(competitor_gap) = 'object'),
  -- Aspirations only: which of their pages the engines cite.
  playbook jsonb check (playbook is null or jsonb_typeof(playbook) = 'array'),
  -- Prospects only: one sentence Krish could open with.
  approach_hook text check (char_length(approach_hook) <= 300),
  stats jsonb not null default '{}'::jsonb check (jsonb_typeof(stats) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (subject_id, week_start)
);
create index if not exists growth_aeo_digests_week_idx on public.growth_aeo_digests (week_start desc, subject_id);

-- 4. Run now -----------------------------------------------------------------

create table if not exists public.aeo_commands (
  id bigint generated always as identity primary key,
  command text not null default 'run' check (command = 'run'),
  subject_id uuid references public.growth_aeo_subjects(id) on delete set null,
  requested_by text not null default 'krish',
  state text not null default 'queued' check (state in ('queued', 'running', 'done', 'failed', 'superseded')),
  requested_at timestamptz not null default now(),
  started_at timestamptz,
  finished_at timestamptz,
  run_id uuid,
  result text check (char_length(result) <= 600),
  error text check (char_length(error) <= 600)
);
-- One queued press per key. A second press while one waits is a no-op.
create unique index if not exists aeo_commands_one_queued_uq
  on public.aeo_commands ((coalesce(subject_id::text, 'all'))) where state = 'queued';
create index if not exists aeo_commands_requested_idx on public.aeo_commands (requested_at desc);

-- 5. content_ideas: aeo_signal -------------------------------------------------

alter table public.content_ideas drop constraint if exists content_ideas_source_type_check;
alter table public.content_ideas add constraint content_ideas_source_type_check
  check (source_type = any (array[
    'signal_inbox',
    'cleo_chat',
    'agatha_chat',
    'openclaw_workspace',
    'zara_signal',
    'manual',
    'inspiration_sweep',
    'synthesis_hypothesis',
    'customer_voice',
    'crm_opportunity',
    'synthesis',
    'pool_headline',
    'lane_sourcing',
    'requested_research',
    'creator_move',
    'build_signal',
    -- New 2026-09-09: one article recommendation from the week's answer-engine
    -- research, written by api/aeo/ingest.ts and judged by the editorial radar.
    'aeo_signal'
  ]));

-- Re-stated so the newest migration naming the CHECK still carries it
-- (scripts/check-build-signals.mts reads that file).
create unique index if not exists content_ideas_build_signal_ref_live_uq
  on public.content_ideas (source_ref)
  where source_type = 'build_signal'
    and buried_at is null
    and source_ref is not null
    and parent_idea_id is null;

create unique index if not exists content_ideas_aeo_signal_ref_live_uq
  on public.content_ideas (source_ref)
  where source_type = 'aeo_signal'
    and buried_at is null
    and source_ref is not null
    and parent_idea_id is null;

-- RLS, house style: anon reads what the Growth tab renders, service_role does
-- everything, the command ledger is service-only and read through /api/aeo/run.

alter table public.growth_aeo_subjects enable row level security;
alter table public.growth_aeo_queries  enable row level security;
alter table public.growth_aeo_digests  enable row level security;
alter table public.aeo_commands        enable row level security;

drop policy if exists growth_aeo_subjects_anon_read on public.growth_aeo_subjects;
create policy growth_aeo_subjects_anon_read on public.growth_aeo_subjects for select to anon using (true);
drop policy if exists growth_aeo_subjects_service_all on public.growth_aeo_subjects;
create policy growth_aeo_subjects_service_all on public.growth_aeo_subjects for all to service_role using (true) with check (true);

drop policy if exists growth_aeo_queries_anon_read on public.growth_aeo_queries;
create policy growth_aeo_queries_anon_read on public.growth_aeo_queries for select to anon using (true);
drop policy if exists growth_aeo_queries_service_all on public.growth_aeo_queries;
create policy growth_aeo_queries_service_all on public.growth_aeo_queries for all to service_role using (true) with check (true);

drop policy if exists growth_aeo_digests_anon_read on public.growth_aeo_digests;
create policy growth_aeo_digests_anon_read on public.growth_aeo_digests for select to anon using (true);
drop policy if exists growth_aeo_digests_service_all on public.growth_aeo_digests;
create policy growth_aeo_digests_service_all on public.growth_aeo_digests for all to service_role using (true) with check (true);

drop policy if exists aeo_commands_service_all on public.aeo_commands;
create policy aeo_commands_service_all on public.aeo_commands for all to service_role using (true) with check (true);

grant select on public.growth_aeo_subjects, public.growth_aeo_queries, public.growth_aeo_digests to anon;
grant all on public.growth_aeo_subjects, public.growth_aeo_queries, public.growth_aeo_digests, public.aeo_commands to service_role;

-- Realtime: the Growth tab subscribes on postgres_changes. The older growth
-- tables were never added to the publication (read back 2026-09-08), so the
-- new ones are added here and the probes table joins them.
do $$
declare t text;
begin
  foreach t in array array['growth_aeo_subjects', 'growth_aeo_queries', 'growth_aeo_digests', 'growth_geo_probes']
  loop
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;

insert into public.audit_log (event_type, actor, details)
values (
  'aeo_engine_migration',
  'system',
  jsonb_build_object(
    'action', 'schema',
    'note', 'AEO engine landing: growth_aeo_subjects (five ventures seeded), subject and run columns on growth_geo_probes, growth_aeo_queries, growth_aeo_digests, aeo_commands, aeo_signal source type and its live source_ref index, realtime on the new tables.'
  )::text
);

commit;
