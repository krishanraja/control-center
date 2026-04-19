# ADR-003: Lowercase slug as the canonical agent join key

- Status: Accepted
- Date: 2026-04-18
- Deciders: Krish

## Context

Agents are referenced from many tables — `tasks.agent`, `tasks.owner`,
`audit_log.actor`, `workflow_runs.agent_id`, `google_drive_sync.agent_id`.
Without a single canonical token, writers drifted: the VPS sync pipeline
lowercased agent names; the `/api/trigger-agent` endpoint inserted the
display name verbatim ("Cleo"); some N8N workflows wrote yet another
casing. The result was that selecting an agent in the UI returned
fragmented join results — Cleo's manually-triggered tasks lived under
`Cleo`, her synced tasks under `cleo`, and her N8N runs under either,
depending on which workflow wrote them.

## Decision

The lowercase slug stored in `agents.id` is the only valid value used
when referencing an agent from any other table. Display name (`agents.name`)
is for human eyes only.

- Writers must lowercase and trim before insert. `sync.ts` and
  `trigger-agent.ts` both do this. New writers must do the same.
- Readers should still expand tolerantly using `.in()` over the set of
  plausible variants (id, name, lowercased) when querying historical
  rows that may pre-date this rule. See `DesktopOrg.tsx` for the
  pattern.

## Alternatives considered

- **Use a UUID surrogate key.** Rejected. UUIDs are not human-meaningful;
  every webhook payload, audit row, and log line would become
  unreadable.
- **Trust readers to do `.ilike()`.** Rejected. `ilike` cannot use
  indexes efficiently and still does not handle whitespace or trailing
  punctuation drift.
- **Validate at insert with a CHECK constraint.** Considered, recommended
  as a follow-up. Not done in this ADR because it would require
  back-cleaning existing rows first.

## Consequences

### Positive
- One token per agent. Joins are deterministic.
- Slug-as-display-fallback (`humanize(slug)` reads well) means the UI
  never breaks if `agents.name` is missing.

### Negative
- Renaming an agent's slug becomes a multi-table migration. We accept
  this — slugs do not change.
- Readers must remember the variant-expansion pattern when querying
  historical data. Documented in `AGENTS.md#slug-as-key`.

### Neutral
- The pod string (`executive`/`ops`/`growth`) follows the same
  lowercase-slug convention by analogy.

## Follow-ups

- Add a CHECK constraint on the slug-keyed columns once a back-cleaning
  pass has been run.
- Add a periodic Vera audit (see `OBSERVABILITY.md`) that flags any row
  where the agent token is not lowercase or does not match an existing
  `agents.id`.
