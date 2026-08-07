-- Plinth is now Legibility. This renames the slug where it lives as DATA.
--
-- ############################################################################
-- # NOT YET APPLIED. READ THE SEQUENCING NOTE BEFORE RUNNING.                #
-- ############################################################################
--
-- The slug is a contract between three systems, and every ordering of them
-- breaks something, so they have to land together rather than in sequence:
--
--   1. control-center code      renamed on this branch, ships on deploy
--   2. live n8n workflows       NOT renamed (the repo copies under
--                               scripts/n8n/ are, but they still have to be
--                               pushed to n8n cloud)
--   3. this database            what this file does
--
-- Ship the CODE first and the Growth, Customers and Goals surfaces filter on
-- a slug the database does not contain, so the lane silently renders empty.
-- Apply the DATABASE first and the live workflows keep writing rows tagged
-- 'plinth' against a slug that no longer exists, orphaning every row Maya's
-- rank sweep, the GSC sync, the GEO citation sweep and the send dispatcher
-- produce until someone notices the lane went quiet.
--
-- So: do not merge the code rename on its own. The tight order, all in one
-- sitting, is APPLY THIS (the enum rename is atomic and preserves every row),
-- then push the n8n workflow copies to n8n cloud, then deploy the code. The
-- exposure window is the deploy, and during it the lane reads empty rather
-- than wrong. Verify with the audit query at the foot of this file.
--
-- Deliberately out of scope:
--   * audit_log (target, details, changes, display_message). An audit trail
--     records what happened under the name it happened under. Rewriting it
--     would be forging the record.
--   * agent_brief_backups.brief_content. Backups are snapshots; correcting a
--     snapshot defeats the point of having one.
--   * tasks.id. One task id contains the string. A primary key is not a label
--     and is not worth the foreign-key risk to make a name read nicely.

begin;

-- ── the enum ────────────────────────────────────────────────────────────────
-- RENAME VALUE preserves every existing row: the label changes in place, so
-- customers.product rows follow automatically with no data update.
do $$
begin
  if exists (
    select 1 from pg_enum e join pg_type t on t.oid = e.enumtypid
    where t.typname = 'customer_product' and e.enumlabel = 'plinth'
  ) then
    execute $q$ alter type public.customer_product rename value 'plinth' to 'legibility' $q$;
  end if;
end $$;

-- ── the venture row ─────────────────────────────────────────────────────────
update public.venture_registry
   set slug         = 'legibility',
       display_name = 'Legibility'
 where slug = 'plinth';

update public.venture_registry
   set voice_profile = replace(voice_profile::text, 'Plinth', 'Legibility')::jsonb
 where voice_profile::text like '%Plinth%';

-- ── lane + metric slugs ─────────────────────────────────────────────────────
update public.lane_directions        set lane    = 'legibility' where lane    = 'plinth';
update public.product_metrics        set product = 'legibility' where product = 'plinth';
update public.maya_striking_distance set product = 'legibility' where product = 'plinth';

update public.lane_directions
   set creative_direction = replace(creative_direction, 'Plinth', 'Legibility')
 where creative_direction like '%Plinth%';

-- ── health probe ────────────────────────────────────────────────────────────
-- The recorded live_url (plinth-tan.vercel.app) is DEAD: it is not attached to
-- the Vercel project, so these probes were already failing against a hostname
-- that resolves to nothing. Point them at the canonical domain.
update public.product_health
   set app_name = 'legibility',
       repo     = replace(repo, 'plinth', 'legibility'),
       live_url = 'https://legibility.io'
 where app_name = 'plinth' or repo like '%plinth%' or live_url like '%plinth%';

-- ── config + integration notes ──────────────────────────────────────────────
update public.system_config
   set value = replace(value::text, 'plinth', 'legibility')::jsonb
 where value::text like '%plinth%';

update public.growth_integrations
   set job   = replace(job,   'plinth', 'legibility'),
       notes = replace(replace(notes, 'Plinth', 'Legibility'), 'plinth', 'legibility')
 where job like '%plinth%' or notes ilike '%plinth%';

-- ── agent briefs ────────────────────────────────────────────────────────────
-- These are live instructions the fleet reads. A stale product name here is a
-- behavioural bug, not a cosmetic one.
update public.agents
   set brief_content = replace(replace(brief_content, 'Plinth', 'Legibility'), 'plinth', 'legibility')
 where brief_content ilike '%plinth%';

update public.tasks
   set title = replace(replace(title, 'Plinth', 'Legibility'), 'plinth', 'legibility')
 where title ilike '%plinth%';

commit;

-- ── verification ────────────────────────────────────────────────────────────
-- Expect only audit_log.*, agent_brief_backups.brief_content and tasks.id,
-- which are all intentionally preserved above.
--
--   select 'venture_registry.slug' src, slug          from venture_registry where slug ilike '%plinth%'
--   union all select 'enum', e.enumlabel from pg_enum e join pg_type t on t.oid=e.enumtypid
--     where t.typname='customer_product' and e.enumlabel ilike '%plinth%'
--   union all select 'product_health', app_name from product_health where app_name ilike '%plinth%'
--   union all select 'agents', name from agents where brief_content ilike '%plinth%';
