-- Step 8: connect the rewrite to the running system.
--
-- Steps 1 to 7 all shipped and all passed their guards. None of it ran. The
-- Content tab was still served entirely by content_decisions, scoreArc() and
-- surface() were called by nothing, lintCard() was reached by nothing, and all
-- 54 live arcs had lens null and theme_id null. A whole engine sat beside the
-- one actually serving the queue.
--
-- This migration adds what the chain needs to run and records the backfill that
-- gave it data on day one.

begin;

-- ============ classification provenance ============
alter table public.shifts add column if not exists classified_at timestamptz;
alter table public.shifts add column if not exists classify_reason text;
-- Set when an arc matched no folder but names a question durable enough to open
-- one. Without it an unthemed arc is blocked outright, so the two reserved
-- slots could never fill, which is the failure check-arc-scoring.mts warns of.
alter table public.shifts add column if not exists plausible_new_theme boolean not null default false;

comment on column public.shifts.classify_reason is
  'Why this arc got the lens it got, or, when lens is null, what kind of story it is instead. Written on every classification INCLUDING discards, because "why did this never surface" was unanswerable in the previous engine and that is how it produced 54 proposals with zero explanations.';

-- ============ the surfacing record ============
create table if not exists public.arc_cards (
  id           uuid primary key default gen_random_uuid(),
  shift_id     uuid not null references public.shifts(id) on delete cascade,
  week         text not null,
  headline         text,
  what_changed     text,
  why_now          text,
  the_opening      text,
  where_this_goes  text,
  reader_decision  text,
  format       text,
  score        numeric,
  components   jsonb not null default '[]'::jsonb,
  blocked      boolean not null default false,
  blocks       text[] not null default '{}',
  surfaced     boolean not null default false,
  surface_reason text,
  reserved_slot  boolean not null default false,
  created_at   timestamptz not null default now(),
  unique (shift_id, week)
);

create index if not exists arc_cards_week_idx on public.arc_cards (week, surfaced, score desc);

alter table public.arc_cards enable row level security;
drop policy if exists "arc_cards anon read" on public.arc_cards;
create policy "arc_cards anon read" on public.arc_cards for select to anon using (true);
drop policy if exists "arc_cards service all" on public.arc_cards;
create policy "arc_cards service all" on public.arc_cards for all to service_role using (true) with check (true);

comment on table public.arc_cards is
  'One row per arc per week: the composed card, the score with its components, and whether it surfaced. Blocked and unsurfaced arcs are written too, with their reasons, so a quiet week is distinguishable from a broken job.';

-- ============ the 26 Aug backfill, recorded ============
--
-- Applied by hand against the same six lenses the classifier uses, because the
-- build sandbox had no ANTHROPIC_API_KEY and 54 arcs with lens null meant
-- nothing downstream could run at all. api/_classify.ts handles every arc from
-- here; this is the one-off that gave it a starting point.
--
-- Result: 26 classified, 28 discarded (52 percent), 8 filed under a folder.
-- The discards were governance 10, org 6, proof 5, security 4, orchestration 1,
-- model 1, product 1, which is precisely the corpus item B04 in the ranked
-- slate describes: "its vocabulary had words for governance and none for
-- pricing, so it could not see the stories I wanted". Fifty four proposals.
-- These fifty four.
--
-- The full slug-to-lens assignment was applied directly; it is reproducible
-- from shifts.lens and shifts.classify_reason, both of which carry it.

-- Channel follows the lens, exactly as api/_classify.ts derives it. An arc that
-- already had a lane keeps it: a hand-classified row is never overwritten.
update public.shifts set lane = case lens
  when 'pricing_packaging'    then 'paid'
  when 'distribution_channel' then 'paid'
  when 'buyer_behaviour'      then 'paid'
  when 'moat_defensibility'   then 'built'
  when 'build_practice'       then 'built'
end
where superseded_by is null and lens is not null and lane is null
  and lens <> 'category_positioning';

insert into public.audit_log (event_type, actor, target, details)
values (
  'content_chain_connected',
  'content-engine-v2',
  'shifts,arc_cards',
  jsonb_build_object(
    'classified', 26, 'discarded', 28, 'discard_rate', 0.52, 'themed', 8,
    'note', 'classify -> compose -> lint -> score -> surface -> serve is now joined up and scheduled; check-content-chain.mts holds it',
    'migration', '2026-08-26-classify-and-surface.sql'
  )::text
);

commit;
