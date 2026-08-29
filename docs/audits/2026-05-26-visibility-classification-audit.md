# Visibility Classification + Builder Economy Scouting Audit

**Date:** 2026-05-26
**Author:** Claude (diagnosis pass)
**Branch:** `audit/visibility-classification`
**Scope:** the three compounding problems the user has flagged — wrong guest/press classification at scout time, low-signal HN-sourced Builder Economy guests, and the Visibility card UX (no inline enrich, no clickable link, stuck migration stubs).

This document is the diagnosis half. No code ships from this branch. Fixes land in five subsequent PRs.

---

## 1. Schema reality vs the brief

The brief assumed a different schema than what is live. Live columns probed via PostgREST `select=*`:

### `visibility_targets` actual columns

`id, title, type, event_url, cfp_url, deadline_at, event_start_at, audience, audience_size, why_relevant, suggested_talk_title, relevance_score, quality_score, recommended_next_step, status, format, location, ticket_price_usd, source, raw_data, migrated_from_nova_id, created_at, updated_at, organizer, organizer_reputation, audience_sector, audience_seniority, past_speakers, cfp_requirements, proposed_talk, strategic_value, angle, effort_estimate, risk_notes, next_actions, deep_enriched_at, enrichment_version, source_url, applied_at, rejected_at`

Important deviations from the brief:

- The brief used `name`; the column is **`title`**.
- The brief proposed adding a new column `kind`; **`type`** already exists and serves that role. The existing enum is `'cfp' | 'conference' | 'podcast' | 'newsletter' | 'guest_appearance' | 'other'` (no DB-level CHECK constraint — enforced in the TypeScript hook only).
- `source_url` already exists (added by the 2026-05-25 pedantic audit migration). The brief assumed it might not.
- `event_url` and `cfp_url` also exist as more specific URL columns.

### `guests` actual columns

`id, name, email, linkedin_url, twitter_handle, personal_url, podcast_target, one_liner, why_fit, best_channel, pitch_draft, fit_score, attainability_score, quality_score, status, scheduled_at, recorded_at, published_at, notes, raw_data, source, migrated_from_nell_candidates_id, cascade_fired_at, created_at, updated_at, legacy_source, last_outreach_at, last_email_draft_id, last_email_draft_url`

Important deviations from the brief:

- There is no `company` or `role` column. Person context lives in `one_liner` and `why_fit`.
- There is no `source_url` on `guests`.
- `podcast_target` uses underscores: `builder_economy`, `signal_noise`. The brief used hyphens (`builder-economy`, `signal-and-noise`). The hyphen form does not exist in the data.
- There is no `target_type` column yet. Adding it is in scope for PR 1.

---

## 2. Quantified mess

### `guests` — 36 total, ALL status='enriched'

| podcast_target | count |
|---|---|
| `builder_economy` | 20 |
| `signal_noise` | 16 |

**All 20 `builder_economy` guests are HN-username trash.** Every single one:

- `source = 'migration'` (every row)
- `quality_score = 'amber'` (every row)
- name is a lowercase alphanumeric HN handle (`erohead`, `keepamovin`, `hubraumhugo`, `hadisafa`, `jjcm`, `fivesigma`, `bbx`, `lukeigel`, `Octouroboros`, `geoffschmidt`, `drcode`, `olalonde`, `lukehollis`, `jart`, `Hello9999901`, `jamesharding`, `pkiller`, `rushingcreek`, `sexy_year`, `newobj`)
- `one_liner` literally starts with `Show HN: "Show HN: ...". {N} points, {N} comments.`
- email = null, linkedin_url = null

None of them can be contacted. None of them are vetted as builders. Every one is an HN poster whose Show HN happened to rank, scraped wholesale into `guests`.

**All 16 `signal_noise` guests are journalists.** Joanna Stern (WSJ), Jessica Davies (Digiday), Deborah Turness (former BBC News head), Andrew Deck, Casey Newton, Joshua Benton (NiemanLab), Tim Heffernan (Wirecutter), Kimeko McCoy, Sarah Ebner, Vinny Rinaldi, Laura Hazard Owen, Hanaa' Tameez, Ronan Shields, Joseph Poliszuk, Neel Dhanesha, Seb Joseph.

