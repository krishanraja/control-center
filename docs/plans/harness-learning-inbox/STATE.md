# Harness learning inbox

## Outcome

Every capable AI work surface can submit one small redacted event to a shared HTTPS endpoint. No local daemon, scheduled script, n8n workflow, raw transcript, or direct canon edit is required. Supabase owns the raw append-only inbox. `krishanraja/ai-harness` remains the only release authority for accepted harness doctrine.

## Current phase

Production inbox infrastructure and the governed GitHub import loop are live
and verified. The stateless MCP emitter is live in production. Codex, Claude
Code, and Cursor on the primary Windows machine each have a separately
revocable identity and an accepted canary. The intermittently connected second
workstation remains explicitly pending and is not a runtime dependency.

## Source layers

- Durable doctrine: `krishanraja/ai-harness`, especially its operating contract and governed learning loop.
- Operational truth: this repository and its Supabase project.
- Historical stores: `learning_events`, `feedback_queue`, `corrections`, `skill_proposals`, and `standards_registry` remain retired or separately governed. This inbox does not revive or write to them.

## Locked architecture

```text
AI surface -> POST /api/harness/mcp -> harness_event_inbox
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
- No dependency on another workstation or mapped drive being online.
- No replacement of client-native memory. Native memory remains scratch and non-authoritative.

## Authority

- Local code, migration, tests, and documentation: authorised by Krish on 2026-09-12.
- Applying the migration, deploying the API, creating the two runtime bearers,
  configuring the GitHub importer, committing, merging, and running one
  synthetic canary: approved by Krish on 2026-09-12.
- Krish approved the hosted MCP design and current-machine client activation on
  2026-09-12. The governed operating contract records the narrow standing write
  authority and keeps `ctrl-capture` as the promotion owner.

## Verification

- Envelope suite: 14 passed, including secret, personal-data, path, size,
  duplicate and conflict cases.
- MCP suite: 12 passed, including fail-closed auth, one-tool discovery,
  server-owned attribution, daily limits, conflict detection, and a retry that
  remains idempotent at the daily limit.
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
- The production canary ran against Vercel deployment
  `dpl_GPdfS3Y3NUDQ8S1eDssXEjWHNu4f`. The merged source deployment
  `dpl_Anc3WQ62dZratekyodZ7TocbhbFd` is ready and aliased to
  `controlcenter.krishraja.com` with separate sensitive ingest and export
  bearers. The export bearer is also configured as the GitHub repository secret,
  and the canonical export URL is configured as a repository variable. Final
  unauthenticated readback returned the expected JSON 401 response.
- Production canary `canary:activation:1789224519152`: unauthenticated export
  401, accepted write 201, exact duplicate 200, conflicting replay 409,
  synthetic secret rejection 400, export 200 with exactly one event.
- `ai-harness` pull request 35 merged as `4b6a73c8b52b573a92ac94ac6bdd8146b113a0ec`.
  Import-only run `34700431080` appended exactly one observation and cursor 1 in
  commit `b4478846c6669ff2efccdfa660edd33aad1b9087`, with no changes under
  `contract/`, `skills/`, or `brain/`.
- Import-only run `34700860119` passed against the final Control Center
  deployment and produced no duplicate observation or ledger commit.
- MCP source pull request 312 merged as `0b41c0e0513f`. Production deployment
  `dpl_uVU66uYXxkehb7Gn4gRXmiKrQUsY` is ready on the canonical Control Center
  domain. Unauthenticated POST returned 401; authenticated discovery returned
  exactly `record_harness_observation`; a repeated stable payload returned the
  original inbox 4 receipt with `duplicate: true`.
- Three hashed emitter identities are enabled with a daily limit of 30. Codex
  produced a fresh-session write at inbox 6. Claude Code and Cursor produced
  isolated identity writes at inbox 7 and 8. Their server-owned surface stamps
  read back correctly from Supabase.
- A second fresh Codex session received only a synthetic correction, with no
  instruction to call the MCP tool. It loaded the canonical Observation capture
  rule automatically and recorded inbox 9, proving the behavioral trigger as
  well as transport reachability.
- Import-only harness run `34707672938` then advanced the governed cursor from 1
  to 9 in `cafbfae`, appending five MCP observations and changing only
  `state/observations`. No contract, skill, rule, or canonical memory changed.
- The governed capture contract merged in `ai-harness` pull request 36 as
  `840ad04b6845`. Deployment evidence and the second-workstation pending state
  merged in pull request 37 as `592df63ea23d`.

## Next action

Provision the second workstation only during a session on that machine, because
a mounted filesystem cannot safely set its Windows user credential or prove a
client runtime is active. Reauthenticate Claude Code and Cursor Agent if
headless model canaries are needed. Rotate the unrelated raw third-party
credential discovered in Cursor's existing MCP config under a separate
provider-approved action.
