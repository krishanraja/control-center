-- One append-only intake for observations produced by AI work surfaces.
-- The application can insert and export. It cannot update or delete rows.
-- GitHub remains the only authority for accepted harness rules and releases.

begin;

create table if not exists public.harness_event_inbox (
  inbox_id bigint generated always as identity primary key,
  event_id text not null unique,
  schema_version smallint not null default 1,
  occurred_at timestamptz not null,
  received_at timestamptz not null default now(),
  surface text not null,
  kind text not null,
  summary text not null,
  evidence_ref text not null,
  related_skill_or_rule text,
  outcome text not null,
  severity text not null,
  confidence text not null,
  payload_sha256 text not null,
  constraint harness_event_id_shape check (event_id ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{15,127}$'),
  constraint harness_event_schema_version check (schema_version = 1),
  constraint harness_event_surface check (surface in (
    'codex', 'claude-code', 'cursor', 'claude-cloud', 'perplexity',
    'github-actions', 'n8n', 'other'
  )),
  constraint harness_event_kind check (kind in (
    'explicit_correction', 'failure', 'missed_trigger', 'false_trigger',
    'repeated_manual_step', 'successful_pattern', 'contradiction'
  )),
  constraint harness_event_outcome check (outcome in ('corrected', 'failed', 'succeeded', 'unknown')),
  constraint harness_event_severity check (severity in ('low', 'medium', 'high', 'blocking')),
  constraint harness_event_confidence check (confidence in ('low', 'medium', 'high')),
  constraint harness_event_summary_length check (length(summary) between 12 and 800),
  constraint harness_event_evidence_ref_length check (length(evidence_ref) between 3 and 300),
  constraint harness_event_related_length check (related_skill_or_rule is null or length(related_skill_or_rule) <= 160),
  constraint harness_event_payload_hash check (payload_sha256 ~ '^[a-f0-9]{64}$')
);

comment on table public.harness_event_inbox is
  'Append-only, redacted observations from AI work surfaces. Evidence only. Never an authority for canon changes.';

alter table public.harness_event_inbox enable row level security;

revoke all on table public.harness_event_inbox from anon, authenticated;
revoke all on sequence public.harness_event_inbox_inbox_id_seq from anon, authenticated;

-- Service-side API code needs insert and select only. No application role gets
-- update or delete, which keeps retries idempotent and history append-only.
revoke update, delete, truncate on table public.harness_event_inbox from service_role;
grant select, insert on table public.harness_event_inbox to service_role;
grant usage, select on sequence public.harness_event_inbox_inbox_id_seq to service_role;

commit;