Casey Newton (Platformer) and Joshua Benton (NiemanLab editor) plausibly fit the `dual` category — they're both publishers/operators in addition to journalists. The rest are unambiguous press_target.

### `visibility_targets` — 19 total, ALL status='queued', ALL type='conference'

| Sub-state | count | examples |
|---|---|---|
| Migration stubs (`why_relevant` starts with `Migrated from tasks row...`, no URLs, `deep_enriched_at IS NULL`) | 4 | AI Summit London, AI Week Tampa, AI Week Columbus, SuperAI Singapore |
| Enriched but URL-less (`deep_enriched_at IS NOT NULL`, no event_url/cfp_url/source_url) | 4 | VentureBeat Transform, AI Week Cincinnati, AI Engineer World's Fair, AI Summit London (partial) |
| Fully populated (URLs + enriched) | 11 | Cannes Lions, IAB ALM, Advertising Week NY, Possible, Web Summit, MWC, MAICON, Adtech NY, Collision, DMEXCO, SXSW, IAB NewFronts |

The brief said cards like VentureBeat Transform still showed the migration-stub text. That's no longer true — VentureBeat Transform has been enriched. But the URL bug persists: the row is enriched and yet has no clickable link. The visible symptom for Krish is the same (no clickable source on the card), the underlying cause is different (URL never written, rather than no enrichment).

---

## 3. Nell Guest Scout workflow findings

Workflow id `8DlMfyTYsbnQGYR2`, active, schedule Mon/Wed/Fri 9–11 ET.

**Pipeline:**

```
Schedule → [Product Hunt Top, HN Show HN, Digiday RSS, Rebooting RSS, NiemanLab RSS]
        → Parse + Merge candidates → Dedup → Anthropic Extract People → Score
        → Filter by score → Apollo Enrich → Draft Pitches → Store in `guests`
        → Telegram digest → Gmail draft
```

**Critical defects:**

1. **HN Show HN is treated as a builder source.** The "HN: Show HN" node fetches `https://hacker-news.firebaseio.com/v0/topstories.json` (or similar), takes top posts, and treats the *poster's username* as the candidate name. That's how `keepamovin` and `erohead` became builder_economy "guests".

2. **No `target_type` discrimination.** Every emitted candidate is inserted into `guests`. There is no routing to `visibility_targets` for press_target. The Digiday + NiemanLab RSS sources surface journalists, and the workflow routes them into `guests` with `podcast_target='signal_noise'` instead of `visibility_targets` with `kind='press_relationship'`.

3. **No quality gate on contact verifiability.** The Apollo enrich step finds an email when one exists, but the workflow inserts the row into `guests` regardless. Hence 20 builder_economy rows with `email=null, linkedin_url=null` and no way to actually reach them.

4. **No editorial-bar prompt.** The Anthropic Score node returns a fit score but the rubric is generic. There is no rule that says "HN username with no verifiable real-name resolution = skip". HN posters pass through.

The classifier prompt and the router are the two surgical change-points for PR 2.

---

## 4. Nova Visibility Sweeper + Deep Enrich findings

### Visibility Sweeper (`SIDlCqURzTVsVt70`, active)

- Schedule: weekly Mon 11:00 UTC
- Polls Perplexity for events → Anthropic extracts to typed rows → inserts into `visibility_targets` with `event_url` populated
- Retry sub-flow: hourly, fetches rows where `deep_enriched_at IS NULL LIMIT 10`, fires `POST /webhook/visibility-deep-enrich` for each

The retry filter (`deep_enriched_at is.null`) *should* pick up the 4 migration stubs since they have `deep_enriched_at=null`. They have been stuck for several days, which means the Deep Enrich workflow has been failing or no-op-ing on them — see below.

### Visibility Deep Enrich (`kbHAHuxfzQLLlysG`, active)

- Webhook → `Fetch Target` (selects all columns) → Brave research using `title` → Anthropic Sonnet enrich → `Patch Target`
- The `Patch Target` body **does not include event_url / cfp_url / source_url**. So even if Brave research returned a canonical URL for "AI Week Tampa", that URL would not be written back to the row.

