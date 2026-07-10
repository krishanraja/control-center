-- Coherence wave 1 (Content Engine v2 follow-through):
-- 1. The old `idea` branch surfaced EVERY active content_ideas row as "waiting
--    on you" — with the v2 ambient Feed that would flood Home with ~160 pool
--    headlines that explicitly carry zero obligations. It narrows to the only
--    idea-level ask that remains personal: pieces in `review` (his sign-off),
--    excluding feed rows.
-- 2. New `content_decision` branch: the finite typed weekly queue
--    (brief_review / shift_proposal / shift_fading / graduation / purge_preview)
--    joins the unified decisions_waiting view, so Home and the Content tab
--    share ONE "waiting on you" truth.
-- Only the content_ideas branch changes and one branch is appended; all other
-- branches are byte-identical to the previous definition.

create or replace view public.decisions_waiting as
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
  WHERE (tasks.status = ANY (ARRAY['waiting'::text, 'in_progress'::text, 'blocked'::text, 'new'::text])) AND COALESCE(tasks.krish_reviewed, false) = false AND tasks.buried_at IS NULL
UNION ALL
 SELECT 'guest'::text AS kind,
    guests.id::text AS id,
    (('Pitch guest: '::text || COALESCE(guests.name, '(unnamed)'::text)) || ' for '::text) || COALESCE(guests.podcast_target, 'unknown show'::text) AS title,
    COALESCE(guests.why_fit, guests.one_liner) AS description,
    'nell'::text AS agent,
    guests.status,
        CASE
            WHEN COALESCE(guests.fit_score, 0) >= 8 THEN 'high'::text
            ELSE 'normal'::text
        END AS priority,
    COALESCE(guests.updated_at, guests.created_at, now()) AS sort_at,
    COALESCE(guests.linkedin_url, guests.personal_url, guests.twitter_handle) AS url,
    'guests'::text AS source_table,
    jsonb_build_object('podcast_target', guests.podcast_target, 'fit_score', guests.fit_score, 'attainability_score', guests.attainability_score, 'quality_score', guests.quality_score, 'has_pitch_draft', guests.pitch_draft IS NOT NULL, 'pitch_draft_preview', "left"(COALESCE(guests.pitch_draft, ''::text), 200), 'suggested_angles', guests.notes) AS meta,
    'guests?guest='::text || guests.id::text AS route_target
   FROM guests
  WHERE (guests.status = ANY (ARRAY['researched'::text, 'pitched'::text, 'scouted'::text, 'enriched'::text])) AND guests.buried_at IS NULL
UNION ALL
 SELECT 'idea'::text AS kind,
    content_ideas.id::text AS id,
    COALESCE(content_ideas.idea, "left"(COALESCE(content_ideas.source_snippet, '(no title)'::text), 120)) AS title,
    COALESCE(content_ideas.thesis, content_ideas.source_snippet) AS description,
    'cleo'::text AS agent,
    COALESCE(content_ideas.state, 'seeded'::text) AS status,
    'normal'::text AS priority,
    COALESCE(content_ideas.updated_at, content_ideas.created_at, now()) AS sort_at,
    content_ideas.source_url AS url,
    'content_ideas'::text AS source_table,
    jsonb_build_object('distribution', content_ideas.distribution, 'confidence', content_ideas.confidence, 'quality_score', content_ideas.quality_score) AS meta,
    'content?idea='::text || content_ideas.id::text AS route_target
   FROM content_ideas
  WHERE COALESCE(content_ideas.state, 'seeded'::text) = 'review'::text
    AND content_ideas.source_type <> 'pool_headline'::text
    AND content_ideas.buried_at IS NULL
UNION ALL
 SELECT 'content_decision'::text AS kind,
    cd.id::text AS id,
        CASE cd.kind
            WHEN 'brief_review'::text THEN 'Review the weekly brief: '::text || COALESCE(cd.payload ->> 'title'::text, cd.week)
            WHEN 'shift_proposal'::text THEN 'New shift proposed: '::text || COALESCE(cd.payload ->> 'title'::text, '(untitled)'::text)
            WHEN 'shift_fading'::text THEN 'Shift losing momentum: '::text || COALESCE(cd.payload ->> 'title'::text, '(untitled)'::text)
            WHEN 'graduation'::text THEN 'Graduate to Library: '::text || COALESCE(cd.payload ->> 'title'::text, '(untitled)'::text)
            ELSE (COALESCE(cd.payload ->> 'expiring'::text, '0'::text) || ' items expire in the Monday purge'::text)
        END AS title,
    COALESCE(cd.payload ->> 'summary'::text, cd.payload ->> 'implication'::text) AS description,
    'cleo'::text AS agent,
    cd.kind AS status,
        CASE
            WHEN cd.kind = ANY (ARRAY['brief_review'::text, 'shift_proposal'::text]) THEN 'high'::text
            ELSE 'normal'::text
        END AS priority,
    cd.created_at AS sort_at,
    NULL::text AS url,
    'content_decisions'::text AS source_table,
    cd.payload || jsonb_build_object('decision_kind', cd.kind, 'ref', cd.ref, 'week', cd.week) AS meta,
    'content'::text AS route_target
   FROM content_decisions cd
  WHERE cd.status = 'pending'::text
