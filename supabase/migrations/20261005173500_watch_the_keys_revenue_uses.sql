-- Watch the credentials revenue actually uses, not the ones it used to.
--
-- 2026-10-05. #388 moved the revenue pull onto ONE Stripe organisation key
-- (STRIPE_ORG_KEY) with a per-account Stripe-Context header. The per-account
-- keys became a fallback read only when the org key is unset, which it is not.
-- The connections sweep was still watching only the old keys:
--   * `stripe` checked STRIPE_API_KEY and read green, while nothing depended on it;
--   * `stripe-fractionl` sat on skipped_no_key for good, its key retired;
--   * nothing watched the org key, so if it died revenue would stop and the
--     dashboard would stay green.
-- Same day, Krish wired Heartside's store: Shopify Payments, not Stripe, through
-- a Dev Dashboard custom app whose secret is SHOPIFY_HEARTSIDE_CLIENT_SECRET.
--
-- Both new checks are STRICT in api/_connections.ts. The ping check reads
-- 400/404/405 as a live key; Shopify answers a wrong secret AND a wrong client
-- id with HTTP 400, so without that flag a dead Shopify credential reads green.
--
-- Upserts, so this is safe to run again and a rebuilt database watches the same
-- keys as production.

insert into public.service_registry (key, display_name, category, criticality, env_key_name, check_kind, dashboard_url, active)
values
  ('stripe-org', 'Stripe (organisation key, all five accounts)', 'finance', 'critical', 'STRIPE_ORG_KEY', 'ping', 'https://dashboard.stripe.com', true),
  ('shopify-heartside', 'Shopify (Heartside store)', 'finance', 'standard', 'SHOPIFY_HEARTSIDE_CLIENT_SECRET', 'ping', 'https://admin.shopify.com/store/bnf1em-ge', true)
on conflict (key) do update set
  display_name  = excluded.display_name,
  category      = excluded.category,
  criticality   = excluded.criticality,
  env_key_name  = excluded.env_key_name,
  check_kind    = excluded.check_kind,
  dashboard_url = excluded.dashboard_url,
  active        = excluded.active,
  updated_at    = now();

-- The old mind/make key is now only a fallback. Keep watching it, but it is no
-- longer the one whose loss stops revenue, so it is not critical.
update public.service_registry
   set display_name = 'Stripe (mind/make fallback key)', criticality = 'standard', updated_at = now()
 where key = 'stripe';

-- Its key was retired when the org key replaced the per-account keys, so it can
-- only ever read skipped_no_key. The org key covers Fractionl. Deactivated, not
-- deleted, so its history stays readable.
update public.service_registry
   set active = false, updated_at = now()
 where key = 'stripe-fractionl';
