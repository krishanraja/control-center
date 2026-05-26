-- C5 (audit os-e2e-2026-05-25): surface pending corrections in decisions_waiting.
--
-- Why: corrections with status='analyzed' AND approval_state='pending' are only
-- surfaced in DesktopOrg.tsx today. The 42-day arlo correction and 13-day
-- agatha correction haven't been reviewed because mobile and Today never see
-- them. Adding a UNION ALL branch makes them visible everywhere
-- DecisionsWaitingPanel renders.
--
-- Routes to `org?correction=:id` so the existing approve/reject flow handles it.

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
  )                                                       AS meta,
  ('today?task=' || tasks.id::text)                       AS route_target
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
  )                                                       AS meta,
  ('guests?guest=' || guests.id::text)                    AS route_target
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
  )                                                       AS meta,
  ('content?idea=' || content_ideas.id::text)             AS route_target
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
  )                                                       AS meta,
  ('leads?lead=' || leads.id::text)                       AS route_target
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
    'type', visibility_targets.type,
    'deep_enriched_at', visibility_targets.deep_enriched_at,
    'enrichment_version', visibility_targets.enrichment_version
  )                                                       AS meta,
  ('guests?target=' || visibility_targets.id::text)       AS route_target
FROM public.visibility_targets
WHERE (visibility_targets.quality_score IS NULL OR visibility_targets.quality_score = ANY (ARRAY['green'::text, 'amber'::text]))
  AND (visibility_targets.deadline_at IS NULL OR visibility_targets.deadline_at > (now() - interval '7 days'))

UNION ALL

-- C5: surface analyzed, approval-pending corrections so Vera's self-improvement
-- loop closes from any surface (mobile, Today, Home), not just DesktopOrg.
SELECT
  'correction'::text                                      AS kind,
  corrections.id::text                                    AS id,
  ('Correction: ' || coalesce(corrections.agent_id, 'unknown') || ' / ' || coalesce(corrections.correction_type, 'unspecified')) AS title,
  coalesce(corrections.correction_instruction, corrections.proposed_brief_edit, corrections.pattern_extracted) AS description,
  coalesce(corrections.agent_id, 'vera'::text)            AS agent,
  corrections.status,
  CASE
    WHEN corrections.detected_at < (now() - interval '14 days') THEN 'overdue'::text
    WHEN corrections.detected_at < (now() - interval '3 days')  THEN 'urgent'::text
    ELSE 'normal'::text
  END                                                     AS priority,
  coalesce(corrections.detected_at, corrections.created_at, now()) AS sort_at,
  NULL::text                                              AS url,
  'corrections'::text                                     AS source_table,
  jsonb_build_object(
    'correction_type', corrections.correction_type,
    'detection_source', corrections.detection_source,
    'pattern_reason_code', corrections.pattern_reason_code,
    'standard_id', corrections.standard_id,
    'confidence', corrections.confidence,
    'approval_state', corrections.approval_state,
    'pattern_preview', left(coalesce(corrections.pattern_extracted, ''), 200),
    'proposed_brief_edit', corrections.proposed_brief_edit
  )                                                       AS meta,
  ('org?correction=' || corrections.id::text)             AS route_target
FROM public.corrections
WHERE corrections.status = 'analyzed'
  AND corrections.approval_state = 'pending';

GRANT SELECT ON public.decisions_waiting TO anon, authenticated, service_role;

COMMIT;
