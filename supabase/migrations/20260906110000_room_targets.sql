-- The Room: job 1 of the five (docs/plans/one-swing/CHARTER.md).
--
-- One row per named leader who fits the face. The OS finds a live signal
-- about their business, drafts a warm approach in Krish's voice, and stops.
-- Krish sends. The row then walks a fixed ladder: listed, drafted, sent,
-- replied, call_booked, call_taken, room_booked, room_paid, with not_now as
-- the one side exit and the only way back to listed. Every step keeps its own
-- timestamp so the scorecard (job 2) can count sent, calls and paid rooms per
-- week from this table alone.
--
-- A trigger is only ever stored with its source URL. A signal without a
-- citation is not a signal here; the drafting code writes nulls and says
-- "no live trigger found" instead (the cited-or-silent standard).
--
-- Posture: the same as bridge_candidates and contact_intelligence
-- (docs/DECISIONS/011). why_face, the trigger and the draft are private
-- judgments about a named person, so the table is service-role only. RLS is
-- enabled and forced, no policy is created, and anon and authenticated lose
-- every grant. The browser reaches it through /api/room/* behind the cookie
-- gate in api/_auth.ts.

create table if not exists public.room_targets (
  id uuid primary key default gen_random_uuid(),
  contact_id uuid not null unique references public.contacts(id) on delete cascade,

  -- One or two sentences on why this person fits the face.
  why_face text not null,

  -- The live signal that makes this week the week to write. Never stored
  -- without its source.
  trigger_signal text,
  trigger_source_url text,
  trigger_found_at timestamptz,

  -- The draft. draft_url is the Gmail draft when Google is configured.
  draft_subject text,
  draft_body text,
  draft_url text,
  drafted_at timestamptz,

  state text not null default 'listed'
    check (state in (
      'listed', 'drafted', 'sent', 'replied', 'call_booked', 'call_taken',
      'room_booked', 'room_paid', 'not_now'
    )),

  -- One stamp per step. drafted_at above doubles as the drafted stamp.
  listed_at timestamptz not null default now(),
  sent_at timestamptz,
  replied_at timestamptz,
  call_booked_at timestamptz,
  call_taken_at timestamptz,
  room_booked_at timestamptz,
  room_paid_at timestamptz,
  not_now_at timestamptz,

  -- What the room was invoiced at, in pounds. Required when state is room_paid.
  cash_gbp numeric check (cash_gbp is null or cash_gbp >= 0),

  -- Who put this person on the list.
  sourced_by text not null default 'os' check (sourced_by in ('krish', 'os')),
  notes text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.room_targets is
  'The Room list: named leaders who fit the face, with the live trigger, the draft and the state ladder. Service role only. Drafts never send from here.';
comment on column public.room_targets.trigger_signal is
  'One cited sentence. Null whenever trigger_source_url is null: a signal without a source is not stored.';
comment on column public.room_targets.cash_gbp is
  'Invoiced value of the room in GBP. Required at room_paid; the scorecard sums it per week.';

-- The Monday run picks the listed targets with the freshest trigger first.
create index if not exists room_targets_state_trigger_idx
  on public.room_targets (state, trigger_found_at desc nulls last);

-- Small local trigger rather than a shared helper: the repo's public
-- touch_updated_at() exists live but is not declared in this migrations
-- tree, and this file must apply on its own.
create or replace function public.room_targets_touch_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

revoke all on function public.room_targets_touch_updated_at() from public, anon, authenticated;

drop trigger if exists room_targets_touch_updated_at on public.room_targets;
create trigger room_targets_touch_updated_at
  before update on public.room_targets
  for each row execute function public.room_targets_touch_updated_at();

alter table public.room_targets enable row level security;
alter table public.room_targets force row level security;
revoke all on table public.room_targets from anon, authenticated;
