-- decisions_waiting: include status='enriched' guests
--
-- After the canonical Nell Guest Pitch Draft workflow (GuWi9nxNHpbFEfyV) runs,
-- guests transition from status='scouted' to status='enriched' (pitch is drafted
-- but not yet sent). These guests STILL need a human decision (approve, send,
-- skip), so they belong in decisions_waiting. The PR #7 view filter excluded
-- 'enriched', causing the count to drop to ~0 after enrichment.
--
-- This migration adds 'enriched' to the guest status filter. All other branches
-- of the UNION are unchanged.
--
-- Also exposes pitch_draft and suggested_angles via meta jsonb so the decision
-- detail surface can render the draft inline without an extra fetch.

BEGIN;

CREATE OR REPLACE VIEW public.decisions_waiting AS
SELECT
  'task'::text                                            AS kind,
  tasks.id                                                AS id,
  tasks.title,
  tasks.description,
  coalesce(tasks.agent, tasks.owner)                      AS agent,
  tasks.status,
  coalesce(tasks.priority, 'normal'::text)                AS priority,
  coalesce(tasks.due_date, tasks.started_at, tasks.created) AS sort_at,
  tasks.link_primary                                      AS url,
  'tasks'::text                                           AS source_table,
  jsonb_build_object(
    'agent', tasks.agent,
    'workstream', tasks.workstream,
    'tier', tasks.tier,
    'lever_score', tasks.lever_score
  )                                                       AS meta
FROM public.tasks
WHERE tasks.status = ANY (ARRAY['waiting'::text, 'in_progress'::text, 'blocked'::text, 'new'::text])
  AND coalesce(tasks.krish_reviewed, false) = false

UNION ALL

SELECT
  'guest'::text                                           AS kind,
  guests.id::text                                         AS id,
  ('Pitch guest: ' || coalesce(guests.name, '(unnamed)'::text) || ' for ' || coalesce(guests.podcast_target, 'unknown show'::text)) AS title,
  coalesce(guests.why_fit, guests.one_liner)              AS description,
  'nell'::text                                            AS agent,
  guests.status,
  CASE WHEN coalesce(guests.fit_score, 0) >= 8 THEN 'high'::text ELSE 'normal'::text END AS priority,
  coalesce(guests.updated_at, guests.created_at, now())   AS sort_at,
  coalesce(guests.linkedin_url, guests.personal_url, guests.twitter_handle) AS url,
  'guests'::text                                          AS source_table,
  jsonb_build_object(
    'podcast_target', guests.podcast_target,
    'fit_score', guests.fit_score,
    'attainability_score', guests.attainability_score,
    'quality_score', guests.quality_score,
    'has_pitch_draft', (guests.pitch_draft IS NOT NULL),
    'pitch_draft_preview', left(coalesce(guests.pitch_draft, ''), 200),
    'suggested_angles', guests.notes
  )                                                       AS meta
FROM public.guests
WHERE guests.status = ANY (ARRAY['researched'::text, 'pitched'::text, 'scouted'::text, 'enriched'::text])

UNION ALL

SELECT
  'idea'::text                                            AS kind,
  content_ideas.id::text                                  AS id,
  coalesce(content_ideas.idea, left(coalesce(content_ideas.source_snippet, '(no title)'::text), 120)) AS title,
  coalesce(content_ideas.thesis, content_ideas.source_snippet) AS description,
  'cleo'::text                                            AS agent,
  coalesce(content_ideas.state, 'seeded'::text)           AS status,
  'normal'::text                                          AS priority,
  coalesce(content_ideas.updated_at, content_ideas.created_at, now()) AS sort_at,
  content_ideas.source_url                                AS url,
  'content_ideas'::text                                   AS source_table,
  jsonb_build_object(
    'distribution', content_ideas.distribution,
    'confidence', content_ideas.confidence,
    'quality_score', content_ideas.quality_score
  )                                                       AS meta
FROM public.content_ideas
WHERE coalesce(content_ideas.state, 'seeded'::text) = ANY (ARRAY['seeded'::text, 'researching'::text, 'drafting'::text, 'review'::text])

UNION ALL

SELECT
  'lead'::text                                            AS kind,
  leads.id::text                                          AS id,
  (coalesce(leads.full_name, '(unnamed)'::text) || coalesce(' at ' || nullif(leads.company, ''::text), ''::text)) AS title,
  leads.why_relevant                                      AS description,
  coalesce(leads.assignee_agent, 'felix'::text)           AS agent,
  leads.status,
  CASE
    WHEN leads.quality_score = 'green'::text THEN 'high'::text
    WHEN leads.quality_score = 'amber'::text THEN 'normal'::text
    ELSE 'low'::text
  END                                                     AS priority,
  coalesce(leads.updated_at, leads.created_at, now())     AS sort_at,
  coalesce(leads.linkedin_url, leads.source_url)          AS url,
  'leads'::text                                           AS source_table,
  jsonb_build_object(
    'primary_venture', leads.primary_venture,
    'tags', leads.tags,
    'icp_scores', leads.icp_scores,
    'fit_score', leads.fit_score,
    'quality_score', leads.quality_score
  )                                                       AS meta
FROM public.leads
WHERE leads.status = ANY (ARRAY['new'::text, 'ready'::text])
  AND (leads.quality_score IS NULL OR leads.quality_score = ANY (ARRAY['green'::text, 'amber'::text]))

UNION ALL

SELECT
  'visibility'::text                                      AS kind,
  visibility_targets.id::text                             AS id,
  (coalesce(visibility_targets.title, '(untitled)'::text) || ' (' || coalesce(visibility_targets.type, 'event'::text) || ')') AS title,
  visibility_targets.why_relevant                         AS description,
  'nova'::text                                            AS agent,
  CASE
    WHEN visibility_targets.deadline_at < now() THEN 'overdue'::text
    WHEN visibility_targets.deadline_at < (now() + interval '7 days') THEN 'urgent'::text
    ELSE coalesce(visibility_targets.status, 'waiting'::text)
  END                                                     AS status,
  CASE WHEN coalesce(visibility_targets.relevance_score, 0) >= 8 THEN 'high'::text ELSE 'normal'::text END AS priority,
  coalesce(visibility_targets.deadline_at, visibility_targets.event_start_at, now() + interval '30 days') AS sort_at,
  coalesce(visibility_targets.cfp_url, visibility_targets.event_url) AS url,
  'visibility_targets'::text                              AS source_table,
  jsonb_build_object(
    'event_start_at', visibility_targets.event_start_at,
    'deadline_at', visibility_targets.deadline_at,
    'audience_size', visibility_targets.audience_size,
    'quality_score', visibility_targets.quality_score,
    'type', visibility_targets.type
  )                                                       AS meta
FROM public.visibility_targets
WHERE (visibility_targets.quality_score IS NULL OR visibility_targets.quality_score = ANY (ARRAY['green'::text, 'amber'::text]))
  AND (visibility_targets.deadline_at IS NULL OR visibility_targets.deadline_at > (now() - interval '7 days'));

COMMIT;
