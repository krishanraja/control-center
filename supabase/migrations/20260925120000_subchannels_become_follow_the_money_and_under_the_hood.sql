-- Two of the three subchannels are renamed. Krish, 2026-09-25, in his words:
--
--   "Can we change split.the.bill to follow.the.money, and lift.the.lid to
--   under.the.hood, everywhere? every single instance front and back end, with
--   zero exceptions? those two and mind.the.gap are my FINAL FINAL choices for
--   the 3 channels."
--
-- What this does:
--   1. Renames the two venture_formats rows (id, slug, label). Every foreign
--      key to venture_formats(slug) is ON UPDATE CASCADE, so content_ideas,
--      guests, shifts, content_themes, content_slate_rulings,
--      video_studio_jobs and format_aliases follow in the same statement.
--   2. Renames the two content_cadence rows.
--   3. Rewrites the old names inside every mutable text and json column that
--      carried them: mandates (they name each other), the mandate backup,
--      alias notes, idea meta and history columns, suggestions, intake, the
--      handoff and suggestion vocabularies, and the judge sweep's reply cache.
--   4. Adds the two old slugs as aliases, so an old link, an in-flight payload
--      or an append-only row still resolves to the live subchannel.
--
-- What it cannot do: content_edit_events and judge_verdicts are append-only by
-- trigger. The rows written before this rename keep the names they were
-- written with, and resolve through the aliases in step 4.
--
-- A rename is not activity. User triggers on the cascaded tables are held for
-- the length of the transaction, so no updated_at clock moves and no derived
-- outcome is recomputed because a name changed. Constraint triggers, which
-- carry the cascade, are internal and unaffected.

create or replace function pg_temp.renamed(t text) returns text language sql immutable as $$
  select replace(replace(replace(replace(replace(replace(t,
    'split_the_bill', 'follow_the_money'),
    'split.the.bill', 'follow.the.money'),
    'split-the-bill', 'follow-the-money'),
    'lift_the_lid', 'under_the_hood'),
    'lift.the.lid', 'under.the.hood'),
    'lift-the-lid', 'under-the-hood')
$$;

alter table public.content_ideas disable trigger user;
alter table public.content_themes disable trigger user;
alter table public.shifts disable trigger user;
alter table public.guests disable trigger user;
alter table public.video_studio_jobs disable trigger user;

-- 1. The formats. The cascade carries every slug reference.
update public.venture_formats
   set id = 'publication:follow_the_money', slug = 'follow_the_money', label = 'follow.the.money'
 where slug = 'split_the_bill';
update public.venture_formats
   set id = 'publication:under_the_hood', slug = 'under_the_hood', label = 'under.the.hood'
 where slug = 'lift_the_lid';

-- 2. The cadence rows.
update public.content_cadence
   set id = 'cadence:follow_the_money', slot = 'follow_the_money', label = 'follow.the.money'
 where id = 'cadence:split_the_bill';
update public.content_cadence
   set id = 'cadence:under_the_hood', slot = 'under_the_hood', label = 'under.the.hood'
 where id = 'cadence:lift_the_lid';

-- 3. Every mutable column that carried either name.
update public.venture_formats set mandate = pg_temp.renamed(mandate)
 where mandate ~* 'split.the.bill|lift.the.lid';
update public.venture_formats_mandate_backup_20260924
   set slug = pg_temp.renamed(slug), mandate = pg_temp.renamed(mandate)
 where slug ~* 'split.the.bill|lift.the.lid' or mandate ~* 'split.the.bill|lift.the.lid';
update public.format_aliases set note = pg_temp.renamed(note)
 where note ~* 'split.the.bill|lift.the.lid';
update public.content_ideas
   set meta = pg_temp.renamed(meta::text)::jsonb, lane_slot_was = pg_temp.renamed(lane_slot_was)
 where meta::text ~* 'split.the.bill|lift.the.lid' or lane_slot_was ~* 'split.the.bill|lift.the.lid';
update public.content_themes set channel_was = pg_temp.renamed(channel_was)
 where channel_was ~* 'split.the.bill|lift.the.lid';
update public.suggestions
   set producer = pg_temp.renamed(producer::text)::jsonb,
       reason = pg_temp.renamed(reason),
       alternatives = pg_temp.renamed(alternatives::text)::jsonb,
       proposed = pg_temp.renamed(proposed::text)::jsonb
 where producer::text ~* 'split.the.bill|lift.the.lid' or reason ~* 'split.the.bill|lift.the.lid'
    or alternatives::text ~* 'split.the.bill|lift.the.lid' or proposed::text ~* 'split.the.bill|lift.the.lid';
update public.intake_items set raw = pg_temp.renamed(raw::text)::jsonb
 where raw::text ~* 'split.the.bill|lift.the.lid';
update public.handoff_reasons set says = pg_temp.renamed(says), fix_hint = pg_temp.renamed(fix_hint)
 where says ~* 'split.the.bill|lift.the.lid' or fix_hint ~* 'split.the.bill|lift.the.lid';
update public.suggestion_surfaces set what = pg_temp.renamed(what)
 where what ~* 'split.the.bill|lift.the.lid';
update public.judge_sweep_cache set value = pg_temp.renamed(value::text)::jsonb
 where value::text ~* 'split.the.bill|lift.the.lid';

-- 4. The old slugs resolve.
insert into public.format_aliases (alias, slug, note, retired_on) values
  ('split_the_bill', 'follow_the_money', 'Renamed follow.the.money by Krish on 2026-09-25, everywhere. Kept only so an old link, payload or append-only row resolves.', '2026-09-25'),
  ('lift_the_lid', 'under_the_hood', 'Renamed under.the.hood by Krish on 2026-09-25, everywhere. Kept only so an old link, payload or append-only row resolves.', '2026-09-25');

alter table public.content_ideas enable trigger user;
alter table public.content_themes enable trigger user;
alter table public.shifts enable trigger user;
alter table public.guests enable trigger user;
alter table public.video_studio_jobs enable trigger user;
