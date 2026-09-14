-- Retire Priya (Product Strategy), 2026-09-14.
--
-- Priya ran two scheduled workflows: a twice-daily product health scan and a
-- Monday rollup. Between them they wrote a product_health row, opened tasks,
-- created a Google Doc bug report per scan, and sent three Telegram messages.
-- The doc and the alerts were the output nobody acted on, which makes the whole
-- loop cost without a decision attached. Both workflows are unpublished in n8n
-- and their definitions moved to scripts/n8n/_retired/.
--
-- Same shape as the Felix retirement (2026-07-10): the row stays so historical
-- tasks, audit_log entries and workflow_runs still resolve an owner, and
-- expected_runs_per_day drops to zero so the fleet observer stops reading a
-- workflow that no longer exists as dead rather than retired.

update public.agents
   set active = false,
       expected_runs_per_day = 0,
       mandate = coalesce(mandate, '') ||
         case when coalesce(mandate, '') = '' then '' else E'\n\n' end ||
         'RETIRED 2026-09-14. Product health scanning and the weekly rollup were '
         'stopped: the Google Doc bug reports and Telegram alerts were output nobody '
         'acted on. Historical rows are kept for attribution.',
       updated_at = now()
 where id = 'priya';
