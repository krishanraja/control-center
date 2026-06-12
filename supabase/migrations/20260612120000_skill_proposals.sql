-- Generative learning loop: success-induction arm (Phase 1, agent-scope only).
-- skill_proposals is an approval QUEUE that mirrors workflow_proposals, not a
-- skill store: approved drafts leave it and land in agents.brief_content (the
-- existing SSOT), which render-identity.py turns into skills/agent-{id}/SKILL.md.
-- Applied live 2026-06-12; this file records it for repo SSOT (idempotent).

create table if not exists public.skill_proposals (
  id                bigint generated always as identity primary key,
  proposed_by       text not null default 'vera',
  scope             text not null default 'agent' check (scope in ('agent','shared')),
  target_agent_id   text,
  skill_slug        text not null,
  skill_title       text not null,
  skill_body        text not null,
  pattern_key       text not null,
  evidence_refs     text[] not null default '{}',
  evidence_count    integer not null default 0,
  confidence        text not null default 'low' check (confidence in ('low','medium','high')),
  status            text not null default 'proposed'
                      check (status in ('proposed','approved','rejected','executing','completed','rolled_back','retired')),
  approved_by       text,
  approved_at       timestamptz,
  rejected_at       timestamptz,
  executed_at       timestamptz,
  completed_at      timestamptz,
  rolled_back_at    timestamptz,
  rollback_reason   text,
  write_target      text default 'agents.brief_content#learned_plays',
  written_ref       text,
  usage_count       integer not null default 0,
  last_used_at      timestamptz,
  retire_flagged_at timestamptz,
  retire_reason     text,
  buried_at         timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create unique index if not exists skill_proposals_live_pattern_uniq
  on public.skill_proposals (pattern_key)
  where status in ('proposed','approved','executing');

create index if not exists skill_proposals_status_idx
  on public.skill_proposals (status) where buried_at is null;

create or replace function public.tg_skill_proposals_touch()
returns trigger language plpgsql
set search_path = public, pg_temp as $$
begin new.updated_at = now(); return new; end $$;

drop trigger if exists skill_proposals_touch on public.skill_proposals;
create trigger skill_proposals_touch before update on public.skill_proposals
  for each row execute function public.tg_skill_proposals_touch();

alter table public.skill_proposals enable row level security;
drop policy if exists skill_proposals_anon_read on public.skill_proposals;
create policy skill_proposals_anon_read on public.skill_proposals
  for select to anon using (true);
drop policy if exists skill_proposals_service_all on public.skill_proposals;
create policy skill_proposals_service_all on public.skill_proposals
  for all to service_role using (true) with check (true);

insert into public.system_config (key, value) values
  ('skill_induction_min_cluster_size', '3'),
  ('skill_induction_lookback_days', '30'),
  ('skill_induction_decay_days', '45')
on conflict (key) do nothing;

-- Detection: cluster evidence-backed, non-rejected, non-closed wins by
-- [agent, task_type]; return clusters at/above threshold that do not already
-- have a live or completed skill. Self-gates to zero until a corpus exists.
create or replace function public.induct_skill_candidates()
returns table (
  pattern_key text, agent_id text, task_type text,
  win_count integer, thumbsup_count integer,
  evidence_refs text[], sample_titles text[]
)
language sql stable
set search_path = public, pg_temp as $$
  with cfg as (
    select
      coalesce((select value::int from public.system_config where key='skill_induction_min_cluster_size'), 3) as min_cluster,
      coalesce((select value::int from public.system_config where key='skill_induction_lookback_days'), 30) as lookback_days
  ),
  wins as (
    select
      t.id,
      coalesce(t.agent, t.owner, 'unknown') as agent_id,
      lower(coalesce(nullif(t.workstream,''), nullif(t."group",''), 'general')) as task_type,
      t.title,
      exists (select 1 from public.feedback_queue f
              where f.source_table='tasks' and f.source_id=t.id and f.vote > 0) as has_thumbsup
    from public.tasks t, cfg
    where t.status='done'
      and (coalesce(t.evidence,'')<>'' or coalesce(t.outcome,'')<>'')
      and coalesce(t.completed_at, t.updated_at) > now() - (cfg.lookback_days || ' days')::interval
      and not exists (select 1 from public.feedback_queue f
                      where f.source_table='tasks' and f.source_id=t.id
                        and (f.vote < 0 or f.rejection_reason is not null))
      and not exists (select 1 from public.concept_decisions cd
                      where cd.concept_id = t.concept_id and cd.decision='closed' and cd.superseded_at is null)
  ),
  clustered as (
    select
      'skill:' || agent_id || ':' || task_type as pattern_key,
      agent_id, task_type,
      count(*)::int as win_count,
      count(*) filter (where has_thumbsup)::int as thumbsup_count,
      array_agg('tasks:' || id) as evidence_refs,
      (array_agg(title order by title))[1:5] as sample_titles
    from wins group by agent_id, task_type
  )
  select c.pattern_key, c.agent_id, c.task_type, c.win_count, c.thumbsup_count, c.evidence_refs, c.sample_titles
  from clustered c, cfg
  where c.win_count >= cfg.min_cluster
    and not exists (select 1 from public.skill_proposals sp
                    where sp.pattern_key = c.pattern_key
                      and sp.status in ('proposed','approved','executing','completed'))
  order by c.win_count desc, c.thumbsup_count desc;
$$;

-- Usage proxy: a completed skill counts as used when its pattern produces a
-- fresh win after go-live.
create or replace function public.bump_skill_usage()
returns integer language plpgsql
set search_path = public, pg_temp as $$
declare n int;
begin
  with fresh as (
    select
      'skill:' || coalesce(t.agent,t.owner,'unknown') || ':' ||
      lower(coalesce(nullif(t.workstream,''),nullif(t."group",''),'general')) as pattern_key,
      max(coalesce(t.completed_at,t.updated_at)) as last_at
    from public.tasks t
    where t.status='done'
      and (coalesce(t.evidence,'')<>'' or coalesce(t.outcome,'')<>'')
      and coalesce(t.completed_at,t.updated_at) > now() - interval '7 days'
    group by 1
  )
  update public.skill_proposals sp
  set usage_count = sp.usage_count + 1, last_used_at = fresh.last_at
  from fresh
  where sp.pattern_key = fresh.pattern_key and sp.status='completed'
    and (sp.last_used_at is null or fresh.last_at > sp.last_used_at);
  get diagnostics n = row_count; return n;
end $$;

-- Decay: flag completed skills unused for N days, or followed by a same-pattern
-- rejection. Flags only; actual retirement stays approval-gated.
create or replace function public.flag_decayed_skills()
returns table (id bigint, skill_title text, reason text)
language plpgsql
set search_path = public, pg_temp as $$
declare decay_days int := coalesce((select value::int from public.system_config where key='skill_induction_decay_days'), 45);
begin
  return query
  update public.skill_proposals sp
  set retire_flagged_at = now(),
      retire_reason = case when sp.usage_count = 0
                          then 'no_usage_in_' || decay_days || 'd'
                          else 'post_golive_rejection_same_pattern' end
  where sp.status='completed' and sp.retire_flagged_at is null
    and (
      (sp.completed_at < now() - (decay_days || ' days')::interval and sp.usage_count = 0)
      or exists (
        select 1 from public.feedback_queue f
        join public.tasks t on t.id = f.source_id
        where f.source_table='tasks' and f.vote < 0 and f.created_at > sp.completed_at
          and 'skill:' || coalesce(t.agent,t.owner,'unknown') || ':' ||
              lower(coalesce(nullif(t.workstream,''),nullif(t."group",''),'general')) = sp.pattern_key
      )
    )
  returning sp.id, sp.skill_title, sp.retire_reason;
end $$;

grant execute on function public.induct_skill_candidates() to service_role;
grant execute on function public.bump_skill_usage() to service_role;
grant execute on function public.flag_decayed_skills() to service_role;
