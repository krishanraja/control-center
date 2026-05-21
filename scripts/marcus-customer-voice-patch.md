# Marcus prompt patch — `customer_voice[]` array (2026-05-23)

**Target:** `agents.brief_content` for the `marcus` row.

## Why

The Customer Compounding Engine logs every customer conversation to
`customer_contacts.summary`. Marcus can mine the last 7 days of those
summaries + recent `churn_reason` values + customer metadata notes to
surface themes. "5 paid users asked for SSO this week — ship it" is
the pattern.

## Append to brief_content

```markdown
## customer_voice[] — themes from customer conversations (2026-05-23)

Each synthesis run should query the last 7 days of `customer_contacts`
+ any `customers.raw.metadata.notes` and any Stripe feedback events.
Cluster the qualitative content into 3-7 themes. Emit on `home_intelligence`
as `customer_voice`:

```json
[
  {
    "theme": "<one-sentence theme — e.g. 'Users want SSO before paying'>",
    "mention_count": <int>,
    "sample_quote": "<one verbatim or near-verbatim line>",
    "products": ["gutted","onalert"],
    "recommended_response": "<what Krish should do — ship feature | pricing change | follow-up call | etc.>"
  }
]
```

Cap at 5 themes. Order by `mention_count` desc. Themes mentioned only
once should not appear (single anecdotes are noise — wait for pattern).

If `customer_contacts` is empty (pre-cadence), emit `customer_voice: []`
and recommend in `recommended_focus` that Krish hold 3 customer calls
this week.
```

## Verify

After patching, trigger the synthesis workflow once. SQL:

```sql
SELECT customer_voice FROM home_intelligence WHERE id='current';
```

Returns a JSON array (empty if pre-cadence).
