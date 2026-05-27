-- Phase 2 of focus + tasks inbox brief: Tasks Inbox.
--
-- Krish drops raw tasks via Cmd+K (desktop) or a mobile FAB. The
-- classifier (Sonnet 4.6) decides where each goes; the router writes
-- the routed row; the return detector flips status back to needs_krish
-- when the routed row reaches a state needing Krish's input again.
--
-- 14-day auto-decay archives anything still raw or in clarification.
--
-- Idempotent. Safe to re-run.

CREATE TABLE IF NOT EXISTS public.tasks_inbox (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  raw_text  text NOT NULL,
  source    text NOT NULL CHECK (source IN ('control_center','mobile','voice','telegram')),
  captured_at timestamptz NOT NULL DEFAULT now(),

  classified_at  timestamptz,
  classification jsonb,

  routed_to_agent text,
  target_table    text,
  target_id       uuid,

  status      text NOT NULL DEFAULT 'raw' CHECK (status IN ('raw','classifying','needs_clarification','routing','in_flight','needs_krish','done','archived','failed')),
  clarification_thread jsonb NOT NULL DEFAULT '[]'::jsonb,
  concept_id  text,

  archived_at    timestamptz,
  archive_reason text CHECK (archive_reason IN ('auto_decay_14d','krish_dismissed','completed','classifier_failed') OR archive_reason IS NULL),

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS tasks_inbox_status_idx      ON public.tasks_inbox (status);
CREATE INDEX IF NOT EXISTS tasks_inbox_captured_at_idx ON public.tasks_inbox (captured_at);
CREATE INDEX IF NOT EXISTS tasks_inbox_concept_id_idx  ON public.tasks_inbox (concept_id);
CREATE INDEX IF NOT EXISTS tasks_inbox_target_idx
  ON public.tasks_inbox (target_table, target_id) WHERE target_id IS NOT NULL;

ALTER TABLE public.tasks_inbox ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_read_tasks_inbox"       ON public.tasks_inbox;
DROP POLICY IF EXISTS "service_role_all_tasks_inbox" ON public.tasks_inbox;
CREATE POLICY "anon_read_tasks_inbox"        ON public.tasks_inbox FOR SELECT TO anon USING (true);
CREATE POLICY "service_role_all_tasks_inbox" ON public.tasks_inbox FOR ALL    TO service_role USING (true) WITH CHECK (true);

CREATE OR REPLACE FUNCTION public.touch_tasks_inbox_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at := now(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS tasks_inbox_touch_updated_at ON public.tasks_inbox;
CREATE TRIGGER tasks_inbox_touch_updated_at
  BEFORE UPDATE ON public.tasks_inbox
  FOR EACH ROW EXECUTE FUNCTION public.touch_tasks_inbox_updated_at();

-- archive_stale_inbox_ideas: 14-day auto-decay for rows that never
-- finished classification or never resolved their clarification thread.
CREATE OR REPLACE FUNCTION public.archive_stale_inbox_ideas()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_count int;
BEGIN
  UPDATE public.tasks_inbox
     SET status         = 'archived',
         archived_at    = now(),
         archive_reason = 'auto_decay_14d',
         updated_at     = now()
   WHERE status IN ('raw','classifying','needs_clarification')
     AND captured_at < now() - interval '14 days';
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN jsonb_build_object('ok', true, 'archived_count', v_count, 'at', now());
END;
$$;

-- Extend decisions_waiting view with a 7th branch: inbox_returned.
-- Triggers only when a routed inbox row has been flipped back to
-- needs_krish by the return detector. The route_target deep-links to
-- the underlying row in the right Control Center surface.
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
  WHERE guests.status = ANY (ARRAY['researched','pitched','scouted','enriched'])
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
  WHERE COALESCE(content_ideas.state, 'seeded') = ANY (ARRAY['seeded','researching','drafting','review'])
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
