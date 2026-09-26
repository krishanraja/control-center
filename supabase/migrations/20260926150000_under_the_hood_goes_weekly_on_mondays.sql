-- under.the.hood publishes every Monday, one a week.
--
-- Until today it had no fixed day and a target of 0.5 a week (a 14 day
-- interval, 20260920160000), so it was placed by hand when a product change
-- deserved it. The makeyourmindup cover page went live on 2026-09-26 promising
-- "Mon · Wed · Fri" and "under.the.hood, Mondays", every week. Krish,
-- 2026-09-26: "Just get in line with what those updates are at the live
-- website." The engine follows the public promise, so the planner now treats
-- under.the.hood as due weekly, like the other two.
--
-- Two tables carry the cadence and both change together:
--   venture_formats  cadence_label and target_per_week, which the rooms, the
--                    composer and src/lib/formats.generated.json read;
--   content_cadence  interval_days and target_per_week, which the n8n sourcing
--                    planner (Plan Due Lanes) reads to decide what is overdue.
--
-- To undo: set them back to 'No fixed day', 0.5 and 14.

update public.venture_formats
   set cadence_label = 'Mondays', target_per_week = 1.0, updated_at = now()
 where slug = 'under_the_hood';

update public.content_cadence
   set interval_days = 7, target_per_week = 1.0, updated_at = now()
 where id = 'cadence:under_the_hood';

-- APPLIED and read back 2026-09-26: venture_formats under_the_hood reads
-- Mondays, 1.0; content_cadence has three active rows, each 7 days and 1.0.
-- Krish, confirming it: "Correct the engine's table and anywhere else, its
-- out of date."
