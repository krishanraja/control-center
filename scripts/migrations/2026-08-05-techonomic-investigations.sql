-- Techonomic investigation pipeline: the why-ladder, its harnesses, and the
-- double-check gate audit record.
--
-- Context (2026-08-05): the shift register was measured and found to contain
-- fabrications attributed to real publishers. Every table here exists to make a
-- plausible-sounding fabrication expensive to produce and cheap to detect. The
-- load-bearing design rule is that each gate records the VALUE IT OBSERVED, not
-- just a boolean, so "why did this pass" is answerable months later.
--
-- RLS house pattern, unchanged: anon SELECT, service_role ALL, all writes
-- through api/* with the service role key.

-- ============ investigations: one per week, one anchor ============
create table if not exists public.investigations (
  id uuid primary key default gen_random_uuid(),
  week text not null,
  status text not null default 'running'
    check (status in ('running', 'complete', 'aborted')),
  -- The anchor, resolved from the live feed, never invented.
  anchor_idea_id uuid references public.content_ideas(id) on delete set null,
  anchor_headline text,
  anchor_url text,
  anchor_domain text,
  anchor_score real,
  anchor_scores jsonb not null default '{}'::jsonb,
  -- G1 outcome. 'circulation' is the pivot a vendor number forces: the story
  -- stops being the number and becomes how the number travelled.
  thesis_mode text check (thesis_mode in ('mechanism', 'circulation')),
  rung0_question text,
  -- Honest terminal state. Published, not hidden.
  terminal_rung int,
  terminal_reason text check (terminal_reason in
    ('cap', 'motive_not_mechanism', 'evidence_exhausted', 'restatement', 'abstraction_drift')),
  terminal_statement text,
  -- Degradation is loud: a stale lexicon or a skipped harness still runs, but
  -- the run is stamped so the audit shows it.
  degraded boolean not null default false,
  degraded_reasons jsonb not null default '[]'::jsonb,
  abort_reason text,
  -- Budget, measured not estimated.
  model_calls int not null default 0,
  input_tokens int not null default 0,
  output_tokens int not null default 0,
  est_cost_usd numeric(10, 4) not null default 0,
  page_fetches int not null default 0,
  search_calls int not null default 0,
  -- The scored shortlist, kept so a rejected anchor is auditable too.
  candidates jsonb not null default '[]'::jsonb,
  -- Where the verified ladder was written as meta.materials for _finalPass.
  content_idea_id uuid references public.content_ideas(id) on delete set null,
  is_test boolean not null default false,
  started_at timestamptz not null default now(),
  finished_at timestamptz
);
create index if not exists investigations_week_idx on public.investigations (week desc, started_at desc);
create index if not exists investigations_status_idx on public.investigations (status, started_at desc);

alter table public.investigations enable row level security;
drop policy if exists "investigations anon read" on public.investigations;
create policy "investigations anon read" on public.investigations for select to anon using (true);
drop policy if exists "investigations service all" on public.investigations;
create policy "investigations service all" on public.investigations for all to service_role using (true) with check (true);

-- ============ investigation_claims: the ladder as a DAG ============
create table if not exists public.investigation_claims (
  id uuid primary key default gen_random_uuid(),
  investigation_id uuid not null references public.investigations(id) on delete cascade,
  -- Short printable alias inside the run (c1, r2). The model never sees a uuid.
  ref text not null,
  rung int not null check (rung >= 0 and rung <= 3),
  parent_id uuid references public.investigation_claims(id) on delete cascade,
  text text not null,
  claim_type text check (claim_type in ('thesis', 'mechanism', 'observation', 'analogy')),
  -- G4: enum membership IS the unfalsifiable-abstraction guard. 'incentive' is
  -- deliberately absent; 'incentive_contract' is admissible because a contract
  -- is a document you can cite.
  mechanism_type text,
  quantity text,
  -- G2 span grounding. quote must be a verbatim substring of the source text.
  quote text,
  grounding text check (grounding in ('exact', 'partial', 'failed')),
  strength_inflation boolean not null default false,
  -- G3. A falsifier is a product, not just a gate: falsifier_due_on feeds the
  -- public corrections log, which turns an apology page into a scoreboard.
  falsifier text,
  falsifier_well_formed boolean,
  falsifier_jaccard real,
  falsifier_due_on date,
  surprise int,
  verifiability int,
  priority real,
  source_url text,
  source_domain text,
  source_tier int,
  publisher_is_beneficiary boolean,
  checkable boolean,
  -- G5.5: an analogy must name the shared mechanism and the point it breaks.
  shared_mechanism text,
  breaks_if text,
  abstraction_score real,
  new_artifacts jsonb not null default '[]'::jsonb,
  status text not null default 'active' check (status in ('active', 'downgraded', 'blocked')),
  created_at timestamptz not null default now()
);
create unique index if not exists investigation_claims_ref_idx on public.investigation_claims (investigation_id, ref);
create index if not exists investigation_claims_rung_idx on public.investigation_claims (investigation_id, rung);

alter table public.investigation_claims enable row level security;
drop policy if exists "investigation_claims anon read" on public.investigation_claims;
create policy "investigation_claims anon read" on public.investigation_claims for select to anon using (true);
drop policy if exists "investigation_claims service all" on public.investigation_claims;
create policy "investigation_claims service all" on public.investigation_claims for all to service_role using (true) with check (true);

-- ============ investigation_evidence: fetched rows, with the page text ============
-- NOTE on the parallel-store question. The spec asked for failures to land in
-- shift_evidence.citable/quarantine_reason. shift_evidence.shift_id is NOT NULL
-- and FKs to shifts, and an investigation anchor is a content_ideas row that
-- usually has no shift. Minting synthetic register rows to hold quarantined
-- evidence would pollute the exact register this build exists to protect, so
-- investigation evidence lives here and carries the SAME two column names and
-- the same semantics.
create table if not exists public.investigation_evidence (
  id uuid primary key default gen_random_uuid(),
  investigation_id uuid not null references public.investigations(id) on delete cascade,
  ref text not null,
  claim_ref text,
  url text,
  domain text,
  headline text,
  source_tier int,
  -- Captured at G5.1 so G6 needs no second fetch. That storage decision is what
  -- makes the final claim-to-evidence mapping free.
  page_title text,
  page_text text,
  published_on date,
  citable boolean not null default false,
  quarantine_reason text,
  load_bearing boolean not null default false,
  -- G5.2 circular-reporting counter. Nine outlets reprinting one release is
  -- distinct_domains 9, distinct_origins 1.
  entity text,
  numeric_fingerprint text,
  origin_key text,
  harness text,
  created_at timestamptz not null default now()
);
create unique index if not exists investigation_evidence_ref_idx on public.investigation_evidence (investigation_id, ref);
create index if not exists investigation_evidence_origin_idx on public.investigation_evidence (investigation_id, origin_key);

alter table public.investigation_evidence enable row level security;
drop policy if exists "investigation_evidence anon read" on public.investigation_evidence;
create policy "investigation_evidence anon read" on public.investigation_evidence for select to anon using (true);
drop policy if exists "investigation_evidence service all" on public.investigation_evidence;
create policy "investigation_evidence service all" on public.investigation_evidence for all to service_role using (true) with check (true);

-- ============ investigation_harness_results: what each probe cost and returned ============
create table if not exists public.investigation_harness_results (
  id uuid primary key default gen_random_uuid(),
  investigation_id uuid not null references public.investigations(id) on delete cascade,
  harness text not null check (harness in
    ('supporting', 'contradictory', 'base_rate', 'primary_source',
     'provenance_chain', 'adjacent_category', 'url_liveness', 'publisher_beat')),
  subject_ref text,
  query text,
  -- 'skipped' and 'budget' are first-class outcomes. An enrichment failure is
  -- never fatal to the investigation, it is recorded and the run continues.
  verdict text not null check (verdict in ('hit', 'miss', 'skipped', 'error', 'budget')),
  cost_calls int not null default 0,
  cost_fetches int not null default 0,
  latency_ms int,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists investigation_harness_idx on public.investigation_harness_results (investigation_id, harness);

alter table public.investigation_harness_results enable row level security;
drop policy if exists "investigation_harness anon read" on public.investigation_harness_results;
create policy "investigation_harness anon read" on public.investigation_harness_results for select to anon using (true);
drop policy if exists "investigation_harness service all" on public.investigation_harness_results;
create policy "investigation_harness service all" on public.investigation_harness_results for all to service_role using (true) with check (true);

-- ============ investigation_gate_log: append-only, one row per gate decision ============
-- Survives deletion of the thing it judged (run_id is deliberately NOT a FK).
create table if not exists public.investigation_gate_log (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null,
  week text not null,
  gate text not null check (gate in
    ('G1_anchor', 'G2_grounding', 'G3_interest', 'G4_ladder', 'G5_harness', 'G6_draft')),
  subject_kind text not null check (subject_kind in
    ('anchor', 'claim', 'rung', 'evidence', 'analogy', 'draft')),
  subject_ref text not null,
  subject_label text,
  action text not null check (action in ('pass', 'flag', 'downgrade', 'block')),
  score real,
  -- [{id, passed, observed, expected, deterministic}]. The observed value is the
  -- whole point: a boolean cannot be re-audited, a recorded value can.
  checks jsonb not null default '[]'::jsonb,
  model_calls int not null default 0,
  model_name text,
  input_tokens int,
  output_tokens int,
  prompt_sha text,
  created_at timestamptz not null default now()
);
create index if not exists investigation_gate_log_run_idx on public.investigation_gate_log (run_id, created_at);
create index if not exists investigation_gate_log_gate_idx on public.investigation_gate_log (gate, created_at desc);

alter table public.investigation_gate_log enable row level security;
drop policy if exists "investigation_gate_log anon read" on public.investigation_gate_log;
create policy "investigation_gate_log anon read" on public.investigation_gate_log for select to anon using (true);
drop policy if exists "investigation_gate_log service all" on public.investigation_gate_log;
create policy "investigation_gate_log service all" on public.investigation_gate_log for all to service_role using (true) with check (true);

-- ============ publisher_beats: the self-populating plausibility map ============
-- marketingprofs.com does not publish G7 policy stories. Deterministic first
-- pass resolves most domains free; the model is asked only about unknowns, and
-- the answer is cached here so the marginal cost trends to zero. Krish promotes
-- confirmed rows into code at review time.
create table if not exists public.publisher_beats (
  domain text primary key,
  beats text[] not null default '{}',
  confirmed_by text not null default 'model' check (confirmed_by in ('code', 'model', 'krish')),
  confidence real,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.publisher_beats enable row level security;
drop policy if exists "publisher_beats anon read" on public.publisher_beats;
create policy "publisher_beats anon read" on public.publisher_beats for select to anon using (true);
drop policy if exists "publisher_beats service all" on public.publisher_beats;
create policy "publisher_beats service all" on public.publisher_beats for all to service_role using (true) with check (true);

-- ============ vendor_lexicon_pending: proposed, never auto-applied ============
-- G1 may only PROPOSE a vendor entity. The code lexicon is a reviewed artifact,
-- so a model can never widen or narrow the rule that blocks vendor numbers.
create table if not exists public.vendor_lexicon_pending (
  id uuid primary key default gen_random_uuid(),
  entity text not null,
  domain text,
  sells_the_thing_measured boolean,
  confidence real,
  evidence text,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'rejected')),
  first_seen_at timestamptz not null default now(),
  resolved_at timestamptz
);
create unique index if not exists vendor_lexicon_pending_entity_idx on public.vendor_lexicon_pending (lower(entity));

alter table public.vendor_lexicon_pending enable row level security;
drop policy if exists "vendor_lexicon_pending anon read" on public.vendor_lexicon_pending;
create policy "vendor_lexicon_pending anon read" on public.vendor_lexicon_pending for select to anon using (true);
drop policy if exists "vendor_lexicon_pending service all" on public.vendor_lexicon_pending;
create policy "vendor_lexicon_pending service all" on public.vendor_lexicon_pending for all to service_role using (true) with check (true);

-- ============ content_decisions: 'investigation' becomes a typed decision ============
alter table public.content_decisions drop constraint if exists content_decisions_kind_check;
alter table public.content_decisions add constraint content_decisions_kind_check
  check (kind = any (array['brief_review', 'shift_proposal', 'shift_fading', 'graduation', 'purge_preview', 'investigation']));

-- decisions_waiting must learn the new kind or Home renders the Monday purge
-- copy for it. The ELSE branch of that CASE is a silent mislabeler, so an
-- unrecognised kind is a real defect, not a cosmetic one. Reproduced verbatim
-- from pg_get_viewdef with two edits: the investigation label branch and the
-- high-priority list.
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
  WHERE (tasks.status = ANY (ARRAY['waiting'::text, 'in_progress'::text, 'blocked'::text, 'new'::text])) AND COALESCE(tasks.krish_reviewed, false) = false AND tasks.buried_at IS NULL AND (tasks.due_date IS NULL OR tasks.due_date < (CURRENT_DATE + 1)) AND NOT (EXISTS ( SELECT 1
           FROM acquisition_sends s
          WHERE s.approval_task_id = tasks.id AND s.status = 'queued'::text))
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
            WHEN 'investigation'::text THEN 'Investigation ready: '::text || COALESCE(cd.payload ->> 'title'::text, cd.payload ->> 'anchor_headline'::text, '(untitled)'::text)
            ELSE COALESCE(cd.payload ->> 'expiring'::text, '0'::text) || ' items expire in the Monday purge'::text
        END AS title,
    COALESCE(cd.payload ->> 'summary'::text, cd.payload ->> 'implication'::text) AS description,
    'cleo'::text AS agent,
    cd.kind AS status,
        CASE
            WHEN cd.kind = ANY (ARRAY['brief_review'::text, 'shift_proposal'::text, 'investigation'::text]) THEN 'high'::text
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
    jsonb_build_object('lane', sq.lane, 'sequence_type', sq.sequence_type, 'frame_version', sq.frame_version, 'touch_count', jsonb_array_length(sq.touches), 'first_subject', (sq.touches -> 0) ->> 'subject'::text, 'rationale', sq.rationale) AS meta,
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
    ('Flat or down for '::text || gs.window_days) || ' days. 3 drafted moves attached.'::text AS description,
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
