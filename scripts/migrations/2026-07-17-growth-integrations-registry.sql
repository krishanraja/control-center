-- Integrations registry: every tool the control center connects to, with its
-- cost. Costs fold into lane_economics so the Profit Governor's caps and
-- circuit breaker automatically cover every integration ever added.
-- APPLIED LIVE 2026-07-17 (growth_integrations_table + lane_economics_with_integration_cost).

create table if not exists public.growth_integrations (
  id uuid primary key default gen_random_uuid(),
  tool text not null unique,
  category text not null,           -- analytics|seo|geo|social|push|community|survey|waitlist|podcast|email|attribution|affiliate|ads|video|distribution|billing|deliverability|credibility
  job text,
  status text not null default 'pending' check (status in ('wired','pending','gated')),
  lanes text[] not null default '{}',   -- lanes it serves; empty = org-shared
  monthly_usd numeric not null default 0,
  usage_metered boolean not null default false,
  credential_ref text,              -- n8n credential name (secret lives there, not here)
  docs_url text,
  gated_reason text,                -- why status=gated
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.growth_integrations enable row level security;
drop policy if exists growth_integrations_anon_read on public.growth_integrations;
create policy growth_integrations_anon_read on public.growth_integrations for select to anon using (true);
drop policy if exists growth_integrations_service_all on public.growth_integrations;
create policy growth_integrations_service_all on public.growth_integrations for all to service_role using (true) with check (true);
grant select on public.growth_integrations to anon;
grant all on public.growth_integrations to service_role;

-- lane_economics gains a per-lane integration cost (a tool with a monthly cost
-- and named lanes contributes monthly_usd/n_lanes to each), folded into
-- total_cost_mtd, contribution_margin_usd, and cac_usd, plus an
-- integration_cost_monthly output column. Org-shared tools (empty lanes) stay
-- out of per-lane margin. Full view body is in the applied migration
-- lane_economics_with_integration_cost; the material change is the `integ` CTE:
--   integ AS (
--     SELECT l AS lane, sum(gi.monthly_usd / GREATEST(array_length(gi.lanes,1),1)) AS integration_monthly
--     FROM growth_integrations gi, LATERAL unnest(gi.lanes) l
--     WHERE gi.status <> 'gated' AND gi.monthly_usd > 0 AND array_length(gi.lanes,1) IS NOT NULL
--     GROUP BY l )
-- joined LEFT JOIN integ ig ON ig.lane = v.slug, added into the cost sums.

-- Seed (researched stack, mid-2026). Costs: gated total $269/mo (Affonso $19 +
-- Churnkey $250, both locked); pending $15 (getwaitlist); wired $0.
-- (Full INSERT ... ON CONFLICT (tool) DO NOTHING applied live; see session record.)
