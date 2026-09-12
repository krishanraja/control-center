# Harness learning inbox

## Outcome

Every capable AI work surface can submit one small redacted event to a shared HTTPS endpoint. No local daemon, scheduled script, n8n workflow, raw transcript, or direct canon edit is required. Supabase owns the raw append-only inbox. `krishanraja/ai-harness` remains the only release authority for accepted harness doctrine.

## Current phase

Phase 8 local implementation complete. Phase 9 production activation was approved by Krish on 2026-09-12 and is in progress.

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
  is unavailable. Migration apply and authoritative schema readback remain in
  the production gate.
- A deployed canary must prove accepted write, duplicate receipt, rejected secret, paginated export, GitHub ledger import, and zero direct canon mutation.

## Next action

Apply the migration to the Control Center Supabase project, read back table
privileges and constraints, deploy the two Vercel routes, configure their
bearers plus the GitHub export secret and URL, then run the end-to-end canary.
