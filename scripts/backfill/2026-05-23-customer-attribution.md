# Backfill — populate `customers.attribution_*` for existing rows

**One-off.** New rows post-merge get attribution from the Stripe webhook patch. Existing rows have no attribution. This SQL backfills both by matching emails to leads.

## Run

```sql
-- Match each paid customer to its most recent matching lead by email.
WITH best_lead AS (
  SELECT DISTINCT ON (lower(l.email))
         lower(l.email)        AS email_lower,
         l.id                  AS lead_id,
         l.promoted_task_id    AS task_id,
         l.assignee_agent
    FROM leads l
   WHERE l.email IS NOT NULL
   ORDER BY lower(l.email), l.created_at DESC
)
UPDATE customers c
   SET attribution_lead_id     = b.lead_id,
       attribution_task_id     = b.task_id,
       attribution_channel     = coalesce(c.attribution_channel,
                                          'agent:' || coalesce(b.assignee_agent, 'unknown')),
       attribution_confidence  = 'exact_email'
  FROM best_lead b
 WHERE c.email IS NOT NULL
   AND lower(c.email) = b.email_lower
   AND c.attribution_lead_id IS NULL;

-- Stamp unattributed paid rows so the ROI panel buckets them correctly.
UPDATE customers
   SET attribution_channel     = coalesce(attribution_channel, source, 'organic'),
       attribution_confidence  = coalesce(attribution_confidence, 'utm')
 WHERE kind = 'paid'
   AND attribution_lead_id IS NULL
   AND attribution_channel IS NULL;
```

## Verify

```sql
SELECT kind,
       count(*) FILTER (WHERE attribution_lead_id IS NOT NULL)       AS via_lead,
       count(*) FILTER (WHERE attribution_channel = 'organic')       AS organic,
       count(*) FILTER (WHERE attribution_confidence = 'unattributed') AS unknown
  FROM customers
 GROUP BY kind
 ORDER BY kind;
```

Expected: every `kind='paid'` row has either `attribution_lead_id` set or `attribution_channel` set (no `unattributed` paid rows).

## Roll-back

```sql
UPDATE customers SET
  attribution_lead_id    = NULL,
  attribution_task_id    = NULL,
  attribution_channel    = NULL,
  attribution_confidence = NULL;
```
