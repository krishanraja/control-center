# ADR-021: The LinkedIn button is unconditional, and says which kind it is

- **Status:** Accepted
- **Date:** 2026-09-14

## Context

Krish's requirement for the Network tab, in his words: for every contact he must
be able to tell **where he knows them from**, get to their **LinkedIn profile in
one click — mandatory**, and reach **email or social in one click** where an
address exists.

Measured against the corpus on the day this was written, none of the three held:

| | |
|---|---|
| contacts | 10,768 |
| with a LinkedIn URL | 4,941 (46%) |
| with an email | 5,933 |
| `origin_channel = 'network_intelligence'` | 8,295 |
| `origin_campaign = 'network_intelligence_2026_08'` | 8,297 |
| `first_met_context` that is an enrichment blob, not a note | 639 |

Provenance *coverage* was 100% and provenance *value* was near zero: three
quarters of the network was labelled with the identifier of the import run that
loaded it, and the Cannes cohort carried 200-character MX-verification text in
the column meant to hold a memory cue. Neither reached a result row at all —
both were fetched per person, after the sheet opened.

Then 1,037 members of three Circle communities arrived, 365 of them with no
LinkedIn URL, and made the gap impossible to defer.

## The decision

**"One click to their LinkedIn" is a rendering guarantee, not a data target.**

No enrichment budget drives 5,827 missing profile URLs to zero. A promise that
depends on finishing that work is a promise that is false for more than half the
network for as long as the work runs, which is indefinitely. So the button is
always rendered, and is one of two things:

- the **profile**, when a URL is on file
- a **pre-filled LinkedIn people-search** on name + company otherwise, labelled
  "Find on LinkedIn", rendered dashed and quiet, sorted last, marked
  `speculative`, and never the primary action

The second is not a consolation. It lands on the person in one click for almost
anyone with a name and an employer. What it must never do is read as a verified
identity, because the failure that costs a relationship is Krish opening a
message believing a profile was confirmed when it was inferred from a name.

The same reasoning governs the 150 pattern-guessed email addresses that came in
with the Circle rosters. Krish's ruling was to surface them; they are surfaced,
labelled "unverified — may bounce", kept out of `email_normalized` so no bulk
path can ever read them, and ranked **below** a verified LinkedIn profile.
Certainty outranks channel preference: email is the better channel and a guess is
still an email, so without an explicit rule the guess becomes the highlighted
button — the one tapped without reading.

**Provenance is a decision about which column answers the question, not a
formatter.** `contactProvenance` prefers a campaign only when it reads like a
room a person typed, rejects machine slugs (`network_intelligence_2026_08`),
falls back to the channel in human words, and says "Unknown source" out loud
rather than implying a shared context that does not exist.

## Consequences

- `network_search` returns four more columns (`twitter_handle`,
  `origin_channel`, `origin_campaign`, `first_met_context`). Projection only —
  no filter, scoring or signature change. The sheet no longer waits on
  `/api/network/person/:id` to render an X button.
- Every result row now carries a provenance chip and up to two reach buttons.
- The Circle 1,037 land as `origin_channel = 'community'` with the community as
  `origin_campaign`, at `consent_tier = 'permissioned'` (Krish's ruling: shared
  community membership counts as opt-in context). The risk of treating
  co-members of rooms he is *in* as permissioned was raised and he held the
  position; it is recorded here rather than argued.
- `scripts/network/backfill-linkedin.ts` converts search fallbacks into real
  profiles over time, warm tiers first, stopping at the first `blocked_quota`.
  The fallback means that work is never blocking.
