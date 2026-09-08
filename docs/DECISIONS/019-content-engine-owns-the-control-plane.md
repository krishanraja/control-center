# ADR-019: The Content Engine repository owns the control plane

- Status: Accepted
- Date: 2026-09-08
- Deciders: Krish Raja
- Amends: ADR-014 (Video Engine control and media authority), ADR-017 (Portable Studio session gateway)

## Context

ADR-014 and ADR-017 put the control plane and the portable session gateway in
this repository, next to the dashboard that drives them. That was right while
the studio was one engine among several things Control Center coordinated.

It stopped being right once the Content Engine became the thing Krish iterates
on daily. The contracts, the renderer, the CLI and the Windows runner lived in
`krishanraja/content-engine`; every route, cron, migration and guard that drove
them lived here. A change to a zod contract and a change to the route serving it
were two pull requests in two repositories, kept in step by hand, with the
schemas hand-copied on this side and no compiler able to see both.

## Decision

The routes, the crons and the structural guards move to
`content-engine/apps/control-plane`, deployed as its own Vercel project. Control
Center reaches them through rewrites, so every URL the browser, the Windows
runner and the MCP clients use is unchanged.

What ADR-014 and ADR-017 decided about **authority** is untouched and still
governs: Supabase owns durable operator intent, safe projections, leases,
receipts and runner health; the job folder owns the exact media ledger; Drive
owns intake and archive; the Windows runner is the only media executor; the
gateway stores bounded structured events and never a transcript. Only the
question of which repository *serves* those contracts has changed.

Control Center remains the review and direction surface. It keeps the Content
tab, the Composer, the mobile deck, the studio reviewer, and the hooks and types
they read. It no longer holds the machinery behind them.

One database, one schema history. `decisions_waiting` still unions
`content_ideas` and `content_decisions` with ten other tables, so splitting the
database would split the Home queue. Applied migrations stay in this repository;
the engine owns new content and studio DDL from here.

## Alternatives considered

- A published package consumed by this repo's `api/`: rejected. It leaves the
  routes, crons and migrations here, which is the opposite of the intent.
- A second Supabase project for content: rejected. It breaks the Home queue.
- Moving the UI too: rejected. The dashboard is one pane over the whole OS, not
  a content app; the Content tab belongs beside Leads and the Room.

## Consequences

- Positive: one repository to change a contract and the route that serves it,
  with one compiler over both.
- Positive: the engine can be developed and deployed without touching the
  dashboard, and vice versa.
- Negative: two deployments must hold the same `ACCESS_CODE`, `APP_ORIGIN` and
  CSRF secret, because the browser's guards now run across a rewrite.
- Negative: some helpers exist as a copy on each side. Drift there is accepted;
  the one thing that must not drift silently, the cron schedule, is reported by
  `GET /api/content-engine/health` and said on the tab.
- Neutral: the runner still points at this origin. Repointing it at the engine's
  own domain is a separate change to the pinned URL and a runner reinstall.
