# ADR-014: Video Engine control plane and media authority

- Status: Accepted
- Date: 2026-09-04
- Deciders: Krish Raja

## Context

Video Engine work begins from large private media in Google Drive and is executed by a Windows media runner. Control Center must remain usable when that computer or Codex is unavailable. Supabase remains the mind/make OS state system, but it is unsuitable as the source of truth for master media, full transcripts, local render artifacts, or exact editor event history.

## Decision

Supabase owns durable operator intent, safe job projections, exact artifact-bound review requests, command leases, receipts, and runner health. The Video Studio job folder owns the append-only exact media event ledger and immutable media artifacts. Google Drive owns intake and approved archive files. Control Center is the review and direction surface; the Windows runner is the only media executor.

Every cloud command binds an idempotency key, exact parent revision, exact artifact hashes, and a typed operation. A runner cannot silently rebase or activate stale work. Cloud projections exclude raw media, transcripts, local paths, credentials, OAuth state, and process output.

An accepted review is not treated as locally authoritative until its runner-signed command receipt succeeds. If activation or decision recording fails terminally, Control Center keeps the failed review discoverable and may create one bounded recovery generation at a time. A hidden recovery review becomes actionable only after a dedicated `review_recovery_record` command authenticates the exact source binding and provenance on the runner. The old review remains discoverable while that bridge is queued, leased, failed, or exhausted.

Before/After proxies live in a private Storage bucket and never pass through a Vercel function body. Upload slots bind command, side, SHA-256, MD5, MIME type, byte size, and an expiry. Completion verifies exact size and MIME plus a normalized MD5 ETag; an absent or non-MD5 ETag fails closed. Release therefore requires a live single-request ETag check against the configured bucket. Proxy objects become retention candidates only after their review or abandoned-slot expiry plus a seven-day recovery grace, and the runner calls the authenticated retention endpoint daily.

## Alternatives considered

- Put all media state in Supabase: rejected because it widens the privacy boundary, duplicates content-addressed artifacts, and makes local media execution less recoverable.
- Store commands only on the Windows machine: rejected because mobile actions would be lost or unavailable while the machine is offline.
- Require Codex for every action: rejected because Krish explicitly requires intake, bounded magic edits, review, and recovery to operate without a local Codex session.
- Let Control Center edit video directly: rejected because browser media processing would create a second renderer and diverging edit authority.

## Consequences

- Positive: phone-issued intent is durable while the runner is offline and exact media lineage remains private and reconstructable.
- Positive: every candidate is reversible and stale-parent activation fails closed.
- Negative: projection and local-ledger reconciliation require explicit receipts and recovery tests.
- Neutral: free-form instructions must compile into schema-constrained operations; unsafe or editorial changes route for human judgement.

## Follow-ups

- Verify one phone-to-command-to-runner-to-candidate-to-activation path before production connection.
- Verify terminal failure-to-signed-recovery-review on a second browser/device, including lost HTTP responses and an offline runner.
- Verify the private bucket's exact MIME/size settings and single-request MD5 ETag behaviour, then enable the daily authenticated retention call.
- Apply production migrations and configure scoped credentials only after a separate release approval.
- Keep public publishing behind its existing explicit Krish approval gates.
