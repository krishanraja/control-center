# ADR-002: Single shared realtime channel for tasks

- Status: Accepted
- Date: 2026-04-18
- Deciders: Krish

## Context

`useRealtimeTasks` was originally written so that every component mount
created its own Supabase realtime channel with a unique name. Each
channel held its own copy of the task list. With seven tabs and several
panels per tab, a single browser session could end up holding four to
six concurrent `tasks` channels for the same data, all firing the same
refetches on every change. This was flagged in
[`DATA-RECOMMENDATIONS.md §3.1`](../DATA-RECOMMENDATIONS.md).

## Decision

Refactor `useRealtimeTasks` to maintain a single module-level Supabase
channel (`tasks-rt-shared`) plus a single shared task cache. Every
consumer registers a listener and derives a filtered view from the
shared cache. Filters that were previously applied at query time
(`statusIn`) are now applied client-side from the cache.

## Alternatives considered

- **React Context + Provider** at the app root. Rejected. Functionally
  equivalent but adds boilerplate (Provider wrapping in App.tsx, Context
  exports) for no behavioural gain over a module-scoped store.
- **External state library (Zustand, Jotai).** Rejected. We have one
  shared resource. A library is overkill.
- **Keep per-mount channels and add a debouncer.** Rejected. Treats the
  symptom (extra refetches) and not the cause (extra connections).

## Consequences

### Positive
- One `tasks` channel per browser session regardless of mount count.
- Cache is shared, so newly mounted components see data immediately
  without a fresh fetch.
- Tear-down deferred one tick so fast tab swaps don't churn the channel.

### Negative
- The `statusIn` filter is now applied client-side, so the cache always
  contains every task. At current volumes this is fine; if the table
  ever grows past a few thousand rows, revisit.
- Module-scoped state is harder to reason about in unit tests. A
  `__resetRealtimeTasksStore()` helper is exported for that case.

### Neutral
- The hook signature is unchanged for consumers (`{ tasks, loading,
  refresh }`). No call sites needed updating beyond the hook itself.

## Follow-ups

- If task volume grows past ~5k rows, add server-side filtering for
  large queries while keeping the shared channel.
- Mirror this pattern for `audit_log` if its volume warrants it. Today
  it does not.