UNION ALL
 SELECT 'lead'::text AS kind,
    leads.id::text AS id,
    COALESCE(leads.full_name, '(unnamed)'::text) || COALESCE(' at '::text || NULLIF(leads.company, ''::text), ''::text) AS title,
    leads.why_relevant AS description,
    COALESCE(leads.assignee_agent, 'felix'::text) AS agent,
    leads.status,
        CASE
            WHEN leads.quality_score = 'green'::text THEN 'high'::text
            WHEN leads.quality_score = 'amber'::text THEN 'normal'::text
            ELSE 'low'::text
        END AS priority,
    COALESCE(leads.updated_at, leads.created_at, now()) AS sort_at,
    COALESCE(leads.linkedin_url, leads.source_url) AS url,
    'leads'::text AS source_table,
    jsonb_build_object('primary_venture', leads.primary_venture, 'tags', leads.tags, 'icp_scores', leads.icp_scores, 'fit_score', leads.fit_score, 'quality_score', leads.quality_score) AS meta,
    'leads?lead='::text || leads.id::text AS route_target
   FROM leads
  WHERE (leads.status = ANY (ARRAY['new'::text, 'ready'::text])) AND (leads.quality_score IS NULL OR (leads.quality_score = ANY (ARRAY['green'::text, 'amber'::text]))) AND leads.buried_at IS NULL
UNION ALL
 SELECT 'visibility'::text AS kind,
    visibility_targets.id::text AS id,
    ((COALESCE(visibility_targets.title, '(untitled)'::text) || ' ('::text) || COALESCE(visibility_targets.type, 'event'::text)) || ')'::text AS title,
    visibility_targets.why_relevant AS description,
    'nova'::text AS agent,
        CASE
            WHEN visibility_targets.deadline_at < now() THEN 'overdue'::text
            WHEN visibility_targets.deadline_at < (now() + '7 days'::interval) THEN 'urgent'::text
            ELSE COALESCE(visibility_targets.status, 'waiting'::text)
        END AS status,
        CASE
            WHEN COALESCE(visibility_targets.relevance_score, 0) >= 8 THEN 'high'::text
            ELSE 'normal'::text
        END AS priority,
    COALESCE(visibility_targets.deadline_at, visibility_targets.event_start_at, now() + '30 days'::interval) AS sort_at,
    COALESCE(visibility_targets.cfp_url, visibility_targets.event_url) AS url,
    'visibility_targets'::text AS source_table,
    jsonb_build_object('event_start_at', visibility_targets.event_start_at, 'deadline_at', visibility_targets.deadline_at, 'audience_size', visibility_targets.audience_size, 'quality_score', visibility_targets.quality_score, 'type', visibility_targets.type, 'deep_enriched_at', visibility_targets.deep_enriched_at, 'enrichment_version', visibility_targets.enrichment_version) AS meta,
    'guests?target='::text || visibility_targets.id::text AS route_target
   FROM visibility_targets
  WHERE (visibility_targets.quality_score IS NULL OR (visibility_targets.quality_score = ANY (ARRAY['green'::text, 'amber'::text]))) AND (visibility_targets.deadline_at IS NULL OR visibility_targets.deadline_at > (now() - '7 days'::interval)) AND visibility_targets.buried_at IS NULL
UNION ALL
 SELECT 'correction'::text AS kind,
    corrections.id::text AS id,
    (('Correction: '::text || COALESCE(corrections.agent_id, 'unknown'::text)) || ' / '::text) || COALESCE(corrections.correction_type, 'unspecified'::text) AS title,
    COALESCE(corrections.correction_instruction, corrections.proposed_brief_edit, corrections.pattern_extracted) AS description,
    COALESCE(corrections.agent_id, 'vera'::text) AS agent,
    corrections.status,
        CASE
            WHEN corrections.detected_at < (now() - '14 days'::interval) THEN 'overdue'::text
            WHEN corrections.detected_at < (now() - '3 days'::interval) THEN 'urgent'::text
            ELSE 'normal'::text
        END AS priority,
    COALESCE(corrections.detected_at, corrections.created_at, now()) AS sort_at,
    NULL::text AS url,
    'corrections'::text AS source_table,
    jsonb_build_object('correction_type', corrections.correction_type, 'detection_source', corrections.detection_source, 'pattern_reason_code', corrections.pattern_reason_code, 'standard_id', corrections.standard_id, 'confidence', corrections.confidence, 'approval_state', corrections.approval_state, 'pattern_preview', "left"(COALESCE(corrections.pattern_extracted, ''::text), 200), 'proposed_brief_edit', corrections.proposed_brief_edit) AS meta,
    'org?correction='::text || corrections.id::text AS route_target
   FROM corrections
  WHERE corrections.status = 'analyzed'::text AND corrections.approval_state = 'pending'::text
