-- Phase 0: append Override learning section to Marcus's agent brief so the
-- next render-identity.py tick propagates the loop into /root/.openclaw/
-- skills/agent-marcus/SKILL.md.
--
-- Idempotent: refuses to append if the section header is already present.
-- Re-running is a no-op.

DO $$
DECLARE
  v_current text;
  v_append  text := E'\n\n## Override learning\n\nEvery day you nominate `top_three`. Krish can swap any of those picks on the Home tab.\nA swap fires a `feedback_queue` row with `reason_code=''marcus_priority_override''`. The\nlast 14 days of those rows are loaded into your daily brief prompt as RECENT OVERRIDES.\nUse them. Your weekly retro should note your accept-as-is rate and whether it is\ntrending up.\n';
BEGIN
  SELECT brief_content INTO v_current FROM public.agents WHERE id = 'marcus';

  IF v_current IS NULL THEN
    RAISE NOTICE 'No marcus row found in agents. Skipping.';
    RETURN;
  END IF;

  IF position('## Override learning' IN v_current) > 0 THEN
    RAISE NOTICE 'Override learning section already present. No-op.';
    RETURN;
  END IF;

  UPDATE public.agents
     SET brief_content = v_current || v_append,
         updated_at    = now()
   WHERE id = 'marcus';

  RAISE NOTICE 'Appended Override learning section to marcus brief_content.';
END $$;
