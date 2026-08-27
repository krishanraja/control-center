# Content Engine rewrite: brief vs production

Section 0 of the rewrite brief says to map its proposed names onto the real
Supabase schema rather than create parallel structures, and to read the live
schema before writing migrations. This is that read, taken 2026-08-26 against
the Mindmaker OS project. It is fact-finding only. No migration is written here,
because §9 Q1 blocks C1.

## What the brief calls a thing, and what production calls it

| Brief | Production today | Note |
|---|---|---|
| `arc` | `shifts` | Already has `id`, `headline`→`title`, `summary`, `implication`, `first_seen_on`→`opened_at`, `last_evidence_on`→`last_evidence_at`, `decision` |
| `arc.evidence[]` | `shift_evidence` | Already a real table with `(shift_id, occurred_on, headline)` unique. Carries `provenance` (lived/reconstructed), `citable`, `quarantine_reason` |
| `arc.lens` | `shifts.category` | CHECK: `model, economics, tools, orchestration, product, governance, security, org, proof` — the nine C2 deletes |
| `arc.channel` (built \| money) | **`shifts.lane`** (`built` \| `paid`) | **The channel column already exists.** C2's "keep the old keys as aliases" is satisfied by keeping `lane` and its two values, and relabelling only at the display layer |
| `arc.state` | `shifts.status` | CHECK: `proposed, active, fading, retired, library` — five states against the brief's seven |
| `arc.beats[]` | *nothing* | `momentum_history[]` holds `{week, momentum, day_span, source_count, recent_count}` — a metric series, not `{what_changed, delta_from_prior}`. New |
| `arc.state_history[]` | *nothing* | New |
| `arc.publishable_moments[]` | *nothing* | New |
| `arc.supersedes[]` | *nothing* | `scripts/consolidate-shifts.ts` merges by deletion, so merges are currently unrecoverable. New |
| `arc.disposition` | partially `content_decisions.status` | Now `pending, done, dismissed, archived` |
| the card queue | `content_decisions` | `kind` CHECK: `brief_review, shift_proposal, shift_fading, graduation, purge_preview, investigation` |
| `momentum` (to replace) | `shifts.momentum` int + `momentum_history` jsonb | |
| source `tier` / `class` / `vertical` | *nothing* | `content_ideas.source_type` is the nearest thing and is a provenance enum, not a tier |

## Four production facts the brief could not have known

**1. The channel split already exists and is half-populated.** `shifts.lane` holds
`built` 9, `paid` 21, **null 24**. So 44% of the register has no channel, and
C2's routing rule ("every candidate routes to exactly one, or is discarded") has
never been enforced. The aliasing §2 asks for is cheaper than expected: keep
`lane`, relabel at the display layer.

**2. No shift has ever been accepted.** `shifts.status` is `proposed` 19,
`fading` 19, `retired` 16 — **zero `active`, zero `library`** across 54 rows.
The state machine C4 replaces has never reached its own middle state. This is the
same finding as the zero rejections in `feedback_queue`: the ruling layer is not
underused, it is unused. It matters for C4 because there is no accepted-arc
behaviour in production to preserve or migrate.

**3. The corpus is exactly what C1 says it is, and the numbers are worse than
"deprioritise" implies.** `content_ideas.source_type` across 220 rows:
`inspiration_sweep` 117, `lane_sourcing` 56, `pool_headline` 43, `cleo_chat` 2,
`requested_research` 2. There is no filing, pricing-page, job-posting or
ad-market source class in production at all. C1 is not a re-weighting of tiers,
it is building a primary tier that does not exist yet.

**4. `content_ideas.source_type` is a CHECK, not a lookup.** Adding source
classes means a migration per class. If C1 lands, that column should become a
join to a `sources` table carrying `tier`/`class`/`vertical`, or the CHECK will
be edited on every corpus change.

## Where the brief's names should NOT be adopted

- **`arc` as a new table.** `shifts` + `shift_evidence` already carry the
  identity, the evidence with provenance and citability, and the merge target.
  Creating `arc` alongside them is the parallel structure §0 forbids. The state
  machine, `beats[]`, `state_history[]` and `supersedes[]` are additive columns
  on `shifts`.
- **`channel`.** `lane` exists, is populated, and is read by `ContentV2Tab`,
  `LaneRoom` and `laneOf()`. Renaming it touches the UI for no gain.

## Naming reconciliation raised, not fixed

§2 says the `content-corpus` skill names these lanes **Paid** and **Built**, the
brief names them **The Money of AI** and **Built with AI**, and that this needs a
governed update via `ctrl-capture` rather than an edit from this work. Recorded
here; not actioned. Note the data layer uses `paid`/`built`, matching the skill
rather than the brief, so the alias direction is: `lane` stays, labels change.

## Not started

C1 through C6. §9 Q1 gates C1, and C2–C6 depend on it.
