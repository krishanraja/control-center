-- Revenue logged from Stripe, in the unit that is actually true: cash collected.
--
-- WHY THIS EXISTS. `customers.mrr_usd` is written by an n8n expression
-- (scripts/n8n/stripe-customer-write-patch.md:45):
--
--   const mrr = obj.plan?.amount ? obj.plan.amount / 100
--             : (obj.amount_total ? obj.amount_total / 100 : null)
--
-- `amount_total` is the Checkout session GRAND TOTAL, so a one-off advisory
-- invoice or a workshop seat lands as "per month" revenue. There is no
-- interval, mode or recurring check anywhere, and nothing in the schema
-- separated recurring from one-off: not a table, not a column, not an enum.
--
-- The live account proves why that matters. Nine succeeded charges all time:
-- eight Substack Connect subscriptions ($8/mo, $81/yr, A$115/yr, each net of
-- Substack's 10% application fee) and ONE one-time payment of A$1,000 with no
-- invoice and no customer object. That single payment is most of the money
-- ever collected and no MRR figure can represent it.
--
-- So: two tables, two different questions.
--   revenue_events        -> what cash arrived, and what was left after fees
--   revenue_subscriptions -> what is committed to recur
-- They are never summed together.

BEGIN;

-- ── cash ───────────────────────────────────────────────────────────────────
-- One row per Stripe balance transaction. The balance transaction is the right
-- grain because it settles the FEES: the charge object alone does not tell you
-- what actually landed after Stripe's cut and Substack's 10%.
create table if not exists public.revenue_events (
  id                text primary key,          -- txn_..., so re-sync is a no-op
  stripe_account    text not null,
  charge_id         text,
  invoice_id        text,                      -- NULL means not invoice-driven
  subscription_id   text,
  customer_id       text,
  kind              text not null check (kind in ('recurring','one_time','refund','adjustment')),
  occurred_at       timestamptz not null,
  currency          text not null,             -- as charged. Never assumed.
  gross_cents       bigint not null,
  stripe_fee_cents  bigint not null default 0,
  app_fee_cents     bigint not null default 0, -- Substack's 10%, etc
  net_cents         bigint not null,           -- what actually landed
  -- NULL when no FX rate is known for `currency` on that date. Deliberately
  -- nullable: treating a missing rate as 1.0 is how AUD silently becomes USD.
  -- attribution.revenue_by_campaign has exactly that bug today.
  usd_cents         bigint,
  fx_rate           numeric,
  product           text,                      -- NULL when the price is unmapped
  description       text,
  raw               jsonb not null,
  ingested_at       timestamptz not null default now()
);

create index if not exists revenue_events_occurred_idx on public.revenue_events (occurred_at desc);
create index if not exists revenue_events_kind_idx     on public.revenue_events (kind, occurred_at desc);

-- ── commitment ─────────────────────────────────────────────────────────────
-- Current state of every subscription. This, and ONLY this, produces MRR.
create table if not exists public.revenue_subscriptions (
  id                  text primary key,        -- sub_...
  stripe_account      text not null,
  customer_id         text,
  product             text,
  status              text not null,
  interval            text,                    -- month | year | week | day
  interval_count      int,
  unit_amount_cents   bigint,
  quantity            int not null default 1,
  currency            text not null,
  mrr_cents           bigint,                  -- normalised to a month, in `currency`
  mrr_usd_cents       bigint,                  -- NULL when no rate is known
  current_period_end  timestamptz,
  canceled_at         timestamptz,
  raw                 jsonb not null,
  synced_at           timestamptz not null default now()
);

create index if not exists revenue_subscriptions_status_idx on public.revenue_subscriptions (status);

-- ── access ─────────────────────────────────────────────────────────────────
-- Service role only. Revenue is not anon-readable and the dashboard reads it
-- through /api/*, matching the existing rule for fleet_revenue_by_campaign
-- (warehouse/migrations/0002_product_truth_app_health.sql:38-41).
alter table public.revenue_events        enable row level security;
alter table public.revenue_subscriptions enable row level security;

drop policy if exists revenue_events_service_all on public.revenue_events;
create policy revenue_events_service_all on public.revenue_events
  for all to service_role using (true) with check (true);

drop policy if exists revenue_subscriptions_service_all on public.revenue_subscriptions;
create policy revenue_subscriptions_service_all on public.revenue_subscriptions
  for all to service_role using (true) with check (true);

revoke all on public.revenue_events        from anon, authenticated;
revoke all on public.revenue_subscriptions from anon, authenticated;
grant  all on public.revenue_events        to service_role;
grant  all on public.revenue_subscriptions to service_role;

COMMIT;

NOTIFY pgrst, 'reload schema';
