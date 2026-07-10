-- Content Engine v2: weekly brief + shifts register (docs/CONTENT-ENGINE-V2-SPEC.md)
-- Applied via Supabase Management API. RLS house pattern: anon SELECT, service_role ALL.

-- ============ shifts: the persistent register ============
create table if not exists public.shifts (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  title text not null,
  summary text not null,
  implication text not null,
  category text not null check (category in
    ('model','economics','tools','orchestration','product','governance','security','org','proof')),
  status text not null default 'proposed' check (status in
    ('proposed','active','fading','retired','library')),
  first_seen_on date not null,
  last_evidence_on date,
  momentum real not null default 0,
  momentum_history jsonb not null default '[]'::jsonb,
  day_span_total int not null default 0,
  source_count_total int not null default 0,
  story_count int not null default 0,
  provenance text not null default 'lived' check (provenance in ('reconstructed','lived','mixed')),
  embedding vector(1536),
  decision jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists shifts_status_momentum_idx on public.shifts (status, momentum desc);

alter table public.shifts enable row level security;
drop policy if exists "shifts anon read" on public.shifts;
create policy "shifts anon read" on public.shifts for select to anon using (true);
drop policy if exists "shifts service all" on public.shifts;
create policy "shifts service all" on public.shifts for all to service_role using (true) with check (true);

-- ============ shift_evidence: dated receipts, append-only ============
create table if not exists public.shift_evidence (
  id uuid primary key default gen_random_uuid(),
  shift_id uuid not null references public.shifts(id) on delete cascade,
  occurred_on date not null,
  headline text not null,
  source text,
  url text,
  provenance text not null check (provenance in ('reconstructed','lived')),
  week_label text,
  created_at timestamptz not null default now()
);
create index if not exists shift_evidence_shift_idx on public.shift_evidence (shift_id, occurred_on desc);
create unique index if not exists shift_evidence_dedupe_idx
  on public.shift_evidence (shift_id, occurred_on, headline);

alter table public.shift_evidence enable row level security;
drop policy if exists "shift_evidence anon read" on public.shift_evidence;
create policy "shift_evidence anon read" on public.shift_evidence for select to anon using (true);
drop policy if exists "shift_evidence service all" on public.shift_evidence;
create policy "shift_evidence service all" on public.shift_evidence for all to service_role using (true) with check (true);

-- ============ weekly_briefs: the brief object ============
create table if not exists public.weekly_briefs (
  id uuid primary key default gen_random_uuid(),
  week text unique not null,                 -- '2026-W28'
  title text,
  status text not null default 'assembling' check (status in
    ('assembling','ready','in_review','approved','pushed','sent','archived')),
  sections jsonb not null default '{}'::jsonb,
  body_md text,
  versions jsonb not null default '[]'::jsonb,
  stats jsonb not null default '{}'::jsonb,
  formats jsonb not null default '[]'::jsonb,
  assembled_at timestamptz,
  approved_at timestamptz,
  pushed_at timestamptz,
  sent_at timestamptz,
  purge_ran_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists weekly_briefs_status_idx on public.weekly_briefs (status, week desc);

alter table public.weekly_briefs enable row level security;
drop policy if exists "weekly_briefs anon read" on public.weekly_briefs;
create policy "weekly_briefs anon read" on public.weekly_briefs for select to anon using (true);
drop policy if exists "weekly_briefs service all" on public.weekly_briefs;
create policy "weekly_briefs service all" on public.weekly_briefs for all to service_role using (true) with check (true);

-- ============ content_decisions: the finite weekly queue ============
create table if not exists public.content_decisions (
  id uuid primary key default gen_random_uuid(),
  week text not null,
  kind text not null check (kind in
    ('brief_review','shift_proposal','shift_fading','graduation','purge_preview')),
  ref uuid not null,
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'pending' check (status in ('pending','done','dismissed')),
  resolution jsonb,
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);
create index if not exists content_decisions_open_idx on public.content_decisions (status, week desc, kind);
create unique index if not exists content_decisions_dedupe_idx
  on public.content_decisions (week, kind, ref);

alter table public.content_decisions enable row level security;
drop policy if exists "content_decisions anon read" on public.content_decisions;
create policy "content_decisions anon read" on public.content_decisions for select to anon using (true);
drop policy if exists "content_decisions service all" on public.content_decisions;
create policy "content_decisions service all" on public.content_decisions for all to service_role using (true) with check (true);

-- ============ content_ideas: horizon + purge + linkage columns ============
alter table public.content_ideas add column if not exists horizon text not null default 'news'
  check (horizon in ('news','evergreen'));
alter table public.content_ideas add column if not exists expires_at timestamptz;
alter table public.content_ideas add column if not exists shift_id uuid references public.shifts(id) on delete set null;
alter table public.content_ideas add column if not exists library_at timestamptz;
create index if not exists content_ideas_purge_idx on public.content_ideas (expires_at)
  where expires_at is not null and shift_id is null and library_at is null;

-- widen source_type CHECK with pool_headline
alter table public.content_ideas drop constraint if exists content_ideas_source_type_check;
alter table public.content_ideas add constraint content_ideas_source_type_check check (source_type = any (array[
  'signal_inbox','cleo_chat','agatha_chat','openclaw_workspace','zara_signal','manual',
  'inspiration_sweep','synthesis_hypothesis','customer_voice','crm_opportunity','synthesis',
  'pool_headline']::text[]));

-- updated_at maintenance
create or replace function public.touch_updated_at() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;
drop trigger if exists trg_shifts_touch on public.shifts;
create trigger trg_shifts_touch before update on public.shifts
  for each row execute function public.touch_updated_at();
drop trigger if exists trg_weekly_briefs_touch on public.weekly_briefs;
create trigger trg_weekly_briefs_touch before update on public.weekly_briefs
  for each row execute function public.touch_updated_at();
