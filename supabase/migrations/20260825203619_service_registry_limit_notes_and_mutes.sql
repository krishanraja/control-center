-- Limits awareness + per-service mutes for the connections sweep.
--
-- limit_note: a plain-English line about the service's plan ceiling and who
-- consumes it, shown on the spend detail sheet. It exists because "FMP is
-- broken" turned out to mean "FMP's 300 calls/min Starter quota was spent by
-- a consumer the Control Center does not meter" — the tracker should say
-- that, not just "exhausted".
--
-- Cloudflare: muted at Krish's request (the stored token is stale and the
-- service is not worth a standing check right now). check_kind='none' drops
-- it from the sweep and the broken count; sweep state is cleared so the old
-- auth_failed verdict does not linger as truth.

BEGIN;

alter table public.service_registry add column if not exists limit_note text;

update public.service_registry
   set check_kind = 'none',
       last_status = null,
       last_http_status = null,
       last_error = null,
       last_checked_at = null,
       balance = null,
       balance_unit = null,
       updated_at = now()
 where key = 'cloudflare';

update public.service_registry
   set limit_note = 'Starter plan: 300 calls/min. Consumed by Compound market pulls; not metered by the Control Center.',
       updated_at = now()
 where key = 'fmp';

COMMIT;

NOTIFY pgrst, 'reload schema';
