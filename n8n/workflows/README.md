# N8N workflow snapshots

Point-in-time exports of n8n workflows the control-center frontend depends on, captured directly from the live n8n instance. The canonical state lives at https://krishraja10101.app.n8n.cloud — these files exist for diff review, recovery, and historical record. They are **not** auto-synced.

Each file is the result of `GET /api/v1/workflows/:id` with the response narrowed to `id, name, active, nodes, connections, settings, triggerCount`. Credential secrets are never included (n8n redacts them).

## Snapshot timestamp
All five files captured 2026-05-25 during the pedantic CEO audit's final verification sweep.

| File | id | active | notes |
|---|---|---|---|
| `agatha-lead-deep-enrich.json` | `YPKjTnB2P6mqe4kG` | ✓ | Hits Webhook → Fetch Lead → Brave Search → Sonnet Enrich → Parse Sonnet → Patch Lead. Repaired during the audit (see CHANGELOG below). |
| `cleo-content-transform.json` | `5cACYr3eR4vzwiTt` | ✓ | Activated during the audit (had never executed before then). Reads idea → Sonnet writes channel-specific variant → PATCH `content_ideas.transformed_outputs`. |
| `nova-visibility-deep-enrich.json` | `kbHAHuxfzQLLlysG` | ✓ | Visibility target deep enrichment. Webhook trigger consumed by `/api/visibility-targets/:id/enrich-deep`. |
| `agatha-visibility-deep-enrich-ARCHIVED.json` | `Kq5CQ96yVcbOBHdP` | ✗ | Duplicate of Nova's workflow; renamed during the audit so the active version isn't shadowed. Safe to fully delete in n8n once nobody references the id. |
| `cleo-email-draft.json` | `wztp6KoiO5EuFQEB` | ✓ | **NEW** in this audit. Webhook → fetch entity (lead/customer/guest) → Sonnet drafts subject+body → `gmail.drafts.create` via OAuth → patch `email_drafts` ledger + `mark_entity_emailed` RPC. |
| `visibility-deep-enrich.json` | — | — | Pre-existing checked-in file. Older snapshot; see `nova-visibility-deep-enrich.json` for current state. |

## CHANGELOG — outreach quality pass 2026-06-05

### `cleo-email-draft.json` (`wztp6KoiO5EuFQEB`) — DEPLOYED live via the n8n API
- **Build Prompt**: now injects `voice_rules` (passed from the endpoint, sourced
  from `system_config.krish_voice_rules`) and a hard anti-fabrication rule —
  ground every specific only in the supplied research, acknowledge shared history
  instead of cold-opening, one true opening line, one low-friction ask.
- **Sonnet Compose**: system prompt upgraded from a thin one-liner to the real
  krish-voice (founder-practitioner, drop subject pronouns, Not-X-Y clarifier, no
  em dashes / exclamations, full banned-words list, 120-word cap).
- **Endpoint** (`/api/contacts/:id/draft-email`): now extracts the rich
  `RE Dossier Engine v1` passes — `pass5_meeting_weapon` (who_they_are /
  shared_history / the_one_move), `pass4_cross_venture` (per-venture
  opening_wedge + why_this_person), `pass2_public_voice`, `pass1_resolve` facts —
  and passes them as sanctioned research. When a contact is NOT enriched it says
  so explicitly so the model stays honest instead of inventing specifics.
- Verified end-to-end on a real enriched contact: the draft opened on genuine
  shared history, used real dossier facts, proposed a specific angle, and stayed
  in voice with no fabrication.

## CHANGELOG — contacts outreach 2026-06-05

### `cleo-email-draft.json` (`wztp6KoiO5EuFQEB`)
- **Build Prompt**: allowed `entity_type` set widened from `lead|customer|guest` to
  `lead|customer|guest|contact` so the Relationship Engine "Leads" tab (backed by
  the `contacts` table) can draft outreach. This is the only change; all other
  nodes/credentials are untouched.
