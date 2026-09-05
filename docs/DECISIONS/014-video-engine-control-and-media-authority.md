# ADR-014: Video Engine control plane and media authority

- Status: Accepted
- Date: 2026-09-04
- Deciders: Krish Raja

## Context

Video Engine work begins from large private media in Google Drive and is executed by a Windows media runner. Control Center must remain usable when that computer or Codex is unavailable. Supabase remains the mind/make OS state system, but it is unsuitable as the source of truth for master media, full transcripts, local render artifacts, or exact editor event history.

## Decision

Supabase owns durable operator intent, safe job projections, exact artifact-bound review requests, command leases, receipts, and runner health. The Video Studio job folder owns the append-only exact media event ledger and immutable media artifacts. Google Drive owns intake and approved archive files. Control Center is the review and direction surface; the Windows runner is the only media executor.

Every cloud command binds an idempotency key, exact parent revision, exact artifact hashes, and a typed operation. A runner cannot silently rebase or activate stale work. Cloud projections exclude raw media, transcripts, local paths, credentials, OAuth state, and process output.

A projection that uses the acknowledged-state protocol carries its complete prior safe platform state separately from the desired platform state. Control Center compares that expectation under the platform-row lock before applying the desired state. `parent_*` in the desired state therefore means reversible magic-edit ancestry only; it is never reused as the compare-and-swap predecessor. Candidate ancestry is stored as immutable, platform-scoped immediate-parent links so consecutive returns can walk an activation chain without guessing.

The acknowledged projection also carries the authenticated local ledger cursor: the V2 `events.jsonl` entry count (including `job_created` as entry one), its event-chain hash, and the materialized source revision hash. The source revision must equal the desired platform revision. Control Center stores the three values atomically on the global job. A lower count is stale; an equal count must have the identical chain and source revision; and a higher count must advance the chain. Review-specific title and summary copy is deliberately excluded from equal-cursor identity: a higher cursor may update the global display copy, while an equal-cursor platform catch-up leaves it unchanged and stores its exact copy on the review.

Because the treatment artifact and local event ledger are job-global in v1, platform isolation is intentionally conservative. Only one platform may carry an active magic-edit lineage for a job, and only one runner command may be queued or leased for that job. A projection is rejected while any local mutation is in flight. A command is rejected if its platform has not caught up to the global source revision or if another platform owns active lineage. Post-render and QA projections may advance revision, semantic map, and editorial state on the active platform, but they cannot rewrite the active candidate, its parent tuple, or its active artifact. Those fields move only through a signed activation or return receipt.

An accepted review is not treated as locally authoritative until its runner-signed command receipt succeeds. If activation or decision recording fails terminally, Control Center keeps the failed review discoverable and may create one bounded recovery generation at a time. A hidden recovery review becomes actionable only after a dedicated `review_recovery_record` command authenticates the exact source binding and provenance on the runner. The old review remains discoverable while that bridge is queued, leased, failed, or exhausted.

V1 command ownership is sticky to one installed runner. The first lease records that runner identity; an expired command may be reclaimed only by the same runner, although its live lease token changes. A normally leased completion remains token-fenced. If the cloud terminalises a command after the runner has already persisted its signed result, Control Center may acknowledge that exact late receipt without relying on its obsolete token only when the retained runner identity, command and receipt hashes, source cursor, parent state, and pre-terminal completion time all match. A fresh healthy heartbeat with no pending receipts is required before an operator recovery can be bound. A never-claimed command may enter recovery only after expiry with zero attempts and exactly one recent, idle, Drive-ready, schema-compatible runner; zero or several possible owners fail closed. A committed recovery remains idempotently readable even if that heartbeat later goes offline. An exact queued and demonstrably unstarted recovery is superseded if the earlier signed source receipt wins; any leased, completed, or user-acted recovery causes an explicit `recovery_exists` conflict instead. This is transport reconciliation, not permission to execute work after terminalisation.

