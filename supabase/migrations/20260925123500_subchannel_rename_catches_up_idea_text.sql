-- Follow-up to 20260925120000. Between the survey for that migration and its
-- apply, two judge sweeps still running the previous code repaired ideas and
-- wrote the old subchannel names into one idea's thesis. The first migration
-- never touched idea, thesis or body, because none carried either name when
-- it was written.
--
-- This renames the old names in idea, thesis and body wherever they appear.
-- A thesis is part of what the judges fingerprint (artifact_hash =
-- sha256(trim(idea || '\n\n' || thesis))), so a changed thesis would be
-- re-judged and re-billed. A rename is not new substance: where the stored
-- hash matched the text before the rename, it is re-stamped to match the text
-- after. A hash that was already stale stays stale and is judged as it would
-- have been anyway. User triggers are held so no clock moves and the autoscore
-- trigger (which fires on a changed body) does not call out.
--
-- It then re-runs the column rewrite from 20260925120000 for anything written
-- in the window. Append-only tables (content_edit_events, judge_verdicts) are
-- untouched, as before.

create or replace function pg_temp.renamed(t text) returns text language sql immutable as $$
  select replace(replace(replace(replace(replace(replace(t,
    'split_the_bill', 'follow_the_money'),
    'split.the.bill', 'follow.the.money'),
    'split-the-bill', 'follow-the-money'),
    'lift_the_lid', 'under_the_hood'),
    'lift.the.lid', 'under.the.hood'),
    'lift-the-lid', 'under-the-hood')
$$;

create or replace function pg_temp.fingerprint(idea text, thesis text) returns text language sql immutable as $$
  select encode(sha256(convert_to(regexp_replace(idea || E'\n\n' || coalesce(thesis, ''), '^\s+|\s+$', '', 'g'), 'UTF8')), 'hex')
$$;

alter table public.content_ideas disable trigger user;

update public.content_ideas c
   set idea = pg_temp.renamed(c.idea),
       thesis = pg_temp.renamed(c.thesis),
       body = pg_temp.renamed(c.body),
       meta = case
         when c.meta->'ladder'->>'artifact_hash' = pg_temp.fingerprint(c.idea, c.thesis)
         then jsonb_set(c.meta, '{ladder,artifact_hash}', to_jsonb(pg_temp.fingerprint(pg_temp.renamed(c.idea), pg_temp.renamed(c.thesis))))
         else c.meta
       end
 where c.idea ~* 'split.the.bill|lift.the.lid' or c.thesis ~* 'split.the.bill|lift.the.lid' or c.body ~* 'split.the.bill|lift.the.lid';

update public.content_ideas
   set meta = pg_temp.renamed(meta::text)::jsonb, lane_slot_was = pg_temp.renamed(lane_slot_was)
 where meta::text ~* 'split.the.bill|lift.the.lid' or lane_slot_was ~* 'split.the.bill|lift.the.lid';

alter table public.content_ideas enable trigger user;

update public.suggestions
   set producer = pg_temp.renamed(producer::text)::jsonb,
       reason = pg_temp.renamed(reason),
       alternatives = pg_temp.renamed(alternatives::text)::jsonb,
       proposed = pg_temp.renamed(proposed::text)::jsonb
 where producer::text ~* 'split.the.bill|lift.the.lid' or reason ~* 'split.the.bill|lift.the.lid'
    or alternatives::text ~* 'split.the.bill|lift.the.lid' or proposed::text ~* 'split.the.bill|lift.the.lid';
update public.intake_items set raw = pg_temp.renamed(raw::text)::jsonb
 where raw::text ~* 'split.the.bill|lift.the.lid';
update public.judge_sweep_cache set value = pg_temp.renamed(value::text)::jsonb
 where value::text ~* 'split.the.bill|lift.the.lid';