- **Why**: new `POST /api/contacts/:id/draft-email` endpoint sends
  `entity_type: 'contact'` with a rich, venture-aware `context` block ("how we
  could work together"), plus `intent`, length and tone guidance.
- **DEPLOYED 2026-06-05** to the live workflow via the n8n public API
  (`PUT /api/v1/workflows/wztp6KoiO5EuFQEB`) — only the Build Prompt `jsCode`
  changed; all three credential bindings (Anthropic `httpHeaderAuth`, Gmail
  `gmailOAuth2`, Supabase `supabaseApi`) verified intact and the workflow is
  still `active`. Confirmed end-to-end: a `contact` payload composed an email and
  created a Gmail draft. The endpoint's `'lead'` fallback is now dormant.
- **Known follow-up**: `mark_entity_emailed` + the `email_drafts.entity_type`
  CHECK still only model `lead|customer|guest`, so contact drafts are logged as
  `lead` and `contacts` rows aren't stamped with `last_emailed_at`. Closing that
  needs a DB migration (add `contact` to the CHECK, teach the RPC to stamp
  `contacts`, add `last_email*` columns to `contacts`).

## CHANGELOG — audit fixes 2026-05-25

### `agatha-lead-deep-enrich.json` (`YPKjTnB2P6mqe4kG`)
- **Patch Lead**: jsonBody now writes `enrichment_status: 'enriched'` alongside `deep_enriched_at` so the frontend's optimistic "Enriching" pill clears automatically when the run completes.
- **Brave Search**: credential relinked to the new `Brave API 2026-05-25` httpHeaderAuth credential (id `Z0C5gLxjyf7T02j3`) — previous credential had an expired subscription token.
- **Brave Search**: URL expression changed from `$json[0].full_name` → `$json.full_name` (the upstream Supabase select returns a single object, not an array — the `[0]` was producing an empty `q=` parameter, which Brave rejects with 422).
- **Brave Search**: explicit `Accept: application/json` header added (Brave 422s on n8n's default multi-format Accept header).
- **Sonnet Enrich**: credential relinked from the **Apollo** credential (id `bIpgw4efk6vHrFEG`, accidentally selected previously) to `Anthropic Header 2026-05-21` (id `w8sWwz8EfYc1JA7G`). Previously failed with 401 invalid x-api-key.
- **Sonnet Enrich**: jsonBody downstream `Fetch Lead` reference updated to handle both array and single-object shapes (`Array.isArray(fl) ? fl[0] : fl`).
- **Parse Sonnet**: same `Fetch Lead` shape fix.

### `cleo-content-transform.json` (`5cACYr3eR4vzwiTt`)
- Toggled `active: false → true`. Had never executed since 2026-05-23 creation. Verified working end-to-end against a real content idea after activation.

### `agatha-visibility-deep-enrich-ARCHIVED.json` (`Kq5CQ96yVcbOBHdP`)
- Renamed `Agatha | Visibility Deep Enrich` → `ZZ ARCHIVED ...` to remove confusion with the active Nova workflow that the frontend actually consumes. Workflow remains inactive; not deleted (n8n public API doesn't expose hard-delete without a separate call, and a record was worth keeping for now).

### `cleo-email-draft.json` (`wztp6KoiO5EuFQEB`)
- Created from scratch during the audit. Webhook trigger `POST /webhook/cleo/email-draft`. Body shape: `{entity_type: 'lead' | 'customer' | 'guest', entity_id: uuid, recipient_email, recipient_name, intent}`. Returns `{ok: true, draft_id, draft_url, subject, body_preview}`. Hits Gmail Drafts API via Krish's existing OAuth credential — nothing is auto-sent, drafts only.

## Restoring a workflow from a snapshot
N8N's public API doesn't accept the full export shape for `PUT`. Use `PUT /api/v1/workflows/:id` with `{name, nodes, connections, settings}` from the snapshot file. See `scripts/n8n-restore.py` (TODO if needed) or do it interactively in the n8n UI: open workflow → ⋯ → Import from File.
