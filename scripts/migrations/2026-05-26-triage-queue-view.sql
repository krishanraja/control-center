-- audit-2026-05-26: triage_queue view — agent suggestions awaiting Krish's call.
--
-- Distinct from decisions_waiting (which is the unified to-do view). This view
-- surfaces ONLY unvetted suggestions:
--   content_ideas state='seeded'
--   leads status='new' AND quality_score IS NULL
--   visibility_targets status='queued' AND proposed_talk IS NULL
--   guests status IN ('scouted','enriched')
--
-- The /triage tab on the SPA uses this view. Thumb-up on a row moves it out
-- of triage_queue (state/status flips); thumb-down sets the row to
-- terminal and writes a feedback_queue row for Vera.

BEGIN;

CREATE OR REPLACE VIEW public.triage_queue AS
SELECT
  'content_idea'::text                                    AS kind,
  content_ideas.id::text                                  AS id,
  coalesce(content_ideas.idea, left(coalesce(content_ideas.source_snippet, '(no title)'::text), 120)) AS title,
  coalesce(content_ideas.thesis, content_ideas.source_snippet) AS description,
  'cleo'::text                                            AS agent,
  content_ideas.source_url                                AS source_url,
  coalesce(content_ideas.confidence::numeric, 0)          AS confidence,
  content_ideas.created_at                                AS sort_at,
  'content_ideas'::text                                   AS source_table,
  jsonb_build_object(
    'state', content_ideas.state,
    'distribution', content_ideas.distribution,
    'quality_score', content_ideas.quality_score
  )                                                       AS meta
FROM public.content_ideas
WHERE content_ideas.state = 'seeded'

UNION ALL

SELECT
  'lead'::text                                            AS kind,
  leads.id::text                                          AS id,
  (coalesce(leads.full_name, '(unnamed)'::text) || coalesce(' at ' || nullif(leads.company, ''::text), ''::text)) AS title,
  leads.why_relevant                                      AS description,
  coalesce(leads.assignee_agent, 'nell'::text)            AS agent,
  coalesce(leads.linkedin_url, leads.source_url)          AS source_url,
  coalesce(leads.fit_score::numeric, 0)                   AS confidence,
  coalesce(leads.created_at, now())                       AS sort_at,
  'leads'::text                                           AS source_table,
  jsonb_build_object(
    'primary_venture', leads.primary_venture,
    'source_type', leads.source_type,
    'fit_score', leads.fit_score,
    'tags', leads.tags
  )                                                       AS meta
FROM public.leads
WHERE leads.status = 'new' AND leads.quality_score IS NULL

UNION ALL

SELECT
  'visibility'::text                                      AS kind,
  visibility_targets.id::text                             AS id,
  (coalesce(visibility_targets.title, '(untitled)'::text) || ' (' || coalesce(visibility_targets.type, 'event'::text) || ')') AS title,
  visibility_targets.why_relevant                         AS description,
  'nova'::text                                            AS agent,
  coalesce(visibility_targets.event_url, visibility_targets.cfp_url) AS source_url,
  coalesce(visibility_targets.relevance_score::numeric, 0) AS confidence,
  coalesce(visibility_targets.created_at, now())          AS sort_at,
  'visibility_targets'::text                              AS source_table,
  jsonb_build_object(
    'type', visibility_targets.type,
    'deadline_at', visibility_targets.deadline_at,
    'audience_size', visibility_targets.audience_size,
    'has_proposed_talk', (visibility_targets.proposed_talk IS NOT NULL)
  )                                                       AS meta
FROM public.visibility_targets
WHERE visibility_targets.status = 'queued'
  AND visibility_targets.proposed_talk IS NULL

UNION ALL

SELECT
  'guest'::text                                           AS kind,
  guests.id::text                                         AS id,
  ('Pitch: ' || coalesce(guests.name, '(unnamed)'::text) || ' for ' || coalesce(guests.podcast_target, '(unset)'::text)) AS title,
  coalesce(guests.why_fit, guests.one_liner)              AS description,
  'nell'::text                                            AS agent,
  coalesce(guests.linkedin_url, guests.personal_url, guests.twitter_handle) AS source_url,
  coalesce(guests.fit_score::numeric, 0)                  AS confidence,
  coalesce(guests.created_at, now())                      AS sort_at,
  'guests'::text                                          AS source_table,
  jsonb_build_object(
    'podcast_target', guests.podcast_target,
    'fit_score', guests.fit_score,
    'has_pitch_draft', (guests.pitch_draft IS NOT NULL)
  )                                                       AS meta
FROM public.guests
WHERE guests.status IN ('scouted', 'enriched');

GRANT SELECT ON public.triage_queue TO anon, authenticated, service_role;

COMMIT;
