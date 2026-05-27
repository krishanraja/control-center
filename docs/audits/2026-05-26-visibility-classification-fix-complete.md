# Visibility Classification + Builder Economy Scouting — fix complete

**Date:** 2026-05-26
**Diagnosis PR:** [#75](https://github.com/krishanraja/control-center/pull/75)
**Fix PRs (all merged):** [#76](https://github.com/krishanraja/control-center/pull/76) · [#77](https://github.com/krishanraja/control-center/pull/77) · [#78](https://github.com/krishanraja/control-center/pull/78) · [#79](https://github.com/krishanraja/control-center/pull/79) · [#80](https://github.com/krishanraja/control-center/pull/80)

## Pre/post — at a glance

| Metric | Before | After |
|---|---|---|
| Total guests in active status (`enriched` etc.) | 36 | 16 |
| guests / builder_economy / live | 20 (all HN-username trash) | 12 (verified AI founders) |
| guests / signal_noise / live | 16 (12 journalists + 4 operators) | 4 (operators only) |
| visibility_targets / press_relationship | 0 | 13 |
| visibility_targets / conference | 19 | 19 |
| visibility_targets with no URL | 7 of 19 | 0 of 32 |
| visibility_targets / migration stubs (unenriched) | 4 | 0 |
| `guests.target_type` column | did not exist | exists, backfilled, indexed |
| `nell_rejected` audit table | did not exist | exists, RLS on, populated by Nell |
| Nell Guest Scout writing to | dropped `nell_candidates` table | live `guests` / `visibility_targets` / `nell_rejected` |
| `/api/visibility-targets/[id]/enrich-deep` | 404 on every call (selecting nonexistent `name`) | works (selects `title`) |
| Nova Deep Enrich persists URLs | no | yes (`event_url` + `cfp_url` + `source_url`) |
| Visibility card inline Enrich button | none | yes, on stub rows |
| Visibility card source URL link | only if `event_url` or `cfp_url` set | falls back to `source_url`, all rows clickable |

## What shipped

### PR #76 — schema

Added `guests.target_type` text column with CHECK constraint (`podcast_guest`, `press_target`, `dual`), default `'podcast_guest'`. Widened `visibility_targets.type` CHECK to include `press_relationship` and `speaking`. New `nell_rejected` table with RLS. Backfilled `target_type='press_target'` on 13 journalist guests via heuristic.

Verified via Management API: column present, both check constraints in place, RLS policies set, backfill counts match.

### PR #77 — Nell scout routing + quality gate

Live n8n workflow `8DlMfyTYsbnQGYR2` (Nell Guest Scout) patched in-place. Four nodes rewritten so output routes by `target_type` and is gated by an explicit editorial bar.

New prompt emits per candidate: `target_type`, `podcast_target`, `press_publication`, `fit_score`, `attainability_score`, `quality_signals`, `contact_method`, `suggested_channel`, `reasoning`, `skip_reason`.

Skip rules:
- HN username with no resolvable real name
- `contact_method='none'` for a `podcast_guest`
- Below fit floor (6 for `builder_economy`, 7 for `signal_noise`)
- Single Show HN post not durable enough for `builder_economy`

Router:
- `podcast_guest` (passing the bar) → `guests`
- `press_target` → `visibility_targets` with `type='press_relationship'`
- `dual` → both
- `skip_reason` set → `nell_rejected` (silent)

Defanged the old `Store Qualified` node (had been silently posting into dropped `nell_candidates` since 2026-05-22).

Live test against 10 fixtures: 4 of 5 journalists routed to `press_target`, both HN usernames skipped, all 3 founder fixtures classified as builder_economy guests with high fit. Companion v2 patch maps upstream source labels to `'nell_outbound'` for the `guests_source_check`.

### PR #78 — Visibility card UX

Inline Enrich button replaces Apply when row is a stub (no `deep_enriched_at` or `why_relevant` starts with migration text). Primary CTA link falls back through `cfp_url → event_url → source_url` with type-appropriate label. `VisibilityTargetType` widened to match DB. Fixed `/api/visibility-targets/[id]/enrich-deep` selecting nonexistent `name` column.

`tsc --noEmit` clean. `vite build` clean.

### PR #79 — Backfill + Nova Deep Enrich persistence

`scripts/backfill-visibility-stubs.ts` rescued the 4 migration-stub rows (AI Week Columbus, AI Summit London, AI Week Tampa, SuperAI Singapore). Second-pass ad-hoc backfill populated URLs on the 3 enriched-but-URL-less rows (AI Engineer World's Fair, VentureBeat Transform, AI Week Cincinnati). VentureBeat Transform corrected to canonical `venturebeat.com/vbtransform2026`.

Nova Visibility Deep Enrich workflow (`kbHAHuxfzQLLlysG`) patched in-place: `Patch Target` now writes `event_url` / `cfp_url` / `source_url`; Sonnet prompt wrapped with `URL_FIELDS_INSTRUCTION` so the model emits URLs grounded in Brave research only.

### PR #80 — Triage existing pile

`scripts/triage-existing-guests.ts`: 13 press_target guests inserted into `visibility_targets` as `press_relationship` with LinkedIn/personal/Twitter URL as `source_url`, then dropped from `guests`. 20 builder_economy guests dropped.

Discovered `guests_status_check` only allows `'scouted','enriched','pitched','responded','scheduled','confirmed','recorded','published','dropped'` (no `'skipped'` despite the DATABASE.md prose). Script uses `'dropped'`.

### Post-merge actions

1. **Permanently deleted all 20 dropped builder_economy guests from Supabase** per Krish's call.
2. **Seeded 12 fresh, curated, real builder_economy guests** (Andrej Karpathy, Soumith Chintala, Jeremy Howard, Harrison Chase, Amjad Masad, Guillermo Rauch, Aravind Srinivas, Mati Staniszewski, Dylan Patel, Anton Troynikov, Logan Kilpatrick, Steven Tey) classified through the live editorial-bar prompt. All 12 passed the bar with fit_score 7–10. Each has a verifiable LinkedIn or Twitter.
3. **Backfilled LinkedIn URLs** for all 11 URL-less press_relationship rows via Brave Search.

## Final verification snapshot

```
guests:
  builder_economy / podcast_guest / enriched : 12   ← all fresh, all real builders
  signal_noise   / press_target  / dropped  : 12   ← moved to visibility_targets
  signal_noise   / podcast_guest / enriched : 4    ← legit media operators kept

visibility_targets:
  conference         / queued : 19
  press_relationship / queued : 13
  URLs populated              : 32 of 32

decisions_waiting view (Triage queue):
  visibility : 31
  guest      : 16   (12 BE + 4 SN)
  idea       : 5
  lead       : 3
  correction : 2
  task       : 1
```

## Follow-ups deferred (tracked separately)

- **Nell source mix expansion.** The PR 2 patch kept HN Show HN as a source but added a quality gate around it. The brief originally proposed demoting HN and adding Substack notes (Latent Space, AI Snake Oil, Stratechery, One Useful Thing), Crunchbase AI infra funding RSS, recent AI conference rosters, and LinkedIn operator posts. Not done in this batch — the quality gate keeps HN's harm bounded, but high-signal sources would improve precision.
- **Nell scout writing into the live graph.** The defanged `Store Qualified` node still POSTs `[]` to `/rest/v1/guests` on every run for graph-shape preservation. Future cleanup: remove that node entirely and re-wire `Build Digest` to read directly from `Prep Supabase Insert`.
- **Subagent test trigger.** No manual trigger of the patched Nell scout has been fired post-merge — confidence comes from the 10-fixture live API test. The next scheduled Mon/Wed/Fri run (~2026-05-27 ET) will produce the first live confirmation.
- **DATABASE.md is stale.** The doc claims `guests.status` includes `'new'` and `'skipped'`, neither of which is in the live check constraint. Documented in this audit; a doc-only PR could refresh DATABASE.md to match reality.

## File map (where to look)

- Diagnosis: `docs/audits/2026-05-26-visibility-classification-audit.md` (PR #75)
- Schema migration: `supabase/migrations/20260526160000_visibility_classification.sql`
- n8n patch notes: `n8n/nell-guest-scout-patch-notes.md`, `n8n/nova-deep-enrich-patch-notes.md`
- Scripts: `scripts/backfill-visibility-stubs.ts`, `scripts/triage-existing-guests.ts`
- UI: `src/components/VisibilityTargetCard.tsx`, `src/hooks/useVisibilityTargets.ts`
- API: `api/visibility-targets/[id]/enrich-deep.ts`
- Changelog: `docs/MINDMAKER_OS_ARCHITECTURE.md` §20 (2026-05-26 entry)
