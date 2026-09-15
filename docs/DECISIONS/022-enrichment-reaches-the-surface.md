# ADR-022: Enrichment reaches the surface by trigger, not by convention

- **Status:** Accepted
- **Date:** 2026-09-15

## Context

1,700 Coresignal credits bought full LinkedIn profiles for 169 contacts. Measured
immediately afterwards:

| | |
|---|---|
| enriched contacts whose `contact_intelligence.updated_at` predated their own enrichment | 169 / 169 |
| whose `intel_doc` did not contain the headline that was bought | 130 |
| still `intel_method = 'rules_v1'` | 90 |

The last row is the sharpest: the Network tab was badging ninety people
*"thin evidence: their title and company were pattern-matched and no profile was
ever read"* while a complete profile sat in the same row.

`network_search` ranks on `intel_doc` (lexical, via the generated `intel_tsv`)
and on `embedding` (semantic). Neither was rebuilt. `follower_count` — the only
honest hub signal in the payload — sat in `contacts.raw`, an untyped jsonb
drawer that no query, no ranker and no component reads.

So the money bought data the system could not see.

## The root cause is not a forgotten line

Rebuilding `intel_doc` after writing facts was a **convention**. Every importer
had to remember it: `import-intelligence`, `import-circle`, `add-person`,
`enrich-person`, and the ad-hoc Coresignal collector. Conventions lose. The next
enrichment script would have lost too.

## Decision

**1. Enrichment facts are typed columns on `contact_intelligence`.**
`followers`, `headline`, `summary`, `current_title`, `current_company`,
`experience_count`, `enriched_source`, `enriched_at`. Typed because a value in
jsonb cannot be ranked, filtered, indexed or rendered without every reader
re-deriving it. On `contact_intelligence` rather than `contacts` for ADR-011's
reason: `contacts` carries `contacts_anon_select`, and these are private
assessments.

`followers`, not `connections_count`. LinkedIn caps the latter at 500 for its
"500+" display, so every consequential person maxes it out and it carries no
information. Measured on the first 169: followers averaged 10,526 and ranged
161–7,284; `connections_count` was 500 for nearly all of them.

**2. A trigger rebuilds `intel_doc` and marks the vector stale.**
`ci_rebuild_doc_and_score` fires on any write of a signal-bearing column,
recomposes the retrieval text, and sets `embed_stale` when that text actually
moved. An unrelated column update must not queue a paid embedding call.

**3. `embed_stale`, never a nulled embedding.** Nulling would drop the person
out of semantic recall for the window between enrichment and the re-embed job —
making search worse at the moment the data got better. A stale vector still
finds them on their old text. `scripts/network/reembed-stale.ts` closes the gap,
and clears the flag in the same write as the vector so a crash between the two
cannot leave a row claiming freshness it does not have.

**4. `completeness`, 0–100, on every contact.** Weighted by what makes someone
ACTIONABLE, not by how many fields are populated: a profile URL you can click
(25) outranks a bio you cannot act on (15). Freshness decays — a title collected
two years ago is otherwise asserted as confidently as one collected today.

This is the number that lets the Control Center say what is missing, what a
given spend would buy, and what actually improved after a run.

## Consequences

- The 169 now average **94/100**; none is badged thin evidence. "Amazon audio
  business development" returns Larry Linietsky first at 70.6, which it could
  not do before the re-embed.
- First honest read of network health: warm averages 56 with **153 of 359 below
  50**; the 1,045 Circle members average 38 with **zero** strong records — they
  hold URLs but nothing has been read about them.
- Future enrichment reaches search whether or not its author thinks about it.
  That is the whole point.
- `contacts.raw` keeps the provider payload as provenance, but stops being the
  place facts live.
