# COMPOUND concept trace

- Sanitized brief: `DESIGN_BRIEF.md` revision DB-001
- Surface: daily dashboard
- Human review state: V1 reviewed; same-spine copy revision 1 in progress

## Round 1

Independent generators:

- G-A: Morning Ledger
- G-B: Change Ledger
- G-C: Capital Docket

### Distance check

The set failed conceptual-distance requirements before human review.

| Pair | Sequencing | Primary interaction | Information structure | State model | Result |
|---|---|---|---|---|---|
| G-A vs G-B | ordered daily changes | tap row to expand proof | continuous ledger | analytical plus review plus feed state | convergent |
| G-A vs G-C | ordered daily changes | tap line to expand proof | continuous ruled docket | materiality plus disposition plus feed state | convergent |
| G-B vs G-C | ordered daily changes | next unresolved plus inline proof | continuous ledger | review plus evidence integrity | convergent |

All three used the same governing structure: a vertically ordered change ledger with expandable evidence and a desktop proof column. Naming and detail varied, but sequencing, agency and state representation did not differ on two load-bearing axes.

### Verdict

Rejected before human review. No visual synthesis was created from this round.

### Round 2 target

Explore conceptual territory that is not a ledger, docket, feed, report, vertical findings list, card dashboard or selected-row detail pane. Preserve all product, data honesty, accessibility and implementation constraints from DB-001.

## Round 2

Independent generators:

- G-D: Capital Stress Field, navigated by an evidence lens
- G-E: Compound Dial, navigated by optional rotate, align and press
- G-F: Temporal Capital Field, navigated by a horizon time scrub

### Distance check

The set differs on at least two load-bearing axes per candidate:

| Candidate | Sequencing | Primary interaction | Information structure | State model |
|---|---|---|---|---|
| G-D | verdict -> pressure -> disturbances -> review verbs | slide evidence lens | deformable topology | stress, fracture and contour crossing |
| G-E | hub -> exposure mass -> ring breaks -> review gates | optional radial alignment plus direct tap | fixed concentric instrument | ring depth, segment state and trust gaps |
| G-F | verdict -> spatial cluster -> temporal path -> review vectors | time scrub plus vector selection | anchored gravitational field | mass, distance, trail and tier orbit |

The set is sufficiently diverse and materially distinct from the rejected ledger family.

## Independent judging

- J-1 ranked Compound Dial first at A-minus, Temporal Capital Field second at B-plus and Stress Field third at C-plus.
- J-2 ranked Temporal Capital Field first at B-plus, Compound Dial second at B and Stress Field third at C-plus.
- The winner disagreement triggered a blinded tiebreaker with candidates re-randomized and no prior verdicts.
- T-1 selected Compound Dial at A-minus, Temporal Capital Field at B-plus and Stress Field at C-plus.

### Selected synthesis: Compound Dial

Use the dial as a fixed, inspectable chassis. Rotation is optional and never required.

1. Keep the plain Today verdict, capital-review answer, active horizon and review-gate count permanently visible.
2. Exposure-ring angular width equals capital share.
3. Fixed clockwise anchors prevent layout movement from masquerading as market movement.
4. Thesis health, vertical transitions, watchlist tiers and feed trust use separate ring positions and explicit labels.
5. The outer change collar shows only material change.
6. Direct tap, previous and next controls, keyboard focus and a complete semantic table reach every object.
7. Each gate opens an Argument Balance with affected capital, evidence, countercase, numeric falsifier, current value, source, timestamp and freshness.
8. Gaps, dashes, patterns and text represent stale, partial and missing data. The single signal color remains reserved for review attention.
9. Dependent calls are withheld rather than quietly recomputed from incomplete inputs.

### Feasibility record

- Fixed SVG paths can deterministically encode every ring from the approved snapshot schema.
- Exposure width, thesis depth, transition state, tier state and freshness are direct data mappings, not simulated physics.
- A pure semantic table can consume the identical data objects and preserve keyboard and screen-reader order.
- Mobile uses the dial followed by the selected argument. Desktop reflows the same objects into two columns.
- Representative, quiet, partial and stale fixtures can be rendered without network access.

### Render target

- Artifact revision: COMPOUND-DASHBOARD-MOCK-V1
- Source: `mock-v1/index.html`
- States: representative partial data, quiet, stale
- Viewports: 390 by 844 and 1440 by 1000
- Approval state: awaiting Krish's first reaction

## V1 first reaction

Exact feedback:

> looks nice but the language needs to be friendlier, simpler, remove jargon and AI speak, I need to be able to know whats going on with zero prior context or knowlege of trading

- Root cause: copy and content contract.
- What stays: the Compound Dial visual direction, layout, hierarchy and interaction model.
- Same-spine revision count: 1.
- Required correction: every visible label and sentence must work for a person with no trading knowledge. Expand company names, replace unexplained finance terms, explain the dial in place and describe late data in ordinary language.
- Artifact revision: COMPOUND-DASHBOARD-MOCK-V2.
- Rendered evidence: `compound-mock-v2-mobile-partial.png`, `compound-mock-v2-desktop-partial.png`, `compound-mock-v2-mobile-quiet.png` and `compound-mock-v2-desktop-stale.png`.
- Verification: no horizontal overflow at 390 or 1440 pixels; time-period control and full-list control pass; representative, quiet and stale wording inspected in the rendered artifact.
- Approval state: awaiting Krish's first reaction to V2.