Before/After proxies live in a private Storage bucket and never pass through a Vercel function body. Upload slots bind command, runner, side, SHA-256, MD5, MIME type, byte size, and an expiry. The expiry limits upload authority; it does not invalidate acknowledgement of an object that was already written. Completion first verifies the stored object's exact size and normalized MD5 ETag, rejecting missing or changed objects before the database call. It may then transactionally extend only the two existing slots whose full immutable bindings match the signed receipt, just long enough for receipt storage. It cannot create or replace a slot. An absent or non-MD5 ETag fails closed. Release therefore requires a live single-request ETag check against the configured bucket. Proxy objects become retention candidates only after their review or abandoned-slot expiry plus a seven-day recovery grace, and the runner calls the authenticated retention endpoint daily.

## Alternatives considered

- Put all media state in Supabase: rejected because it widens the privacy boundary, duplicates content-addressed artifacts, and makes local media execution less recoverable.
- Store commands only on the Windows machine: rejected because mobile actions would be lost or unavailable while the machine is offline.
- Require Codex for every action: rejected because Krish explicitly requires intake, bounded magic edits, review, and recovery to operate without a local Codex session.
- Let Control Center edit video directly: rejected because browser media processing would create a second renderer and diverging edit authority.

## Consequences

- Positive: phone-issued intent is durable while the runner is offline and exact media lineage remains private and reconstructable.
- Positive: every candidate is reversible and stale-parent activation fails closed.
- Positive: downstream projections can advance without overwriting the active candidate's undo ancestry.
- Negative: projection and local-ledger reconciliation require explicit receipts and recovery tests.
- Negative: a state created before candidate-lineage storage can preserve only the current known edge. The migration does not invent older ancestry that the cloud no longer contains.
- Neutral: free-form instructions must compile into schema-constrained operations; unsafe or editorial changes route for human judgement.

## Compatibility rollout

The rollout is Control Center first:

1. Deploy the additive HTTP parser, PostgreSQL migration, API error mapping, and PG17 regression suite. Do not release the cursor-writing runner first.
2. Existing cloud jobs may already have platform state but no authenticated local cursor. The upgraded runner therefore sends the complete source count, chain, and revision while omitting `expected_platform_state` once per existing platform. Control Center accepts this only when the desired state is an exact root-state match, no command or active lineage exists, the job stage/status agree, and the global source tuple is either safely initialised or already identical. A declared target platform with no row may use the same constrained root bootstrap. Control Center records platform adoption so the omission cannot be replayed.
3. After adoption, every projection carries `expected_platform_state`. An explicit `null` means that the platform row must not exist. An exact object means that all ten safe platform fields must still match. Exact idempotency retries return their original event before state or command fences are evaluated.
4. Release the runner only after the Control Center migration and API checks are green. Exercise one existing single-platform job, one existing two-platform job, and one new job before activating the private vertical slice.

An older runner that omits both expected state and the source tuple remains temporarily readable during the Control Center-first window, but it cannot mutate a job after its authenticated source cursor has been adopted. This is compatibility, not a second authority model.

After every active runner and platform has demonstrated adoption plus a successful exact-state retry, omission must become invalid in both the HTTP parser and SQL function. Remove the no-source legacy branch, the one-time adoption branch, and `source_cursor_adopted_at` in a dedicated follow-up migration; retain the source count/chain/revision CAS permanently. A runner advances its expected cloud state only after a successful or duplicate projection response, or a verified successful command receipt. A conflict never advances that expectation.

## Follow-ups

- Verify one phone-to-command-to-runner-to-candidate-to-activation path before production connection.
- Verify terminal failure-to-signed-recovery-review on a second browser/device, including lost HTTP responses and an offline runner.
- Verify same-runner reclaim and terminal late-receipt acknowledgement across a lost response, including a cloud lease-token advance that happens before the runner can persist the replacement token.
- Verify that an intact expired-slot preview receipt is acknowledged while a missing, truncated, or MD5-mismatched object still fails before database completion.
- Verify the private bucket's exact MIME/size settings and single-request MD5 ETag behaviour, then enable the daily authenticated retention call.
- Deploy Control Center's additive expected-state support before releasing a runner that sends the new field.
- Record adoption evidence for every job/platform, then remove both legacy omission forms in a dedicated follow-up PR.
- Replace the job-global v1 treatment fence only if treatment artifacts and revision merges become genuinely platform-scoped; do not relax it as a UI convenience.
- Apply production migrations and configure scoped credentials only after a separate release approval.
- Keep public publishing behind its existing explicit Krish approval gates.
