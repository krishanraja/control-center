-- Draft/published drift as observable state (2026-08-24).
--
-- n8n Cloud keeps a draft version and a published (active) version. An edit made
-- through the MCP update_workflow tool writes the DRAFT. A manual test run
-- executes the draft and passes, while the schedule keeps running the old
-- published version, so a fix looks shipped and silently is not.
--
-- Found for real: Vera's Feedback Aggregation provenance fix passed a manual run
-- on 2026-08-24 while the Sunday cron would still have executed the broken code.
--
-- This is invisible to every signal the OS already had. The workflow does not
-- error, its heartbeat is written, its execution counts look healthy: it is just
-- running last week's logic. api/health/fleet-reconcile.ts compares versionId
-- against activeVersionId (both already returned by the workflows endpoint, so
-- this costs no extra API calls) and raises a tier-2 silent_failure.

ALTER TABLE public.workflow_health
  ADD COLUMN IF NOT EXISTS unpublished_draft boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.workflow_health.unpublished_draft IS
  'True when n8n reports versionId <> activeVersionId: the workflow has unpublished draft edits, so the schedule runs older code than the editor shows. False also means "n8n did not report both ids", i.e. cannot tell - never treat as a positive health signal on its own.';

CREATE INDEX IF NOT EXISTS workflow_health_unpublished_draft_idx
  ON public.workflow_health (unpublished_draft)
  WHERE unpublished_draft;
