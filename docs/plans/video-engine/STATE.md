# Video Engine control surface

## Delivery state

- Status: approved visual contract, review-branch implementation complete; release verification in progress
- Canonical state route: `docs/plans/video-engine/STATE.md`
- First approval artifact: `docs/plans/video-engine/mock-mobile-magic-v1.html`
- Control Center base: `f25daafcbb2fda06416be0973ea40444d520d893`
- Video Studio base: `595609c7309df5e57c9d05781ee763340ccd1c97`
- Mindmake design base: `54ea43b9771d3b263718a4d40cecc68167b7a718`

The approved visual contract is locked at design commit `988dba0defe2d3b16d657af3956be8deb3408a61`. The approved mock has SHA-256 `0098E19D50E5B3AF23DF2CA6D02BF54BDDB7A836237756A0C5AA64FAFFBE03C9`.

After that approval, Krish explicitly reported that The Money of AI wordmark was too small to read and asked for a solution across all use cases. The original approved revision remains preserved at its commit and hash. The current review branch replaces the tiny double stack with a responsive official-artwork identity system and must receive visual re-review before release. The policy measures the complete letter-bearing pixels in the official Money and Built assets, not their padded image canvases. At 375px and 390px, both marks must remain fully contained, preserve at least 16 CSS px of high-contrast lettering, and retain at least 97% of their rendered letter-box width. Compact or dense layouts must move, delay, or allocate a larger identity beat rather than shrink the lettering below that floor. The horizontal official-artwork rail is the compact Control Center projection; the produced video retains the approved stacked identity beat whenever the collision-safe frame has room for it. The revised, not-yet-reapproved mock has SHA-256 `B429EA2F677BE12CDD4E1002FBB21A24DA25FB9E736E7F7B3C07EB5C88728D05`.

Krish approved the rendered first surface on 2026-09-04 with the exact unanchored reaction `i like`. It had already passed independent visual and interaction audits at 390 by 844, 360 by 800, and 375 by 667. This approval authorises implementation of the locked interaction surface on review branches. It does not authorise a production database migration, credential rotation, merge, or deployment.

## Locked approval record

- Approved artifact: `docs/plans/video-engine/mock-mobile-magic-v1.html`
- Artifact revision: `988dba0defe2d3b16d657af3956be8deb3408a61`
- Artifact SHA-256: `0098E19D50E5B3AF23DF2CA6D02BF54BDDB7A836237756A0C5AA64FAFFBE03C9`
- Approval date: 2026-09-04
- Exact reaction: `i like`
- Carry forward: video-first composition, directorial input, one real child candidate at a time, face-safe proof choreography, accessible Before and After comparison, one binary review decision, and immutable version lineage underneath.
- Preserve: voice, tap, typing, exact-parent binding, five blocking gates, return to parent, honest offline states, runner independence, and complete Compound exclusion.
- Do not infer: approval to deploy, merge, apply migrations, rotate credentials, post publicly, or widen the first vertical slice.

## Product truth

The Video Engine is a governed short-form production system. In the implemented first slice, an authorised operator explicitly projects a local job to Control Center, Control Center directs and reviews work, and a Windows runner performs media work. Google Drive discovery remains a later intake adapter. Codex is an optional editorial collaborator, not a runtime dependency.

The system optimises for honest qualified growth. It may challenge a weak idea, block unsafe work, and request a rerecord when the material is not strong enough.

## Source layers

1. Durable doctrine: root `AGENTS.md`, `docs/DESIGN_SYSTEM.md`, ADR-013, the Mindmake North Star and design contract, and the Video Studio architecture and contracts.
2. Current requirement: Content placement, mobile magic direction, an always-on runner, a whole-shell quality standard, and complete exclusion of Compound.
3. Existing product history: Content v2, the mobile Composer edit pattern, and the Video Studio immutable job and approval model.
4. External platform evidence: browser and native haptic support, service-worker notification support, and mobile accessibility guidance.
5. Obsolete constraint: Codex as the exclusive front door. Codex remains supported, but cannot be required for intake, processing, review, recovery, or approval.

## Hard non-goals

- No work in, import from, schema reference to, route to, event wiring with, test against, or deployment of `compound/`.
- No new top-level Control Center tab. Video Engine lives under Content.
- No browser-based master-media upload. Google Drive is the intake surface.
- No Premiere-style timeline editor.
- No raw media, full transcript, local file path, OAuth state, credential, or command output in the Control Center database.
- No public posting from the engine.
- No silent preference activation.
- No fake progress, fake preview, fake haptic, or silent rebasing of an edit onto a newer version.

