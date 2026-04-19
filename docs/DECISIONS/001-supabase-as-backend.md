# ADR-001: Supabase as the only backend

- Status: Accepted
- Date: 2025-Q4 (initial), formalised 2026-04
- Deciders: Krish

## Context

Control Center needs to store a small amount of structured state (tasks,
agents, audit log, system health, workflow runs) and surface changes to a
single-operator UI in realtime. It also needs a webhook mechanism so
state changes can wake N8N agents.

Building a custom Node/Postgres/Redis stack would mean writing CRUD
endpoints, a realtime pub/sub layer, an auth layer, and outbound webhook
plumbing — all of which Supabase ships out of the box.

## Decision

Use Supabase (Postgres + Realtime + pg_net for outbound webhooks) as the
only backend. The UI talks directly to Supabase via the JavaScript
client. Vercel serverless functions under `/api/*` exist only as
narrowly-scoped server-side helpers (sync ingestion, agent triggering,
health rollup) — not as a general API tier.

## Alternatives considered

- **Custom Node + Postgres.** Rejected. Doubles the moving parts for no
  feature gain at this scale.
- **Firebase / Firestore.** Rejected. Document model is a poor fit for
  the relational joins (tasks ↔ agents ↔ workflow_runs).
- **Hasura on a self-hosted Postgres.** Rejected. Adds a layer with no
  payoff for a single-operator product.
- **Hand-rolled WebSocket layer.** Rejected. Supabase Realtime delivers
  the same contract for free and is already battle-tested.

## Consequences

### Positive
- Zero backend code for the read path. UI subscribes; rows arrive.
- pg_net + N8N forms a clean event-driven loop without a message broker.
- Anonymous-key + RLS provides a clear path to multi-tenant if ever
  needed (see [`SECURITY.md`](../SECURITY.md)).

### Negative
- Schema migrations are run by hand against Supabase. Versioning is
  documented in [`DATABASE.md`](../DATABASE.md) but not yet automated.
- The service-role key is the single most sensitive secret in the
  system. Mishandling it bypasses RLS entirely.
- Vendor lock-in. If we ever leave Supabase, the realtime layer and
  pg_net webhooks both need replacement.

### Neutral
- The `/api/*` Vercel functions remain useful as a place to keep
  service-role-key-using logic out of the browser. They are not a
  general API tier.

## Follow-ups

- Land RLS once the product gains a second user (ADR-006, planned).
- Adopt a migrations tool (e.g. Supabase migrations or sqitch) before
  the schema becomes too complex to track by hand.
