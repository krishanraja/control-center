-- Delete the Sarah Chen test contact task.
-- This was a placeholder/example task that lingered in the waiting queue.
-- Krish confirmed: hard delete (not status=done).

DELETE FROM public.tasks
WHERE id = 'd71e9c32-b234-4ac9-b0a7-dd0acce81369';

-- Audit trail entry
INSERT INTO public.audit_log (event_type, actor, target, display_message)
VALUES (
  'task_deleted',
  'krish',
  'd71e9c32-b234-4ac9-b0a7-dd0acce81369',
  'Deleted test contact (Sarah Chen) - not a real lead'
);

-- Verify
-- SELECT count(*) FROM public.tasks WHERE id = 'd71e9c32-b234-4ac9-b0a7-dd0acce81369';
-- Expected: 0.
