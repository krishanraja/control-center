-- The Daily Brief reads its inputs through a stored credential.
--
-- Marcus's Daily Brief (n8n, 06:30) read fifteen tables from a Code node with
-- the service-role key written into its source, because n8n's JS task-runner
-- sandbox cannot read a stored credential. Anyone who could open the workflow,
-- or any saved version of it, could read the key.
--
-- This function returns all fifteen reads in one call. An HTTP Request node
-- fetches it over the stored Supabase credential, the Code node keeps only the
-- arithmetic, and the workflow holds no key at all.
--
-- Each section is the old REST query transliterated: the same columns in the
-- same order, the same filters and LIMIT, ORDER BY only where the old query
-- had one, and NULLS LAST only where it said .nullslast (a bare .desc is
-- Postgres's default NULLS FIRST, over REST as here). Each is json_agg over a
-- sorted subquery, which is how PostgREST builds its own response, so the rows
-- reach the brief in the same order and as the same JSON.
--
-- One section is not a transliteration. The closed-bets read asked for
-- bets.outcome, bets.closed_at and the status 'killed', none of which exist,
-- so it failed on every run and its .catch(() => []) handed the model an empty
-- list labelled "Closed bets (30d)". It now reads what that label says: bets
-- won or lost in the last 30 days, status as the outcome, decided_at as the
-- close date. The only closed bet was decided in May, so the brief sees the
-- same empty list today and a real one the day a bet closes.
--
-- A missing column now fails the whole read, where the last five sections used
-- to empty themselves without a word. That is how closed bets went unread from
-- the day the query was written.

create or replace function public.daily_brief_inputs()
returns json
language sql
stable
security invoker
set search_path = ''
-- The brief compares these timestamps as ISO strings against UTC instants, so
-- they must render as +00:00 whatever the session's zone. UTC is already the
-- database default; this keeps it true for this function if that changes.
set timezone = 'UTC'
as $$
  select json_build_object(
    'customers', (
      select coalesce(json_agg(r), '[]'::json) from (
        select product, kind, mrr_usd, became_paid_at, churned_at
        from public.customers
        limit 500
      ) r),
    'bets', (
      select coalesce(json_agg(r), '[]'::json) from (
        select hypothesis, kind, started_at, time_box_days, est_mrr_impact_usd
        from public.bets
        where status = 'live'
        order by started_at desc
        limit 50
      ) r),
    'leads', (
      select coalesce(json_agg(r), '[]'::json) from (
        select full_name, company, tier, follow_up_at
        from public.leads
        where status in ('ready', 'contacted', 'conversation')
        order by follow_up_at asc nulls last
        limit 20
      ) r),
    'council', (
      select coalesce(json_agg(r), '[]'::json) from (
        select full_name, email, product, mrr_usd, became_paid_at
        from public.customers
        where kind = 'paid' and churned_at is null
        order by mrr_usd desc nulls last
        limit 10
      ) r),
    'hot_leads', (
      select coalesce(json_agg(r), '[]'::json) from (
        select id, full_name, company, why_relevant, fit_score, follow_up_at
        from public.leads
        where status in ('ready', 'conversation') and quality_score = 'green'
        order by fit_score desc nulls last
        limit 10
      ) r),
    'open_visibility', (
      select coalesce(json_agg(r), '[]'::json) from (
        select id, title, type, deadline_at, relevance_score, quality_score
        from public.visibility_targets
        where status <> 'declined' and deadline_at > now()
        order by deadline_at asc
        limit 10
      ) r),
    'stale_tasks', (
      select coalesce(json_agg(r), '[]'::json) from (
        select id, title, priority, lever_score, due_date, started_at
        from public.tasks
        where status = 'waiting' and krish_reviewed = false
        order by lever_score desc nulls last
        limit 10
      ) r),
    'recent_tasks', (
      select coalesce(json_agg(r), '[]'::json) from (
        select completed_at
        from public.tasks
        where status = 'shipped' and completed_at > now() - interval '7 days'
        limit 500
      ) r),
    'recent_leads', (
      select coalesce(json_agg(r), '[]'::json) from (
        select created_at
        from public.leads
        where created_at > now() - interval '7 days'
        limit 500
      ) r),
    'recent_visibility', (
      select coalesce(json_agg(r), '[]'::json) from (
        select updated_at
        from public.visibility_targets
        where updated_at > now() - interval '7 days'
          and status in ('accepted', 'submitted', 'pitched')
        limit 500
      ) r),
    'overrides', (
      select coalesce(json_agg(r), '[]'::json) from (
        select created_at, reason_text, meta
        from public.feedback_queue
        where reason_code = 'marcus_priority_override'
          and created_at >= now() - interval '30 days'
        order by created_at desc
        limit 80
      ) r),
    'unsuitable', (
      select coalesce(json_agg(r), '[]'::json) from (
        select created_at, reason_text, meta
        from public.feedback_queue
        where reason_code = 'marcus_suggestion_unsuitable'
          and created_at >= now() - interval '30 days'
        order by created_at desc
        limit 80
      ) r),
    'green_ideas', (
      select coalesce(json_agg(r), '[]'::json) from (
        select id, idea, thesis, distribution, state
        from public.content_ideas
        where state in ('seeded', 'researching', 'drafting') and quality_score = 'green'
        limit 10
      ) r),
    'focus_history', (
      select coalesce(json_agg(r), '[]'::json) from (
        select focus_date, target_1_text, target_2_text, target_3_text, status
        from public.daily_focus
        where focus_date >= (now() - interval '14 days')::date
        order by focus_date desc
        limit 14
      ) r),
    'closed_bets', (
      select coalesce(json_agg(r), '[]'::json) from (
        select hypothesis, kind, status as outcome, est_mrr_impact_usd,
               actual_mrr_impact_usd, decided_at as closed_at
        from public.bets
        where status in ('won', 'lost')
          and decided_at >= now() - interval '30 days'
        order by decided_at desc
        limit 20
      ) r)
  )
$$;

comment on function public.daily_brief_inputs() is
  'Everything the n8n Daily Brief 06:30 reads, in one call: fifteen sections keyed by name, each the REST query the workflow used to make with an inline service-role key. Called by its "Fetch brief inputs" node over the stored Supabase credential. Service role only: the sections name customers and leads.';

revoke all on function public.daily_brief_inputs() from public, anon, authenticated;
grant execute on function public.daily_brief_inputs() to service_role;
