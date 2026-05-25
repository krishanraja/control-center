# Pedantic CEO audit — execution status

Live tracker for the multi-chunk execution started 2026-05-25. If a new session resumes mid-flight, read this file, find the first unchecked task, and continue from there.

**Branch:** `claude/repo-audit-mobile-ux-58KQG`
**Plan source:** `/root/.claude/plans/root-claude-uploads-4c04ef66-c854-4eab-noble-oasis.md` (ephemeral — this file mirrors the executable parts).
**Verification coverage at start:** 6 browser viewports, 76 N8N workflows, 16 Supabase tables, every cited line number direct-read.
**Credentials in container:** `/tmp/.creds` (chmod 600). Contains `SUPABASE_SERVICE_ROLE`, `SUPABASE_ACCESS_TOKEN`, `N8N_API_KEY`, `GITHUB_PAT`, `VERCEL_TOKEN`. Re-source via `source /tmp/.creds`. If reclaimed, ask user to re-paste.
**Vercel project:** `control-center` / `prj_ymGIPNZzWx5gSuxv1kqppexR60Ac` (vite). Production domain: `controlcenter.krishraja.com`.

## Gate policy
Pause for explicit user approval before:
- Applying the Supabase migration (additive, idempotent — but DDL is DDL).
- Flipping `Cleo | Content Transform` (`5cACYr3eR4vzwiTt`) to active — it has never executed in prod.
- Archiving `Agatha | Visibility Deep Enrich` (`Kq5CQ96yVcbOBHdP`, duplicate of Nova's).
- Setting Vercel env vars on the production project.
- Merging the PR to `main`.

No pauses for: file edits, branch commits, branch pushes, creating new N8N workflows, agent-brief updates, branch-preview deploys, Playwright verification.

## Chunks

### Chunk 0 — Bootstrap (this file)
- [x] Verify credentials work
- [x] Locate Vercel project (control-center / prj_ymGIPNZzWx5gSuxv1kqppexR60Ac)
- [x] Write this tracker
- [x] Commit + push (commit 32cba78)

### Chunk 1 — Foundations (frontend-only, ship-safe)
- [x] `index.html:8` — viewport `initial-scale=2.13` → `1.0`, add `viewport-fit=cover`
- [x] `src/components/shared/Toast.tsx:34` — responsive safe-area bottom (lift above BottomNav at <900px)
- [x] `src/components/mobile/MobileLeads.tsx:29-31` — fallback chain: full_name → company → email-prefix → "New lead"
- [x] `src/components/LeadCard.tsx:154` — same fallback chain
- [x] `src/components/DesktopSidebar.tsx:22-35` — dropped ghost `system_health.metric/value`; MRR now sums `customers.mrr_usd` where `churned_at IS NULL`
- [x] `src/components/mobile/MobileOrg.tsx:52,67-68` — dropped ghost `agent` column + dead matching branch
- [x] `src/components/desktop/DesktopOrg.tsx:161-171` — dropped legacy `.in('agent', tokens)` query + its defensive catch
- [x] `src/lib/tabs.ts` + `src/components/BottomNav.tsx` — added `mobileShortLabel`; Subscriptions→"Subs", Visibility→"Vis" below 360px
- [x] `src/components/desktop/DesktopLeads.tsx:75,108` — grid `minmax(0,...)` + `min-w-0` on both children for 1280px overflow
- [x] `npx tsc --noEmit` clean
- [ ] Commit: `fix: viewport, toast safe-area, naming fallbacks, supabase select bugs`
- [ ] Push

### Chunk 2 — `/api/status` hardening + Supabase migration file
- [x] `api/status.ts:7-9` — moved env-var check inside handler; returns JSON 503 instead of module-load throw
- [x] Wrote `supabase/migrations/20260525090000_pedantic_audit.sql` (129 lines, additive only, real audit_log cols)
- [x] **GATE passed** — user approved apply via service-role
- [x] Applied via Supabase Management API `/v1/projects/.../database/query` (HTTP 201; needed User-Agent header to bypass CF rule 1010)
- [x] Verified: all new cols on leads/customers/guests/visibility_targets queryable; email_drafts table created; RPC `mark_entity_emailed` callable (HTTP 204); Disney lead backfilled (`full_name="Disney"`)
- [ ] Commit: `feat: /api/status hardening; supabase migration for email-draft + visibility schemas`
- [ ] Push

### Chunk 3 — New `/api/*` proxy routes
- [x] Converted `api/leads/[id].ts` → `api/leads/[id]/index.ts` (keeps git history)
- [x] `api/leads/[id]/draft-email.ts` — POST → N8N Cleo email-draft webhook
- [x] `api/leads/[id]/enrich.ts` — POST → N8N Agatha Lead Deep Enrich, optimistically sets enrichment_status
- [x] `api/visibility-targets/[id]/index.ts` — GET + PATCH (allowed fields whitelist)
- [x] `api/visibility-targets/[id]/enrich-deep.ts` — POST → Nova Visibility Deep Enrich
- [x] `api/visibility-targets/[id]/apply.ts` — POST → status='applied' + creates Nova task + audit_log entry
- [x] `api/customers/[id]/draft-email.ts`
- [x] `api/guests/[id]/draft-email.ts`
- [x] Converted `api/automations.ts` → `api/automations/index.ts` so we can add `[workflow_id]` sub-route
- [x] `api/automations/[workflow_id]/rerun.ts` — POST → N8N `/workflows/:id/run`
- [x] Added 4 server-side env vars to `.env.example`
- [x] `npx tsc --noEmit` clean
- [ ] Commit: `feat: new /api proxy routes for email-draft, enrich, visibility, rerun`
- [ ] Push

### Chunk 4 — N8N workflows (all 4 MCP-enabled per user)
- [x] Inspected Cleo Content Transform (`5cACYr3eR4vzwiTt`) — structure solid (webhook→validate→fetch idea→Sonnet→parse→merge with existing transformed_outputs→patch→audit→respond)
- [x] Inspected Agatha Lead Deep Enrich (`YPKjTnB2P6mqe4kG`) — webhook `/webhook/lead-deep-enrich`, body `{lead_id: uuid}` — matches new /api/leads/:id/enrich payload exactly
- [x] Inspected Nova Visibility Deep Enrich (`kbHAHuxfzQLLlysG`) — webhook `/webhook/visibility-deep-enrich`, body `{target_id: uuid}` — matches /api/visibility-targets/:id/enrich-deep payload
- [x] Inspected Agatha Visibility Deep Enrich (`Kq5CQ96yVcbOBHdP`) — duplicate of Nova's, uses SAME webhook path (would conflict if activated)
- [x] **GATE passed**: user approved activating Cleo Content Transform
- [x] Activated Cleo Content Transform — was never executed since 2026-05-23 creation
- [x] **GATE passed**: user chose rename (not archive) of duplicate
- [x] Renamed `Kq5CQ96yVcbOBHdP` to "ZZ ARCHIVED Agatha | Visibility Deep Enrich (duplicate of Nova)"
- [x] Created new `Cleo | Email Draft` workflow (id `wztp6KoiO5EuFQEB`, active=true, webhook `/webhook/cleo/email-draft`)
- [x] **Live smoke-tested** Cleo Email Draft end-to-end: webhook returned `{ok:true, draft_id:"r6132928408781060430"}`, Gmail draft created, `email_drafts` ledger row written, `mark_entity_emailed` RPC fired correctly. Sonnet wrote subject "Quick check on the audit session"
- [x] SKIP new Execution Error Monitor workflow — existing System | Workflow Monitor + Critical Infrastructure Monitor + Silent Success Detector + Vera | Failure Pattern Sweep already cover this surface
- [x] Updated agent briefs in `agents.brief_content` via service-role: cleo (+894), agatha (+630), nell (+323), nova (+565), marcus (+311). All HTTP 204.

**Webhook URLs captured for chunk 7 (Vercel env vars):**
- `N8N_CLEO_TRANSFORM_WEBHOOK_URL`         = `https://krishraja10101.app.n8n.cloud/webhook/cleo/transform`
- `N8N_EMAIL_DRAFT_WEBHOOK_URL`            = `https://krishraja10101.app.n8n.cloud/webhook/cleo/email-draft`
- `N8N_LEAD_DEEP_ENRICH_WEBHOOK_URL`       = `https://krishraja10101.app.n8n.cloud/webhook/lead-deep-enrich`
- `N8N_VISIBILITY_DEEP_ENRICH_WEBHOOK_URL` = `https://krishraja10101.app.n8n.cloud/webhook/visibility-deep-enrich`
- `N8N_API_BASE_URL`                       = `https://krishraja10101.app.n8n.cloud/api/v1`

### Chunk 5 — Action surface buildout (frontend UI for the new routes)
- [ ] `MobileLeads.tsx:210-244` `buildActions()` — add Draft email + Deep enrich
- [ ] `LeadCard.tsx:134-152` — rewrite `deepEnrich()` to POST to `/api/leads/[id]/enrich`, surface as button
- [ ] `LeadCard.tsx` — add Draft email button
- [ ] New `src/components/VisibilityTargetDetail.tsx` mobile sheet; wire from `MobileGuests.tsx`
- [ ] `CustomerCard.tsx` + `MobileCustomers.tsx:163` (currently `actions={[]}`) — Draft email + Log call + Mark for outreach
- [ ] `GuestCard.tsx` + `MobileGuests.tsx` — Draft email
- [ ] `MobileIntel.tsx` + `DesktopExec.tsx` — Create task / Add to bets buttons on signal rows
- [ ] `MobileFlows.tsx` + `DesktopFlows.tsx` — Rerun / Disable buttons on erroring workflows
- [ ] `ContentIdeaCardActionable.tsx:121-137` — parse response body on failure, show real error + Retry button
- [ ] Commit: `feat: action surfaces across Leads/Customers/Guests/Intel/Flows/Visibility`
- [ ] Push

### Chunk 6 — Density polish + naming pass
- [ ] Naming pass (UI strings only, NOT URL ids): Leads→Services, Customers→Subscriptions, Guests→Visibility
- [ ] `ContentIdeaCardActionable.tsx:267-337` — mobile overflow menu for secondary buttons
- [ ] `DecisionsWaitingPanel.tsx` — limit 4→12 + "View all" modal
- [ ] Cmd+K hint on `DesktopHome.tsx`
- [ ] `MobileBets.tsx:96-119` — grid-cols-1 sm:grid-cols-3
- [ ] `MobileOrg.tsx` — inline brief editing
- [ ] Commit: `refactor: naming pass, mobile density polish`
- [ ] Push

### Chunk 7 — Vercel env vars + preview deploy
- [ ] Set Vercel env vars: `VITE_N8N_EMAIL_DRAFT_URL`, `VITE_N8N_LEAD_DEEP_ENRICH_URL`, `N8N_API_BASE_URL`, `N8N_EMAIL_DRAFT_WEBHOOK_URL`, `N8N_LEAD_DEEP_ENRICH_WEBHOOK_URL`, `N8N_VISIBILITY_DEEP_ENRICH_WEBHOOK_URL`, `N8N_CLEO_TRANSFORM_WEBHOOK_URL`. **GATE before setting on production env.**
- [ ] Trigger fresh deploy of the branch (or wait for auto)
- [ ] Retrieve preview URL

### Chunk 8 — Live verification (against branch preview deploy)
- [ ] Playwright across 6 viewports against preview URL
- [ ] Verify zero Supabase 400s
- [ ] Verify `/api/status` 200
- [ ] Click: Cleo Transform → expect success
- [ ] Click: Lead → Draft email → expect Gmail draft visible
- [ ] Click: Lead → Deep enrich → expect realtime status flip
- [ ] Click: Visibility target → detail sheet → Deep enrich
- [ ] Verify Toast at 390px sits above BottomNav
- [ ] Verify BottomNav at 320px no truncation

### Chunk 9 — PR + report
- [ ] Open PR from branch → main
- [ ] Body = this status report + verification screenshots
- [ ] **GATE: ask user before merging**

## Decisions logged
- Email path: Gmail Drafts via new N8N workflow (`Cleo | Email Draft`) using Krish's OAuth.
- Naming: commit to Services / Subscriptions / Visibility everywhere. URL ids unchanged.
- Scope: full transformation.
- Existing workflows that already serve specific functions: `Nell | Draft Outbound Messages` is LinkedIn DMs + Telegram (not email — confirmed via node inspection); kept untouched.
- Duplicate workflow `Agatha | Visibility Deep Enrich` (`Kq5CQ96yVcbOBHdP`, inactive) — proposed archive in favor of active `Nova | Visibility Deep Enrich` (`kbHAHuxfzQLLlysG`).

## Live state snapshots (for resume context)
- `customers` rows: 17, active MRR sum: $0.00 (real, not a query bug)
- `leads`: Disney lead has NULL full_name → triggers "Unnamed" symptom
- `visibility_targets`: empty table (Nova sweeper hasn't populated)
- `home_intelligence.metrics`: stringified JSON in TEXT column (TODO not in scope this round)
- `vercel.json` rewrites `/((?!api/).*)` → `/index.html` (so any non-`/api/*` fetch hits the SPA)

## Resume instructions for a fresh session
1. `source /tmp/.creds` (if container survived) — else ask user to re-paste.
2. `git -C /home/user/control-center checkout claude/repo-audit-mobile-ux-58KQG && git pull`
3. Read this file, find the first unchecked `[ ]` task, start from there.
4. Update the checkbox + commit in the same chunk.
