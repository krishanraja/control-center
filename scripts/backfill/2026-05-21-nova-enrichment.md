# Backfill — Nova conference enrichment (2026-05-21)

**One-time job.** Populates the 12 existing `nova_target_conferences` rows
with audience/deadline/CFP/why-relevant via the new
`Nova | Conference Enrichment` workflow.

## Pre-check (state before run)

```sql
SELECT
  count(*)                                          AS total,
  count(*) FILTER (WHERE audience_size IS NOT NULL) AS enriched_audience,
  count(*) FILTER (WHERE deadline_at  IS NOT NULL)  AS enriched_deadline,
  count(*) FILTER (WHERE cfp_url      IS NOT NULL)  AS enriched_cfp
FROM nova_target_conferences
WHERE active = true;
```

Expected before run: `total = 12, enriched_* = 0` for all columns.

## Step 1 — import + activate the workflow

In N8N:

1. Open `Workflows → Import from File`.
2. Pick `scripts/n8n/nova-conference-enrichment.workflow.json` from this
   repo.
3. Attach credentials when prompted:
   - **Supabase account 2** (already exists in N8N).
   - **Anthropic Header** (already exists — used by other Sonnet nodes).
   - **Brave Search** — if you don't have one yet, create an
     `httpHeaderAuth` credential named `Brave Search` with header
     `X-Subscription-Token = <your Brave API key>` and attach.
4. Save. **Do not activate yet.**

## Step 2 — dry run

Open the workflow → click `Manual Trigger (backfill)` → `Execute Workflow`.
Watch the execution panel. Each row goes through `Brave Search → Sonnet
Extract → Parse → Supabase Patch`. Expect ~10s per row, ~2 minutes total
for all 12.

If a row's Sonnet response can't be parsed as JSON, the `Parse Sonnet JSON`
node silently emits `{ id }` only — the upsert becomes a no-op for that
row. Re-run the workflow to retry; Sonnet's output is non-deterministic.

## Step 3 — verify

```sql
SELECT
  count(*)                                          AS total,
  count(*) FILTER (WHERE audience_size IS NOT NULL) AS enriched_audience,
  count(*) FILTER (WHERE deadline_at  IS NOT NULL) AS enriched_deadline,
  count(*) FILTER (WHERE cfp_url      IS NOT NULL) AS enriched_cfp,
  count(*) FILTER (WHERE why_relevant IS NOT NULL) AS enriched_why
FROM nova_target_conferences
WHERE active = true;
```

Acceptance: at minimum `enriched_audience >= 8` AND `enriched_why >= 10`.
Conferences like SXSW, Cannes Lions, Web Summit have well-published
attendance numbers; obscure or stub rows may not enrich on the first
pass.

Spot-check 3 rows in the Control Center:

- AI Summit London
- Web Summit
- SXSW

Each card should now show audience + deadline + why-relevant + CFP CTA.

## Step 4 — activate the cron

Once spot-check passes, flip the workflow to **active**. The `Daily 6AM
UTC` cron will run nightly and re-enrich any row where `last_scraped_at`
is older than 30 days, plus any newly-inserted row.

## Roll-back

`UPDATE nova_target_conferences SET audience_size = NULL, audience_description = NULL, deadline_at = NULL, cfp_url = NULL, ticket_price_usd = NULL, format = NULL, location = NULL, why_relevant = NULL, relevance_score = NULL, recommended_next_step = NULL, last_scraped_at = NULL;`

That returns the table to the pre-backfill state. The cards revert to the
bare name fallback.
