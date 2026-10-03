-- Telegram is retired.
--
-- Krish no longer uses Telegram, and his bots have been hijacked before. A bot
-- token is a standing credential: whoever holds it can post as the system, and
-- where a workflow listens to the bot, drive the workflow. So nothing is left
-- talking to Telegram (state checked 2026-10-03):
--   * Control Center has been pull-only since 2026-09-06 (api/_alert.ts).
--   * Every Telegram node in n8n is disabled and none is a trigger. The bot
--     tokens left inline in disabled nodes were blanked in the workflows
--     rebuilt this week; revoking the bots at BotFather kills the rest.
--   * The one inbound Telegram callback (System | Krish Approval Callback) is
--     unpublished.
--   * The connections sweep no longer probes the bot (api/_connections.ts),
--     and TELEGRAM_* is gone from .env.example.
--
-- This row is what the sweep reads. It was set inactive live the same day;
-- this records it so a fresh database agrees. Every reader filters on active,
-- so the row drops off Spend, Systems and the health dot. env_key_name stays
-- so the history of what the row used to check still reads.

update public.service_registry
   set active = false,
       check_kind = 'none',
       updated_at = now()
 where key = 'telegram';

-- Applied live 2026-10-03 through the Supabase connector (ledger version
-- 20261003212514). Readback: active false, check_kind none.
