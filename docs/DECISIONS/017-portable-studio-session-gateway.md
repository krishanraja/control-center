# ADR-017: Portable Studio session gateway

- Status: Accepted
- Date: 2026-09-07
- Deciders: Krish Raja

## Context

Krish needs the Video and Carousel Studio to behave consistently from Control Center, Codex, Claude, and ChatGPT. Repository instructions can teach a client how to work, but they cannot prove that an action reached the engine or that feedback entered durable learning. Copying full third-party chat transcripts into Control Center would create a broad privacy boundary and still leave several competing sources of truth.

## Decision

Control Center exposes one fail-closed HTTPS MCP gateway backed by a client-neutral session contract. Every supported client opens a tracked session, uses the exact capabilities returned by the gateway, and records bounded structured actions with idempotency keys, artifact hashes, optional exact feedback excerpts, inferred rationale, confidence, scope, and confirmation state.

Supabase stores only safe session projections, append-only interaction events, and governed weekly learning proposals. It never stores whole third-party chat transcripts, raw media, full production transcripts, local paths, credentials, OAuth state, customer records, or command output. The Windows runner remains the only media executor, GitHub remains code authority, and Google Drive remains intake and approved-archive authority.

The first release uses a separate server-side bearer token for local Codex and Claude Code clients. Consumer ChatGPT and Claude.ai mutation access remains read-only and untracked until a dedicated OAuth connector is reviewed and released. No client may reuse the local bearer as a consumer connector secret.

Durable rules do not activate automatically. A weekly compiler may propose taste, performance, or engine-quality changes with evidence, counterexamples, and regression cases. Only Krish may approve a terminal decision, and code or configuration still follows its normal review and release path.

## Alternatives considered

- Store every chat transcript: rejected because it expands the privacy boundary and mistakes conversation for verified engine evidence.
- Keep separate memory per client: rejected because preferences would diverge and provenance would be lost.
- Treat repository connection as write authority: rejected because instructions do not authenticate an actor or guarantee event capture.
- Require the Windows runner for session capture: rejected because cloud review and feedback must remain available while the runner is offline.

## Consequences

- Positive: supported clients share one capability, feedback, and learning contract.
- Positive: action capture is explicit, bounded, idempotent, and attributable.
- Positive: engine learning stays proposal-only until Krish approves it.
- Negative: consumer web clients do not have mutation parity until OAuth is implemented.
- Negative: a client that cannot reach the gateway must be honest about operating read-only and untracked.
- Neutral: exact media state and rendering remain outside the cloud session ledger.

## Follow-ups

- Add reviewed OAuth for Claude.ai and ChatGPT connectors.
- Add the Learning Inbox and session provenance views to the approved Control Center Studio surface.
- Add the weekly proposal compiler after enough cross-session evidence exists.
- Verify bearer rotation, connector revocation, abandoned-session closure, and concurrent idempotency behavior before production activation.
