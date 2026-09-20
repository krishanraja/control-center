-- A source that stops producing must be loud, not quiet.
--
-- Krish, 2026-09-20, on the attend lane: "nope but I like that feature so have
-- it fixed and more antifragile." The attend lane stopped on 2026-09-09 when
-- its Gmail ingest started firing into a 401, and nobody found out for eleven
-- days. Fixing that one lane would leave the fault that hid it, because the
-- fault is not in the lane. It is that no source anywhere declares how often it
-- is supposed to produce, so there is nothing a silence can be measured
-- against and every dead source looks exactly like a quiet week.
--
-- Read on 2026-09-20, before this migration, with nothing raising a hand:
--
--   inspiration_sweep   105 hours quiet, and it runs TWICE A DAY. The Gmail
--                       ledger it reads is current at 18 hours, so the sweep is
--                       reading messages and making no ideas from any of them.
--   drive_files         753 hours quiet, 31 days, on a folder scanned every two
--                       hours.
--   lane_sourcing       614 hours quiet.
--   aeo_signal          284 hours quiet against a weekly packet.
--
-- Four live sources in that state and the only reason anyone knows is that
-- somebody ran a query by hand today. So the expectation becomes a column, the
-- silence becomes a computed verdict, and an overdue source becomes a row in
-- the same suggestions bank every other machine output lands in, with the same
-- named reason. Nothing new is invented: intake_sources, suggestions and
-- handoff_reasons already exist and each gets one more thing to carry.

begin;

-- ── 1. A source says how often it should produce ───────────────────────────
-- Null is a real answer and the honest one for a source with no cadence, such
-- as anything Krish types in himself. A zero or a negative is not: that is a
-- number somebody guessed, and it would make the verdict below meaningless.
alter table public.intake_sources
  add column if not exists expects_every_hours integer,
  add column if not exists expectation_set_on  date;

alter table public.intake_sources
  drop constraint if exists intake_sources_expectation_is_a_duration;
alter table public.intake_sources
  add constraint intake_sources_expectation_is_a_duration
  check (expects_every_hours is null or expects_every_hours > 0);

comment on column public.intake_sources.expects_every_hours is
  'How many hours may pass between rows before this source is overdue. NULL means no cadence is claimed, which is honest for a source Krish writes by hand and is never a stand-in for "nobody has looked". The number is the source''s own published schedule plus slack, not a wish.';
comment on column public.intake_sources.expectation_set_on is
  'When the expectation was last set, so an expectation nobody has revisited is visible as one.';

-- The published schedule of each live source, plus slack, taken from the
-- `formerly` column each row already carries. A source that runs twice a day
-- gets 36 hours rather than 12, because one missed run is a blip and three in a
-- row is a fault, and an alarm that fires on a blip is one nobody reads.
update public.intake_sources set expects_every_hours = v.h, expectation_set_on = date '2026-09-20'
from (values
  ('inspiration_sweep',       36),   -- Sonnet reads the Gmail label twice a day
  ('gmail_newsletters',       36),   -- the same sweep's seen-ledger
  ('pool_headline',           48),   -- daily 11:30 UTC
  ('drive_files',             72),   -- scanned every two hours, but Krish fills it, so three days
  ('aeo_signal',             216),   -- one packet a week, Sunday 04:00 UTC, plus two days
  ('build_signal',           216),   -- Saturday 05:00 UTC
  ('creator_move',           216),   -- Tuesday 08:00 UTC
  ('lane_sourcing',          336),   -- on demand, but two weeks of nothing is a fault
  ('events_attend',          216)    -- added below
) as v(slug, h) where public.intake_sources.slug = v.slug;

-- ── 2. The attend lane becomes a source like any other ─────────────────────
-- Krish keeps the feature. What it stops being is a private pipeline with its
-- own table, its own 401 and nobody watching: it joins the one intake, so the
-- next time its credential dies the row below says so within nine days.
insert into public.intake_sources (slug, label, what, active, owner, formerly, sort_order, expects_every_hours, expectation_set_on)
values (
  'events_attend',
  'Events worth attending',
  'Conferences, panels and stages, discovered from the inbox and from search. 355 rows by 2026-09-20 and not one carries a decision or an outcome, so the lane has never learned anything from a single one. Kept by ruling (Krish, 2026-09-20) and rebuilt rather than retired: discovery lands here as an intake row, the question of whether to go is a suggestion, and the answer is a verdict, so the lane compounds instead of accumulating.',
  true, 'openclaw',
  'public.events, written by ingest-events-gmail.py (06:15 UTC) and discover-events.py (06:45 UTC) on the OpenClaw VPS. Both have been firing into a 401 since 2026-09-09, which is why the lane went quiet. The port off the host is step 7 of the retirement order.',
  120, 216, date '2026-09-20')
