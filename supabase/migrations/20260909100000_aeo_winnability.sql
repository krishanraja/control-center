-- The winnability judgement (2026-09-08): a recommendation must name what this
-- business has that the sites currently cited structurally cannot have, and the
-- questions that fail become what NOT to chase.
--
-- The first live digest recommended whatever the machine was absent from, which
-- is how it offered a category term a jobs board already owns. Absence is not
-- opportunity: a question missing because a social network and a video platform
-- own the answer is a wall, not a gap, and one piece will not move it.
--
-- One column. why_you_can_win rides inside each recommendation object in the
-- existing recommendations jsonb, so it needs no schema change.

begin;

alter table public.growth_aeo_digests
  add column if not exists not_worth_chasing jsonb not null default '[]'::jsonb;

alter table public.growth_aeo_digests drop constraint if exists growth_aeo_digests_not_worth_chasing_check;
alter table public.growth_aeo_digests add constraint growth_aeo_digests_not_worth_chasing_check
  check (jsonb_typeof(not_worth_chasing) = 'array');

comment on column public.growth_aeo_digests.not_worth_chasing is
  'Questions probed and scored that this business should not try to win. Each entry: query_id, query, owned_by (the sites that own the answer), why_not (one plain sentence).';

insert into public.audit_log (event_type, actor, details)
values (
  'aeo_winnability_migration',
  'system',
  jsonb_build_object(
    'action', 'schema',
    'note', 'growth_aeo_digests.not_worth_chasing added. Recommendations carry why_you_can_win inside the existing recommendations jsonb.'
  )::text
);

commit;
