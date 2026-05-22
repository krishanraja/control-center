-- PR 7: decisions_waiting view.
-- One unified view union'd across tasks, guests, content_ideas, leads, visibility_targets.
-- Agatha's State of the Union and the Control Center Home tab both read this. Same query, same numbers.

BEGIN;

CREATE OR REPLACE VIEW public.decisions_waiting AS
SELECT
  'task'::text                                            AS kind,
  id::text                                                AS id,
  title,
  description,
  coalesce(agent, owner)                                  AS agent,
  status,
  coalesce(priority, 'normal')                            AS priority,
  coalesce(due_date, started_at, created)                 AS sort_at,
  link_primary                                            AS url,
  'tasks'::text                                           AS source_table,
  jsonb_build_object(
    'agent',       agent,
    'workstream',  workstream,
    'tier',        tier,
    'lever_score', lever_score
  )                                                       AS meta
FROM public.tasks
WHERE status IN ('waiting','in_progress','blocked','new')
  AND coalesce(krish_reviewed, false) = false

UNION ALL

SELECT
  'guest'::text                                           AS kind,
  id::text                                                AS id,
  'Pitch guest: ' || coalesce(name, '(unnamed)') || ' for ' || coalesce(podcast_target, 'unknown show')
                                                          AS title,
  coalesce(why_fit, one_liner)                            AS description,
  'nell'::text                                            AS agent,
  status,
  CASE WHEN coalesce(fit_score, 0) >= 8 THEN 'high' ELSE 'normal' END
                                                          AS priority,
  coalesce(updated_at, created_at, now())                 AS sort_at,
  coalesce(linkedin_url, personal_url, twitter_handle)    AS url,
  'guests'::text                                          AS source_table,
  jsonb_build_object(
    'podcast_target',       podcast_target,
    'fit_score',            fit_score,
    'attainability_score',  attainability_score,
    'quality_score',        quality_score
  )                                                       AS meta
FROM public.guests
WHERE status IN ('researched','pitched','scouted')

UNION ALL

SELECT
  'idea'::text                                            AS kind,
  id::text                                                AS id,
  coalesce(idea, left(coalesce(source_snippet, '(no title)'), 120))
                                                          AS title,
  coalesce(thesis, source_snippet)                        AS description,
  'cleo'::text                                            AS agent,
  coalesce(state, 'seeded')                               AS status,
  'normal'::text                                          AS priority,
  coalesce(updated_at, created_at, now())                 AS sort_at,
  source_url                                              AS url,
  'content_ideas'::text                                   AS source_table,
  jsonb_build_object(
    'distribution',  distribution,
    'confidence',    confidence,
    'quality_score', quality_score
  )                                                       AS meta
FROM public.content_ideas
WHERE coalesce(state, 'seeded') IN ('seeded','researching','drafting','review')

UNION ALL

SELECT
  'lead'::text                                            AS kind,
  id::text                                                AS id,
  coalesce(full_name, '(unnamed)') || coalesce(' at ' || nullif(company, ''), '')
                                                          AS title,
  why_relevant                                            AS description,
  coalesce(assignee_agent, 'felix')                       AS agent,
  status,
  CASE
    WHEN quality_score = 'green' THEN 'high'
    WHEN quality_score = 'amber' THEN 'normal'
    ELSE 'low'
  END                                                     AS priority,
  coalesce(updated_at, created_at, now())                 AS sort_at,
  coalesce(linkedin_url, source_url)                      AS url,
  'leads'::text                                           AS source_table,
  jsonb_build_object(
    'primary_venture', primary_venture,
    'tags',            tags,
    'icp_scores',      icp_scores,
    'fit_score',       fit_score,
    'quality_score',   quality_score
  )                                                       AS meta
FROM public.leads
WHERE status IN ('new','ready')
  AND (quality_score IS NULL OR quality_score IN ('green','amber'))

UNION ALL

SELECT
  'visibility'::text                                      AS kind,
  id::text                                                AS id,
  coalesce(title, '(untitled)') || ' (' || coalesce(type, 'event') || ')'
                                                          AS title,
  why_relevant                                            AS description,
  'nova'::text                                            AS agent,
  CASE
    WHEN deadline_at < now()                       THEN 'overdue'
    WHEN deadline_at < now() + interval '7 days'   THEN 'urgent'
    ELSE coalesce(status, 'waiting')
  END                                                     AS status,
  CASE WHEN coalesce(relevance_score, 0) >= 8 THEN 'high' ELSE 'normal' END
                                                          AS priority,
  coalesce(deadline_at, event_start_at, now() + interval '30 days')
                                                          AS sort_at,
  coalesce(cfp_url, event_url)                            AS url,
  'visibility_targets'::text                              AS source_table,
  jsonb_build_object(
    'event_start_at', event_start_at,
    'deadline_at',    deadline_at,
    'audience_size',  audience_size,
    'quality_score',  quality_score,
    'type',           type
  )                                                       AS meta
FROM public.visibility_targets
WHERE (quality_score IS NULL OR quality_score IN ('green','amber'))
  AND (deadline_at IS NULL OR deadline_at > now() - interval '7 days');

GRANT SELECT ON public.decisions_waiting TO anon, authenticated, service_role;

COMMIT;
