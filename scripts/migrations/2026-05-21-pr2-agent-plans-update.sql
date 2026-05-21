-- PR 2 of os-rebuild: update agent_plans for Zara + Felix after the Zara fix.
--
-- Zara: blockers cleared (the parse-error crash root cause is fixed).
-- Felix: was unblocked from Zara crashing; now waiting on next scheduled run
-- to verify warm paths actually arrive.

UPDATE public.agent_plans
SET blockers = NULL,
    current_phase = 'Post-fix verification (PR 2)',
    next_milestone = 'Mon-Fri 10am EST: next scheduled sweep should produce >=3 valid signals with company_name, summary>=20, signal_score>=1',
    updated_at = NOW()
WHERE agent_id = 'zara';

UPDATE public.agent_plans
SET blockers = 'Waiting on next Zara sweep to verify warm paths arrive (post PR 2)',
    updated_at = NOW()
WHERE agent_id = 'felix';
