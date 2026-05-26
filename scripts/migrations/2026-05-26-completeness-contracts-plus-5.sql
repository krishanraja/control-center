-- audit-2026-05-26: +5 completeness_contracts (now 11 total).
-- Per the audit, Tier-1 self-healing coverage was 8% (6 contracts). These add
-- contracts for the 5 highest-leverage workflows currently uncovered.

INSERT INTO public.completeness_contracts
  (workflow_id, workflow_name, target_table, required_fields, forbidden_patterns, min_rows_per_run, description, active)
VALUES
  ('d2sHSeyXMmu8Xe0C', 'Marcus | Mindmaker OS | Daily Brief 06:30',
    'home_intelligence',
    ARRAY['top_three','daily_brief','momentum'],
    '{}'::jsonb,
    1,
    'Marcus daily brief must populate home_intelligence with top_three (3 items), daily_brief, momentum.',
    true),
  ('wztp6KoiO5EuFQEB', 'Cleo | Mindmaker OS | Email Draft',
    'email_drafts',
    ARRAY['gmail_draft_id','subject','body_preview'],
    '{}'::jsonb,
    0,
    'Cleo Email Draft must write a row with gmail_draft_id + subject + body_preview when invoked.',
    true),
  ('YPKjTnB2P6mqe4kG', 'Agatha | Mindmaker OS | Lead Deep Enrich',
    'leads',
    ARRAY['deep_enriched_at'],
    '{}'::jsonb,
    0,
    'Agatha Lead Deep Enrich must stamp leads.deep_enriched_at when manual_trigger=true.',
    true),
  ('pwuS1jd2Mv4H8oBf', 'Maya | Mindmaker OS | Customer Acquisition Sweeper',
    'leads',
    ARRAY['source_type','primary_venture'],
    '{}'::jsonb,
    0,
    'Maya CAC sweeper writes leads rows with source_type + primary_venture set.',
    true),
  ('SXdHes0WwIovjPAB', 'System | Mindmaker OS | Critical Infrastructure Monitor',
    'system_health',
    ARRAY['component','status','last_check'],
    '{}'::jsonb,
    1,
    'Critical Infra Monitor upserts system_health row on every 5-min tick (F11 contract).',
    true)
ON CONFLICT DO NOTHING;
