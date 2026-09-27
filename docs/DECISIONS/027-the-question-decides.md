# ADR-027: In a network search, the question decides and the relationship adjusts

- **Status:** Proposed. Migration `20260927160000` is written and measured, not yet applied to production.
- **Date:** 2026-09-27

## Context

Krish, 2026-09-27: "the way my network scores against searches is terrible,
and with terrible reasoning. We did a huge expensive enrichment job, why are the
results still so poor?"

Measured on production that day. The enrichment itself worked: 2,478 profiles
were read, each with a headline, a summary, about six past roles and twelve
skills. Search did not use what it bought, and in three places it was made
worse by it.

| Fault | Measured |
|---|---|
| `tier_weight` on two scales: the import wrote 0-100, the enrichment wrote 1-3 | all 2,478 enriched people weighted 2 or 3, below the 15 a cold lead carries; 418 of them core network |
| enrichment re-tiered people by provider count | 67 people with a reciprocated email thread lost tier 1 |
| enrichment wrote its own seniority words | 2,411 rows the planner's seniority constraint could never match |
| career and skills stored where nothing ranks | 0 of 2,478 enriched docs contained a past role |
| the index led with the model's judgment | for 1,481 people "AI" appeared only in that judgment, often negated; 3,290 of the 5,229 docs matching "data" matched a placeholder |
| the score added five terms, two of which ignore the question | "retail media adtech": ranks 2 to 8 had query relevance under 0.04 and outscored matches at 0.68 and 0.80 |
| the keyword window kept the first thousand matches in physical order | a lottery for any common word |
| the explanation pass saw no enriched facts and covered 12 of 25 rows | rows 13 to 25 showed a stored judgment, 805 of which still name a retired venture |

## Decision

1. **The question decides; the relationship adjusts.**
   `score = Q x (0.65 + 0.35 R)`, where Q is semantic, keywords and (when
   present) constraints, and R is relationship and actionability. Among people
   who answer the question equally, the one Krish knows ranks higher, by up to
   about a third. Someone who does not answer it cannot be carried up by warmth.
   Recommend mode, which has no question, ranks on R as before.
2. **The index holds facts about the person, never opinions about them.**
   `why_them`, `hook` and `risk` stay on the row for the sheet and the
   explanation pass and are no longer matched against. Career and skills are.
3. **One vocabulary and one scale per field, enforced by the trigger.**
   `tier_weight` is derived from `network_tier`; seniority and channel are
   normalised onto the planner's words; a reciprocated email pins tier 1. The
   planner exports the vocabularies and the enrichment prompt reads them.
4. **Every row on screen gets a reason for this question**, from the facts
   first.

## Consequences

- Measured before and after on six questions, keywords only (no embedding was
  generated for the test): results with query relevance under 0.15 in the top
  ten fell from 8 of 60 to 2 of 60, and enriched people in the top ten rose from
  17 of 60 to 57 of 60. "Who used to work at Google" now finds former Googlers
  through the career line.
- The index is shorter, not longer: enriched docs average 940 characters
  against 1,017, the rest 121 against 418, so the timeout budget set by
  `20260915250000` is untouched. The ordered keyword window measured 140ms for a
  five-word query matching 9,341 rows.
- People nobody enriched now match on a thinner text (what they do, title,
  company, place). Some lose recall they had through the judgment's wording: a
  reciprocated contact who runs a retail media network fell from third to
  outside the top ten for "retail media" on keywords alone, outranked by people
  with those words in their title. The semantic tier recovers part of that, and
  the rest is the case for enriching the remaining 78%.
- Enriched people dominate result lists. That follows from their records being
  complete, not from a bonus, and it is the right way round.
- The explanation pass costs one extra model call per search when more than
  twelve rows are shown.
- `scripts/network/probes.sql` P10 to P12 assert the invariants and were
  confirmed to fail on the pre-migration data.
