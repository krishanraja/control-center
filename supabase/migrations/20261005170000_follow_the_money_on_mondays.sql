-- follow.the.money publishes on Mondays and under.the.hood on Wednesdays.
--
-- Until today the week ran under.the.hood on Monday (since 2026-09-26,
-- 20260926150000), follow.the.money on Wednesday and mind.the.gap on Friday.
-- Krish, 2026-10-05: "Let's just make follow the money permanently a monday
-- thing, and swap it out." Then: "ok, make sure absolutely everywhere
-- reflects this swap in scheduling, including the site, everywhere".
--
-- Only the day changes. Each subchannel keeps its colour, sticker, promise,
-- question and mandate; mind.the.gap stays on Fridays.
--
-- Where the day lives:
--   venture_formats  cadence_label, which the rooms, the composer, the week's
--                    slots (src/lib/contentModel.ts weekSlots) and
--                    src/lib/formats.generated.json read.
-- content_cadence holds no weekday (interval_days 7 and target_per_week 1.0
-- for both rows), and neither mandate names a weekday for these two, so
-- neither changes. sort_order stays: the hero first, then follow.the.money,
-- then under.the.hood, which is now also the order of the week.
--
-- To undo: set follow_the_money back to 'Wednesdays' and under_the_hood back
-- to 'Mondays'.

update public.venture_formats
   set cadence_label = 'Mondays', updated_at = now()
 where slug = 'follow_the_money';

update public.venture_formats
   set cadence_label = 'Wednesdays', updated_at = now()
 where slug = 'under_the_hood';

-- APPLIED and read back 2026-10-05: venture_formats follow_the_money reads
-- Mondays and under_the_hood reads Wednesdays, both 1.0 a week;
-- mind_the_gap still reads Fridays. The mandates are unchanged.
