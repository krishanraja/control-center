-- hunter, one system (hunter/docs/ONE_SYSTEM.md). Two tables, each with one
-- writer per column, so two systems never disagree about one row.
--
-- hunter_drafts: prose hunter needs written. hunter queues a request with the
-- exact prompt and the evidence it will be checked against; the weekly Claude
-- Code routine, running on Krish's subscription, writes the answer; hunter's
-- hourly drain checks it with the same validator and voice gate the API path
-- uses, and only then uses it. A request nobody answers falls back to the API
-- under the monthly ceiling. Writers: hunter (requests, status after checks),
-- the routine (output, drafted_at, drafted_by, status queued -> drafted).
create table if not exists public.hunter_draft_contexts (
  key text primary key,          -- sha256 of text
  text text not null,
  created_at timestamptz not null default now()
);
alter table public.hunter_draft_contexts enable row level security;
comment on table public.hunter_draft_contexts is 'hunter: shared system context for draft requests, stored once by hash. Written by hunter/src/hunter/drafts.py.';

create table if not exists public.hunter_drafts (
  id bigserial primary key,
  kind text not null check (kind in ('case', 'door_observation')),
  ref text not null,             -- job_id for a case, contact_id for a door card
  context_key text references public.hunter_draft_contexts(key),
  prompt text not null,
  schema jsonb,                  -- JSON schema of the answer; null means one plain sentence
  evidence text not null default '',
  meta jsonb not null default '{}',
  status text not null default 'queued'
    check (status in ('queued', 'drafted', 'used', 'failed', 'expired')),
  output jsonb,
  problems text[] not null default '{}',
  drafted_by text,               -- 'routine' or 'api'
  requested_at timestamptz not null default now(),
  drafted_at timestamptz,
  used_at timestamptz
);
create unique index if not exists hunter_drafts_open_once
  on public.hunter_drafts (kind, ref) where status in ('queued', 'drafted');
create index if not exists hunter_drafts_status on public.hunter_drafts (status, requested_at);
alter table public.hunter_drafts enable row level security;
comment on table public.hunter_drafts is 'hunter: prose requests answered by the subscription routine, checked by hunter before use. Written by hunter/src/hunter/drafts.py and the hunter-writer routine.';

-- hunter_actions: what Krish pressed in Control Center for hunter. Control
-- Center inserts; hunter's hourly drain applies each one (writing the sheet,
-- which only hunter can) and records what happened. Nothing here sends,
-- submits or posts: "prepare" builds an application for him to press.
create table if not exists public.hunter_actions (
  id bigserial primary key,
  kind text not null check (kind in ('verdict', 'prepare', 'outcome')),
  job_id text not null,
  payload jsonb not null default '{}',
  requested_by text not null default 'krish',
  requested_at timestamptz not null default now(),
  status text not null default 'queued' check (status in ('queued', 'done', 'failed')),
  result text,
  processed_at timestamptz
);
create index if not exists hunter_actions_queued on public.hunter_actions (status, requested_at);
alter table public.hunter_actions enable row level security;
comment on table public.hunter_actions is 'hunter: buttons Krish pressed in Control Center (verdict, prepare, outcome). Inserted by control-center api/hunter/act.ts; applied and closed by hunter/src/hunter/actions.py.';
