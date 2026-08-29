# N8N patch — surface Podchaser results in the Visibility lane

**Target workflow:** `Nova | mind/make OS | Closed-Loop PR Engine`
(id `hCbvRXoGWaqG1Znx`)

**Prerequisite migration:** `scripts/migrations/2026-05-21-podchaser-podcasts.sql`
must be applied first. The new nodes upsert into that table.

## Why

The PR Engine searches Podchaser, ranks shows via Haiku, enriches host
contact via Apollo, drafts pitches via Sonnet, and writes everything into
`contacted_persons` + `audit_log`. **It never writes podcasts into a table
the Control Center can read.** That's why no Podchaser podcasts ever show
up in the Visibility lane regardless of whether the API works.

This patch adds **3 parallel taps** to the existing flow. They run alongside
the email pipeline (do not replace it). Each tap upserts data into
`podchaser_podcasts` keyed by `podchaser_id` so re-running is idempotent.

## Tap 1 — base podcast row (after `Map Podchaser Search`)

Add an HTTP Request node `Supabase: Upsert Podchaser Podcast`:

```json
{
  "name": "Supabase: Upsert Podchaser Podcast",
  "type": "n8n-nodes-base.httpRequest",
  "parameters": {
    "method": "POST",
    "url": "https://gojpffsrxybbpbdzzrvs.supabase.co/rest/v1/podchaser_podcasts?on_conflict=podchaser_id",
    "sendHeaders": true,
    "headerParameters": {
      "parameters": [
        { "name": "Prefer", "value": "resolution=merge-duplicates,return=representation" },
        { "name": "Content-Type", "value": "application/json" }
      ]
    },
    "sendBody": true,
    "specifyBody": "json",
    "jsonBody": "={{ JSON.stringify({ podchaser_id: String($json.id), title: $json.title, author: $json.author, web_url: $json.webUrl, description: $json.description, number_of_episodes: $json.numberOfEpisodes, last_scraped_at: new Date().toISOString() }) }}",
    "authentication": "predefinedCredentialType",
    "nodeCredentialType": "supabaseApi"
  },
  "credentials": {
    "supabaseApi": { "name": "Supabase account 2" }
  }
}
```

Wire it as a sibling of the current `Map Podchaser Search → …` edge:

```
Map Podchaser Search ─┬─► Split Podcast Results ─► (existing path)
                      └─► Supabase: Upsert Podchaser Podcast ─► (no-op)
```

## Tap 2 — latest episode + fit score (after `Haiku: Filter Podcast Quality`)

Add an HTTP Request node `Supabase: Patch Podcast Enrichment`. Source the
podchaser_id from upstream `$json.id` and write the Haiku output fields:

```json
{
  "name": "Supabase: Patch Podcast Enrichment",
  "type": "n8n-nodes-base.httpRequest",
  "parameters": {
    "method": "PATCH",
    "url": "=https://gojpffsrxybbpbdzzrvs.supabase.co/rest/v1/podchaser_podcasts?podchaser_id=eq.{{ String($json.id) }}",
    "sendHeaders": true,
    "headerParameters": {
      "parameters": [
        { "name": "Prefer", "value": "return=minimal" },
        { "name": "Content-Type", "value": "application/json" }
      ]
    },
    "sendBody": true,
    "specifyBody": "json",
    "jsonBody": "={{ JSON.stringify({ fit_score: $json.fit_score ?? null, why_relevant: $json.why_relevant ?? null, recommended_next_step: $json.recommended_next_step ?? null, latest_episode_title: $json.latestEpisodeTitle ?? null, latest_episode_summary: $json.latestEpisodeSummary ?? null, latest_episode_date: $json.latestEpisodeDate ?? null }) }}",
    "authentication": "predefinedCredentialType",
    "nodeCredentialType": "supabaseApi"
  },
  "credentials": {
    "supabaseApi": { "name": "Supabase account 2" }
  }
}
```

Wire it downstream of `Haiku: Filter Podcast Quality` (and its Gemini
fallback). It runs on every podcast that Haiku scored.

## Tap 3 — host contact (after `Apollo: Enrich Host Email`)

Add `Supabase: Patch Podcast Host`:

```json
{
  "name": "Supabase: Patch Podcast Host",
  "type": "n8n-nodes-base.httpRequest",
  "parameters": {
    "method": "PATCH",
    "url": "=https://gojpffsrxybbpbdzzrvs.supabase.co/rest/v1/podchaser_podcasts?podchaser_id=eq.{{ String($json.podcast_id ?? $json.id) }}",
    "sendHeaders": true,
    "headerParameters": {
      "parameters": [
        { "name": "Prefer", "value": "return=minimal" },
        { "name": "Content-Type", "value": "application/json" }
      ]
    },
    "sendBody": true,
    "specifyBody": "json",
    "jsonBody": "={{ JSON.stringify({ host_email: $json.email ?? null, host_linkedin: $json.linkedin_url ?? null }) }}",
    "authentication": "predefinedCredentialType",
    "nodeCredentialType": "supabaseApi"
  },
  "credentials": {
    "supabaseApi": { "name": "Supabase account 2" }
  }
}
```

If the Apollo node's output doesn't carry `podcast_id`, propagate it through
`Map Podchaser Search` so the join-back works. Easiest: in `Map Podchaser
Search`, set `item.json.podcast_id = item.json.id` for every output row.

## Idempotency

Every tap upserts by `podchaser_id`. Re-running the PR Engine on the same
day is safe — rows update in place, `updated_at` re-touches, no duplicates.

## Test

Apply migration + tap 1 + tap 2 + tap 3, then run a P1 path:

```bash
curl -X POST \
  -H "X-N8N-API-KEY: $N8N_API_KEY" \
  "https://krishraja10101.app.n8n.cloud/api/v1/workflows/hCbvRXoGWaqG1Znx/execute"
```

Then verify with SQL:

```sql
SELECT
  count(*)                                       AS total,
  count(*) FILTER (WHERE fit_score IS NOT NULL)  AS scored,
  count(*) FILTER (WHERE host_email IS NOT NULL) AS with_email
FROM podchaser_podcasts;
```

Should be ≥ 10 rows, most scored, several with host_email. Refresh the
Control Center → Visibility lane → rose-bordered "podcast target" cards
appear above the conference cards.

## Roll-back

Delete the 3 new nodes from the workflow. The `podchaser_podcasts` table
keeps any rows already inserted; the UI just stops seeing fresh writes.
You can also `DELETE FROM podchaser_podcasts` to clear the table without
dropping it.
