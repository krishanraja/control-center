-- Growth stall engine: the growth_stalls episode table + decisions_waiting v5.
--
-- A stall is one episode of a growth metric going flat-or-down across its
-- window (default 14d, per-key overrides in system_config.growth_stall_days).
-- The daily /api/growth/stall-check cron opens at most ONE row per metric_key
-- (partial unique index), drafts ~3 concrete moves into `moves`, and the row
-- surfaces on Home as a `growth_stall` decision with the moves attached.
-- Adopt turns a move into a task; rising values auto-resolve the episode.
-- Drafts only; nothing sends without Krish (PUB-001).

create table if not exists public.growth_stalls (
  id uuid primary key default gen_random_uuid(),
  metric_key text not null,
  window_days integer not null,
  baseline_value numeric,
  latest_value numeric,
  started_at timestamptz not null default now(),
  status text not null default 'open'
    check (status in ('open', 'acknowledged', 'resolved', 'dismissed')),
  moves jsonb not null default '[]'::jsonb,
  moves_drafted_at timestamptz,
  resolved_at timestamptz,
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists growth_stalls_one_open_per_key
  on public.growth_stalls (metric_key) where status = 'open';
alter table public.growth_stalls enable row level security;
drop policy if exists growth_stalls_anon_read on public.growth_stalls;
create policy growth_stalls_anon_read on public.growth_stalls for select to anon using (true);
drop policy if exists growth_stalls_service_all on public.growth_stalls;
create policy growth_stalls_service_all on public.growth_stalls for all to service_role using (true) with check (true);
grant select on public.growth_stalls to anon;
grant all on public.growth_stalls to service_role;

-- Stall window config: default + per-key overrides. Read by the cron.
insert into public.system_config (key, value, updated_at)
values ('growth_stall_days', '{"default": 14, "overrides": {"app_mrr_usd": 21}}', now())
on conflict (key) do nothing;

-- decisions_waiting v5: v4 verbatim + the growth_stall branch. Column shape
-- (kind, id, title, description, agent, status, priority, sort_at, url,
--  source_table, meta, route_target) unchanged — CREATE OR REPLACE requires it.
-- Cosmetic fix riding along: 'today?task=' route_target strings become
-- 'home?task=' (Today folded into Home; the client never reads route_target,
-- but it should not lie).

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
    'home?task='::text || tasks.id AS route_target
   FROM tasks
  WHERE (tasks.status = ANY (ARRAY['waiting'::text, 'in_progress'::text, 'blocked'::text, 'new'::text]))
    AND COALESCE(tasks.krish_reviewed, false) = false
    AND tasks.buried_at IS NULL
    AND (tasks.due_date IS NULL OR tasks.due_date < (CURRENT_DATE + 1))
    AND NOT EXISTS (
      SELECT 1 FROM acquisition_sends s
      WHERE s.approval_task_id = tasks.id AND s.status = 'queued'::text
    )
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
  WHERE COALESCE(content_ideas.state, 'seeded'::text) = 'review'::text AND content_ideas.source_type <> 'pool_headline'::text AND content_ideas.buried_at IS NULL
UNION ALL
 SELECT 'content_decision'::text AS kind,
    cd.id::text AS id,
        CASE cd.kind
            WHEN 'brief_review'::text THEN 'Review the weekly brief: '::text || COALESCE(cd.payload ->> 'title'::text, cd.week)
            WHEN 'shift_proposal'::text THEN 'New shift proposed: '::text || COALESCE(cd.payload ->> 'title'::text, '(untitled)'::text)
            WHEN 'shift_fading'::text THEN 'Shift losing momentum: '::text || COALESCE(cd.payload ->> 'title'::text, '(untitled)'::text)
            WHEN 'graduation'::text THEN 'Graduate to Library: '::text || COALESCE(cd.payload ->> 'title'::text, '(untitled)'::text)
            ELSE COALESCE(cd.payload ->> 'expiring'::text, '0'::text) || ' items expire in the Monday purge'::text
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
            WHEN 'tasks'::text THEN 'home?task='::text || ti.target_id::text
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
    'home?task='::text || COALESCE(vg.task_id, ''::text) AS route_target
   FROM vera_gaps vg
  WHERE vg.status = 'open'::text AND vg.cycles_open >= 2
UNION ALL
 SELECT 'sequence_approval'::text AS kind,
    sq.id::text AS id,
    'Sequence: '::text || sq.name AS title,
    sq.rationale AS description,
    COALESCE(sq.proposed_by, 'maya'::text) AS agent,
    sq.status,
    'high'::text AS priority,
    COALESCE(sq.updated_at, sq.created_at, now()) AS sort_at,
    NULL::text AS url,
    'acquisition_sequences'::text AS source_table,
    jsonb_build_object('lane', sq.lane, 'sequence_type', sq.sequence_type, 'frame_version', sq.frame_version, 'touch_count', jsonb_array_length(sq.touches), 'first_subject', sq.touches -> 0 ->> 'subject'::text, 'rationale', sq.rationale) AS meta,
    'acquisition?seq='::text || sq.id::text AS route_target
   FROM acquisition_sequences sq
  WHERE sq.status = 'proposed'::text
UNION ALL
 SELECT 'send_sample'::text AS kind,
    s.id::text AS id,
    (('T'::text || s.touch_number) || ' send: '::text) || COALESCE(s.rendered_subject, '(no subject)'::text) AS title,
    "left"(COALESCE(s.rendered_body, ''::text), 240) AS description,
    'maya'::text AS agent,
    s.status,
    'normal'::text AS priority,
    COALESCE(s.queued_at, now()) AS sort_at,
    NULL::text AS url,
    'acquisition_sends'::text AS source_table,
    jsonb_build_object('lane', s.lane, 'frame_version', s.frame_version, 'touch_number', s.touch_number, 'lead_id', s.lead_id, 'subject', s.rendered_subject) AS meta,
    'acquisition?send='::text || s.id::text AS route_target
   FROM acquisition_sends s
  WHERE s.status = 'queued'::text AND s.sample_required
UNION ALL
 SELECT 'growth_stall'::text AS kind,
    gs.id::text AS id,
    'Growth stalled: '::text || gs.metric_key AS title,
    (('Flat or down for '::text || gs.window_days) || ' days. 3 drafted moves attached.'::text) AS description,
    'marcus'::text AS agent,
    gs.status,
    'high'::text AS priority,
    gs.started_at AS sort_at,
    NULL::text AS url,
    'growth_stalls'::text AS source_table,
    jsonb_build_object('metric_key', gs.metric_key, 'window_days', gs.window_days, 'baseline_value', gs.baseline_value, 'latest_value', gs.latest_value, 'moves', gs.moves) AS meta,
    'home'::text AS route_target
   FROM growth_stalls gs
  WHERE gs.status = 'open'::text;
