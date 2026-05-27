# Nova Visibility Deep Enrich — patch notes (2026-05-26)

Workflow id `kbHAHuxfzQLLlysG`. Two surgical changes so URL fields persist through enrichment.

## What was wrong

The `Patch Target` HTTP node wrote back every enrichment field except the three URL fields (`event_url`, `cfp_url`, `source_url`). The Sonnet prompt did not explicitly ask for canonical URLs either. The net effect: when a row entered enrichment without an event URL (every migration-stub row, plus three Nova-fresh rows that had only a source URL stripped during normalization), it left enrichment without one.

That was the root cause of the visible "VentureBeat Transform card has no link" symptom Krish flagged. The migration-stub text was overwritten with real enrichment content, but no URL ever populated.

## What changed

### `Patch Target`

JSON body now includes `event_url`, `cfp_url`, `source_url` (all coalesce to null when the model doesn't produce them).

### `Sonnet Enrich`

Prompt body wrapped with a `URL_FIELDS_INSTRUCTION` addendum that explicitly asks for the canonical event URL, CFP URL, and a fallback source URL — but only when the value is grounded in the Brave research passed in. No hallucinated URLs.

## Combined with the script-based backfill

`scripts/backfill-visibility-stubs.ts` (PR 4) rescued the 4 migration-stub rows by hand. A second-pass backfill (not committed; ad hoc helper) populated URLs on 3 enriched-but-URL-less rows (AI Engineer World's Fair, VentureBeat Transform, AI Week Cincinnati). After both runs, all 19 visibility_targets in the live DB have at least one URL set.

Going forward, any new row entering Deep Enrich without a URL will receive one from the enrichment pass itself.
