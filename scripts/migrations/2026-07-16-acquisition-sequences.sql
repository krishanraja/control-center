-- Acquisition OS: first-class sequence proposals + send sampling
-- (Growth tab Phase 2 — see docs/MINDMAKER_OS_ARCHITECTURE.md §11.5)
--
-- 1. acquisition_sequences: a proposed nurture / frame-promotion /
--    re-engagement sequence awaiting a Krish ruling. Surfaces in
--    decisions_waiting as kind='sequence_approval' (a typed decision,
--    not a queue — one strategic ruling per sequence).
-- 2. acquisition_sends gains sampling + approval-audit columns so the
--    L1/L2/L3 autonomy ladder is mechanical: L1 queues every send with
--    sample_required=true, L2 samples 1-in-10, L3 none.

create table if not exists public.acquisition_sequences (
  id uuid primary key default gen_random_uuid(),
  lane text not null references public.venture_registry(slug),
  name text not null,
  sequence_type text not null default 'nurture'
    check (sequence_type in ('nurture','frame_promotion','re_engagement')),
  frame_version text not null,
  -- [{touch_number, delay_days, subject, body}] — the full sequence copy.
  touches jsonb not null default '[]'::jsonb,
  rationale text,
  proposed_by text not null default 'maya',
  status text not null default 'proposed'
    check (status in ('draft','proposed','approved','rejected','retired')),
  approved_by text,
  approved_at timestamptz,
  rejection_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.acquisition_sequences enable row level security;

-- Sequence copy is the same exposure class as content_ideas drafts: readable
-- in the browser for review. Writes go through the service-role API only.
drop policy if exists acquisition_sequences_anon_read on public.acquisition_sequences;
create policy acquisition_sequences_anon_read
  on public.acquisition_sequences for select to anon using (true);
drop policy if exists acquisition_sequences_service_all on public.acquisition_sequences;
create policy acquisition_sequences_service_all
  on public.acquisition_sequences for all to service_role using (true) with check (true);

grant select on public.acquisition_sequences to anon;
grant all on public.acquisition_sequences to service_role;

-- acquisition_sends: sampling + approval audit. NOTE: acquisition_sends has
-- RLS enabled with NO anon policies (deny-all) — rendered bodies + lead PII
-- stay behind the service-role /api/acquisition/* routes. Keep it that way.
alter table public.acquisition_sends
  add column if not exists sequence_id uuid references public.acquisition_sequences(id),
  add column if not exists sample_required boolean not null default true,
  add column if not exists approved_at timestamptz,
  add column if not exists approved_by text,
  add column if not exists rejection_reason text;

create index if not exists acquisition_sends_lane_status_idx
  on public.acquisition_sends (lane, status);

-- Realtime: sequences are anon-readable so their events can drive the
-- decisions inbox live-refresh. acquisition_sends is deliberately NOT added —
-- deny-all RLS means the browser would never receive its events anyway; the
-- 60s Growth-tab poll and mount-time inbox fetch cover queued-send freshness.
do $$
begin
  alter publication supabase_realtime add table public.acquisition_sequences;
exception when duplicate_object then null;
end $$;
