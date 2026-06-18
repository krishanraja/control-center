# Content Tab Rebuild — Charter

> **FIRST ACTION OF EVERY SESSION:** read in this exact order — `STATE.md` → `CORE_PROBLEM.md` → `PRINCIPLES.md` → `ANTI_PATTERNS.md` → this file → `OBSERVATIONS.md` → `NIRVANA.md` → `PLAN.md` (current phase only) → `CONTEXT_POINTERS.md` → `RUNBOOK.md`.
>
> Last touched: 2026-06-17. If the date here is stale relative to `STATE.md`, trust `STATE.md`.
>
> **The apex is `CORE_PROBLEM.md`** — one pile, one card, one set of actions, the primary action develops the card (never just relabels it), one count. **The constitution is `PRINCIPLES.md`** — principle-led, not ticket-led. Every frustration folds into a principle that serves the core problem; we never fix one item at a time.

## Why this exists

The Content tab grew patchwork: an ingestion engine, a triage deck, a Composer, a calendar, an "Awaiting you" tier, a backburner, a synthesis tray, channel variants, the Five Standards gate, the seed rail, and the auto-classifier all landed in separate PRs. The seams show. Krish (the only user) reports:

- Auto-classification doesn't work (review-state cards have empty bodies).
- Horizontal scroll on desktop.
- Mobile swipe-deck patterns leak onto desktop.
- Buttons go to unexpected places ("click ≠ what I expected to happen").
- Patchwork feel; no single mental model.

The rebuild is **not a from-scratch rewrite**. It's a re-grounding around two concrete user modes (mobile triage, desktop deep-work) plus a hard correction of the state machine that's mis-labelling cards.

## Success criteria (measurable)

| # | Criterion | How we verify |
|---|---|---|
| C-1 | Zero `review`-state ideas with `length(body) < 200` chars | SQL: `select count(*) from content_ideas where state='review' and coalesce(length(body),0) < 200 and buried_at is null`. Target: 0. |
| C-2 | Zero `drafting`-state ideas with no `body` and no `meta.cleo_chat` activity | SQL count = 0. |
| C-3 | Desktop Content tab: `document.documentElement.scrollWidth === clientWidth` at 1440px (no horizontal scroll). | CDP snippet in `RUNBOOK.md`. |
| C-4 | Desktop Content tab: no swipe-deck component mounted at 1440px (`TriageCard`/`useCardDeck` absent in render tree). | DevTools React tree or class-name check. |
| C-5 | Mobile (390x844): clearing 30 backlog items takes ≤ 30 user actions (1 swipe per card). | Manual count + replay in `RUNBOOK.md`. |
| C-6 | Desktop deep-work: from "idea picked" → "Save Draft" → Google Doc created → review state, no scrolling past the fold. | E2E walkthrough in `RUNBOOK.md`. |
| C-7 | Mobile fast-iterate: from list tap → magic-fix preview → accept → Save Draft, ≤ 4 taps for a "tighten this" iteration. | Manual count in `RUNBOOK.md`. |
| C-8 | Krish-voice guardrails still enforced server-side and client-side. `sanitizeVoice()` still runs on revise/transform/chat/save-draft/capture. | Grep + unit test if any. |
| C-9 | PUB-001 (no auto-publish) still holds. Save Draft creates a Google Doc; nothing publishes without `X-Agatha-Secret`. | Code search confirms. |
| C-10 | All existing API contracts at `/api/content-ideas/:id/*` still respond (revise, challenge, score, dive-deeper, transform, materials, chat, save-draft). | Curl from `RUNBOOK.md`. |

## Hard scope guardrails (do not violate)

- **Composer stays.** It is the deep-work surface. `src/components/content/ContentComposer.tsx` is load-bearing. If you change its shape, version it; don't delete it.
- **Five Standards gate stays advisory, not blocking.** Decision 2026-06-11. PUB-001 says Krish is the final word.
- **No em dashes anywhere in user-facing copy.** Inputs sanitized via `sanitizeVoice()` + `src/lib/voiceLint.ts`. Standard V-001..V-007.
- **No auto-publish.** Save Draft = Google Doc + Telegram alert. Nothing posts to LinkedIn/etc. without `X-Agatha-Secret`. PUB-001/PUB-005.
- **Materials store stays.** `meta.materials[]` was added explicitly to fix the "Krish's research corpus disappeared" bug. Do not remove.
- **Lane → channel mapping stays.** `src/lib/contentEngine.ts` holds the bridge. Lanes drive variants, channels drive the factory.
- **Realtime channels stay shared.** One channel per table per browser. ADR-002.
- **`content_ideas` RLS unchanged.** Anon SELECT, service-role ALL. All writes go through `/api/*`. Don't reintroduce the inline `supabase.from('content_ideas').update(...)` that silently failed.
- **Auto-score trigger stays one-shot.** `trg_autoscore_content_idea` fires once per row (cost-runaway lesson). Don't make it re-fire on edit.
- **`VITE_CONTENT_ENGINE_ENABLED` gate stays** until the rebuild ships. Default off, prod true. New flags live under it.

## Out of scope (this rebuild does not touch)

- Cleo (the n8n agent) or any other agent brief.
- The content-factory webhook (`AnhkJrJBvmohfqjJ`) internals.
- The Telegram approvals bot (`@krish_approvals_bot`).
- The Google Docs formatting on the factory side.
- The shared `AppFrame`, sidebar, bottom nav, or other tabs.
- The Capture button (`⌘I`) — already proven.
- The Substack audience import (separate flow).

If a phase wants to touch any of the above, it must be split out and approved separately.

## Who owns what

- **Krish** = product owner. Confirms `NIRVANA.md`. Approves every PR.
- **Whatever model is in session** = executor. Reads `STATE.md` first, picks the smallest in-progress slice from `PLAN.md`, ships it behind a flag, updates `STATE.md`.
- **Vera (n8n)** = feedback aggregator. Will see drop reasons; not part of this rebuild but the rebuild should keep her loop intact (every swipe-left writes a `feedback_queue` row, every Sweep-triage writes one too).

## Operating discipline

1. One phase = one PR. No mega-PRs.
2. Every PR description includes "Principles advanced" + "Principles unchanged" + `J-NN` job ID(s).
3. Every PR includes a `RUNBOOK.md` snippet that verifies it.
4. Every PR updates `STATE.md` in the same commit.
5. Every PR with new UI lands behind a flag (extend `VITE_CONTENT_ENGINE_ENABLED` or add `VITE_CONTENT_REBUILD_ENABLED`).
6. Live-tested on both mobile (390x844) and desktop (1440x900) before "Done When" is checked.
7. If a phase reveals a missing principle, that principle is added to `PRINCIPLES.md` *first*, in a commit by itself, then the phase resumes.
