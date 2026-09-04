# Video Engine control surface

## Delivery state

- Status: awaiting Krish visual approval
- Canonical state route: `docs/plans/video-engine/STATE.md`
- First approval artifact: `docs/plans/video-engine/mock-mobile-magic-v1.html`
- Control Center base: `f25daafcbb2fda06416be0973ea40444d520d893`
- Video Studio base: `595609c7309df5e57c9d05781ee763340ccd1c97`
- Mindmake design base: `d3905dfe8da6fc4bf7178d872fdad777ead715cc`

No production UI, database, runner, or deployment change is authorised by this design branch.

The rendered first surface has passed independent visual and interaction audits at 390 by 844 and 375 by 667. The next gate is Krish's unanchored reaction to the surface itself.

## Product truth

The Video Engine is a governed short-form production system. Google Drive starts intake, Control Center directs and reviews work, and a Windows runner performs media work. Codex is an optional editorial collaborator, not a runtime dependency.

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

The Windows runner will be installed as a background task or service with restart-on-failure behaviour. It watches and periodically reconciles the agreed Google Drive inbox, waits for file stability, hashes and deduplicates media, groups camera split files, and claims cloud commands with leases and idempotency keys.

When the computer is off or Drive is unavailable, cloud decisions remain safe and visible as waiting. Local media processing resumes only when the machine and Drive are available. The interface must never imply otherwise.

## Security precondition

Connected command execution cannot launch until Video Engine mutations have a dedicated fail-closed operator guard, CSRF and same-origin protection for browser actions, a separate scoped runner credential, no wildcard CORS, no-store responses, rate limits, immutable audit receipts, and redacted database projections.

An unrelated legacy approval route contains an exposed credential-like value and permissive access behaviour. Its revocation and repair require a separate security change and explicit approval. The value must never be reused by Video Engine.

## Approval sequence

1. Krish reviews the rendered mobile surface without design rationale.
2. The accepted artifact revision and interaction choices are locked here.
3. Security boundaries and shared contracts are implemented first.
4. The runner and one end-to-end vertical slice are implemented.
5. Mobile and desktop surfaces are implemented one material surface at a time.
6. Production activation, credential rotation, deployment, and merge remain separate explicit gates.
