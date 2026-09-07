# History log

Newest first. Entries are written by the docs steward (`docs/steward/RUNBOOK.md`)
and by people doing the same job by hand. Nothing in this file describes
current behaviour; `NOW.md` and `docs/plans/one-swing/STATE.md` do. Files
moved here keep their body verbatim under a Historical banner.

## 2026-09-07

- decision (Krish, 2026-09-07): the docs steward is adopted across eight repos. `NOW.md` at the root is the one file agents are promised is current; this log is where superseded material goes instead of being deleted. Procedure: `docs/steward/RUNBOOK.md`. The three weekly "Documentation Refresh" Routines that wrote to unmerged `claude/*` branches were deleted by Krish the same day (recorded in `docs/MINDMAKE_OS_ARCHITECTURE.md` section 0c, #281).
- reconciled at `3554502d`: main moved by five commits while the seven other fleet repos were being bootstrapped (#280, #281, the scorecard author-filter change, its guard, and a merge). NOW.md re-headed and given the two bullets; `scripts/steward/validate.mjs` and `digest.mjs` now pass `core.quotePath=false` to git after an en-dash filename in mm-ctrl showed quoted paths fail the allowlist glob; `fleet.json` corrected to `public/.well-known/ai-plugin.json` for fractionl-pulse.
- reconciled at `600ba77c`: `docs/icp.json` moved from v2 to v3. It still carried the six-lane model of 2026-06-20 while `api/_icpScore.ts` had led with the `room_face` lane and parked three lanes since 2026-09-06 (ADR-016). Added the `room_face` lane with the scorer's weights and `parked: true` on `fractional_network`, `mm_ctrl_buyer` and `ecosystem_partner`. `docs/ICP.md` gained a lane-status table and a v3 status line; its v2 body is kept as the reference for the six lanes.
- reconciled at `600ba77c`: `n8n/workflows/README.md` claimed the n8n cloud editor was canonical (snapshot of 2026-05-25) while `scripts/n8n/README.md` and the live sync tooling say git wins. A banner at the top of the snapshot README now says so; the snapshots stay as the historical record they are.
- reconciled at `600ba77c`: `docs/GLOSSARY.md` scope now points at `docs/MINDMAKE_OS_ARCHITECTURE.md` section 18 for OS-wide terms and says which wins.
- note: steward and bootstrap commits are signed by the cloud session (`Claude <noreply@anthropic.com>`) rather than the `Krish Raja <hello@krishraja.com>` author standard in `docs/CONTRIBUTING.md`. Recorded here rather than hidden; the Actions steward pushes with the default token.
