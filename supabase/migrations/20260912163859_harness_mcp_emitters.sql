-- Individually revocable, write-only identities for remote MCP emitters.
-- Only token digests are stored. Raw credentials remain in client-native
-- secret storage and never enter Git, Supabase, logs or deployment evidence.

begin;

create table public.harness_emitter_clients (
  emitter_id text primary key,
  token_sha256 text not null unique,
  surface text not null,
  machine_scope text not null,
  enabled boolean not null default true,
  daily_limit smallint not null default 30,
  created_at timestamptz not null default now(),
  revoked_at timestamptz,
  constraint harness_emitter_id_shape check (emitter_id ~ '^[a-z0-9][a-z0-9._:-]{2,63}$'),
  constraint harness_emitter_token_hash check (token_sha256 ~ '^[a-f0-9]{64}$'),
  constraint harness_emitter_surface check (surface in (
    'codex', 'claude-code', 'cursor', 'claude-cloud', 'perplexity',
    'github-actions', 'n8n', 'other'
  )),
  constraint harness_emitter_machine_scope_length check (length(machine_scope) between 3 and 80),
  constraint harness_emitter_daily_limit check (daily_limit between 1 and 1000),
  constraint harness_emitter_revocation_state check (
    (enabled and revoked_at is null) or (not enabled)
  )
);

comment on table public.harness_emitter_clients is
  'Hashed, individually revocable identities for write-only harness MCP clients.';

alter table public.harness_emitter_clients enable row level security;

alter table public.harness_event_inbox
  add column emitter_id text references public.harness_emitter_clients(emitter_id);

create index harness_event_inbox_emitter_received_idx
  on public.harness_event_inbox (emitter_id, received_at desc)
  where emitter_id is not null;

revoke all on table public.harness_emitter_clients from anon, authenticated, service_role;
grant select on table public.harness_emitter_clients to service_role;

-- Reassert the inbox boundary after ALTER TABLE so default grants cannot widen
-- the append-only API role.
revoke all on table public.harness_event_inbox from anon, authenticated, service_role;
grant select, insert on table public.harness_event_inbox to service_role;

commit;
