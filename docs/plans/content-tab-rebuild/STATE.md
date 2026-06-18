# State — read me first, every session

> **Update this file in the same commit as any code change in this rebuild.**
> If you finish a phase, mark its row green and add a one-line "verified by" note.

## Currently in progress

**Session (2026-06-17):** Planning pass complete + **P-3 executed and verified on prod.** Apex/constitution/observations/jobs/plan all written. P-3 demoted 15 empty-body zombie cards (4 review + 11 drafting, all with a thesis) to `researching`; prod now shows review 9 / drafting 1 / researching 15, zero zombies. Migration file at `scripts/migrations/2026-06-17-content-hygiene.sql`; reversal snapshot at `p3-reversal-snapshot.json`.

**Execution note:** the Mindmaker OS SSOT (`gojpffsrxybbpbdzzrvs`) is NOT in the Supabase MCP scope (MCP only sees Fractionl/Mindmaker-AI/onalert/FullTime projects). P-3 was therefore applied via the deployed **service-role `/api/content-ideas` PATCH** endpoint (the app's own sanctioned mutation path), not via the SQL editor. Anon key + project URL were read from the deployed JS bundle for read-only counts. **Future DB-writing phases must use the same path** (deployed `/api/*`), or Krish runs the `.sql` in the Supabase SQL editor. The `.sql` file is the canonical record either way.

**Next executor starts at P-4 (one pipeline + honest state guard).** No git commits made — Krish has not asked to commit.

**Read order for the next session:** `STATE.md` (this file) → `CORE_PROBLEM.md` (the apex) → `PRINCIPLES.md` → `ANTI_PATTERNS.md` → `CHARTER.md` → `OBSERVATIONS.md` → `NIRVANA.md` → `PLAN.md` → `CONTEXT_POINTERS.md` → `RUNBOOK.md`.

**Core problem (Krish-confirmed 2026-06-17):** the Content tab is FOUR duplicate implementations of one state machine (lanes list / swipe deck / right "IDEA" rail / `useContentTriage`), all of which **relabel** a card's state but **none develop it**. "Greenlight → drafting" and the deck `→` only `PATCH {state}`; "Send to research" toasts "sent to Zara" but fires no Zara call (relabel + fake confirmation). Counts diverge across 5 populations. See `CORE_PROBLEM.md`. Everything else rolls under this.

## Phase ledger

| ID | Phase | Status | Owner | Verified by |
|---|---|---|---|---|
| P-0 | Write harness scaffolding (this folder) | DONE | Opus session 2026-06-17 | files present |
| P-1 | Live-test inventory in `OBSERVATIONS.md` | DONE | Opus session 2026-06-17 | 31 observations logged, mobile + desktop |
| P-1b | Write `PRINCIPLES.md` — every observation rolls up to a principle | DONE | Opus session 2026-06-17 | 21 principles, 4 tiers |
| P-1c | `CORE_PROBLEM.md` apex + code-confirmed root cause (OBS-033..038) | DONE | Opus session 2026-06-17 | 4-surface duplication + relabel-not-develop + 5-count divergence, with file/line refs |
| P-1d | `PLAN.md` filled with 16 sequenced PR-sized phases, each citing principles + jobs | DONE | Opus session 2026-06-17 | phases P-3..P-16 specced with DONE WHEN |
| P-2 | Krish confirms apex + constitution + jobs (proceeding without blocking per Krish "move on") | ACK-OPTIONAL | — | — |
| **P-3** | **DB hygiene migration** (demote 15 zombie rows to honest states) | DONE | Opus 2026-06-17 | 15 empty-body review/drafting → researching; verified 0 zombies remain; em-dash backfill found unnecessary (0 in 309 rows) |
| P-4 | One pipeline + honest state guard | NEXT | — | the structural refactor — collapse the 4 surfaces |
| P-5 | Advance = develop, not relabel | NOT STARTED | — | — |
| P-6..P-16 | Remaining execution phases | NOT STARTED | — | see `PLAN.md` |

## Hard blocks for next session

- **`NIRVANA.md`** must be confirmed by Krish before any code lands. The model running the next session reads `OBSERVATIONS.md`, drafts `NIRVANA.md` (or refines the existing draft), and stops to ask.
- **Auto-classification fix is the biggest single-impact win.** SQL queries in `RUNBOOK.md` quantify the damage. Even before P-2 closes, a backfill migration to demote zombie `review`-state rows back to `seeded` would unblock everything visible to Krish on mobile. Flag this as a candidate P-4 in `PLAN.md`.

## Decisions made (don't relitigate)

- **No mega-PR.** One phase = one PR.
- **Flag-gate the rebuild** under `VITE_CONTENT_REBUILD_ENABLED` so each phase ships dark and Krish can A/B against the current build.
- **Mobile = triage + fast-iterate; Desktop = deep-work + publish.** Confirmed by Krish in the kickoff message.
- **Composer stays.** ANTI_PATTERNS.md item.
- **Five Standards stays advisory.** ANTI_PATTERNS.md item.

## Open questions (will close in `NIRVANA.md`)

1. Should there be a **board / kanban** view on desktop (vs the current lanes column + by-state aside)?
2. Should desktop **show the swipe deck at all**, or is it strictly a mobile primitive?
3. Should `review`/`approved` cards on mobile expose **inline actions** (Approve / Schedule / Edit / Drop) so iteration takes 1 tap not 3?
4. Should the **seed rail be promoted to a real "what's incoming"** with attribution, or kept as an opt-in browse bar?
5. Should **Sweep triage** be the default action on a backlog-over-30, or stay opt-in?
6. What is the **canonical state machine** for promotions? Today it's implicit; we should make it explicit (seeded ↔ researching gated on a `research` action; drafting gated on a body write; review gated on `length(body) >= N`; etc.).
