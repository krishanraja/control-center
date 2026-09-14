-- Retire Kai (Technical Architecture / Integrations), recorded 2026-09-14.
--
-- Kai was retired on 2026-09-07 and both its workflows archived: it was an n8n
-- workflow monitoring n8n, which shares the blind spot it existed to close, and
-- `/api/health/fleet-reconcile` plus `/api/health/connections-sweep` replaced it
-- from outside the runtime. docs/AGENTS.md and the architecture doc have said so
-- since that day.
--
-- The row never followed. Found on 2026-09-14 still `active = true` with
-- `expected_runs_per_day = 6` and no run since 2026-09-07 08:00 UTC (135 runs in
-- the preceding month, then nothing). That combination is exactly what the fleet
-- observer reads as a dead agent, so a retirement nobody completed shows up
-- forever as a failure nobody can fix.
--
-- Same shape as the Felix and Priya retirements: the row stays so historical
-- tasks, audit_log entries and workflow_runs still resolve an owner.
--
-- Hunter is deliberately NOT touched here. It ran 11 times in the last 30 days,
-- most recently the same day this migration was written, from GitHub Actions
-- rather than n8n. Older comments in the codebase called it retired; they were
-- wrong and are corrected in the same commit.

update public.agents
   set active = false,
       expected_runs_per_day = 0,
       mandate = coalesce(mandate, '') ||
         case when coalesce(mandate, '') = '' then '' else E'\n\n' end ||
         'RETIRED 2026-09-07, row reconciled 2026-09-14. Workflow health is owned by '
         '/api/health/fleet-reconcile and credential health by /api/health/connections-sweep, '
         'both Vercel crons outside the n8n runtime. Historical rows are kept for attribution.',
       updated_at = now()
 where id = 'kai';
