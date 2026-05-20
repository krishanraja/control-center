# ADR-006 — Leads tab + Content Ideas inbox

> Status: **Accepted** · 2026-05-20 · Krish + Claude

## Context

Two parallel pains drove this change.

**Leads.** Lead documents lived everywhere except in the Control Center: Apollo
exports in Drive, podcast appearance audiences nowhere, Nell candidates only
visible as a small dropdown header in the Visibility lane. There was no `leads`
table, no document ingestion, no surface that answered "what leads do I have,
where did they come from, and which one is next to call."

**Content ideas.** Krish surfaces content seeds across five channels — Layer 1
Signal Inbox (Drive drops), Cleo bot Telegram chats, Agatha bot Telegram chats,
`# IDEA:` markers in OpenClaw workspace files, Zara market signals — plus
in-the-moment thoughts. Until now those evaporated. The Home Content lane
rendered tasks tagged `workstream='content'`, which leaked admin ("FIX:
content pipeline plumbing", owned by Arlo) and marketing ("Beta Acquisition
Sprint", owned by Maya) into a surface that was meant to answer Krish's
stated question: *"what idea have we seeded, why is it a good one, where
should it go?"*

## Decision

Adopt a unifying principle: **many sources, one surface**. Symmetric design
for both domains:

1. **One typed table per domain.** `leads` and `content_ideas` are first-class
   entities, not tasks. The `tasks` table stays for agent work; these capture
   the upstream domain objects.
2. **Strict `source_type` enum on every row.** Six lead sources
   (`podcast_audience`, `drive_import`, `manual`, `apollo`, `nell_candidate`,
   `signal_inbox`), six idea sources (`signal_inbox`, `cleo_chat`,
   `agatha_chat`, `openclaw_workspace`, `zara_signal`, `manual`).
3. **One ingestion webhook per domain.** `/webhook/lead-doc-ingest` and
   `/webhook/idea-capture` are the single funnels. Every entry point (UI
   drag-drop, Telegram bot intent, cron sweep, manual quick-capture) goes
   through one extraction prompt + one dedupe path + one Supabase write.
4. **Provenance is surfaced, not buried.** Every card carries a source pill
   (`<LeadSourcePill>`) deep-linking back to origin (Drive doc / Telegram
   thread / workspace file / signal). The user's stated test — "where did
   this come from?" — is answered in one glance.
5. **The Content lane on Home leads with ideas, not tasks.** Seeded ideas
   render first as full cards with `idea / thesis / distribution`. In-flight
   draft tasks render below. Admin/marketing tasks are filtered out.
6. **Global ⌘+I quick-capture.** A floating pill in the bottom-right opens
   a single-field modal that POSTs through the same idea-capture webhook
   as every other source.

## Consequences

- **Schema migrations** under `scripts/migrations/2026-05-20-*.sql`
  introduce `leads`, `content_ideas`, enrich `nova_target_conferences`,
  and document a `superseded` status value for `tasks`.
- **Realtime hooks** (`useRealtimeLeads`, `useRealtimeContentIdeas`) follow
  the shared-channel pattern from ADR-002.
- **N8N workflows** ship as files under `scripts/n8n/` for user import
  rather than auto-created — the workflows touch Drive + Supabase write
  + Sonnet credits and need human review before activation.
- **Prompt patches** ship as Markdown under `scripts/*-prompt-patch.md`
  for the user to paste into Marcus's, Layer 1 Signal Inbox's, and
  Cleo/Agatha's `brief_content`.
- **Mobile parity** is deferred. The new Leads tab renders the desktop
  layout on narrow viewports (stacks gracefully). Mobile-specific
  components are a follow-up.

## Anti-design rejected

- We considered adding a `tasks.type` enum to discriminate
  admin/content/marketing within `tasks`. Rejected: every existing row
  would need backfill, and we'd still have heterogeneous shapes in one
  table. New domain → new table is cleaner.
- We considered keeping content ideas as a view over `tasks` filtered
  by a special workstream. Rejected: ideas have fields tasks don't
  (`thesis`, `distribution`, `confidence`, `source_snippet`), and shoehorning
  them in would compromise both schemas.

## Verification

End-to-end checks listed in the plan file
(`/root/.claude/plans/okay-there-s-some-issues-cosmic-patterson.md`).
Headline: ⌘+I → modal → idea → realtime card appears in Content lane
within 5s. Drag CSV onto Leads dropzone → leads animate into source
lanes within 5s of N8N completing extraction.
