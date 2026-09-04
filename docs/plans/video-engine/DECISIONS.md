# Video Engine design decisions

## D-001: Placement

Status: accepted in principle

Video Engine lives inside Content. It does not receive a seventh primary navigation tab. Queue items deep-link to the exact review request, and the reviewer may take over the viewport while open.

## D-002: Mobile magic model

Status: proposed for visual approval

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

Codex is not part of the execution path. A background Windows runner owns Drive intake, local processing, recovery, and cloud-command execution. Codex may still help with editorial judgement and can operate the same durable commands.

## D-004: Haptic honesty

Status: proposed

Haptic feedback is an enhancement. Android web uses supported vibration patterns. iOS web uses immediate visual and motion feedback. A future native iPhone shell may add native haptics without changing Video Engine commands or review state.

## D-005: Compound exclusion

Status: locked

Compound is outside this programme. No file, import, database schema, route, event, test, deployment, or design change in Compound is in scope. Repository-wide checks for Video Engine must explicitly preserve that boundary.