on conflict (slug) do update
  set active = excluded.active, what = excluded.what, formerly = excluded.formerly,
      expects_every_hours = excluded.expects_every_hours, expectation_set_on = excluded.expectation_set_on;

-- ── 3. What silence looks like, computed every time and never stored ───────
create or replace view public.intake_source_health as
select
  s.slug,
  s.label,
  s.active,
  s.owner,
  s.expects_every_hours,
  s.expectation_set_on,
  m.last_seen_at,
  m.rows_ever,
  case when m.last_seen_at is null then null
       else floor(extract(epoch from (now() - m.last_seen_at)) / 3600)::int end as hours_quiet,
  case
    when not s.active                       then 'inactive'
    when s.expects_every_hours is null      then 'no expectation'
    when m.last_seen_at is null             then 'never produced'
    when extract(epoch from (now() - m.last_seen_at)) / 3600 > s.expects_every_hours then 'overdue'
    else 'producing'
  end as verdict,
  case
    when not s.active then 'Inactive on purpose. Silence is the expected reading.'
    when s.expects_every_hours is null then
      'No cadence is claimed for this source, so nothing here can tell a quiet week from a dead writer. That is honest for a source Krish fills by hand and is a gap for any source a machine writes.'
    when m.last_seen_at is null then
      'Declared active and has never produced a row. A writer that has never written is invisible to anything that only watches what it finds.'
    when extract(epoch from (now() - m.last_seen_at)) / 3600 > s.expects_every_hours then
      'Last row ' || floor(extract(epoch from (now() - m.last_seen_at)) / 3600)::int ||
      ' hours ago against an expectation of ' || s.expects_every_hours ||
      '. Its writer is ' || s.owner || '; start there, and read `formerly` for where it runs.'
    else 'Producing inside its expectation.'
  end as says
from public.intake_sources s
left join lateral (
  select max(coalesce(i.received_at, i.first_seen_at)) as last_seen_at, count(*) as rows_ever
  from public.intake_items i where i.source = s.slug
) m on true;

comment on view public.intake_source_health is
  'Every intake source against its own declared cadence, computed at read time. The one question the intake could not answer before 2026-09-20: not "why is this row not in my queue", which intake_items answers, but "why has nothing arrived at all", which nothing answered.';

-- ── 4. An overdue source is a named row, never a silence ───────────────────
insert into public.handoff_reasons (slug, label, says, fix_hint, severity) values
  ('source_went_quiet',
   'a source stopped producing',
   'This source has produced nothing for longer than its own declared cadence allows. That is not a quiet week: a quiet week still has a writer running. Until it is looked at, everything downstream is working from a pool with a hole in it and no way to see the hole.',
   'Read intake_source_health for the hours and the owner, then check that writer. The three ways this happens, in order of how often: a credential the writer uses has expired and it is failing silently, the schedule was switched off, or the writer runs and finds nothing because something upstream of it broke.',
   'blocking')
on conflict (slug) do nothing;

-- One hand-off row per overdue source per week. Idempotent on the run id, so
-- running it twice in a week does not stack, and a source that stays quiet gets
-- one new row each week rather than one row that ages quietly into furniture.
create or replace function public.flag_quiet_intake_sources(run_tag text default null)
returns table (slug text, hours_quiet int, suggestion_id uuid)
language plpgsql
security definer
set search_path = public
as $$
declare
  tag text := coalesce(run_tag, 'source-health:' || to_char(now(), 'IYYY-"W"IW'));
begin
  return query
  with overdue as (
    select h.slug, h.hours_quiet, h.says, h.owner, h.expects_every_hours
    from public.intake_source_health h
    where h.verdict in ('overdue', 'never produced')
  ), written as (
    insert into public.suggestions
      (surface, subject_table, subject_id, proposed, reason, confidence,
       alternatives, producer, handoff_reason, run_id)
    select
      'slate_pick', 'intake_sources', o.slug, null, o.says, null, '[]'::jsonb,
      jsonb_build_object('agent', 'intake-source-health', 'run', tag,
                         'owner', o.owner, 'expects_every_hours', o.expects_every_hours),
      'source_went_quiet', tag
    from overdue o
    where not exists (
      select 1 from public.suggestions s
      where s.run_id = tag and s.subject_table = 'intake_sources' and s.subject_id = o.slug)
    returning suggestions.subject_id, suggestions.id
  )
  select o.slug, o.hours_quiet, w.id
  from overdue o left join written w on w.subject_id = o.slug;
end $$;

comment on function public.flag_quiet_intake_sources(text) is
  'Turns every overdue intake source into a named hand-off row, one per source per ISO week. Called by the weekly slate run before it gathers, so the slate knows which part of its pool is missing rather than scoring a hole it cannot see.';

revoke all on function public.flag_quiet_intake_sources(text) from public, anon, authenticated;
grant execute on function public.flag_quiet_intake_sources(text) to service_role;

commit;
