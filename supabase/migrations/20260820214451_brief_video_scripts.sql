-- Video scripts on the weekly brief.
--
-- A brief could be pushed to Paid, Built, LinkedIn, Signal & Noise and
-- vertical_video, but nothing in the OS could actually produce a script: the
-- closest thing was the composer's single "YouTube script" adapt (one length,
-- roughly five to nine minutes) and the growth Creative Board, where the
-- script and shot notes are typed by hand.
--
-- content_ideas already had somewhere to put a generated cut
-- (transformed_outputs); weekly_briefs had no equivalent and no meta column at
-- all, so this is that column. Keyed by duration ('15s', '60s', '20min', ...)
-- so several lengths of the same brief coexist rather than overwriting each
-- other, which is the normal case: the 60 second cut and the 10 minute cut are
-- both wanted.
--
-- Written only by api/briefs/[week]/video-script.ts. Nothing here touches
-- body_md, so generating a script can never disturb an edit session.

ALTER TABLE public.weekly_briefs
  ADD COLUMN IF NOT EXISTS video_scripts jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.weekly_briefs.video_scripts IS
  'Generated spoken video scripts, keyed by duration id (15s|30s|60s|3min|10min|20min). Each value carries beats (timecode, spoken line, shot note), the flattened script and shot_notes in the shape growth_creative_queue wants, the word count against its target, and any figures the number check could not find in the source. Written by api/briefs/[week]/video-script.ts; never touches body_md.';
