-- Nova's standard, in the database.
--
-- The lane had one number, `relevance_score`, and it was two scales at once.
-- Read off the live table on 2026-10-05:
--
--   nell-scout, nell-triage-2026-05-27   wrote 7, 8, 9        85 rows
--   nova_sweep, nova_retarget_2026-06-02 wrote 72 to 95       20 rows
--   nova_podchaser_*                     wrote NULL           24 rows
--
-- No row in the whole corpus scores between 10 and 69. So a "floor of 50" on
-- that column is not a quality line, it is a source filter: it would have
-- excluded 8 of the 14 targets Krish ever acted on and kept 16 rows of which 2
-- were ever acted on. The old column is kept for history and never gated on.
--
-- In its place, three axes and a conjunction (api/_visibilityScore.ts):
--   room_score      does the audience contain the buyer
--   standing_score  does the platform carry authority
--   only_him_score  is the angle one only Krish can deliver
--   visibility_score = LEAST of the three, so one strong axis cannot carry two
--                      weak ones. That is the entire point.
--
-- Two rules live in the VIEWS rather than in a reader, for the same reason
-- events_recommendable carries the date rule: every reader goes through the view
-- and no reader remembers a rule.
--
--   1. ONLY A `take` OR `stretch` ROW IS AN OPPORTUNITY. Nothing unjudged ever
--      reads as one.
--   2. A REJECTED ROW IS VISIBLE WITH ITS REASON. It is not deleted and not
--      hidden. The old brief said "if I cannot enrich a candidate to green or
--      amber quality, DO NOT write the row", which is why 91 of 129 rows are
--      green: green was the entry ticket, so everything that exists has it. The
--      bar now sits at the surface, where the reader can see what it refused.

-- 1. The axes, the verdict, and the reason ------------------------------------

alter table public.visibility_targets
  add column if not exists room_score       integer,
  add column if not exists standing_score   integer,
  add column if not exists only_him_score   integer,
  add column if not exists visibility_score integer,
  add column if not exists score_version    integer,
  add column if not exists scored_at        timestamptz,
  add column if not exists verdict          text,
  add column if not exists reject_reason    text,
  -- What makes it worth it, in his words, at the point of decision. Separate
  -- columns rather than one blob because the card reads them one per line and a
  -- missing one must render as missing, not as an empty sentence.
  add column if not exists who_is_in_the_room text,
  add column if not exists why_him            text,
  add column if not exists why_now            text,
  add column if not exists score_reason       text,
  add column if not exists feeds_channel      text,
  add column if not exists named_people       jsonb;

comment on column public.visibility_targets.relevance_score is
  'LEGACY, score_version 0 or null. Two scales in one column: 7-9 from the nell-* sources, 72-95 from the nova_* sources, null from nova_podchaser_*. Never gate on it. Use visibility_score.';

comment on column public.visibility_targets.visibility_score is
  'LEAST(room_score, standing_score, only_him_score). A conjunction, not a mean: the audience, the platform and the angle all have to be right at once.';

-- A verdict the UI cannot label is a verdict nobody can act on, so the set is
-- closed here. `unjudged` is the honest fourth state: the material did not
-- support a judgement. It is NEVER written as a low score, because on the card a
-- low score reads as a verdict on the stage and is the same pixels as an honest
-- one. Same lesson as events.score_reason and api/_enrich.ts.
do $$ begin
  alter table public.visibility_targets
    add constraint visibility_targets_verdict_check
    check (verdict is null or verdict in ('take', 'stretch', 'rejected', 'unjudged'));
exception when duplicate_object then null; end $$;

-- The reject codes are the ONE taxonomy from src/lib/servedSurfaces.ts under
-- `visibility_targets`. No new vocabulary: scripts/check-served-surfaces.mts
-- already holds that set across the three files that have to agree about it.
do $$ begin
  alter table public.visibility_targets
    add constraint visibility_targets_reject_reason_check
    check (reject_reason is null or reject_reason in (
      'visibility_wrong_audience',
      'visibility_bad_timing',
      'visibility_already_pitched',
      'visibility_too_low_tier',
      'visibility_wrong_location',
      'visibility_unlikely_accepted',
      'visibility_pay_to_play',
      'visibility_no_relevant_talk',
      'visibility_too_technical',
      'visibility_off_vertical',
      'visibility_other'
    ));
exception when duplicate_object then null; end $$;

-- A rejected row must carry its reason. This is the half the UI cannot enforce:
-- a rejection with a null reason renders as a silent drop with extra steps.
do $$ begin
  alter table public.visibility_targets
    add constraint visibility_targets_rejection_has_a_reason
    check (verdict <> 'rejected' or reject_reason is not null);
exception when duplicate_object then null; end $$;

create index if not exists visibility_targets_verdict_idx
  on public.visibility_targets (verdict, visibility_score desc nulls last);

-- 2. The gate: what may read as an opportunity -------------------------------
--
-- Mirrors public.events_recommendable. Nothing that has not cleared the standard
-- under the CURRENT score version appears here, so a row judged under a future
-- regime cannot be silently mixed with one judged under this one.

create or replace view public.visibility_recommendable as
  select * from public.visibility_targets
  where verdict in ('take', 'stretch')
    and score_version = 1
    and buried_at is null
    and status in ('sourced', 'queued')
    and (event_start_at is null or event_start_at >= now())
    and (deadline_at is null or deadline_at >= now());

comment on view public.visibility_recommendable is
  'The only rows allowed to read as an opportunity. A reader that selects from visibility_targets directly re-admits the long tail and the card cannot tell the difference.';

-- 3. The other half of honesty: the refusals, with their reasons --------------
--
-- Deliberately a view and not a filter in the client, so "what did the standard
-- turn down, and why" is answerable in one query by anything that asks, and so
-- the count cannot drift from the thing it counts.

create or replace view public.visibility_rejected as
  select
    id, title, type, event_url, source, created_at, scored_at,
    verdict, reject_reason, score_reason,
    room_score, standing_score, only_him_score, visibility_score,
    who_is_in_the_room, why_him
  from public.visibility_targets
  where verdict = 'rejected'
    and score_version = 1
    and buried_at is null;

comment on view public.visibility_rejected is
  'What the standard refused and why. Shown, never deleted: a weak target that vanishes teaches nobody anything and hides a generator that cannot justify its output.';

-- 4. The legacy corpus is marked, not deleted --------------------------------
--
-- Every existing scored row is stamped score_version 0 so it cannot pass the
-- gate above, and so the two regimes are visible rather than mixed. No row is
-- dropped: 8 of the 14 targets Krish ever acted on live in this set, and the
-- corpus is the only record of what he has looked at.

update public.visibility_targets
   set score_version = 0
 where score_version is null;

-- Nothing is pre-verdicted. A row's verdict stays null until the standard has
-- actually judged it, because a verdict written by a migration is a verdict
-- nothing computed.
