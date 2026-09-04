# Architecture Decision Records

> **Scope.** Each ADR captures one architectural decision: what was
> decided, why, what alternatives were considered, and what we accept as
> a consequence. ADRs prevent re-litigating settled questions and explain
> the *why* that the rest of the documentation cannot.
>
> **Not in this folder.** The current state of the system is documented
> elsewhere — `ARCHITECTURE.md`, `DATABASE.md`, `PRODUCT.md`, `AGENTS.md`,
> etc. ADRs explain how we arrived at that state.

---

## Index

| # | Title | Status |
|---|---|---|
| [001](./001-supabase-as-backend.md) | Supabase as the only backend | Accepted |
| [002](./002-shared-realtime-channel.md) | Single shared realtime channel for tasks | Accepted |
| [003](./003-slug-as-agent-key.md) | Lowercase slug as the canonical agent join key | Accepted |
| [004](./004-agent-id-rename.md) | Renaming `workflow_runs.agent` → `agent_id` and `started_at` → `run_at` | Accepted |
| [005](./005-pipeline-first-home.md) | Pipeline-first Home | Accepted |
| [006](./006-leads-and-ideas-inbox.md) | Leads tab + Content Ideas inbox | Accepted |
| [007](./007-obsidian-aurora-design-system.md) | Obsidian Aurora design system + adaptive light/dark theming | Superseded by ADR-015 |
| [008](./008-security-hardening-and-auth-rls-scope.md) | DB security hardening now; auth + RLS deferred, scoped | Accepted |
| [009](./009-compound-isolated-application-boundary.md) | COMPOUND isolated application boundary | Accepted |
| [010](./010-vendored-primitive-layer.md) | Vendor Relume's primitives, reject its design system | Accepted |
| [011](./011-contact-intelligence-sibling-table.md) | Network judgment layer is a sibling table, not columns on `contacts` | Accepted |
| [012](./012-one-goal-canon-home-recompose.md) | One goal canon; Home recomposed around it | Accepted |
| [013](./013-one-system-per-job.md) | One system per job: the phone-first recomposition locked as canon | Accepted |
| [014](./014-video-engine-control-and-media-authority.md) | Video Engine control plane and media authority | Accepted |
| [015](./015-mindmake-instrument-room.md) | Mindmake Instrument Room across Control Center and Video Engine | Accepted |

---

## Format

Each ADR is a short markdown file with the following structure:

```
# ADR-NNN: <Title>

- Status: <Proposed | Accepted | Superseded by ADR-NNN | Deprecated>
- Date: YYYY-MM-DD
- Deciders: <names>

## Context
What is the situation that demands a decision?

## Decision
What did we choose, in one or two sentences?

## Alternatives considered
Bullet list with a one-line rejection reason for each.

## Consequences
- Positive
- Negative
- Neutral

## Follow-ups
Concrete tasks or future ADRs spawned by this decision.
```

Keep ADRs short. If you need pages of detail, the design probably is not
yet decided. Write a Proposed ADR instead, link the open questions, and
upgrade to Accepted only when those are answered.

## Numbering

Sequential, never reused. If an ADR is superseded, leave the file in place
with `Status: Superseded by ADR-NNN` so the history is preserved.

## When to write one

Write an ADR when the change:

- Locks in a non-trivial vendor or library choice.
- Picks one of several plausible architectures.
- Establishes a convention that future contributors must follow (e.g.
  naming, key conventions, error-handling patterns).
- Migrates a column, table, or contract that other systems depend on.
- Trades off a non-functional concern (latency, cost, security) explicitly.

Do not write an ADR for routine code changes, bug fixes, or
implementation details that the existing documentation already covers.
