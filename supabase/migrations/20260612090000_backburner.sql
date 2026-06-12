-- Backburner: auto-deprioritization for agent-generated items.
--
-- The fleet generates items faster than Krish can triage (Home "Waiting on
-- you" pinned at the 200-row view limit). This adds the schema for a daily
-- deterministic sweep that buries low-score, idle, agent-originated rows
-- behind a per-tab collapsed "Backburner" section.
--
-- Hard rule: anything the user created/loaded themselves (origin='user') is
-- NEVER auto-buried. Restored items get protected_at and are never re-buried.
--
-- Idempotent. Safe to re-run.

-- ── Columns ──────────────────────────────────────────────────────────────────
ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS origin text NOT NULL DEFAULT 'agent',
  ADD COLUMN IF NOT EXISTS buried_at timestamptz,
  ADD COLUMN IF NOT EXISTS buried_reason text,
  ADD COLUMN IF NOT EXISTS protected_at timestamptz;

ALTER TABLE public.guests
  ADD COLUMN IF NOT EXISTS origin text NOT NULL DEFAULT 'agent',
  ADD COLUMN IF NOT EXISTS buried_at timestamptz,
  ADD COLUMN IF NOT EXISTS buried_reason text,
  ADD COLUMN IF NOT EXISTS protected_at timestamptz;

ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS origin text NOT NULL DEFAULT 'agent',
  ADD COLUMN IF NOT EXISTS buried_at timestamptz,
  ADD COLUMN IF NOT EXISTS buried_reason text,
  ADD COLUMN IF NOT EXISTS protected_at timestamptz;

ALTER TABLE public.visibility_targets
  ADD COLUMN IF NOT EXISTS origin text NOT NULL DEFAULT 'agent',
  ADD COLUMN IF NOT EXISTS buried_at timestamptz,
  ADD COLUMN IF NOT EXISTS buried_reason text,
  ADD COLUMN IF NOT EXISTS protected_at timestamptz;

ALTER TABLE public.content_ideas
  ADD COLUMN IF NOT EXISTS origin text NOT NULL DEFAULT 'agent',
  ADD COLUMN IF NOT EXISTS buried_at timestamptz,
  ADD COLUMN IF NOT EXISTS buried_reason text,
  ADD COLUMN IF NOT EXISTS protected_at timestamptz;

CREATE INDEX IF NOT EXISTS tasks_buried_at_idx              ON public.tasks (buried_at)              WHERE buried_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS guests_buried_at_idx             ON public.guests (buried_at)             WHERE buried_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS leads_buried_at_idx              ON public.leads (buried_at)              WHERE buried_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS visibility_targets_buried_at_idx ON public.visibility_targets (buried_at) WHERE buried_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS content_ideas_buried_at_idx      ON public.content_ideas (buried_at)      WHERE buried_at IS NOT NULL;

-- ── Backfill: recognizable user-originated rows ──────────────────────────────
-- (tasks has no `source` column in prod; manual-trigger tasks are identified
-- going forward by origin stamped at the API write path.)
UPDATE public.content_ideas      SET origin = 'user' WHERE source_type = 'manual' AND origin <> 'user';
UPDATE public.visibility_targets SET origin = 'user' WHERE source = 'manual_import' AND origin <> 'user';
UPDATE public.tasks              SET origin = 'user' WHERE workstream = 'objective-ladder' AND origin <> 'user';

-- ── triage_queue: exclude buried rows ────────────────────────────────────────
-- Canonical definition from scripts/migrations/2026-05-26-triage-queue-view.sql
-- with `buried_at IS NULL` added to each branch.
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
  AND content_ideas.buried_at IS NULL

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
  AND leads.buried_at IS NULL

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
  AND visibility_targets.buried_at IS NULL

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
WHERE guests.status IN ('scouted', 'enriched')
  AND guests.buried_at IS NULL;

GRANT SELECT ON public.triage_queue TO anon, authenticated, service_role;

-- ── decisions_waiting: exclude buried rows ───────────────────────────────────
-- Canonical 7-branch definition from 20260527200000_tasks_inbox_phase2.sql,
-- with `buried_at IS NULL` added to the 5 source-table branches. Column shape
-- is identical, so CREATE OR REPLACE is safe.
CREATE OR REPLACE VIEW public.decisions_waiting AS
SELECT 'task'::text AS kind,
    tasks.id,
    tasks.title,
    tasks.description,
    COALESCE(tasks.agent, tasks.owner) AS agent,
    tasks.status,
    COALESCE(tasks.priority, 'normal'::text) AS priority,
    COALESCE(tasks.due_date, tasks.started_at, tasks.created) AS sort_at,
    tasks.link_primary AS url,
    'tasks'::text AS source_table,
    jsonb_build_object('agent', tasks.agent, 'workstream', tasks.workstream, 'tier', tasks.tier, 'lever_score', tasks.lever_score) AS meta,
    'today?task='::text || tasks.id AS route_target
   FROM tasks
  WHERE (tasks.status = ANY (ARRAY['waiting','in_progress','blocked','new'])) AND COALESCE(tasks.krish_reviewed, false) = false
    AND tasks.buried_at IS NULL
UNION ALL
 SELECT 'guest'::text AS kind,
    guests.id::text AS id,
    (('Pitch guest: ' || COALESCE(guests.name, '(unnamed)')) || ' for ') || COALESCE(guests.podcast_target, 'unknown show') AS title,
    COALESCE(guests.why_fit, guests.one_liner) AS description,
    'nell'::text AS agent,
    guests.status,
    CASE WHEN COALESCE(guests.fit_score, 0) >= 8 THEN 'high' ELSE 'normal' END AS priority,
    COALESCE(guests.updated_at, guests.created_at, now()) AS sort_at,
    COALESCE(guests.linkedin_url, guests.personal_url, guests.twitter_handle) AS url,
    'guests'::text AS source_table,
    jsonb_build_object('podcast_target', guests.podcast_target, 'fit_score', guests.fit_score, 'attainability_score', guests.attainability_score, 'quality_score', guests.quality_score, 'has_pitch_draft', guests.pitch_draft IS NOT NULL, 'pitch_draft_preview', "left"(COALESCE(guests.pitch_draft, ''), 200), 'suggested_angles', guests.notes) AS meta,
    'guests?guest='::text || guests.id::text AS route_target
   FROM guests
  WHERE (guests.status = ANY (ARRAY['researched','pitched','scouted','enriched']))
    AND guests.buried_at IS NULL
UNION ALL
 SELECT 'idea'::text AS kind,
    content_ideas.id::text AS id,
    COALESCE(content_ideas.idea, "left"(COALESCE(content_ideas.source_snippet, '(no title)'), 120)) AS title,
    COALESCE(content_ideas.thesis, content_ideas.source_snippet) AS description,
    'cleo'::text AS agent,
    COALESCE(content_ideas.state, 'seeded') AS status,
    'normal'::text AS priority,
    COALESCE(content_ideas.updated_at, content_ideas.created_at, now()) AS sort_at,
    content_ideas.source_url AS url,
    'content_ideas'::text AS source_table,
    jsonb_build_object('distribution', content_ideas.distribution, 'confidence', content_ideas.confidence, 'quality_score', content_ideas.quality_score) AS meta,
    'content?idea='::text || content_ideas.id::text AS route_target
   FROM content_ideas
  WHERE (COALESCE(content_ideas.state, 'seeded') = ANY (ARRAY['seeded','researching','drafting','review']))
    AND content_ideas.buried_at IS NULL
UNION ALL
 SELECT 'lead'::text AS kind,
    leads.id::text AS id,
    COALESCE(leads.full_name, '(unnamed)') || COALESCE(' at ' || NULLIF(leads.company, ''), '') AS title,
    leads.why_relevant AS description,
    COALESCE(leads.assignee_agent, 'felix') AS agent,
    leads.status,
    CASE WHEN leads.quality_score = 'green' THEN 'high' WHEN leads.quality_score = 'amber' THEN 'normal' ELSE 'low' END AS priority,
    COALESCE(leads.updated_at, leads.created_at, now()) AS sort_at,
    COALESCE(leads.linkedin_url, leads.source_url) AS url,
    'leads'::text AS source_table,
    jsonb_build_object('primary_venture', leads.primary_venture, 'tags', leads.tags, 'icp_scores', leads.icp_scores, 'fit_score', leads.fit_score, 'quality_score', leads.quality_score) AS meta,
    'leads?lead='::text || leads.id::text AS route_target
   FROM leads
  WHERE (leads.status = ANY (ARRAY['new','ready'])) AND (leads.quality_score IS NULL OR (leads.quality_score = ANY (ARRAY['green','amber'])))
    AND leads.buried_at IS NULL
UNION ALL
 SELECT 'visibility'::text AS kind,
    visibility_targets.id::text AS id,
    ((COALESCE(visibility_targets.title, '(untitled)') || ' (') || COALESCE(visibility_targets.type, 'event')) || ')' AS title,
    visibility_targets.why_relevant AS description,
    'nova'::text AS agent,
    CASE
      WHEN visibility_targets.deadline_at < now() THEN 'overdue'
      WHEN visibility_targets.deadline_at < (now() + '7 days'::interval) THEN 'urgent'
      ELSE COALESCE(visibility_targets.status, 'waiting')
    END AS status,
    CASE WHEN COALESCE(visibility_targets.relevance_score, 0) >= 8 THEN 'high' ELSE 'normal' END AS priority,
    COALESCE(visibility_targets.deadline_at, visibility_targets.event_start_at, now() + '30 days'::interval) AS sort_at,
    COALESCE(visibility_targets.cfp_url, visibility_targets.event_url) AS url,
    'visibility_targets'::text AS source_table,
    jsonb_build_object('event_start_at', visibility_targets.event_start_at, 'deadline_at', visibility_targets.deadline_at, 'audience_size', visibility_targets.audience_size, 'quality_score', visibility_targets.quality_score, 'type', visibility_targets.type, 'deep_enriched_at', visibility_targets.deep_enriched_at, 'enrichment_version', visibility_targets.enrichment_version) AS meta,
    'guests?target='::text || visibility_targets.id::text AS route_target
   FROM visibility_targets
  WHERE (visibility_targets.quality_score IS NULL OR (visibility_targets.quality_score = ANY (ARRAY['green','amber']))) AND (visibility_targets.deadline_at IS NULL OR visibility_targets.deadline_at > (now() - '7 days'::interval))
    AND visibility_targets.buried_at IS NULL
UNION ALL
 SELECT 'correction'::text AS kind,
    corrections.id::text AS id,
    (('Correction: ' || COALESCE(corrections.agent_id, 'unknown')) || ' / ') || COALESCE(corrections.correction_type, 'unspecified') AS title,
    COALESCE(corrections.correction_instruction, corrections.proposed_brief_edit, corrections.pattern_extracted) AS description,
    COALESCE(corrections.agent_id, 'vera') AS agent,
    corrections.status,
    CASE
      WHEN corrections.detected_at < (now() - '14 days'::interval) THEN 'overdue'
      WHEN corrections.detected_at < (now() - '3 days'::interval) THEN 'urgent'
      ELSE 'normal'
    END AS priority,
    COALESCE(corrections.detected_at, corrections.created_at, now()) AS sort_at,
    NULL::text AS url,
    'corrections'::text AS source_table,
    jsonb_build_object('correction_type', corrections.correction_type, 'detection_source', corrections.detection_source, 'pattern_reason_code', corrections.pattern_reason_code, 'standard_id', corrections.standard_id, 'confidence', corrections.confidence, 'approval_state', corrections.approval_state, 'pattern_preview', "left"(COALESCE(corrections.pattern_extracted, ''), 200), 'proposed_brief_edit', corrections.proposed_brief_edit) AS meta,
    'org?correction='::text || corrections.id::text AS route_target
   FROM corrections
  WHERE corrections.status = 'analyzed' AND corrections.approval_state = 'pending'
UNION ALL
 SELECT 'inbox_returned'::text AS kind,
    ti.id::text AS id,
    COALESCE(
      (SELECT t.title FROM public.tasks t WHERE t.id = ti.target_id::text AND ti.target_table = 'tasks'),
      "left"(ti.raw_text, 80)
    ) AS title,
    COALESCE(
      (ti.classification->>'first_action'),
      ti.raw_text
    ) AS description,
    COALESCE(ti.routed_to_agent, 'agatha') AS agent,
    ti.status,
    CASE
      WHEN ti.updated_at < (now() - '3 days'::interval) THEN 'urgent'
      ELSE 'normal'
    END AS priority,
    ti.updated_at AS sort_at,
    NULL::text AS url,
    'tasks_inbox'::text AS source_table,
    jsonb_build_object(
      'raw_text', ti.raw_text,
      'classification', ti.classification,
      'concept_id', ti.concept_id,
      'target_table', ti.target_table,
      'target_id', ti.target_id,
      'routed_to_agent', ti.routed_to_agent
    ) AS meta,
    CASE ti.target_table
      WHEN 'tasks'              THEN 'today?task='              || ti.target_id::text
      WHEN 'leads'              THEN 'leads?lead='              || ti.target_id::text
      WHEN 'visibility_targets' THEN 'guests?target='           || ti.target_id::text
      WHEN 'guests'             THEN 'guests?guest='            || ti.target_id::text
      WHEN 'content_ideas'      THEN 'content?idea='            || ti.target_id::text
      WHEN 'bets'               THEN 'bets?bet='                || ti.target_id::text
      ELSE 'inbox?id=' || ti.id::text
    END AS route_target
   FROM public.tasks_inbox ti
  WHERE ti.status = 'needs_krish';
