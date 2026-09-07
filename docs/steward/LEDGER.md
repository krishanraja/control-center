# Docs steward ledger

Append-only. One line per repo per run, newest first. Written by the
control-center nightly steward run from each fleet repo's `NOW.md`
frontmatter, and by hand during the bootstrap. This is the cross-repo
chronology; per-repo detail lives in each repo's `docs/history/LOG.md`.

Disposition vocabulary: `bootstrap`, `no change`, `stamped` (head and as_of
only), `reconciled`, `fallback PR`, `failed`.

| Date | Repo | Head before | Head after | Disposition | Notes |
|---|---|---|---|---|---|
| 2026-09-07 | control-center | 600ba77c | (bootstrap commit) | bootstrap | NOW.md, history log, icp.json v2 to v3 (room_face, parked flags), ICP.md lane table, n8n snapshot README banner, glossary pointer. Content Engine ingest now reads NOW.md and the history log. |
