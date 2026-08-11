# ADR-011: The network judgment layer is a sibling table, not columns on `contacts`

- **Status:** Accepted
- **Date:** 2026-08-11

## Context

`contacts` has always been an identity spine: who someone is, how we got them,
and three externally-written numbers (`heat_score`, `fit_scores`,
`relationship_strength`) that arrive from the n8n RE Dossier Engine.

An enrichment pass produced a judgment layer for 10,670 resolved people: `who`,
`why_them`, `hook`, `risk`, `roles`, `surface_when`, `venture_scores`,
`confidence`. Verified before landing it: 2,466 of the 2,470 rows already in
`contacts` resolve into that file, so it is an enrichment of the existing spine,
not a parallel one.

The obvious move was ~20 new columns on `contacts`.

## The problem with the obvious move

`contacts` carries an RLS policy:

```sql
CREATE POLICY contacts_anon_select ON public.contacts FOR SELECT TO anon USING (true);
```

The anon key ships in the browser bundle. Anyone with it can read every row
through PostgREST.

That is tolerable for names, companies and titles. It is not tolerable for
`why_them` and `risk`, which are private assessments of real, named people,
written for one reader. Adding those as columns on `contacts` would publish
them.

## Decision

Split on the sensitivity boundary.

- `public.contacts`: identity and relationship state. Anon-readable, unchanged.
- `public.contact_intelligence`: the judgment layer. RLS enabled, **no anon
  policy at all**, service-role only. Reachable exclusively through the
  access-gated `/api/network/*` routes.

`contact_id` is a primary key and a foreign key to `contacts.id`, 1:1,
`ON DELETE CASCADE`. `contacts` remains the identity of record. This is a
supplement, not a fork.

`network_search` is `SECURITY INVOKER` with no anon grant, for the same reason.

## Consequences

**Good.** The private judgments are genuinely unreachable from the browser key.
The existing Network read path is untouched, so nothing that reads `contacts`
had to change. Per-venture scores live in `jsonb` rather than four columns,
because the venture set has already changed twice and a fifth must not require a
migration.

**Cost.** Every read of a person plus their judgment is a join. The search RPC
does that join once, server-side, so this is not felt at the call site.

**What this does NOT fix.** `contacts` is still anon-readable. Names, companies
and titles remain exposed to anyone with the bundle. Closing that means changing
the RLS policy and routing the existing Network reads through the API, which is
its own change with its own regression surface. It is flagged, not fixed.

## Alternatives rejected

- **Columns on `contacts` plus column-level grants.** PostgREST honours
  column-level privileges, but the failure mode is silent and one forgotten
  `GRANT` publishes a private assessment. A table with no anon policy fails
  closed.
- **A view over `contacts` filtered for anon.** Views inherit the base table's
  RLS by default; getting this right requires `security_invoker` care that a
  future migration could quietly undo.
