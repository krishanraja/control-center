-- One-shot refresh of system_health rows to reflect 2026-05-18 reality.
-- Reasoning: existing rows last touched 2026-04-14; the snapshot is wrong.
-- Schema: system_health has heterogeneous rows. Component rows have a non-null
-- `component` column. Metric rows (e.g. `mrr`) have non-null `metric`.
-- Readers: api/health.ts (selects component,status), src/components/SystemsPanel.tsx
-- (selects *, parses component/status/message/details/last_check).

-- 1. Add partial unique index on component so ON CONFLICT works.
--    Partial so existing metric-style rows (component IS NULL) are untouched.
CREATE UNIQUE INDEX IF NOT EXISTS system_health_component_uniq
  ON public.system_health(component)
  WHERE component IS NOT NULL;

-- 2. Inspect current rows BEFORE applying (uncomment to dry-run):
-- SELECT component, status, message, last_check
-- FROM public.system_health
-- WHERE component IS NOT NULL
-- ORDER BY component;

-- 3. Upsert each row. Component strings match the display labels used in the
--    Systems tab. If your existing rows use a different string format (e.g.
--    'n8n-cloud' vs 'N8N Cloud'), adjust here — inspect first via step 2.
INSERT INTO public.system_health (component, status, message, last_check)
VALUES
  ('N8N Cloud',                'healthy',  '49 active / 3 inactive workflows',                                                now()),
  ('Status Webhook',           'healthy',  'POST /webhook/status-update returns 200 (workflow cVnbywEWaDS4Xa5V)',             now()),
  ('HARO Ingestion',           'inactive', 'Deactivated 2026-05-18 - Gmail OAuth cred deleted, decision was kill',            now()),
  ('Content Engine',           'degraded', '5/7 content workflows healthy. Draft Post on Demand and Zara Signal Sweep need UI fixes.', now()),
  ('Supabase',                 'healthy',  'Schema clean, 4 ghost tables dropped',                                            now()),
  ('Grok API',                 'healthy',  'Key restored to openclaw.json',                                                   now()),
  ('Cleo Content Factory',     'healthy',  'Last run 6d ago, status success',                                                 now())
ON CONFLICT (component) DO UPDATE
  SET status     = EXCLUDED.status,
      message    = EXCLUDED.message,
      last_check = EXCLUDED.last_check;

-- 4. Components intentionally left untouched (verify externally before changing):
--    - Revenue Report Workflow  (check executions for pyr9wurcs1M9utW3)
--    - Apollo                   (verify via Apollo API if creds available)
--    - Instantly                (status unknown; no signal to update)
--    - GitHub                   (no change to existing row)
--    - Stripe                   (no change to existing row)

-- 5. Verify
-- SELECT component, status, message, last_check
-- FROM public.system_health
-- WHERE component IS NOT NULL
-- ORDER BY component;