This is why the four enriched-but-URL-less rows (VentureBeat Transform et al.) have no link: the enrichment pipeline never persists URLs. Fixing this requires two changes — the Patch must include the discovered URLs, and Brave research output must surface a canonical event URL into the Sonnet output.

### `Visibility Backfill Tick` (`P1arp2BIFQGNDMk5`, **inactive**)

Designed to re-trigger enrichment every 6h for unenriched rows. Currently disabled. If the hourly retry sweep is doing the same work, this tick is redundant; either way it's not why the stubs are stuck.

---

## 5. Broken API endpoint (extra finding)

`api/visibility-targets/[id]/enrich-deep.ts` selects `id, name, source_url, raw_data` from `visibility_targets`. The column is `title`, not `name`. The Supabase select fails the `.single()` constraint and returns 404 to the client.

This means any UI-triggered enrich button (whether it currently exists in detail view or is added in PR 3) cannot work until this endpoint is fixed. The brief assumed a working endpoint; it does not work today.

---

## 6. UI component findings

### `src/components/VisibilityTargetCard.tsx`

- Renders an `Open CFP` (or `Open event`) link only if `cfp_url || event_url` is non-null. **It does not fall back to `source_url`.** For the 4 enriched-but-URL-less rows, no link button is shown.
- No inline `Enrich` button on the card. The user has to click the card to expand the detail panel.
- The decision pair (`Apply` / `Pass`) renders only when `status==='queued'`. There is no special-case for migration stubs — they appear in the same lane with the same Apply/Pass buttons but with no body content of value (just the migration text).

### `src/components/VisibilityTargetDetail.tsx`

Not yet read in this audit pass, but per the brief and per the existing card behavior, the Enrich button lives here. PR 3 will lift it up to the list-view card so it is a one-click action.

### `src/components/desktop/VisibilityTargetLane.tsx`

Renders cards in lanes by status. No changes needed for PR 3.

### `src/hooks/useVisibilityTargets.ts`

Polls visibility_targets every 60s. Excludes `dropped` and `done` by default. Type definitions include `source_url` is not in the type. Adding `source_url` to the row interface is a small required edit.

---

## 7. Fix plan (concrete, in execution order)

### PR 1 — Schema: `target_type` on guests, status check on visibility_targets, source_url backfill

- `ALTER TABLE guests ADD COLUMN target_type text CHECK (target_type IN ('podcast_guest','press_target','dual')) DEFAULT 'podcast_guest'`
- Backfill `target_type='press_target'` on existing guests whose `one_liner` or `why_fit` matches the journalist heuristic (mentions Digiday, WSJ, BBC, NYT, Bloomberg, Axios, NiemanLab, Wirecutter, The Information, Reuters, Forbes, Financial Times, The Economist, Vox, TechCrunch, Wired, The Atlantic, The Guardian, or role contains "reporter", "correspondent", "columnist", "editor", "journalist", "anchor")
- **Do not add a new `kind` column on `visibility_targets`.** Instead, broaden the existing `type` enum to include `press_relationship` (and keep `cfp`, `conference`, `podcast`, `newsletter`, `guest_appearance`, `other`)
- `source_url` already exists on both tables — no schema change needed, just population
- Add a status check constraint on `visibility_targets` documenting the allowed values (`sourced, queued, applied, accepted, rejected, done, dropped`) for safety
- Create the `nell_rejected` log table for PR 2's silent-skip filter

### PR 2 — Nell scout: classifier prompt + router + quality gate

- Rewrite the `Anthropic: Score` prompt to emit the new JSON schema with `target_type`, `quality_score`, `contact_method`, `contact_value`, `skip_reason`
- Add the editorial-bar rules into the system prompt (HN-username skip, contact-verifiability skip, fit-score floors)
- Add a router node after `Parse Scores + Filter` that:
  - If `target_type='press_target'`: insert into `visibility_targets` with `type='press_relationship'`, `source_url`, `status='queued'`
  - If `target_type='podcast_guest'` AND quality passes AND contact verifiable: insert into `guests` (existing path) with `target_type`
  - If `target_type='dual'`: insert into BOTH
  - If `skip_reason`: insert into `nell_rejected` (silent)
