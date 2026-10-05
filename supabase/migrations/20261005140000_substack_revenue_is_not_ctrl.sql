-- The only revenue in the portfolio is the Substack's, and it has been reported
-- as CTRL's since the price map was written.
--
-- WHAT WAS WRONG. `system_config.stripe_price_product_map` mapped all three
-- plans on the Mindmaker LLC Stripe account to `mm_ctrl`:
--   prod_UekRPBqVbrKSI5 / yearly81usd   "$81 a year"
--   prod_UXM897kpHu4ghw / yearly115aud  "A$115 a year"
--   prod_UA0VCxc0WVM898 / monthly8usd   "$8 a month"
-- Read live from Stripe on 2026-10-05, every one of those prices carries
-- `metadata.substack = "yes"` and `metadata.founding = "yes"`. Substack creates
-- and owns these products and bills its paid subscribers through the Mindmaker
-- LLC account with its 10% as an application fee. They are the publication's
-- founding members, not CTRL customers.
--
-- The consequence, measured in production before this migration ran: `customers`
-- held 2 paid and 4 churned rows under `mm_ctrl` carrying $13.51 of monthly
-- revenue, and Control Center reported "CTRL: $13.51/mo, 2 paying" on the
-- Subscriptions tab. CTRL in fact has ZERO paying customers and had, after the
-- 2026-10-05 product cleanup, no active Stripe product at all.
--
-- WHAT CTRL ACTUALLY SELLS. One thing: Edge Pro at $49 a month
-- (prod_Uc7Rd9QP2FHSdY, price_1TpVxnHGqJqsGEJL8caujVtB), charged by Supabase
-- edge functions in the mm-ctrl product project rather than by anything in this
-- repo. Nobody has ever bought it. That pairing stays mapped to `mm_ctrl`
-- because it is genuinely CTRL's, and it is the only Stripe line CTRL has.
--
-- Note for whoever reads this next: the Edge Pro PRODUCT was archived in the
-- 2026-10-05 cleanup while its PRICE is still active, so CTRL's checkout would
-- still take a payment even though the product no longer shows in the Stripe
-- dashboard. Whether CTRL keeps selling Edge Pro is Krish's call, not this
-- migration's.
--
-- The old row is kept whole under a dated key, so this is reversible by copying
-- it back. Nothing is deleted.

begin;

-- 1. Back up the row before changing it.
insert into public.system_config (key, value, updated_at)
select
  'stripe_price_product_map_backup_20261005',
  value,
  now()
from public.system_config
where key = 'stripe_price_product_map'
on conflict (key) do update set value = excluded.value, updated_at = now();

