# Kick-off — first run of `Maya | Customer Acquisition Sweeper`

**One-time.** Seeds the central `customers` table from the 5 product
Supabase projects so the new Customers tab is populated immediately
rather than waiting on the daily cron.

## Pre-requisites

1. `scripts/migrations/2026-05-22-customers.sql` applied in Mindmaker OS.
2. `scripts/n8n/maya-customer-acquisition-sweeper.workflow.json` imported
   into N8N.
3. Five new N8N credentials of type `httpHeaderAuth`, each with header
   `apikey=<that project's anon key>`:
   - `Gutted Anon`           → `hzadscrqmyilbisexvyz`
   - `OnAlert Anon`          → `zcreubinittdqyoxxwtp`
   - `Merciless Anon`        → `cgkcplcamsijghalintq`
   - `Fractionl Circle Anon` → `ksyuwacuigshvcyptlhe`
   - `Fractionl Pulse Anon`  → `dtlcprcpvdomrehbejhw`
4. Each per-product `httpHeaderAuth` credential attached to the
   corresponding HTTP Request node in the workflow.

## Pre-check

```sql
SELECT count(*) FROM customers;
```

Expected: 0.

## Run

In the N8N workflow editor for `Maya | Customer Acquisition Sweeper`:

1. Click `Manual Trigger` → `Execute Workflow`.
2. Wait ~30 seconds for all five upstream fetches + the normalise step
   + upsert.

## Verify

```sql
SELECT product,
       count(*)                              AS total,
       count(*) FILTER (WHERE kind='paid')   AS paid,
       count(*) FILTER (WHERE kind='free_signup') AS free_signups,
       count(*) FILTER (WHERE kind='waitlist')    AS waitlist,
       count(*) FILTER (WHERE kind='churned')     AS churned
  FROM customers
 GROUP BY product
 ORDER BY product;
```

Acceptance (give or take a row from dedupe — emails reused between
projects merge by `(product, lower(email))`):

| product            | total | paid | free_signups | waitlist | churned |
| ------------------ | ----- | ---- | ------------ | -------- | ------- |
| gutted             | 2     | 0    | 2            | 0        | 0       |
| onalert            | 4     | 0    | 4            | 0        | 0       |
| merciless          | 0     | 0    | 0            | 0        | 0       | <- user_subscriptions empty
| fractionl_circle   | 8     | 1    | 0            | 0        | 7       |
| fractionl_pulse    | 3     | 0    | 0            | 3        | 0       |

Open Control Center → Customers tab. The hero card should be empty
("no activity yet" — no Stripe paid events have been received in 7d
since the webhook patches just landed). Per-product FeedCards should
render with the expected counts.

## Activate the cron

Once spot-check passes, flip the workflow to **active**. The Daily 7AM
UTC cron re-syncs nightly so any new signups or churn lands within 24h
of the source table change.

## Roll-back

`DELETE FROM customers WHERE created_at < now();`

This clears the sweeper-seeded rows but leaves Stripe-webhook-seeded
rows in place (the latter have non-null `stripe_customer_id` and were
inserted with `kind='paid'` immediately).
