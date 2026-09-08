-- The prediction ledger (2026-09-08): what a published page was expected to
-- change, written down BEFORE it was published.
--
-- The engine is meant to improve the answer-engine strategy on its own, which
-- means learning which kinds of page actually get quoted. It cannot learn that
-- from a log. If a page goes out and the citation rate later moves, there is a
-- correlation and no way to tell it from the week the assistants reshuffled
-- their own index. What separates the two is a prediction recorded in advance:
-- this page targets this question, these hosts hold the answer today, we expect
-- to be named within four weeks.
--
-- Four weeks later the weekly probe either confirms it or does not, and the
-- miss is the interesting one. This cannot be retrofitted: a prediction never
-- written down cannot be recovered later, so the table exists before the first
-- page ships rather than after the first month of guessing.
--
-- One row per published page per target question. The probe machine already
-- writes growth_geo_probes every week; nothing here duplicates that. This table
-- holds only the claim made in advance and the verdict written once.

begin;

create table if not exists public.geo_predictions (
  id uuid primary key default gen_random_uuid(),

  -- What was published.
  content_idea_id uuid references public.content_ideas(id) on delete set null,
  subject_id uuid references public.growth_aeo_subjects(id) on delete set null,
  product_slug text,
  -- Where it went live, so a miss can be checked against a real URL rather
  -- than an assumption that publishing worked.
  repo text,
  path text,
  published_url text,
  commit_sha text,

  -- The question it was written to win, carried from the research run so the
  -- check can match probes without re-deriving anything.
  target_query text not null,
  query_id uuid,

  -- The state of the world at the moment of publishing. Kept verbatim so a
  -- later reader can see what changed rather than inferring it.
  hosts_before jsonb not null default '[]'::jsonb,
  cited_before boolean not null default false,

  -- The claim the page makes, and the reason it was thought winnable. These
  -- are what the learning is actually about: which kinds of argument move an
  -- answer and which do not.
  claim text,
  why_you_can_win text,

  -- The prediction itself.
  predicted_at timestamptz not null default now(),
  check_after timestamptz not null,

  -- The verdict, written once by the check. Null until then.
  checked_at timestamptz,
  outcome text check (outcome in ('cited', 'not_cited', 'unprobed', 'page_gone')),
  hosts_after jsonb,
  -- Said in words, because a number alone never explains a miss.
  note text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- One live prediction per idea per question. A republish of the same piece
-- replaces the prediction rather than stacking a second one, or the four-week
-- check counts one page twice.
create unique index if not exists geo_predictions_idea_query_uq
  on public.geo_predictions (content_idea_id, target_query)
  where content_idea_id is not null;

-- The check reads by due date, so that is the index that matters.
create index if not exists geo_predictions_due_idx
  on public.geo_predictions (check_after)
  where checked_at is null;

create index if not exists geo_predictions_subject_idx
  on public.geo_predictions (subject_id, predicted_at desc);

alter table public.geo_predictions enable row level security;

drop policy if exists geo_predictions_anon_read on public.geo_predictions;
create policy geo_predictions_anon_read on public.geo_predictions
  for select to anon using (true);

drop policy if exists geo_predictions_service_all on public.geo_predictions;
create policy geo_predictions_service_all on public.geo_predictions
  for all to service_role using (true) with check (true);

insert into public.audit_log (event_type, actor, details)
values (
  'geo_predictions_migration',
  'system',
  jsonb_build_object(
    'action', 'schema',
    'note', 'geo_predictions added: what a published page was expected to change, recorded before publishing, so the four-week check measures a prediction rather than a correlation.'
  )::text
);

commit;
