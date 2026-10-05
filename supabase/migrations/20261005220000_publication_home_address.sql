-- The publication's address is home.makeyourmindup.ai.
--
-- Krish chose the name "home" on 2026-10-05 and asked for the address to be
-- changed "absolutely everywhere". The publication used to live at
-- mindmakerlive.substack.com. Substack serves it at home.makeyourmindup.ai
-- once the custom domain is active, and keeps its own subdomain,
-- mindmakerlive, as the name its API knows the publication by.
--
-- What changes:
--   1. growth_aeo_subjects: the Mindmake venture's domains gain
--      home.makeyourmindup.ai. The old address stays in the list, so AI
--      answers that still cite it keep counting. That is the same rule as
--      hostAliases in src/lib/webProperties.ts and OUR_DOMAINS in
--      api/growth/geo-probe.ts. 20260909090000_aeo_engine.sql seeded the old
--      list and is not edited.
--   2. growth_social_accounts: every row whose profile_url is exactly
--      https://mindmakerlive.substack.com/ (two when this was written) points
--      at https://home.makeyourmindup.ai/. Their notes said the address would
--      stay mindmakerlive until Krish moved it; they now say where the
--      publication lives.
--   3. media_channels: the substack row's notes said the same, and now say
--      where the publication lives.
--
-- What stays: handles (Substack's own name for the publication), metric keys
-- (substack_publication_total, and substack_mindmakerlive_total in
-- scripts/migrations/2026-07-29-growth-metrics.sql), and every earlier
-- migration.
--
-- The old notes are not in this repository, so step 0 copies every row this
-- touches into system_config under a dated key before anything changes.
-- Nothing is lost, and copying them back undoes it.
--
-- Safe to run again: each step matches only rows that still carry the old
-- value, and the backup is written once and never overwritten.
--
-- Apply only when https://home.makeyourmindup.ai serves the publication. On
-- 2026-10-05 it still redirected to substack.com's front page.

begin;

-- 0. Back up every row this changes, as it stands.
insert into public.system_config (key, value, updated_at)
select
  'publication_home_address_backup_20261005',
  jsonb_build_object(
    'growth_aeo_subjects', coalesce((
      select jsonb_agg(jsonb_build_object('id', s.id, 'kind', s.kind, 'slug', s.slug, 'domains', s.domains))
        from public.growth_aeo_subjects s
       where s.kind = 'venture' and s.slug = 'mindmake'
         and 'mindmakerlive.substack.com' = any (s.domains)
         and not ('home.makeyourmindup.ai' = any (s.domains))), '[]'::jsonb),
    'growth_social_accounts', coalesce((
      select jsonb_agg(jsonb_build_object('id', a.id, 'product_slug', a.product_slug, 'profile_url', a.profile_url, 'notes', a.notes) order by a.id)
        from public.growth_social_accounts a
       where a.profile_url = 'https://mindmakerlive.substack.com/'), '[]'::jsonb),
    'media_channels', coalesce((
      select jsonb_agg(jsonb_build_object('slug', c.slug, 'notes', c.notes))
        from public.media_channels c
       where c.slug = 'substack'
         and c.notes ilike '%mindmakerlive%'
         and c.notes not ilike '%home.makeyourmindup.ai%'), '[]'::jsonb)
  ),
  now()
on conflict (key) do nothing;

-- 1. AI answers count under either address.
update public.growth_aeo_subjects
   set domains = array_append(domains, 'home.makeyourmindup.ai'),
       updated_at = now()
 where kind = 'venture' and slug = 'mindmake'
   and 'mindmakerlive.substack.com' = any (domains)
   and not ('home.makeyourmindup.ai' = any (domains));

-- 2. The Substack account on the growth map.
update public.growth_social_accounts
   set profile_url = 'https://home.makeyourmindup.ai/',
       notes = 'The publication lives at home.makeyourmindup.ai, its address since 2026-10-05. Substack still knows it by its own name, mindmakerlive.'
 where profile_url = 'https://mindmakerlive.substack.com/';

-- 3. The Substack channel.
update public.media_channels
   set notes = 'The publication lives at home.makeyourmindup.ai, its address since 2026-10-05. Substack still knows it by its own name, mindmakerlive.'
 where slug = 'substack'
   and notes ilike '%mindmakerlive%'
   and notes not ilike '%home.makeyourmindup.ai%';

commit;

-- NOT APPLIED. Read back after applying:
--   select domains from public.growth_aeo_subjects where kind = 'venture' and slug = 'mindmake';
--     expect mindmake.co, mindmakerlive.substack.com, home.makeyourmindup.ai
--   select id, product_slug, profile_url, notes from public.growth_social_accounts
--    where profile_url in ('https://mindmakerlive.substack.com/', 'https://home.makeyourmindup.ai/');
--     expect two rows, both on the new address
--   select notes from public.media_channels where slug = 'substack';
--   select value from public.system_config where key = 'publication_home_address_backup_20261005';
--     expect the old notes, word for word