-- 2. The corrected map. Same shape, same spellings, three products moved.
update public.system_config
set value = $json$
{
"__comment": "price id or product id -> customers.product. Read live from Stripe on 2026-10-05: the three plans below carry metadata.substack=yes, so they are the publication's, not CTRL's.",

"yearly81usd":"publication","prod_UekRPBqVbrKSI5":"publication",
"yearly115aud":"publication","prod_UXM897kpHu4ghw":"publication",
"monthly8usd":"publication","prod_UA0VCxc0WVM898":"publication",
"price_1TWXFqHGqJqsGEJLZafgWLVl":"publication",

"prod_Uc7Rd9QP2FHSdY":"mm_ctrl","price_1TpVxnHGqJqsGEJL8caujVtB":"mm_ctrl",

"price_1Tpo8WHqiZo6hj3eFxBpm4Lq":"full_time","prod_UpT4QstbwlhLw6":"full_time",

"price_1Tki9I4w6vAdI2o5NtBRlfk6":"legibility","prod_UkCY7a8IvEFi67":"legibility",
"price_1Tki9C4w6vAdI2o574L46LZW":"legibility","prod_UkCYTZae1QZ6sP":"legibility",

"prod_UHoQV8ymZNk4Um":"merciless",

"price_1Tcth9Hdk8IR8OrULdEMpn9b":"fractionl_pulse","price_1Tcth9Hdk8IR8OrU1vRD707U":"fractionl_pulse",
"prod_Uc7xRur62CdlHs":"fractionl_pulse",

"prod_UCtpZiOgAVFndG":"fractionl_circle","price_1Tk7LSHdk8IR8OrUt2KpNI8v":"fractionl_circle",
"price_1TEU2RHdk8IR8OrUiK7DmhRU":"fractionl_circle","prod_UMlhjaeIttDUHE":"fractionl_circle",
"price_1TO2AMHdk8IR8OrUDQ9Ar6yO":"fractionl_circle","prod_UMlg7iiM9Vyqxv":"fractionl_circle",
"price_1TO2ALHdk8IR8OrUn0hOvLZh":"fractionl_circle","prod_Unzxs8M3nCSrh4":"fractionl_circle",
"prod_UTo25BZ4qSW06n":"fractionl_circle","prod_UTo27F6MwSHu8H":"fractionl_circle",

"prod_USNA15ZWgGXV8g":"mindmaker","prod_UWRtT59kvz7mk6":"mindmaker","prod_UWRtMdw8iua8Ej":"mindmaker",
"prod_UWRsGAcNqSNm2M":"mindmaker","prod_UWRsdH5CnPKYX8":"mindmaker","prod_UWRs7a0MQrfh8r":"mindmaker",
"prod_UWRs6T1jsfOUPv":"mindmaker","prod_UFgj64iMx6qA1r":"mindmaker","prod_TmHk0iijlvU3oC":"mindmaker",
"prod_TmHk8Jg1nGSEjo":"mindmaker","prod_UFgNLYnUupFSzu":"mindmaker","prod_UFgN3k5DqT0Jhf":"mindmaker",
"prod_UFgNMqZ1yaDvTW":"mindmaker","prod_UFacJ0ZRZRuB8L":"mindmaker","prod_UFacAw88YXrpFn":"mindmaker",
"prod_UFac7koBfXL1Mk":"mindmaker","prod_UFUrlysHJFf0tf":"mindmaker","prod_UFUrxzBROdmiuW":"mindmaker",
"prod_UFUrT5VVGEGuWF":"mindmaker","prod_UFUfCOt2wdPtBf":"mindmaker","prod_UFUf6dBSgiIz6j":"mindmaker",
"prod_UFUfsA0xlzXs9p":"mindmaker","prod_USNB6Q2ylzABOB":"mindmaker","prod_USNBqN5a4DAH5b":"mindmaker",
"prod_USNBkvZMZTUyno":"mindmaker","prod_U5HJ7O3TXyQWUa":"mindmaker"
}
$json$,
    updated_at = now()
where key = 'stripe_price_product_map';

-- 3. Repoint the rows the old map already wrote. Six rows: the two active
--    founding members and four who cancelled. Scoped to the six Stripe
--    subscription ids read live on 2026-10-05, so this can never catch a row
--    that genuinely belongs to CTRL.
update public.customers
set product = 'publication',
    updated_at = now()
where product = 'mm_ctrl'
  and stripe_subscription_id in (
    'sub_1TfQwUHGqJqsGEJLMSwtU7iy',  -- active,   $81/yr  founding member
    'sub_1TYHQJHGqJqsGEJLFjdXrmMF',  -- active,   A$115/yr founding member
    'sub_1TeRXNHGqJqsGEJL0UBf03WQ',  -- canceled, $8/mo
    'sub_1TeLeEHGqJqsGEJLt3mIvEZq',  -- canceled, $8/mo
    'sub_1TWniEHGqJqsGEJLbc4cmFvM',  -- canceled, $8/mo
    'sub_1TWkuTHGqJqsGEJL3v7Zv7qk'   -- canceled, $8/mo
  );

-- 4. Same for the subscription ledger, whose `product` column the daily pull
--    had been leaving null on every row (it stamped the value after the write
--    rather than before; fixed in api/revenue/sync.ts in the same change).
update public.revenue_subscriptions
set product = 'publication'
where stripe_account = 'mindmaker_llc'
  and id in (
    'sub_1TfQwUHGqJqsGEJLMSwtU7iy', 'sub_1TYHQJHGqJqsGEJLFjdXrmMF',
    'sub_1TeRXNHGqJqsGEJL0UBf03WQ', 'sub_1TeLeEHGqJqsGEJLt3mIvEZq',
    'sub_1TWniEHGqJqsGEJLbc4cmFvM', 'sub_1TWkuTHGqJqsGEJL3v7Zv7qk'
  );

commit;
