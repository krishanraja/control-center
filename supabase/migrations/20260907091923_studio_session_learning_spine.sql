begin;

create table public.mindmake_studio_sessions (
  id uuid primary key default gen_random_uuid(),
  open_idempotency_key uuid not null unique,
  open_request_hash text not null check (open_request_hash ~ '^[a-f0-9]{64}$'),
  client text not null check (client in (
    'control_center', 'codex_desktop', 'codex_cli', 'codex_cloud',
    'claude_desktop', 'claude_code', 'claude_ai', 'chatgpt', 'other_mcp'
  )),
  actor_id text not null default 'krish' check (actor_id = 'krish'),
  display_name text not null default 'Krish' check (display_name = 'Krish'),
  capabilities text[] not null,
  repository_revision text not null check (repository_revision ~ '^[a-f0-9]{40}$'),
  privacy_mode text not null default 'structured_events_only' check (privacy_mode = 'structured_events_only'),
  tracking_state text not null default 'tracked' check (tracking_state in ('tracked', 'read_only_untracked')),
  linked_job_ids text[] not null default '{}',
  opened_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  closed_at timestamptz,
  created_at timestamptz not null default now(),
  constraint mindmake_studio_sessions_time_order check (
    last_seen_at >= opened_at and (closed_at is null or closed_at >= last_seen_at)
  ),
  constraint mindmake_studio_sessions_capabilities_nonempty check (cardinality(capabilities) between 1 and 32),
  constraint mindmake_studio_sessions_jobs_bounded check (cardinality(linked_job_ids) <= 100)
);

create table public.mindmake_studio_interaction_events (
  sequence_id bigint generated always as identity primary key,
  event_id uuid not null unique,
  idempotency_key uuid not null unique,
  session_id uuid not null references public.mindmake_studio_sessions(id) on delete restrict,
  client text not null check (client in (
    'control_center', 'codex_desktop', 'codex_cli', 'codex_cloud',
    'claude_desktop', 'claude_code', 'claude_ai', 'chatgpt', 'other_mcp'
  )),
  action text not null check (action in (
    'session_opened', 'session_closed', 'job_linked', 'job_created_from_drive',
    'artifact_viewed', 'direction_submitted', 'review_approved', 'review_rejected',
    'revision_requested', 'feedback_praised', 'feedback_recorded',
    'feedback_confirmed', 'feedback_corrected', 'learning_approved', 'learning_rejected'
  )),
  job_id text,
  artifact_id text,
  before_hash text check (before_hash is null or before_hash ~ '^[a-f0-9]{64}$'),
  after_hash text check (after_hash is null or after_hash ~ '^[a-f0-9]{64}$'),
  explicit_feedback_excerpt text check (explicit_feedback_excerpt is null or char_length(explicit_feedback_excerpt) between 1 and 1600),
  detected_differences jsonb not null default '[]'::jsonb check (jsonb_typeof(detected_differences) = 'array'),
  inference jsonb check (inference is null or jsonb_typeof(inference) = 'object'),
  confirmation_state text not null check (confirmation_state in ('not_applicable', 'pending', 'confirmed', 'corrected', 'observation_only')),
  tool_name text not null check (tool_name ~ '^studio\.[a-z][a-z0-9_.]{1,79}$'),
  request_hash text not null check (request_hash ~ '^[a-f0-9]{64}$'),
  occurred_at timestamptz not null,
  created_at timestamptz not null default now(),
  constraint mindmake_studio_interaction_after_requires_before check (after_hash is null or before_hash is not null),
  constraint mindmake_studio_confirmed_feedback_evidence check (
    confirmation_state not in ('confirmed', 'corrected')
    or (inference is not null and explicit_feedback_excerpt is not null)
  )
);

create index mindmake_studio_events_session_sequence_idx
  on public.mindmake_studio_interaction_events (session_id, sequence_id);
create index mindmake_studio_events_job_time_idx
  on public.mindmake_studio_interaction_events (job_id, occurred_at desc)
  where job_id is not null;
