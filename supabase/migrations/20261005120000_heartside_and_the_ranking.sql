-- Heartside joins the portfolio and Legibility is re-armed (Krish, 2026-10-05):
-- Heartside and Full Time are priority 1, Legibility priority 2, CTRL and
-- Pulse priority 3. The ranking itself lives in code (src/lib/portfolio.ts),
-- which Growth, Subscriptions and the Sunday review all read. This migration
-- only makes the database accept the two products.
--
-- Additive and backward compatible: a new enum value, two new rows, one row
-- switched back on, and six CHECK constraints widened (never narrowed). Code
-- that does not know about Heartside ignores all of it.
--
-- Both venture tables, because there are two (venture_registry, read by
-- Control Center; ventures, read by the n8n visibility workflows) and the
-- second one rotted once already when only the first was kept up.

-- 1. customers.product can say heartside, so Shopify orders have a home the
--    day they are wired.
alter type public.customer_product add value if not exists 'heartside';

-- 2. venture_registry
insert into public.venture_registry (slug, display_name, kind, icp_description, scoring_criteria, active, sort_order)
values (
  'heartside', 'Heartside', 'product',
  'US dog owners whose dog is their person, buying a gift for themselves or for another dog owner. A Shopify store at heartside.io selling personalised posters, pillows and ornaments written in the dog''s voice. Launches 20 October 2026.',
  '{"status_note": "pre-launch store, opens 2026-10-20", "what_closed_looks_like": "a paid Shopify order"}'::jsonb,
  true, 14
)
on conflict (slug) do update set active = true, display_name = excluded.display_name, updated_at = now();

update public.venture_registry
   set active = true, sort_order = 16, updated_at = now()
 where slug = 'legibility';

-- 3. ventures (the n8n visibility workflows' table; hyphenated ids)
insert into public.ventures (id, name, status, description, owner)
values
  ('heartside', 'Heartside', 'active',
   'Gifts written by your dog. A Shopify store at heartside.io selling to the US, opening 20 October 2026. Priority 1.', 'krish'),
  ('legibility', 'Legibility', 'active',
   'Typed product data for AI agents over REST and MCP, at legibility.io. Private beta. Priority 2.', 'krish')
on conflict (id) do update set status = 'active', name = excluded.name, description = excluded.description;

-- 4. The growth tables accept both products. Each CHECK is recreated with the
--    values it already allowed plus heartside and legibility.
alter table public.growth_touchpoints drop constraint if exists growth_touchpoints_product_slug_check;
alter table public.growth_touchpoints add constraint growth_touchpoints_product_slug_check
  check (product_slug = any (array['ctrl','circle','pulse','full-time','mindmake','publication','signal-noise','mindmaker','heartside','legibility']));

alter table public.growth_creative_queue drop constraint if exists growth_creative_queue_product_slug_check;
alter table public.growth_creative_queue add constraint growth_creative_queue_product_slug_check
  check (product_slug = any (array['ctrl','circle','pulse','full-time','mindmake','publication','signal-noise','mindmaker','heartside','legibility']));

alter table public.growth_council_reviews drop constraint if exists growth_council_reviews_product_slug_check;
alter table public.growth_council_reviews add constraint growth_council_reviews_product_slug_check
  check (product_slug = any (array['ctrl','circle','pulse','full-time','mindmake','publication','signal-noise','mindmaker','heartside','legibility']));

alter table public.growth_geo_probes drop constraint if exists growth_geo_probes_product_slug_check;
alter table public.growth_geo_probes add constraint growth_geo_probes_product_slug_check
  check ((subject_kind <> 'venture') or (product_slug = any (array['ctrl','circle','pulse','full-time','mindmake','publication','signal-noise','mindmaker','heartside','legibility'])));

alter table public.growth_social_accounts drop constraint if exists growth_social_accounts_product_slug_check;
alter table public.growth_social_accounts add constraint growth_social_accounts_product_slug_check
  check (product_slug = any (array['ctrl','circle','pulse','full-time','mindmake','publication','signal-noise','mindmaker','mindmaker_live','heartside','legibility']));

alter table public.growth_aeo_subjects drop constraint if exists growth_aeo_subjects_product_slug_check;
alter table public.growth_aeo_subjects add constraint growth_aeo_subjects_product_slug_check
  check (product_slug = any (array['ctrl','circle','pulse','full-time','mindmake','heartside','legibility']));
