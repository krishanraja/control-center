# N8N patch — extend lead extraction prompt with `attainability_score`, `icp_score`, `assignee_agent`

**Target workflow:** `Nell | mind/make OS | Lead Document Ingest`
(id `fUlQUlyZp1DRRwWT`)

## Why

Today the Sonnet extraction node emits `fit_score`, `tier`, `why_relevant`,
`primary_tension`. The `leads` schema also has `attainability_score`, `icp_score`,
and `assignee_agent` columns — they exist for a reason but are never
populated. The LeadCard surfaces all three when present (ICP chip, agent
lane assignment) so populating them unlocks UX value with zero schema
change.

## Patch

In the Sonnet extraction node's `messages[].content` (`Anthropic: Extract Leads`
or whichever node hits `api.anthropic.com/v1/messages`), append the
following to the system prompt and the expected output schema:

```diff
 Each row of the output JSON array must include:
 - full_name, email, linkedin_url, twitter_handle, company, title
 - fit_score (0-10): how well does the person fit our buyer profile
+- attainability_score (0-10): how reachable they actually are (warm intro
+  available, public email, active on LinkedIn = high; cold outreach to a
+  CEO = low)
+- icp_score (0-10): how cleanly the person matches the Mindmake ICP —
+  senior leader at a media / advertising / commerce org with budget
 - tier (A | B | C): pipeline priority bucket
 - why_relevant: one sentence on why Krish should care
 - primary_tension: the specific business problem we can solve
+- assignee_agent: choose ONE of {"felix","maya","nell","krish"} based on
+  who should own follow-up.
+  * felix  — enterprise advisory leads (mid-large companies, exec titles)
+  * maya   — product-acquisition prospects (smaller co, individual buyer)
+  * nell   — outbound list to nurture, not yet ready to pitch
+  * krish  — VIPs / personal-relationship leads only
 ```

Save. The Sonnet node will start emitting the four extra keys; the existing
`Upsert Leads` Supabase node already passes through `row.*` so they land in
the table without any node-graph change.

## Verify

Drop a test CSV through `LeadImportDropzone` in Control Center. After ~10s
the new row should have non-null values for `attainability_score`,
`icp_score`, AND `assignee_agent`. SQL:

```sql
SELECT full_name, fit_score, attainability_score, icp_score, assignee_agent
  FROM leads
 ORDER BY created_at DESC
 LIMIT 5;
```

## Roll-back

Revert the prompt diff. Newly-extracted rows fall back to the old shape.
Existing enriched rows keep their values (the columns stay populated).
