-- Build signals (2026-09-07): Krish's own builds as Content Engine supply.
--
-- Every Saturday api/scorecard/github-sync.ts reads his commits across
-- GITHUB_REPOS and counts them against him as hours building unasked. The same
-- commit stream is the best owned artifact the publication has, and canon
-- keeps a solo variant of Built with AI running on exactly that ("Krish's own
-- builds, held to the same three-why standard on himself"). Nothing read it
-- for content until now.
--
-- api/discover-build-signals.ts (Saturday 05:00 UTC) writes ONE content_ideas
-- source row per repo-week as source_type 'build_signal', meta.mindmake_build
-- = true and meta.build carrying the PRs, commit subjects, the long commit
-- bodies and the build-log excerpt. It expires after 21 days if undecided,
-- like any seed; the story Krish approves from it is the evergreen row. The
-- editorial radar judges it through both lenses like any other source. Spec:
-- docs/CONTENT-ENGINE-BUILD-SIGNALS.md.
--
-- Two changes:
--   1. 'build_signal' joins the source_type CHECK. The full current list is
--      re-declared (canon before this migration:
--      20260902090000_content_creators_registry.sql).
--   2. One live source row per repo-week, enforced at the database, so a
--      re-run of the Saturday cron refreshes the row rather than duplicating
--      it. Routed publication children carry the same source_ref with a
--      parent_idea_id, so they are outside the index on purpose.

begin;

alter table public.content_ideas drop constraint if exists content_ideas_source_type_check;
alter table public.content_ideas add constraint content_ideas_source_type_check
  check (source_type = any (array[
    'signal_inbox',
    'cleo_chat',
    'agatha_chat',
    'openclaw_workspace',
    'zara_signal',
    'manual',
    'inspiration_sweep',
    'synthesis_hypothesis',
    'customer_voice',
    'crm_opportunity',
    'synthesis',
    'pool_headline',
    'lane_sourcing',
    'requested_research',
    'creator_move',
    -- New 2026-09-07: one of Krish's own build weeks, read from GitHub and
    -- judged as the solo variant of Built with AI.
    'build_signal'
  ]));

create unique index if not exists content_ideas_build_signal_ref_live_uq
  on public.content_ideas (source_ref)
  where source_type = 'build_signal'
    and buried_at is null
    and source_ref is not null
    and parent_idea_id is null;

insert into public.audit_log (event_type, actor, details)
values (
  'build_signals_migration',
  'system',
  jsonb_build_object(
    'action', 'schema',
    'note', 'Added build_signal source_type and the live source_ref unique index. Source rows are written by api/discover-build-signals.ts and judged by api/content-opportunities/refresh.ts.'
  )::text
);

commit;
