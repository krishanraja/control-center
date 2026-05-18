-- Drop four ghost tables created during earlier planning.
-- Zero rows, zero readers in the codebase (verified by grep across src/ and api/).
-- Real schema uses: goals, tasks, system_health, audit_log, workflow_runs.

DROP TABLE IF EXISTS public.weekly_goals;
DROP TABLE IF EXISTS public.system_health_scans;
DROP TABLE IF EXISTS public.pipeline_items;
DROP TABLE IF EXISTS public.content_queue;

-- Verify
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN ('weekly_goals', 'system_health_scans', 'pipeline_items', 'content_queue');
-- Expected: 0 rows.
