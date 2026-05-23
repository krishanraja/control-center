# Visibility follow-ups, 2026-05-23

Out-of-repo work that ships alongside PR #58 (visibility depth). Documented here for audit trail; the actual changes live in n8n Cloud, not this repo.

## Nova | Mindmaker OS | Visibility Sweeper (SIDlCqURzTVsVt70)

Fixed Trigger Deep Enrich to fire per inserted row, not just the first. Added Explode Inserted Code node between Supabase: Insert and Trigger Deep Enrich. Changed Trigger Deep Enrich body from `$json[0].id` to `$json.id`. Now every newly-inserted visibility_target fires its own Deep Enrich webhook.

Audit: audit_log row event_type=n8n_brief_edit actor=cli-followup-A1 target=SIDlCqURzTVsVt70.

## Nova | Mindmaker OS | Visibility Backfill Tick (P1arp2BIFQGNDMk5)

New workflow. Schedule every 6h. Queries visibility_targets WHERE deep_enriched_at IS NULL LIMIT 20. Fires Deep Enrich webhook per row with 30s gap. Catches any row that escaped the Sweeper auto-trigger path (manual inserts, race conditions, prior-state cleanup).

Audit: audit_log row event_type=n8n_brief_edit actor=cli-followup-A1 target=P1arp2BIFQGNDMk5.

## Nell | Mindmaker OS | Guest Pitch Draft (GuWi9nxNHpbFEfyV)

New workflow for Phase 6B. Two triggers:

- Webhook POST /webhook/guest-pitch-draft body {guest_id}: fires per-guest. Used by Control Center when Krish wants to draft a pitch on demand.
- Schedule every 12h: batches up to 10 guests with status in (scouted, enriched) and pitch_draft IS NULL.

Each fire calls Sonnet 4.6 with a Krish-voice + show-fit prompt that knows:

- Builder Economy: AI-native builders, indie hackers, build-in-public tone.
- Signal Noise: senior media and adtech operators, peer-to-peer tone.

Output (per guest): pitch_draft (80-150 words, warm DM/email format), suggested_angles (2-3 recording-day angles grounded in their public work), quality_score, quality_reason. Sets guests.status = 'enriched' on success. Parse Pitch scrubs em dashes defensively as a second line of defence after the prompt's explicit rule.

Verified end-to-end with guest Laura Hazard Owen (signal_noise): 764-char pitch grounded in her Nieman Lab analysis on Twitter link penalties, zero em dashes, quality_score=green.

Audit: audit_log row event_type=guest_pitch_draft_generated actor=nell-guest-pitch-draft.

## Why this lives outside PR #58

PR #58 is feat/visibility-depth-2026-05, which Krish is already reviewing. These follow-ups shipped after PR #58 was opened. Bundling them in would force a re-review of a larger surface. They are independent: Sweeper/Backfill Tick are n8n-only; the Pitch Draft workflow is consumed by the existing DesktopGuests UI but doesn't change any UI code yet.

Future work:

- Wire a "Generate pitch" button on guest cards in DesktopGuests that POSTs to /webhook/guest-pitch-draft.
- Render pitch_draft (and parsed suggested_angles) in GuestCard expanded view.
- Vera reads guests where pitch_draft was generated but Krish never copied it as a feedback signal.
