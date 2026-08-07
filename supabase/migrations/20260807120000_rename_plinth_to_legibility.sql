-- Plinth is now Legibility. This renames the slug where it lives as DATA.
--
-- APPLIED 2026-08-07 to project gojpffsrxybbpbdzzrvs, together with the live
-- n8n workflow rename and the code rename in the same sitting. Verified after:
-- the only surviving occurrences are the ones deliberately preserved below.
--
-- Three things this had to get right, each of which failed a naive first pass:
--
-- 1. venture_registry.slug is the PRIMARY KEY with SEVEN dependent foreign
--    keys, so an in-place UPDATE is rejected outright. It has to be
--    insert-copy -> repoint every child -> delete-old.
-- 2. leads.primary_venture is ON DELETE SET NULL. Delete the parent before
--    repointing it and every Legibility lead silently loses its venture tag.
--    No other child cascades on delete, so the rest fail loudly, which is safe.
-- 3. lane_directions.creative_direction and venture_registry.voice_profile are
--    jsonb (cast through text), while system_config.value is TEXT despite
--    holding a JSON array. Casting that one to jsonb fails.
--
-- Deliberately preserved, and still containing the old name by design:
--   * audit_log (target, details, changes, display_message) - an audit trail
--     records what happened under the name it happened under. Rewriting it
--     would be forging the record.
--   * agent_brief_backups.brief_content - backups are snapshots; correcting a
--     snapshot defeats the point of having one.
--   * tasks.id - one task id contains the string. A primary key is not a label
--     and is not worth the foreign-key risk to make a name read nicely.

create temp table _v on commit drop as
  select * from venture_registry where slug = 'plinth';

update _v set slug = 'legibility',
              display_name = 'Legibility',
              voice_profile = replace(voice_profile::text, 'Plinth', 'Legibility')::jsonb;

insert into venture_registry select * from _v;

-- every child, repointed BEFORE the parent goes (see note 2 above)
update public.acquisition_replies    set lane            = 'legibility' where lane            = 'plinth';
update public.acquisition_sequences  set lane            = 'legibility' where lane            = 'plinth';
update public.lane_costs             set lane            = 'legibility' where lane            = 'plinth';
update public.lane_directions        set lane            = 'legibility' where lane            = 'plinth';
update public.leads                  set primary_venture = 'legibility' where primary_venture = 'plinth';
update public.venture_formats        set venture_slug    = 'legibility' where venture_slug    = 'plinth';
update public.visibility_targets     set product_slug    = 'legibility' where product_slug    = 'plinth';

delete from venture_registry where slug = 'plinth';

-- the enum: RENAME VALUE preserves every customers.product row in place, so no
-- data update is needed and no row can be missed.
do $$
begin
  if exists (
    select 1 from pg_enum e join pg_type t on t.oid = e.enumtypid
    where t.typname = 'customer_product' and e.enumlabel = 'plinth'
  ) then
    execute $q$ alter type public.customer_product rename value 'plinth' to 'legibility' $q$;
  end if;
end $$;

update public.lane_directions
   set creative_direction = replace(creative_direction::text, 'Plinth', 'Legibility')::jsonb
 where creative_direction::text like '%Plinth%';

update public.product_metrics        set product = 'legibility' where product = 'plinth';
update public.maya_striking_distance set product = 'legibility' where product = 'plinth';

-- plinth-tan.vercel.app was recorded as the live URL and is DEAD: not attached
-- to the Vercel project, so all 53 of these probes were hitting a hostname that
-- resolves to nothing. Point them at the canonical domain.
update public.product_health
   set app_name = 'legibility',
       repo     = replace(repo, 'plinth', 'legibility'),
       live_url = 'https://legibility.io'
 where app_name = 'plinth' or repo like '%plinth%' or live_url like '%plinth%';

-- TEXT, not jsonb, despite holding a JSON array (see note 3 above)
update public.system_config
   set value = replace(value, 'plinth', 'legibility')
 where value like '%plinth%';

-- ilike + both cases: the stored value was 'Plinth agent-native distribution',
-- and a lowercase-only replace here left it behind on the first pass.
update public.growth_integrations
   set job   = replace(replace(job,   'Plinth', 'Legibility'), 'plinth', 'legibility'),
       notes = replace(replace(notes, 'Plinth', 'Legibility'), 'plinth', 'legibility')
 where job ilike '%plinth%' or notes ilike '%plinth%';

-- live fleet instructions: a stale product name here is behavioural, not cosmetic
update public.agents
   set brief_content = replace(replace(brief_content, 'Plinth', 'Legibility'), 'plinth', 'legibility')
 where brief_content ilike '%plinth%';

update public.tasks
   set title = replace(replace(title, 'Plinth', 'Legibility'), 'plinth', 'legibility')
 where title ilike '%plinth%';

-- ── verification actually run after applying ────────────────────────────────
-- A scan of every text/varchar/enum/jsonb column in public for '%plinth%'
-- returned only: audit_log.* (11 rows), agent_brief_backups.brief_content (17),
-- tasks.id (1). All three are the intentional exclusions above.
-- leads with a null primary_venture: 0, so no venture tag was lost.