- Demote HN Show HN as a primary source. Add lower-volume, higher-signal sources where feasible (Substack notes for Latent Space, AI Snake Oil, Stratechery, One Useful Thing; Crunchbase AI infra funding RSS).
- Test against 5 fixture cases (Joanna Stern, a known AI infra founder, an HN username, a dual candidate like Andrew Deck, a media-exec for Signal & Noise) before activating

### PR 3 — Visibility card UX: inline Enrich + source link

- Add inline `Enrich` button on `VisibilityTargetCard` for rows where `deep_enriched_at IS NULL` OR `why_relevant ILIKE 'Migrated from tasks row%'`
- Wire it to `POST /api/visibility-targets/:id/enrich-deep` (which must be fixed in this same PR — rename `name` to `title`)
- Render a fallback link: `event_url || cfp_url || source_url`. Label by `type`: "View CFP" / "View event" / "View source".
- Disable `Apply` on cards where the body still looks like a migration stub. Tooltip explains the user needs to Enrich first.
- Add `source_url` to the `VisibilityTargetRow` interface in the hook

### PR 4 — Backfill: rescue migration-stub visibility_targets + Patch Target writes URLs

- One-shot Node script in `scripts/backfill-visibility-stubs.ts`:
  - Select rows where `why_relevant ILIKE 'Migrated from tasks row%'`
  - Use Brave Search with `"<title>" CFP {current_year}` to find the canonical event URL
  - Patch `source_url = <discovered URL>` and clear the stub from `why_relevant`
  - Audit-log each rescue
- In the Nova Visibility Deep Enrich workflow, update the `Patch Target` JSON body to include `event_url`, `cfp_url`, `source_url` from the Sonnet output
- Update the Sonnet enrich prompt to emit `event_url` and `cfp_url` based on Brave research

### PR 5 — Triage existing guests pile

- Insert journalist-typed guests into `visibility_targets` with `type='press_relationship'`, copying `name` to `title`, `why_fit` to `why_relevant`
- Skip-status those `guests` rows
- Skip-status all HN-sourced `builder_economy` rows (the 20 trash rows)
- Add audit_log entries for both moves

### Post-merge — clear Builder Economy + run fresh batch + verify + doc update

- Delete (not skip) all current `builder_economy` guests permanently per user instruction ("get rid of all the current Builder Economy guest ideas permanently from Supabase as they are all rubbish")
- Manually trigger Nell Guest Scout once to populate a fresh batch using the new classifier
- Verify the new batch matches the editorial bar
- Update `docs/MINDMAKE_OS_ARCHITECTURE.md` §3, §4.2, §8.2, §8.3, §20 changelog

---

## 8. Deviations from the brief

These are the points where the brief asked for one thing and the live system requires a different approach. PR descriptions for each will reference back to this audit.

1. **Brief said add `kind` to `visibility_targets`.** Live: `type` already exists with similar semantics. Broaden `type` instead of adding a parallel column.
2. **Brief used `name` for visibility_targets.** Live column is `title`.
3. **Brief used hyphen-form podcast_target slugs.** Live values use underscores.
4. **Brief assumed `status='new'` is the unenriched marker.** Live unenriched marker is `deep_enriched_at IS NULL` and most rows sit at `status='queued'`.
5. **Brief did not flag the broken `/api/visibility-targets/[id]/enrich-deep.ts`.** It selects a nonexistent `name` column and always 404s.
6. **Brief did not flag that the Deep Enrich Patch Target writes no URLs.** This is the root cause for the URL-less enriched rows, separate from the migration-stub issue.

All six are corrected in the fix plan above. The brief's overall architecture goal (`target_type` for guests, press-rel kind on visibility_targets, inline Enrich + source link, backfill stubs, triage existing pile) stands and is preserved through the deviations.

---

## 9. Verification will follow

This audit produces no behavior change. Verification blocks attached to each subsequent PR.
