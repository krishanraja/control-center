# COMPOUND dashboard design brief

- Revision: DB-002
- Date: 2026-08-06
- Materiality: material first surface
- Approval state: V1 visual direction retained; V2 language revision in progress

## State of use

Krish opens COMPOUND one-handed in the morning, often distracted. The surface must answer three questions in ten seconds: what changed, what needs attention, and whether anything deserves capital. Evidence can take up to two minutes to inspect.

## User and action

One private investor decides whether to hold, investigate, compare or leave capital undeployed. The application never executes a trade.

## Governing rule

Signal over feed. Quiet days stay quiet. Every call names its evidence, strongest countercase, numeric falsifier and governing horizon. Missing or stale data is visible at the point where it weakens a conclusion.

## Zero-context language contract

- Assume the reader has never invested and does not know trading language.
- Say what happened, why it matters and what to do in ordinary words.
- Show full company and coin names before any ticker symbol.
- Replace unexplained terms such as capital, thesis, correlation, review gate, falsifier, feed, vertical, P/E and deployment case.
- Explain the dial where it appears: bigger slice means more money; yellow means something changed.
- Keep the recommendation direct, but do not hide missing or late data.

## Required information

1. Persistent 3 month and 1 year horizon control.
2. One-sentence Today verdict.
3. Concentration, crypto share, cash and correlated exposure.
4. Needs attention, only when evidence changed.
5. Zero to three recommendations.
6. Position thesis health.
7. Hot and cold vertical transitions.
8. Watchlist tier movement.
9. Freshness and per-feed health.

## Data truth range

- Representative: all core feeds present, one position straining, one recommendation.
- Quiet: no threshold crossed and no recommendation.
- Partial: one non-critical feed unavailable.
- Stale: latest successful snapshot older than the configured morning deadline.
- Error: current run failed and the previous successful snapshot remains visible.
- Adversarial: long company names, negative values, one unbroken source identifier and the maximum three recommendations.

## Visual constraints

- Mobile first, desktop uses the same information in two columns.
- Cool dark technical base with exactly one signal color.
- Monospace labels and metadata, plain sans-serif figures and sentences.
- No gradient mesh, glass cards, mascot, nested component scrollbars or Control Center visual reuse.
- Charts require accessible table equivalents.
- The page scrolls naturally and controls meet keyboard, focus, contrast and touch-target requirements.

## Authority and proof

Local concept documents and rendered mock artifacts are authorised. Frontend implementation waits for explicit visual approval. Production publication remains separately gated. Proof requires current mobile and desktop renders plus representative, quiet, partial and stale state checks.
