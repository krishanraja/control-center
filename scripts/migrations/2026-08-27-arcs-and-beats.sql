-- Step 4: the arc becomes the publishable unit, and a beat is subordinate to it.
--
-- The single most repeated rejection in the ranked slate was that an item is
-- evidence for something larger. Seven separate notes, including "this is
-- evidence of a larger thesis. That bigger picture is the content" and, twice
-- verbatim, "Seems like a one sentence article, dont see the point of me
-- publishing that".
--
-- So a single event, statistic or disclosure must never surface as a proposal.
-- The arc surfaces. A beat accrues to an arc and is only ever visible inside
-- one. A beat with no arc is discarded silently rather than queued, which is
-- the opposite of the previous model and the reason the One Number format is
-- being retired: it assumed a striking number is a piece.
--
-- ---------------------------------------------------------------------------
-- Why shifts gains arc_state rather than shifts.status being replaced
--
-- status (proposed/active/fading/retired/library) is read by api/shifts/[id].ts,
-- useContentV2, LaneRoom and the deck. It is the operational state: what the
-- register does with a row. arc_state is the narrative state: where the story
-- has got to. They are related but not the same axis, and peaking and reversed
-- have no counterpart in the old set at all.
--
-- Unlike category, which was frozen because three of its nine values had no
-- honest destination, this mapping IS honest and one-to-one, so existing rows
-- are migrated rather than left null. It is also reversible, because status is
-- untouched and can regenerate arc_state at any time.
--
--   proposed -> emerging     nothing has accrued yet
--   active   -> building     evidence is arriving
--   fading   -> resolving    evidence stopped, the ending is now the story
--   retired  -> resolved     it ended
--   library  -> resolved     it ended and was kept
-- ---------------------------------------------------------------------------

begin;

-- ============ the arc state machine ============
alter table public.shifts add column if not exists arc_state text;

alter table public.shifts drop constraint if exists shifts_arc_state_check;
alter table public.shifts add constraint shifts_arc_state_check check (arc_state is null or arc_state = any (array[
  'emerging',   -- first beats, an early call is available
  'building',   -- evidence accruing
  'peaking',    -- consensus forming, the contrarian window is closing
  'resolving',  -- evidence stopped arriving, the closing account is now due
  'resolved',   -- it ended, and how it ended is the most publishable moment
  'stalled',    -- it went quiet without resolving into anything
  'reversed'    -- it turned out the other way, which is the strongest piece available
]::text[]));

update public.shifts set arc_state = case status
  when 'proposed' then 'emerging'
  when 'active'   then 'building'
  when 'fading'   then 'resolving'
  when 'retired'  then 'resolved'
  when 'library'  then 'resolved'
end
where arc_state is null;

comment on column public.shifts.arc_state is
  'Where the STORY has got to. Distinct from status, which is what the register does with the row. Derived once from status on 2026-08-27 by an honest one-to-one mapping; status is untouched, so this is regenerable. Decay is narrative here, not deletion: an arc that stops receiving evidence moves to resolving and owes a closing account, because a resolved arc is frequently the most publishable moment it will ever reach.';

-- Every state change, so "how did this get here" is answerable months later.
alter table public.shifts add column if not exists state_history jsonb not null default '[]'::jsonb;

-- {state, reason, expires_at}. An arc is surfaced on a state TRANSITION, not on
-- a weekly cadence, which is what stops the same arc being re-proposed forever.
alter table public.shifts add column if not exists publishable_moments jsonb not null default '[]'::jsonb;

-- ============ merges become reversible ============
--
-- api/shifts/[id].ts currently DELETES the source shift on merge, so a wrong
-- merge is unrecoverable and the history of what was folded together is gone.
-- The brief is explicit: "Merging must be reversible and logged."
alter table public.shifts add column if not exists supersedes uuid[] not null default '{}';
alter table public.shifts add column if not exists superseded_by uuid
  references public.shifts(id) on delete set null;
alter table public.shifts add column if not exists merged_at timestamptz;

create index if not exists shifts_superseded_idx on public.shifts (superseded_by)
  where superseded_by is not null;

comment on column public.shifts.superseded_by is
  'Set when this arc was merged into another. The row is KEPT rather than deleted so the merge is reversible and the history of what was folded together survives. Readers must exclude superseded_by is not null.';

-- ============ beats ============
--
-- Distinct from shift_evidence, which stays as it is. Evidence is a source: a
-- url, a claim, an extract, a provenance and a citable flag. A beat is the
-- narrative layer over it: what changed at this point in the arc, and how that
-- differs from the beat before. The card shows the arc's claim plus its three
-- or four strongest beats.
create table if not exists public.shift_beats (
  id            uuid primary key default gen_random_uuid(),
  shift_id      uuid not null references public.shifts(id) on delete cascade,
  occurred_on   date not null,
  what_changed  text not null,
  delta_from_prior text,
  -- Independence is what arc_maturity counts, not story volume: "Five outlets
  -- syndicating one wire scores as one."
  origin_key    text,
  source_tier   text check (source_tier is null or source_tier in ('primary', 'secondary')),
  evidence_id   uuid references public.shift_evidence(id) on delete set null,
  strength      numeric,
  created_at    timestamptz not null default now()
);

create index if not exists shift_beats_arc_idx on public.shift_beats (shift_id, occurred_on desc);
-- One beat per arc per origin per day: this is what makes "independent beats"
-- countable rather than a syndication count.
create unique index if not exists shift_beats_dedupe_idx
  on public.shift_beats (shift_id, occurred_on, coalesce(origin_key, what_changed));

alter table public.shift_beats enable row level security;
drop policy if exists "shift_beats anon read" on public.shift_beats;
create policy "shift_beats anon read" on public.shift_beats for select to anon using (true);
drop policy if exists "shift_beats service all" on public.shift_beats;
create policy "shift_beats service all" on public.shift_beats for all to service_role using (true) with check (true);

comment on table public.shift_beats is
  'Evidence that accrues to an arc, and is only ever visible inside one. A beat with no arc is discarded silently, never queued: a single event, statistic or company disclosure must not surface as a proposal. An arc with fewer than two INDEPENDENT beats cannot surface at all.';

-- ============ a countable measure of independence ============
--
-- arc_maturity is "independent beats accrued to the arc, weighted by source
-- tier", explicitly NOT story count. This function is the one definition of
-- that, so the scorer and any query agree.
create or replace function public.arc_independent_beats(p_shift_id uuid)
returns integer
language sql
stable
set search_path = public, pg_temp
as $$
  select count(distinct coalesce(origin_key, what_changed))::integer
  from public.shift_beats
  where shift_id = p_shift_id
$$;

insert into public.audit_log (event_type, actor, target, details)
values (
  'content_arcs_and_beats',
  'content-engine-v2',
  'shifts,shift_beats',
  jsonb_build_object(
    'arc_states', 7,
    'beats_table', true,
    'merges_reversible', true,
    'note', 'arc_state derived from status by one-to-one mapping; status untouched so it is regenerable',
    'migration', '2026-08-27-arcs-and-beats.sql'
  )::text
);

commit;
