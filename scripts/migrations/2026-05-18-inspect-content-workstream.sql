-- Inspection query for the upcoming Content Engine tile.
-- Run BEFORE wiring ContentEngineTile to confirm:
--   1) What workstream string(s) actually exist for content work
--   2) How tasks distribute across statuses (active/in_progress/waiting/blocked/done)
--   3) Whether `completed_at` is populated for done tasks (needed for "published this week")
-- Report results back to Krish so he can confirm the bucket mapping.

-- A. Distinct workstream values + count
SELECT workstream, count(*) AS n
FROM public.tasks
GROUP BY workstream
ORDER BY n DESC;

-- B. Content-leaning workstreams sliced by status
SELECT workstream, status, count(*) AS n
FROM public.tasks
WHERE workstream ILIKE '%content%'
   OR workstream ILIKE '%draft%'
   OR workstream ILIKE '%post%'
   OR workstream ILIKE '%marketing%'
GROUP BY workstream, status
ORDER BY workstream, status;

-- C. Done tasks: is completed_at populated?
SELECT
  count(*) FILTER (WHERE status = 'done')                         AS done_total,
  count(*) FILTER (WHERE status = 'done' AND completed_at IS NOT NULL) AS done_with_completed_at,
  min(completed_at) FILTER (WHERE status = 'done')               AS oldest_done,
  max(completed_at) FILTER (WHERE status = 'done')               AS newest_done
FROM public.tasks;
