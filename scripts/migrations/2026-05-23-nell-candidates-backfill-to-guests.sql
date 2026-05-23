-- Phase 0/7 — Mission Control rebuild data contracts.
--
-- Backfill any unprocessed nell_candidates rows into the guests SSOT.
-- Nell's PR 4 brief ("Guests pipeline") said guests is the source of truth;
-- the legacy nell_candidates table is being retired this migration.
--
-- Dedupe by (podcast_target, name). Tag with legacy_source='nell_candidates'
-- so a future audit can spot-check the migration. The full table drop happens
-- after a 7-day soak in a follow-up migration.

BEGIN;

-- Ensure guests has the legacy_source column for provenance.
ALTER TABLE guests
  ADD COLUMN IF NOT EXISTS legacy_source text;

-- Copy unpromoted candidates. A candidate is "unpromoted" if it does not have
-- a scheduled_task_id and its status is one of the pre-pitch states. The new
-- guests row maps to status='scouted' so it appears in decisions_waiting.
INSERT INTO guests (
  name, podcast_target, why_fit, one_liner,
  fit_score, attainability_score, quality_score,
  linkedin_url, personal_url, twitter_handle,
  pitch_draft, status, notes,
  legacy_source, created_at, updated_at
)
SELECT
  c.name,
  c.podcast_target,
  c.signal_description,
  c.signal_description,
  c.fit_score,
  NULL::numeric                                      AS attainability_score,
  NULL::text                                         AS quality_score,
  c.linkedin_url,
  c.personal_url,
  NULL::text                                         AS twitter_handle,
  c.pitch_draft,
  'scouted'::text                                    AS status,
  c.notes,
  'nell_candidates'                                  AS legacy_source,
  coalesce(c.surfaced_at, now())                     AS created_at,
  coalesce(c.surfaced_at, now())                     AS updated_at
FROM nell_candidates c
WHERE c.scheduled_task_id IS NULL
  AND coalesce(c.status, 'new') IN ('new', 'researched', 'pending')
  AND NOT EXISTS (
    SELECT 1 FROM guests g
     WHERE coalesce(g.podcast_target, '') = coalesce(c.podcast_target, '')
       AND lower(coalesce(g.name, '')) = lower(coalesce(c.name, ''))
  );

COMMIT;
