-- Growth tab Phases 3+4: autonomy stats + profit-governor economics.
--
-- lane_autonomy_stats : per-lane rejection-rate windows from acquisition_sends
--                       joined to venture_registry.autonomy_level — the
--                       mechanical inputs to the L1/L2/L3 promotion gates
--                       (deterministic SQL, no LLM in the loop).
-- lane_costs          : subscription/API/ad-spend amortization the DB cannot
--                       infer (e.g. Resend plan share, Apollo credits, paid
--                       test cells).
-- lane_economics      : the per-lane P&L — agent cost (workflow_runs) + API
--                       cost (api_call_log lane-tagged) + fixed + ad spend vs
--                       attributed MRR (customers). contribution_margin_usd
--                       is THE hard gate: no autonomy promotion while <= 0.
-- acquisition_unattributed_costs : shared cost that no lane claims, surfaced
--                       explicitly so the margin numbers stay honest.
-- system_config seeds : acquisition_budgets / acquisition_lane_workflows /
--                       acquisition_paused_lanes (circuit-breaker state).
--
-- All three views are service-role only (money surfaces read through
-- /api/acquisition/* like fleet-funnel; anon gets nothing).

-- ── Lane roster ────────────────────────────────────────────────────────────
-- Venture kinds are unreliable lane markers (full_time is kind='career',
-- mindmaker is kind='product'), so the acquisition surfaces key off this
-- explicit, Krish-editable config list.
insert into public.system_config (key, value)
values ('acquisition_lanes', '["mm_ctrl","fractionl_pulse","fractionl_circle","plinth","full_time"]')
on conflict (key) do nothing;

-- ── Autonomy stats ─────────────────────────────────────────────────────────
create or replace view public.lane_autonomy_stats as
with lanes as (
  select jsonb_array_elements_text(value::jsonb) as slug
  from system_config where key = 'acquisition_lanes'
),
s as (
  select lane,
    count(*) filter (where queued_at > now() - interval '30 days') as queued_30d,
    count(*) filter (where (status in ('approved','sent') or approved_at is not null)
                     and coalesce(approved_at, sent_at, queued_at) > now() - interval '30 days') as approved_30d,
    count(*) filter (where status = 'rejected'
                     and coalesce(approved_at, queued_at) > now() - interval '30 days') as rejected_30d,
    count(*) filter (where (status in ('approved','sent') or approved_at is not null)
                     and coalesce(approved_at, sent_at, queued_at) > now() - interval '14 days') as approved_14d,
    count(*) filter (where status = 'rejected'
                     and coalesce(approved_at, queued_at) > now() - interval '14 days') as rejected_14d,
    count(*) filter (where status = 'queued' and sample_required) as queued_awaiting
  from acquisition_sends
  group by lane
)
select
  v.slug as lane,
  v.display_name,
  v.active,
  v.autonomy_level,
  coalesce(s.queued_30d, 0)   as queued_30d,
  coalesce(s.approved_30d, 0) as approved_30d,
  coalesce(s.rejected_30d, 0) as rejected_30d,
  coalesce(s.approved_14d, 0) as approved_14d,
  coalesce(s.rejected_14d, 0) as rejected_14d,
  case when coalesce(s.approved_30d, 0) + coalesce(s.rejected_30d, 0) = 0 then null
       else round(s.rejected_30d::numeric / (s.approved_30d + s.rejected_30d), 4) end as rejection_rate_30d,
  case when coalesce(s.approved_14d, 0) + coalesce(s.rejected_14d, 0) = 0 then null
       else round(s.rejected_14d::numeric / (s.approved_14d + s.rejected_14d), 4) end as rejection_rate_14d,
  coalesce(s.queued_awaiting, 0) as queued_awaiting,
  v.autonomy_history
from venture_registry v
join lanes on lanes.slug = v.slug
left join s on s.lane = v.slug;

revoke all on public.lane_autonomy_stats from anon, authenticated;
grant select on public.lane_autonomy_stats to service_role;

-- ── Manual cost ledger ─────────────────────────────────────────────────────
create table if not exists public.lane_costs (
  id uuid primary key default gen_random_uuid(),
  lane text not null references public.venture_registry(slug),
  cost_type text not null default 'subscription'
    check (cost_type in ('subscription','api_credit','ad_spend','other')),
  label text not null,
  monthly_usd numeric not null check (monthly_usd >= 0),
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  notes text,
  created_at timestamptz not null default now()
);
alter table public.lane_costs enable row level security;
drop policy if exists lane_costs_service_all on public.lane_costs;
create policy lane_costs_service_all
  on public.lane_costs for all to service_role using (true) with check (true);
grant all on public.lane_costs to service_role;

-- ── Per-lane P&L ───────────────────────────────────────────────────────────
create or replace view public.lane_economics as
with lanes as (
  select jsonb_array_elements_text(value::jsonb) as slug
  from system_config where key = 'acquisition_lanes'
),
cfg as (
  select coalesce((select value::jsonb from system_config where key = 'acquisition_lane_workflows'), '{}'::jsonb) as v
),
lane_wf as (
  select k.key as lane, jsonb_array_elements_text(k.value) as workflow_id
  from cfg, jsonb_each(cfg.v) as k(key, value)
),
m as (select date_trunc('month', now()) as m0),
agent_costs as (
  select lw.lane,
    sum(coalesce(w.cost_usd, w.cost_estimate_usd, 0)) filter (where w.run_at >= (select m0 from m)) as agent_cost_mtd
  from lane_wf lw
  join workflow_runs w on w.workflow_id = lw.workflow_id
  group by lw.lane
),
api_costs as (
  select meta->>'lane' as lane,
    sum(coalesce(est_cost_usd, 0)) filter (where ts >= (select m0 from m)) as api_cost_mtd
  from api_call_log
  where meta ? 'lane'
  group by 1
),
fixed as (
  select lane,
    sum(monthly_usd) filter (where cost_type <> 'ad_spend') as fixed_monthly,
    sum(monthly_usd) filter (where cost_type = 'ad_spend')  as ad_monthly
  from lane_costs
  where started_at <= now() and (ended_at is null or ended_at > now())
  group by lane
),
rev as (
  select product::text as lane,
    sum(mrr_usd) filter (where kind = 'paid' and churned_at is null) as attributed_mrr,
    count(*)    filter (where kind = 'paid' and churned_at is null) as paid_count,
    count(*)    filter (where kind = 'paid' and became_paid_at >= (select m0 from m)) as new_paid_mtd
  from customers
  group by product
)
select
  v.slug as lane,
  v.display_name,
  v.autonomy_level,
  round(coalesce(a.agent_cost_mtd, 0)::numeric, 2)  as agent_cost_mtd,
  round(coalesce(ac.api_cost_mtd, 0)::numeric, 2)   as api_cost_mtd,
  round(coalesce(f.fixed_monthly, 0)::numeric, 2)   as fixed_cost_monthly,
  round(coalesce(f.ad_monthly, 0)::numeric, 2)      as ad_spend_monthly,
  round((coalesce(a.agent_cost_mtd, 0) + coalesce(ac.api_cost_mtd, 0)
       + coalesce(f.fixed_monthly, 0) + coalesce(f.ad_monthly, 0))::numeric, 2) as total_cost_mtd,
  round(coalesce(r.attributed_mrr, 0)::numeric, 2)  as attributed_mrr,
  coalesce(r.paid_count, 0)                         as paid_count,
  coalesce(r.new_paid_mtd, 0)                       as new_paid_mtd,
  round((coalesce(r.attributed_mrr, 0)
       - (coalesce(a.agent_cost_mtd, 0) + coalesce(ac.api_cost_mtd, 0)
        + coalesce(f.fixed_monthly, 0) + coalesce(f.ad_monthly, 0)))::numeric, 2) as contribution_margin_usd,
  case when coalesce(r.new_paid_mtd, 0) = 0 then null
       else round(((coalesce(a.agent_cost_mtd, 0) + coalesce(ac.api_cost_mtd, 0)
                  + coalesce(f.fixed_monthly, 0) + coalesce(f.ad_monthly, 0))
                  / r.new_paid_mtd)::numeric, 2) end as cac_usd,
  case when coalesce(r.paid_count, 0) = 0 then null
       else round((r.attributed_mrr / r.paid_count * 16)::numeric, 2) end as ltv_estimate_usd
from venture_registry v
join lanes on lanes.slug = v.slug
left join agent_costs a on a.lane = v.slug
left join api_costs  ac on ac.lane = v.slug
left join fixed       f on f.lane = v.slug
left join rev         r on r.lane = v.slug;

revoke all on public.lane_economics from anon, authenticated;
grant select on public.lane_economics to service_role;

-- ── Honesty view: cost no lane claims ──────────────────────────────────────
create or replace view public.acquisition_unattributed_costs as
with cfg as (
  select coalesce((select value::jsonb from system_config where key = 'acquisition_lane_workflows'), '{}'::jsonb) as v
),
mapped_wf as (
  select distinct jsonb_array_elements_text(k.value) as workflow_id
  from cfg, jsonb_each(cfg.v) as k(key, value)
),
m as (select date_trunc('month', now()) as m0)
select
  (select round(sum(coalesce(w.cost_usd, w.cost_estimate_usd, 0))::numeric, 2)
     from workflow_runs w
     where w.run_at >= (select m0 from m)
       and not exists (select 1 from mapped_wf mw where mw.workflow_id = w.workflow_id)) as workflow_cost_unmapped_mtd,
  (select round(sum(coalesce(est_cost_usd, 0))::numeric, 2)
     from api_call_log
     where ts >= (select m0 from m) and not (meta ? 'lane')) as api_cost_unattributed_mtd;

revoke all on public.acquisition_unattributed_costs from anon, authenticated;
grant select on public.acquisition_unattributed_costs to service_role;

-- ── Governor config seeds (idempotent; Krish edits via the Growth tab) ─────
insert into public.system_config (key, value)
values ('acquisition_budgets',
        '{"default":{"daily_usd":5,"monthly_usd":50},"paid_global_cap_usd":500}')
on conflict (key) do nothing;

insert into public.system_config (key, value)
values ('acquisition_lane_workflows', '{}')
on conflict (key) do nothing;

insert into public.system_config (key, value)
values ('acquisition_paused_lanes', '{}')
on conflict (key) do nothing;