## Surface dependencies

1. Secure command and projection contracts, private preview delivery, and runner identity.
2. Background Windows runner with startup recovery, leases, idempotency, reconciliation, and heartbeat.
3. Mobile magic reviewer inside Content.
4. Desktop evidence and comparison reviewer.
5. Review-ready notifications and runner-health states.
6. Whole-shell UX audit using the same primitives and vocabulary.

## Vertical slice

1. An existing reviewable proxy is selected in Content.
2. Krish directs a bounded change against its exact immutable version.
3. The command is stored durably. If the runner is unavailable, it remains visibly queued against that version.
4. The runner creates a child candidate and validates the blocking gates.
5. Mobile shows the affected passage, aligned Before and After views, and a plain-language change receipt.
6. Krish chooses `Use this version` or `Keep current`.
7. Activation changes the current pointer. It never overwrites history, and `Return to parent` remains available.

## First surface

A 390 by 844 mobile candidate review after one magic direction. The visible experience is directorial and fast. Immutable version lineage remains underneath the interface, with history available on demand rather than dominating the screen.

## Interaction contract

- Voice, typed instructions, and bounded recipes are equivalent inputs.
- Hold-to-speak and hold-for-Before are accelerators, never the only route.
- Direct touch targets are limited to deterministic engine-owned entities such as caption blocks, generated overlays, known speakers, and declared story beats.
- A candidate is always bound to its parent hash, instruction, selected range or target, and semantic-target-map version.
- The main review screen has one decision: use the candidate or keep the current version.
- Truth, rights, confidentiality, transcript fidelity, and naming are enforced before activation.
- Story edits invalidate dependent visual, render, QA, and package artifacts. The UI states this plainly.
- Android web may use vibration when supported. iOS web receives equally clear visual and motion feedback. Haptics never carry meaning by themselves.

## Runtime contract

The implemented Windows runner projects explicitly selected local jobs, claims cloud commands with leases and idempotency keys, writes signed local receipts, and recovers interrupted work from durable journals and locks. It can be installed as a background task with restart-on-failure behaviour only at the release gate.

It does **not** yet discover or watch a Google Drive inbox, wait for Drive file stability, deduplicate newly discovered media, or group camera split files. Those are later intake capabilities and must not be implied by the current UI or deployment documentation.

When the computer is off or Drive is unavailable, cloud decisions remain safe and visible as waiting. Local media processing resumes only when the machine and Drive are available. The interface must never imply otherwise.

## Security precondition

Connected command execution cannot launch until Video Engine mutations have a dedicated fail-closed operator guard, CSRF and same-origin protection for browser actions, a separate scoped runner credential, no wildcard CORS, no-store responses, rate limits, immutable audit receipts, and redacted database projections.

An unrelated legacy approval route contains an exposed credential-like value and permissive access behaviour. Its revocation and repair require a separate security change and explicit approval. The value must never be reused by Video Engine.

## Approval sequence

1. Krish reviewed and approved the rendered mobile surface without design rationale.
2. The accepted artifact revision and interaction choices are locked here.
3. Security boundaries and shared contracts are being implemented first.
4. The runner and one end-to-end vertical slice follow on review branches.
5. Later material surfaces remain paused until the mobile slice is implemented and verified.
6. Production activation, credential rotation, deployment, and merge remain separate explicit gates.

## Current handoff

- Outcome: the secure mobile reviewer, command plane, signed recovery bridge, private preview contract, and independent runner are implemented on review branches.
- Phase: independent audit, cross-repository verification, and Control Center-wide visual alignment.
- Current truth: the integration exists in code only. No production migration, private bucket, environment, deployment, background-task installation, Drive watcher, retention schedule, or proactive heartbeat has been activated.
- Locked: the approval record, interaction contract, blocking gates, runtime independence, and non-goals above.
- Authority: GitHub `main` remains canonical; implementation is reviewable branch work only.
- Risks: live database and Storage behaviour remain unverified; installation and credential configuration remain release-gated; the revised responsive wordmark needs visual re-review.
- Verification: contract, auth, idempotency, recovery, visual, short-viewport, accessibility, and exclusion tests are required before a release proposal.
- Next action: finish independent audits, verify the exact first slice against clean commits, and present a no-apply release checklist to Krish.
