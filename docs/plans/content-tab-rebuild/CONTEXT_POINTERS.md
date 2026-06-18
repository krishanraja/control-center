# Context pointers — file paths, tables, routes, flags

Do not grep. Read this. Update this when files move.

## React app — Content tab

| File | What it does |
|---|---|
| `src/components/desktop/DesktopContent.tsx` | Desktop tab shell. Header (Content title, count, Sweep, Triage deck, Synthesize), lane/calendar toggle, focus mode, seed rail, `NextActionStrip`, lanes column + by-state aside, calendar grid, `BackburnerSection`. |
| `src/components/mobile/MobileContent.tsx` | Mobile tab. Two modes: triage deck (active > 30) and "Ready for you / Drafts / upstream-count" tiers (≤ 30). |
| `src/components/content/ContentComposer.tsx` | Full-screen composer overlay opened via `#/content?idea=<id>`. Draft canvas + single rail (Cleo chat / Refine / Materials / Research / Standards). |
| `src/components/content/TriageDeck.tsx` | The swipe deck wrapper. Uses `useContentTriage` + `useCardDeck`. |
| `src/components/content/TriageCard.tsx` | One swipe card (left=drop, right=advance, tap=open Composer). |
| `src/components/content/ContentSeedRail.tsx` | Top-of-tab rail. Reads `/api/content-seed-candidates`. Collapsible (sticky in `localStorage.cc_seed_rail_open`). |
| `src/components/content/ContentEnginePanel.tsx` | Legacy inline engine panel (now retired by Composer; kept for back-compat). |
| `src/components/content/ResearchAndTransform.tsx` | Legacy research/transform stack (now in Composer rail). |
| `src/components/content/SynthesisModal.tsx` | Multi-select → folded narrative modal. |
| `src/components/content/LaneControls.tsx` | `LaneToggle` + `CadenceBar`. |
| `src/components/content/RichText.tsx` | Body renderer. |
| `src/components/ContentIdeaCardActionable.tsx` | The lane card (desktop). Per-idea actions row. |
| `src/components/shared/AppFrame.tsx` | The fixed-viewport shell each tab plugs into. |
| `src/components/shared/SwipeCockpit.tsx` | Generic swipe surface shared with other tabs. |

## Hooks

| Hook | Purpose |
|---|---|
| `src/hooks/useRealtimeContentIdeas.ts` | Single channel `content-ideas-rt-shared`. Exposes `ideas`, `loading`. ContentIdeaRow type lives here. |
| `src/hooks/useContentTriage.ts` | Decides triage-vs-action mode based on `activeCount` (enter > 30, exit ≤ 25). `mode`, `forceTriage`, `exitTriage`. |
| `src/hooks/useCardDeck.ts` | Generic swipe-card state machine. |
| `src/hooks/useDailyFocus.ts` | Daily focus state used by FocusMode. |
| `src/hooks/useFocusMode.ts` | Focus/All toggle, `isFocusModeEnabled()` reads `VITE_FOCUS_MODE_ENABLED`. |
| `src/hooks/useHaptics.ts` | Vibration API wrapper for mobile gestures. |

## Helpers / libs

| File | Purpose |
|---|---|
| `src/lib/contentEngine.ts` | `contentEngineEnabled()` flag check; transform-axis presets; lane→channel map; Five Standards definitions. |
| `src/lib/voiceLint.ts` | `autoFixVoice()` em-dash stripper (client mirror of server `sanitizeVoice()`). |
| `src/lib/triageConfig.ts` | `buildContentTriageConfig(ideas, callbacks, loading)` — desktop swipe-cockpit config. |

## API routes (Vercel functions)

All under `api/`. Every file with relative imports must use `.js` extension (ESM constraint).

| File | Route | Method |
|---|---|---|
| `api/content-ideas/index.ts` | `/api/content-ideas` | POST (create) |
| `api/content-ideas/[id]/index.ts` | `/api/content-ideas/:id` | PATCH |
| `api/content-ideas/[id]/revise.ts` | `/api/content-ideas/:id/revise` | POST |
| `api/content-ideas/[id]/challenge.ts` | `/api/content-ideas/:id/challenge` | POST |
| `api/content-ideas/[id]/score.ts` | `/api/content-ideas/:id/score` | POST |
| `api/content-ideas/[id]/dive-deeper.ts` | `/api/content-ideas/:id/dive-deeper` | POST |
| `api/content-ideas/[id]/transform.ts` | `/api/content-ideas/:id/transform` | POST |
| `api/content-ideas/[id]/materials.ts` | `/api/content-ideas/:id/materials` | GET / POST / DELETE |
| `api/content-ideas/[id]/chat.ts` | `/api/content-ideas/:id/chat` | POST |
| `api/content-ideas/[id]/save-draft.ts` | `/api/content-ideas/:id/save-draft` | POST |
| `api/content-ideas/[id]/schedule.ts` | `/api/content-ideas/:id/schedule` | POST |
| `api/content-seed-candidates.ts` | `/api/content-seed-candidates` | GET |
| `api/_seedSources.ts` | seed source registry (used by above) | (lib) |
| `api/_content.ts` | shared helpers: `callClaude`, `callClaudeMessages`, `sanitizeVoice`, voice/corpus/materials grounding | (lib) |
| `api/triage/relevance-sweep.ts` | `/api/triage/relevance-sweep` | POST |

