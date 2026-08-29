# Marcus prompt patch — addendum (2026-05-21)

Follow-up to `marcus-prompt-patch-2026-05-22.md` after applying it to live
revealed two implementation gaps and one design gap.

## Gap 1: schema missing the column

The brief asked Marcus to emit `customer_signals[]` on `home_intelligence`,
but that column didn't exist (the table only had `external_signals` jsonb).
Patched by `scripts/migrations/2026-05-21-home-intelligence-customer-signals.sql`.

## Gap 2: workflow nodes didn't pass `customer_signals` through

Marcus's N8N workflow `TI1ozQbPtI69qlgO` (`Marcus | mind/make OS | Synthesis
+ Home Intelligence`) had three nodes that needed updates so the LLM-emitted
field actually persisted:

- **`Build Prompt`** — the JSON schema the LLM is instructed to emit listed
  only `home_summary`, `home_metrics`, `home_external_signals`. Appended
  `home_customer_signals` to that schema so the model knows the shape.
- **`Parse LLM Response`** — the code extracted `parsed.home_external_signals`
  but not the new key. Added:
  ```js
  const homeCustomerSignals = Array.isArray(parsed.home_customer_signals)
    ? parsed.home_customer_signals : [];
  ```
  …and included `home_customer_signals: homeCustomerSignals` in the return.
- **`Write to Supabase`** — `homePayload` had no `customer_signals` key.
  Added `customer_signals: d.home_customer_signals || []`.

## Gap 3 (the real one): the LLM has no DB tool

The brief tells Marcus to "query the central `customers` table" and to
"surface overdue `leads.follow_up_at`" — but Marcus is a one-shot synthesis
LLM call, not a tool-augmented agent. The model has no way to query
Supabase. Asking it for these counts produced placeholder zeros.

**Fix:** compute both signals deterministically in the `Write to Supabase`
node *before* upserting. Two extra `__httpRequest` GETs (using the existing
service-role key) feed two reducers:

- `computedCustomerSignals` — groups `customers` rows updated in the last 7d
  by product, emits one entry per product with `paid_added`, `churned`,
  `mrr_delta`, `free_added`, `top_source` (mode of `source`).
- `overdueLeadSignals` — fetches up to 3 leads where `follow_up_at < now()`
  and `status IN ('ready','contacted','conversation')`, shaped into the
  `external_signals` entry format with `urgency='high'` and `days_until`
  (negative for past).

Then `homePayload` uses the merged values:

```js
external_signals: [...overdueLeadSignals, ...(d.home_external_signals || [])],
customer_signals: computedCustomerSignals.length
  ? computedCustomerSignals
  : (d.home_customer_signals || []),
```

The LLM's emission becomes a fallback path for `customer_signals` (in case
the deterministic fetch fails); the LLM-emitted `home_external_signals`
still flows through and gets *prepended* with overdue lead entries.

## Verification

After re-running synthesis once (`exec 5650`):

```sql
SELECT jsonb_array_length(customer_signals) AS cs,
       jsonb_array_length(external_signals) AS es
  FROM home_intelligence WHERE id = 'current';
-- cs=2 (the two products with 7d activity), es=3 (1 overdue lead + 2 LLM signals)
```

The `cs=2` rather than `cs=6` is correct: only `fractionl_circle` and
`fractionl_pulse` had activity in the seeded data window. Products with no
7d activity are omitted, matching the brief's rule.

## Roll-back

If you want to revert to the LLM-only behaviour:

1. Drop the deterministic block between the comment markers `// === Compute
   customer_signals…` and `// === end deterministic signals ===` in the
   `Write to Supabase` node.
2. Restore `external_signals: d.home_external_signals,` and
   `customer_signals: d.home_customer_signals || [],` in `homePayload`.
3. Optional: drop the column with `ALTER TABLE home_intelligence DROP COLUMN
   customer_signals;` (or leave it — empty arrays don't hurt).
