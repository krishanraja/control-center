# ADR-020: Governed harness event inbox

- Status: Accepted
- Date: 2026-09-12
- Deciders: Krish Raja

## Context

Harness learning evidence currently reaches GitHub from commits and canaries,
but most interactive AI surfaces write nothing back. Per-machine collectors
would multiply operating systems, schedulers, credentials and failure modes.

## Decision

Control Center owns one append-only Supabase inbox and two machine-only HTTPS
operations for harness learning events: authenticated ingest and separately
authenticated read-only export. AI work surfaces submit small, versioned,
redacted event envelopes directly when their client can make an HTTPS request.
No local daemon, local scheduler or n8n workflow participates.

The `ai-harness` GitHub observer imports unseen events into its append-only
observation ledger. Events are evidence only. They can generate a proposal but
cannot edit a skill, contract, registry, rule or active client surface. GitHub
remains the release authority, and a human-reviewed proposal plus regression
evidence remains the promotion boundary.

## Alternatives considered

- Per-machine scripts and schedulers: rejected because every machine becomes a
  separate deployment and monitoring problem.
- n8n ingestion and clustering: rejected because Vercel, Supabase and GitHub
  already own the required cloud boundaries.
- Direct client edits to GitHub: rejected because observation, judgment and
  promotion would collapse into one authority path.

## Security and failure posture

- Ingest and export use different fail-closed bearer secrets.
- Supabase anonymous and authenticated roles have no access to the inbox.
- The service role can insert and select but cannot update or delete rows.
- Unknown fields, raw transcripts, oversized payloads, control characters and
  likely credential shapes are rejected before persistence.
- Event ids are idempotency keys. Reuse with different content is a conflict.
- Capture must never block the user's primary task. A missing client capability
  is reported as unavailable, not hidden behind a machine-specific workaround.

## Consequences

Clients need one remote capability and runtime secret configuration, but no
installed script. Clients that cannot issue authenticated HTTPS requests will
not capture automatically until they support an equivalent remote tool. n8n
may emit an event for its own work, but it has no architectural role in the
learning loop.

## Follow-ups

Before production activation: apply and read back the migration, deploy both
routes, set separate Vercel and GitHub secrets, run accepted-write, duplicate,
conflict, secret-rejection and paginated-export canaries, then verify the event
appears once in the GitHub observation ledger and changes no canon file.