Verify the full list whenever this file is touched: `Get-ChildItem api -Recurse -Filter *.ts | Select-Object FullName`.

## Database (Supabase project `gojpffsrxybbpbdzzrvs`)

### Tables / views relevant to Content

| Object | Notes |
|---|---|
| `content_ideas` | The main row. Carries `state`, `lane`, `body`, `quality_score`, `meta` (jsonb), `concept_id`, `pillar_id`, `parent_idea_id`, `transformed_outputs`, `scheduled_for`, `published_at`, `buried_at`, `buried_reason`. RLS: anon SELECT, service_role ALL. |
| `content_pillars` | Lane definitions / pillar metadata. |
| `zara_signals` | Buyer signals feed; seed source. |
| `customer_contacts` | Voice signals; seed source. |
| `opportunities` | Closed deals; seed source (won/lost with substantive reason). |

### `content_ideas.state` enum (effective)

`seeded → researching → drafting → review → approved → published`

Plus terminal: `dropped`, `absorbed` (folded into a synthesized narrative). Buried-but-alive: `buried_at` is set but `state` may be any non-terminal value.

### Triggers

| Trigger | What it does |
|---|---|
| `trg_autoscore_content_idea` | Fires `net.http_post → /api/content-ideas/:id/score` with `model=haiku` once when a non-null `body` first appears AND `quality_score is null`. **One-shot. Do not make it re-fire.** Migration: `scripts/migrations/2026-06-11-content-autoscore.sql`. |

### Realtime channels

| Channel | Hook |
|---|---|
| `content-ideas-rt-shared` | `useRealtimeContentIdeas` |
| `daily-focus-rt-shared` | `useDailyFocus` |

## n8n workflows touched by Content

| Workflow | ID | Trigger | What it does |
|---|---|---|---|
| `Cleo \| Mindmaker OS \| Omnichannel Content Factory` | `AnhkJrJBvmohfqjJ` | Webhook `/webhook/content-factory` | Save Draft fires this. Assembles channel-specific draft, writes Google Doc, pings @krish_approvals_bot. **Do not touch in this rebuild.** |
| `Cleo \| Capture Idea Webhook` | (see n8n) | Webhook | The Capture (`⌘I`) ingest path. |
| `Cleo \| Newsletter Sweep` | (see n8n) | Schedule | Periodic ingest. |
| `Cleo \| Content Idea Capture` | (see n8n) | Schedule | Sonnet 4.6 classification of inbound captures. |
| `OS — Zara Signal Sweep` | `xAfMItfI8UfAqb3M` | Daily | Feeds `zara_signals`. Recently revived (2026-06-11) after the multi-bug failure. |

## Env flags

| Flag | Default | Set by | Effect |
|---|---|---|---|
| `VITE_CONTENT_ENGINE_ENABLED` | off | Vercel build env | Turns on Content Engine (transform axes, Challenge, channel variants, Five Standards, seed rail, Composer rail). Currently `true` in prod. |
| `VITE_DAILY_FOCUS_ENABLED` | on | Vercel | Daily focus spine. |
| `VITE_WEEKLY_FOCUS_ENABLED` | off | Vercel | Weekly takeover. |
| `VITE_FOCUS_MODE_ENABLED` | off | Vercel | Full Focus Mode toggle. |
| `VITE_CONTENT_REBUILD_ENABLED` | **NEW (TBD)** | Vercel | Gate for this rebuild's phases. Default off until each phase is verified. |
| `N8N_CONTENT_FACTORY_WEBHOOK_URL` | — | Vercel env | Server-side, save-draft route. |
| `ANTHROPIC_API_KEY` | — | Vercel env | Sonnet/Haiku for revise/chat/save-draft. |
| `PERPLEXITY_API_KEY` | — | Vercel env | Challenge/enrich. |
| `APIFY_TOKEN`, `APIFY_REDDIT_ACTOR`, `APIFY_LINKEDIN_ACTOR` | optional | Vercel env | Real community scraping in Challenge; falls back to Perplexity forum pass if absent. |
| `NEWSAPI_KEY` | optional | Vercel env | Dated proof in Challenge. |

## External skills

| Skill | Why it matters |
|---|---|
| `krish-voice` (`~/.openclaw/skills/krish-voice/SKILL.md`) | Voice rules V-001..V-007. Mandatory read before any outbound copy edit. |
| `content-corpus` (`~/.openclaw/skills/content-corpus/SKILL.md`) | Per-channel mandate (Techonomic / Builder Economy / Signal & Noise / Mindmaker Live) + Five Standards. |
| `mindmaker-os` (this repo's `docs/MINDMAKER_OS_ARCHITECTURE.md`) | §5.7 is the Content Engine spec; §5.6 is the Focus System. |