create index mindmake_studio_events_confirmation_time_idx
  on public.mindmake_studio_interaction_events (confirmation_state, occurred_at desc)
  where confirmation_state in ('pending', 'confirmed', 'corrected');

create trigger mindmake_studio_interaction_events_append_only
  before update or delete on public.mindmake_studio_interaction_events
  for each row execute function public.video_studio_reject_append_only_mutation();

create table public.mindmake_studio_learning_proposals (
  id uuid primary key default gen_random_uuid(),
  weekly_batch_id text not null check (weekly_batch_id ~ '^[a-z0-9][a-z0-9_-]{1,95}$'),
  proposal_class text not null check (proposal_class in ('taste', 'performance', 'engine_quality')),
  assertion text not null check (char_length(assertion) between 1 and 1600),
  scope jsonb not null check (jsonb_typeof(scope) = 'object'),
  evidence_event_ids uuid[] not null,
  independent_session_count integer not null check (independent_session_count > 0),
  independent_job_count integer not null check (independent_job_count >= 0),
  counterexamples jsonb not null default '[]'::jsonb check (jsonb_typeof(counterexamples) = 'array'),
  regression_cases jsonb not null check (jsonb_typeof(regression_cases) = 'array' and jsonb_array_length(regression_cases) > 0),
  proposed_change jsonb not null check (jsonb_typeof(proposed_change) = 'object'),
  status text not null default 'proposed' check (status in ('proposed', 'approved', 'corrected', 'rejected', 'superseded')),
  decided_at timestamptz,
  decided_by text check (decided_by is null or decided_by = 'Krish'),
  created_at timestamptz not null default now(),
  constraint mindmake_studio_learning_evidence_nonempty check (cardinality(evidence_event_ids) between 1 and 100),
  constraint mindmake_studio_learning_performance_floor check (
    proposal_class <> 'performance' or (independent_session_count >= 3 and independent_job_count >= 3)
  ),
  constraint mindmake_studio_learning_decision_owner check (
    (status = 'proposed' and decided_at is null and decided_by is null)
    or (status <> 'proposed' and decided_at is not null and decided_by = 'Krish')
  )
);

create index mindmake_studio_learning_status_time_idx
  on public.mindmake_studio_learning_proposals (status, created_at desc);

alter table public.mindmake_studio_sessions enable row level security;
alter table public.mindmake_studio_interaction_events enable row level security;
alter table public.mindmake_studio_learning_proposals enable row level security;

revoke all on public.mindmake_studio_sessions from public, anon, authenticated;
revoke all on public.mindmake_studio_interaction_events from public, anon, authenticated;
revoke all on public.mindmake_studio_learning_proposals from public, anon, authenticated;
revoke all on sequence public.mindmake_studio_interaction_events_sequence_id_seq from public, anon, authenticated;

grant select, insert, update on public.mindmake_studio_sessions to service_role;
grant select, insert on public.mindmake_studio_interaction_events to service_role;
grant usage, select on sequence public.mindmake_studio_interaction_events_sequence_id_seq to service_role;
grant select, insert, update on public.mindmake_studio_learning_proposals to service_role;

create policy mindmake_studio_sessions_service_all on public.mindmake_studio_sessions
  for all to service_role using (true) with check (true);
create policy mindmake_studio_interaction_events_service_all on public.mindmake_studio_interaction_events
  for all to service_role using (true) with check (true);
create policy mindmake_studio_learning_proposals_service_all on public.mindmake_studio_learning_proposals
  for all to service_role using (true) with check (true);

comment on table public.mindmake_studio_sessions is
  'Client-neutral tracked Studio sessions. Stores capability and provenance metadata only, never chat transcripts.';
comment on table public.mindmake_studio_interaction_events is
  'Append-only structured Studio actions, exact feedback excerpts, and artifact differences. Raw media, full transcripts, local paths, secrets, OAuth state, and command output are forbidden.';
comment on table public.mindmake_studio_learning_proposals is
  'Weekly governed learning proposals. No row activates a preference or merges code without a separate Krish-approved path.';

commit;
