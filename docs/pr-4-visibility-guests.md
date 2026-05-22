# PR 4: visibility_targets + Nova Sweeper + Guests tab + Sheet importer

Part of the Mindmaker OS rebuild (see `OS-PROGRESS.md` in workspace memory).

## What ships

### Schema (`scripts/migrations/2026-05-22-pr4-visibility-guests.sql`)
- New table `visibility_targets`: canonical pipeline for CFPs, conferences, podcasts, newsletters, guest appearances. Carries `event_url`, `cfp_url`, `deadline_at`, `audience`, `audience_size`, `why_relevant`, `suggested_talk_title`, `relevance_score`, `quality_score`, `recommended_next_step`, `status`. Backfilled from 12 `nova_target_conferences` rows.
- New table `guests`: canonical pipeline for Signal & Noise + Builder Economy podcast guests. Status progresses `scouted -> enriched -> pitched -> responded -> scheduled -> confirmed -> recorded -> published`. Backfilled from 36 `nell_candidates` rows.
- Both new tables get indexes on status, quality_score, plus relevant lookup columns.
- `nova_target_conferences` and `nell_candidates` get table comments marking them DEPRECATED. They are dropped in PR 8 after a 30-day safety window.
- `updated_at` triggers on both new tables.

### n8n workflows (created inactive, see "Acceptance tests" below for activation)
- **Nova Visibility Sweeper** (`SIDlCqURzTVsVt70`). Schedule: Monday 11:00 UTC weekly. Pipeline: Perplexity sonar-pro -> Sonnet 4.6 extract -> Parse + validate -> Filter dedupe by event_url -> Insert `visibility_targets`. Skip path logs to `audit_log`.
- **Nell Guest Sheet Bulk Import** (`tH4GHwadPFIHYRTF`). Webhook: `POST /webhook/guest-doc-ingest`. Same `raw_text` contract as `lead-doc-ingest`: Krish drops a file or pastes rows in any format, Sonnet 4.6 extracts structured guests rows, workflow dedupes by email or name and inserts.
- **Nell Guest Confirmed Cascade** (`bAgGwz2U68aw5L1m`). Webhook: `POST /webhook/guest-confirmed-cascade`. Fires on `Confirm recording`: 3 tasks (prep one week before, recording session, 72h follow-up), 3 promo drafts (Sonnet 4.6 -> `content_ideas`, channels: linkedin, twitter, email_teaser), Gmail draft (when guest email known), `contacted_persons` row, `guests.cascade_fired_at` stamp.

### Frontend
- New `useRealtimeGuests` (Postgres realtime channel on `guests`) and `useVisibilityTargets` (polled, 60s) hooks.
- New `GuestImportDropzone` (mirrors `LeadImportDropzone` UX: drop a CSV / TSV / doc, or paste rows into the textarea).
- New `GuestCard` with Confirm-recording action, status transitions, all contact channels, FeedbackButton.
- New `GuestStatusLane` (desktop) renders guests grouped by status.
- New `VisibilityTargetCard` replaces `VisibilityEventCard` on the Home Visibility lane. Shows event url + CFP url + deadline countdown + audience + why-relevant + suggested talk title.
- `DesktopGuests` and `MobileGuests` placeholders replaced with real tabs.
- `PipelineLanes` Visibility lane swapped from `useNovaConferences` to `useVisibilityTargets`. Legacy hook + card stay in tree for the safety window, unused.

### API
- `POST /api/guests/import` forwards raw_text to the bulk-import webhook.
- `PATCH /api/guests/:id` for status / scoring / scheduled_at updates.
- `POST /api/guests/confirm` updates status to `confirmed` and posts to the cascade webhook.

## Acceptance tests

Brief specifies 8 tests for PR 4. They run after merge:
1. Drop a guest CSV: workflow inserts deduped rows into `guests`.
2. Paste guest rows: same as #1 via the paste textarea.
3. Promote a guest from `scheduled` to `confirmed`: cascade fires (3 tasks created, 3 content_ideas drafted, Gmail draft visible in Drafts, `contacted_persons` row written, `cascade_fired_at` stamped).
4. Trigger Nova Visibility Sweeper manually: inserts fresh `visibility_targets`, no duplicates against existing rows.
5. Home Visibility lane renders cards from `visibility_targets` with all fields populated.
6. Mobile Guests tab loads and shows active guests grouped by status.
7. FeedbackButton on a guest card writes a `feedback_queue` row with `source_table='guests'`.
8. Legacy `nova_target_conferences` and `nell_candidates` data is visible (via backfill) in the new tables.

## Activation plan (post-merge)
The three new workflows ship inactive so this PR doesn't trigger production work before the UI has shipped. After merge:
1. Activate `SIDlCqURzTVsVt70` (Nova) and trigger one manual run via the n8n executions endpoint.
2. Activate `tH4GHwadPFIHYRTF` (Guest Sheet Bulk Import) once Krish has done one drag-drop test against the preview.
3. Activate `bAgGwz2U68aw5L1m` (Cascade) once Krish has scheduled one real guest and is ready to click Confirm.

## Operational rules carried forward
- Git author: Krish Raja <hello@krishraja.com> (GIT-001)
- No em dashes in new content
- Every n8n workflow create logged to `audit_log` and `system_improvements` with `pr_branch='pr-4-visibility-guests'`
- Migration version `2026-05-22-pr4-visibility-guests` in `schema_migrations`