UNION ALL
 SELECT 'inbox_returned'::text AS kind,
    ti.id::text AS id,
    COALESCE(( SELECT t.title
           FROM tasks t
          WHERE t.id = ti.target_id::text AND ti.target_table = 'tasks'::text), "left"(ti.raw_text, 80)) AS title,
    COALESCE(ti.classification ->> 'first_action'::text, ti.raw_text) AS description,
    COALESCE(ti.routed_to_agent, 'agatha'::text) AS agent,
    ti.status,
        CASE
            WHEN ti.updated_at < (now() - '3 days'::interval) THEN 'urgent'::text
            ELSE 'normal'::text
        END AS priority,
    ti.updated_at AS sort_at,
    NULL::text AS url,
    'tasks_inbox'::text AS source_table,
    jsonb_build_object('raw_text', ti.raw_text, 'classification', ti.classification, 'concept_id', ti.concept_id, 'target_table', ti.target_table, 'target_id', ti.target_id, 'routed_to_agent', ti.routed_to_agent) AS meta,
        CASE ti.target_table
            WHEN 'tasks'::text THEN 'today?task='::text || ti.target_id::text
            WHEN 'leads'::text THEN 'leads?lead='::text || ti.target_id::text
            WHEN 'visibility_targets'::text THEN 'guests?target='::text || ti.target_id::text
            WHEN 'guests'::text THEN 'guests?guest='::text || ti.target_id::text
            WHEN 'content_ideas'::text THEN 'content?idea='::text || ti.target_id::text
            WHEN 'bets'::text THEN 'bets?bet='::text || ti.target_id::text
            ELSE 'inbox?id='::text || ti.id::text
        END AS route_target
   FROM tasks_inbox ti
  WHERE ti.status = 'needs_krish'::text
UNION ALL
 SELECT 'skill_proposal'::text AS kind,
    skill_proposals.id::text AS id,
    'Skill: '::text || COALESCE(skill_proposals.skill_title, skill_proposals.skill_slug) AS title,
    "left"(COALESCE(skill_proposals.skill_body, ''::text), 280) AS description,
    COALESCE(skill_proposals.target_agent_id, 'fleet'::text) AS agent,
    skill_proposals.status,
        CASE
            WHEN skill_proposals.confidence = 'high'::text THEN 'high'::text
            ELSE 'normal'::text
        END AS priority,
    COALESCE(skill_proposals.created_at, now()) AS sort_at,
    NULL::text AS url,
    'skill_proposals'::text AS source_table,
    jsonb_build_object('scope', skill_proposals.scope, 'target_agent_id', skill_proposals.target_agent_id, 'pattern_key', skill_proposals.pattern_key, 'evidence_count', skill_proposals.evidence_count, 'confidence', skill_proposals.confidence, 'skill_title', skill_proposals.skill_title, 'skill_body_preview', "left"(COALESCE(skill_proposals.skill_body, ''::text), 600), 'write_target', skill_proposals.write_target) AS meta,
    'org?skill_proposal='::text || skill_proposals.id::text AS route_target
   FROM skill_proposals
  WHERE skill_proposals.status = 'proposed'::text AND skill_proposals.buried_at IS NULL
UNION ALL
 SELECT 'vera_gap'::text AS kind,
    vg.gap_id AS id,
    'Persistent gap: '::text || vg.subject AS title,
    (((((('Vera has flagged this '::text || vg.cycles_open) || 'x ('::text) || vg.band) || '/'::text) || vg.severity) || '). Owner: '::text) || vg.owner_agent AS description,
    vg.owner_agent AS agent,
    'open'::text AS status,
        CASE
            WHEN vg.severity = 'high'::text THEN 'high'::text
            ELSE 'normal'::text
        END AS priority,
    vg.last_seen_at AS sort_at,
    NULL::text AS url,
    'vera_gaps'::text AS source_table,
    jsonb_build_object('subject', vg.subject, 'band', vg.band, 'severity', vg.severity, 'cycles_open', vg.cycles_open, 'owner_agent', vg.owner_agent, 'task_id', vg.task_id, 'first_seen_at', vg.first_seen_at) AS meta,
    'today?task='::text || COALESCE(vg.task_id, ''::text) AS route_target
   FROM vera_gaps vg
  WHERE vg.status = 'open'::text AND vg.cycles_open >= 2;
