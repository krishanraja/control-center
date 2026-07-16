-- Growth tab Phase 5: free-by-construction growth loops.
--
-- 1. Content → capture attribution: which blog post / carousel / Reddit post
--    actually produced captures and paid customers (ATTR-001 already mandates
--    the UTMs; this closes the loop). content_ideas.utm_campaign is stamped
--    by Maya's SEO drafts; the capture intake stamps
--    leads.attribution_content_idea_id by matching utm_campaign.
-- 2. acquisition_replies: inbound replies to nurture sends. A reply always
--    halts the sequence (intake workflow suppresses pending sends).
-- 3. frame_conversion: per (lane, frame) sent → paid — the Frame A/B
--    leaderboard's data. Winners come back as sequence_type='frame_promotion'
--    proposals through the Phase-2 sequence_approval kind.

alter table public.content_ideas
  add column if not exists utm_campaign text,
  add column if not exists capture_count integer not null default 0,
  add column if not exists paid_count integer not null default 0;

alter table public.leads
  add column if not exists attribution_content_idea_id uuid references public.content_ideas(id);

create index if not exists leads_content_idea_idx
  on public.leads (attribution_content_idea_id)
  where attribution_content_idea_id is not null;

-- ── Reply inbox ────────────────────────────────────────────────────────────
create table if not exists public.acquisition_replies (
  id uuid primary key default gen_random_uuid(),
  send_id uuid references public.acquisition_sends(id),
  lead_id uuid references public.leads(id),
  lane text references public.venture_registry(slug),
  from_email text,
  subject text,
  body text,
  classification text not null default 'unclassified'
    check (classification in ('positive_intent','unsubscribe','question','auto_reply','unclassified')),
  status text not null default 'new'
    check (status in ('new','triaged','drafted','closed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
-- Reply bodies are inbound PII — service-role only, like the sends ledger.
alter table public.acquisition_replies enable row level security;
drop policy if exists acquisition_replies_service_all on public.acquisition_replies;
create policy acquisition_replies_service_all
  on public.acquisition_replies for all to service_role using (true) with check (true);
grant all on public.acquisition_replies to service_role;

-- ── Content → capture rollup ───────────────────────────────────────────────
create or replace view public.content_capture_attribution as
select
  ci.id,
  ci.idea,
  ci.utm_campaign,
  ci.published_at,
  ci.lane,
  count(distinct l.id) as captures,
  count(distinct c.id) filter (where c.kind = 'paid') as paid,
  round(coalesce(sum(c.mrr_usd) filter (where c.kind = 'paid' and c.churned_at is null), 0)::numeric, 2) as mrr
from content_ideas ci
left join leads l on l.attribution_content_idea_id = ci.id
left join customers c on c.attribution_lead_id = l.id
where ci.utm_campaign is not null
group by ci.id;

revoke all on public.content_capture_attribution from anon, authenticated;
grant select on public.content_capture_attribution to service_role;

-- ── Frame A/B conversion ───────────────────────────────────────────────────
create or replace view public.frame_conversion as
select
  s.lane,
  s.frame_version,
  count(*) filter (where s.status = 'sent') as sent,
  count(distinct s.lead_id) filter (where s.status = 'sent') as leads_touched,
  count(distinct c.id) filter (where c.kind = 'paid') as paid
from acquisition_sends s
left join customers c on c.attribution_lead_id = s.lead_id
group by 1, 2;

revoke all on public.frame_conversion from anon, authenticated;
grant select on public.frame_conversion to service_role;
