# Harness learning inbox

## Outcome

Every capable AI work surface can submit one small redacted event to a shared HTTPS endpoint. No local daemon, scheduled script, n8n workflow, raw transcript, or direct canon edit is required. Supabase owns the raw append-only inbox. `krishanraja/ai-harness` remains the only release authority for accepted harness doctrine.

## Current phase

Phase 9 production API activation complete. The GitHub importer is configured
and awaiting its merge plus import-only canary.

## Source layers

- Durable doctrine: `krishanraja/ai-harness`, especially its operating contract and governed learning loop.
- Operational truth: this repository and its Supabase project.
- Historical stores: `learning_events`, `feedback_queue`, `corrections`, `skill_proposals`, and `standards_registry` remain retired or separately governed. This inbox does not revive or write to them.

## Locked architecture

```text
AI surface -> POST /api/harness/events -> harness_event_inbox
                                             |
GitHub Action <- GET /api/harness/export <----+
      |
state/observations -> proposal -> human review -> regression -> release
```

The API accepts a versioned allowlisted envelope and rejects unknown fields, oversized text, control characters, and high-confidence secret patterns. Repeated `event_id` values return the original receipt. Export exposes only the accepted redacted envelope and a monotonic cursor.

## Non-goals

- No model may edit a skill, contract, registry, or rule from an inbox event.
- No transcript, prompt, customer record, credential, machine name, or local absolute path is an event payload.
- No n8n dependency.
- No per-machine collector or scheduler.
- No replacement of client-native memory. Native memory remains scratch and non-authoritative.

## Authority

- Local code, migration, tests, and documentation: authorised by Krish on 2026-09-12.
- Applying the migration, deploying the API, creating the two runtime bearers,
  configuring the GitHub importer, committing, merging, and running one
  synthetic canary: approved by Krish on 2026-09-12.
- Activating event emission on each client surface remains a separate release
  gate because the active adapters are governed harness surfaces.

## Verification

- Envelope suite: 14 passed, including secret, personal-data, path, size,
  duplicate and conflict cases.
- GitHub importer suite: 8 passed, including retry idempotency, pagination,
  private-path rejection and false HTTP success.
- API and script TypeScript checks, ESLint, environment-variable coverage and
  value-free secret scan pass.
- Existing harness structure, render, brain, canary and judge checks pass.
- Supabase local database lint is not run because the Docker database runtime
  is unavailable. The production migration was applied through the Supabase
  migration API because the repository's local migration history is incomplete
  and `db push --dry-run` correctly refused to replay unrelated history.
- Production schema readback: table exists, RLS is enabled, row count was zero
  before the canary, `anon` and `authenticated` have no table privileges, and
  `service_role` has only `INSERT` and `SELECT`. A first readback caught default
  `REFERENCES` and `TRIGGER` grants; the least-privilege repair migration removed
  them and the second readback passed.
- Vercel production deployment `dpl_GPdfS3Y3NUDQ8S1eDssXEjWHNu4f` is ready and
  aliased to `controlcenter.krishraja.com` with separate sensitive ingest and
  export bearers. The export bearer is also configured as the GitHub repository
  secret, and the canonical export URL is configured as a repository variable.
- Production canary `canary:activation:1789224519152`: unauthenticated export
  401, accepted write 201, exact duplicate 200, conflicting replay 409,
  synthetic secret rejection 400, export 200 with exactly one event.
- Still required: merge the GitHub importer, run its import-only workflow,
  verify one ledger row and cursor commit, and verify no canon file changed.

## Next action

Merge both reviewed pull requests, run the harness steward in import-only mode,
then verify one canary observation landed in `state/observations/` and no canon
file changed.
