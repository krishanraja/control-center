-- Plan-ceiling notes for the three services the meter watches.
--
-- limit_note is the plain-English line the console shows beside a service that
-- needs a look. These three each need one for a different reason: Apify because
-- its prepaid amount is not its hard cap, n8n because its bill is not in
-- dollars, and Anthropic because the number the OS can measure is not the
-- number on the invoice. Written here rather than in a component so the
-- explanation lives with the data it explains.

BEGIN;

update public.service_registry
   set limit_note = 'Plan includes $29 of usage per billing cycle. Extra lands on the next invoice, or is charged immediately once it passes $50. Spend is metered per actor by /api/meter/apify-sync.'
 where key = 'apify';

update public.service_registry
   set limit_note = 'n8n Cloud bills by EXECUTION, not by usage, and its API reports no price. The Control Center meters executions per workflow; the dollar figure comes from the invoice.'
 where key = 'n8n';

update public.service_registry
   set limit_note = 'API spend is self-metered per agent from the token counts on each response. Total Anthropic spend comes from the invoices — the usage and cost reports need an Admin key an individual account cannot hold, so the key genuinely cannot read its own billing. Calls made outside the OS (an n8n node with its own credential) are invisible to the meter.'
 where key = 'anthropic';

COMMIT;
