# Marcus prompt patch — customer signals + overdue lead follow-ups (2026-05-22)

**Target:** `agents.brief_content` for the `marcus` row in mind/make OS.
The N8N workflow `Marcus | mind/make OS | Synthesis + Home Intelligence`
(id `TI1ozQbPtI69qlgO`) loads this prompt when synthesising.

## Why

Two upgrades:

1. The new central `customers` table tracks paid/free_signup/waitlist/churned
   across 6 products. Marcus should roll up the last 7 days into a
   `customer_signals[]` array on `home_intelligence` so the Control Center
   can render cross-product acquisition stats.
2. The `leads.follow_up_at` column now exists. Overdue follow-ups should
   surface as `external_signals[]` entries with `urgency='high'` so the
   Intel tab's hero card prompts Krish to act.

JSONB is schemaless — no DB migration needed.

## Patch — append to Marcus's brief_content

```markdown
## customer_signals[] — cross-product acquisition roll-up (2026-05-22)

Each Marcus synthesis run should query the central `customers` table and
emit a `customer_signals` array on `home_intelligence`. One entry per
product where there was any activity in the last 7 days. Schema:

```json
{
  "product":      "gutted|onalert|merciless|fractionl_circle|fractionl_pulse|mm_ctrl",
  "paid_added":   <int — paid rows where became_paid_at >= now - 7d>,
  "churned":      <int — churned rows where churned_at >= now - 7d>,
  "mrr_delta":    <number — sum(mrr_usd) of paid_added MINUS sum(mrr_usd) of churned>,
  "free_added":   <int — free_signup rows where signed_up_at >= now - 7d>,
  "top_source":   <string|null — most common `source` value among paid_added>
}
```

If a product had zero activity, omit it from the array (don't emit a row
with all zeros).

## external_signals[] — surface overdue lead follow-ups

When you produce `external_signals[]`, additionally include one entry per
overdue `leads.follow_up_at` (rows where `follow_up_at < now()` AND status
in `('ready','contacted','conversation')`). Shape each entry as:

```json
{
  "signal":             "Follow up: <full_name> — <company>",
  "source":             "Leads",
  "relevance":          "<lead.why_relevant or 'Lead awaiting next touch'>",
  "recommended_action": "<lead.next_step or 'Re-engage with a one-line update'>",
  "urgency":            "high",
  "days_until":         <int days, negative = past>,
  "event_id":           "<lead.id>"
}
```

Cap at 3 overdue follow-ups in `external_signals[]` so the lane stays
scannable; the Control Center has a dedicated Leads tab for the full list.
```

## Verify

After patching the brief, manually trigger the synthesis workflow:

```bash
curl -X POST \
  -H "X-N8N-API-KEY: $N8N_API_KEY" \
  "https://krishraja10101.app.n8n.cloud/api/v1/workflows/TI1ozQbPtI69qlgO/execute"
```

Then SQL:

```sql
SELECT id, customer_signals, external_signals
  FROM home_intelligence
 WHERE id = 'current';
```

`customer_signals` should be a JSON array (possibly empty if no activity
in 7d). `external_signals` should still contain its existing entries
plus up to 3 lead follow-up entries with `urgency='high'`.
