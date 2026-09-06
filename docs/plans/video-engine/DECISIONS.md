# Video Engine design decisions

## D-001: Placement

Status: accepted in principle

Video Engine lives inside Content. It does not receive a seventh primary navigation tab. Queue items deep-link to the exact review request, and the reviewer may take over the viewport while open.

## D-002: Mobile magic model

Status: approved and locked on 2026-09-04

Three distinct interaction models were generated and assessed independently. Both reviewers selected immutable parent-child versions as the safest architecture. Both recommended that version machinery stay mostly invisible while a directorial instruction remains the visible entry point.

The synthesis is:

- Direct one bounded change with voice, typing, or a recipe.
- Bind it to an exact parent and affected passage.
- Create one real child candidate.
- Compare Before and After on the affected passage.
- Show a concise receipt and all blocking-gate results.
- Use the candidate or keep the current version.
- Retain an auditable return path.

Direct manipulation is offered only for reliable engine-owned targets. The interface never pretends it can understand an arbitrary tap on a moving frame.

## D-003: Runtime independence

Status: accepted requirement

Codex is not part of the execution path. A background Windows runner owns local processing, recovery, and cloud-command execution. Phase one accepts explicitly projected jobs. Google Drive discovery, file-stability checking, deduplication, and split-file grouping remain later intake work. Codex may still help with editorial judgement and can operate the same durable commands.

## D-004: Haptic honesty

Status: approved and locked on 2026-09-04

Haptic feedback is an enhancement. Android web uses supported vibration patterns. iOS web uses immediate visual and motion feedback. A future native iPhone shell may add native haptics without changing Video Engine commands or review state.

## D-005: Compound exclusion

Status: locked

Compound is outside this programme. No file, import, database schema, route, event, test, deployment, or design change in Compound is in scope. Repository-wide checks for Video Engine must explicitly preserve that boundary.

## D-006: Approved mobile composition

Status: amended by explicit legibility feedback on 2026-09-04

The approved first surface is video-first. Presenter framing, treated captions, supporting proof, and change receipts are choreographed as one composition. Evidence appears within the video without needlessly replacing the presenter and must use face-aware placement. Before and After remain available through an accessible segmented control and hold gesture. The primary choice is `Keep current` or `Use this version`.

The original compact double-stack identity was explicitly found too small after approval. It is superseded by a responsive official-artwork system. The system measures the complete letter-bearing pixels in each official series asset rather than treating the padded outer image box as legibility. The Money of AI and Built With AI must each remain fully contained at 375px and 390px, with at least 16 CSS px of high-contrast lettering and at least 97% of the rendered letter-box width visible. Compact or dense placements must preserve that floor by moving, delaying, or allocating a larger identity beat; they must never solve a collision by shrinking the series lettering below it. Placement is selected from collision-free safe regions, and the identity may collapse to a compact official Mindmake anchor only after the readable series identity has been established. The horizontal official-artwork rail is the compact Control Center projection; the produced video retains the approved stacked identity beat whenever a collision-safe frame can hold it.

Approval evidence is the exact reaction `i like` against design commit `988dba0defe2d3b16d657af3956be8deb3408a61` and mock SHA-256 `0098E19D50E5B3AF23DF2CA6D02BF54BDDB7A836237756A0C5AA64FAFFBE03C9`.

## D-007: Honest magic-edit boundary

Status: locked implementation constraint

Deterministic recipes and direct manipulation operate only on engine-owned targets. Free-form instructions are compiled into schema-constrained operations before media work begins. If an instruction changes spoken meaning, claims, evidence, story structure, or another protected invariant, the runner returns `requires_editorial_route` instead of pretending to complete it. An unavailable runner or compiler produces a durable waiting state, never a fabricated After preview.
