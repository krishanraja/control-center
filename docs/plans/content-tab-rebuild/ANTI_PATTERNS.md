# Anti-patterns — do NOT do these

A weaker / future-session model could trip into any of these. Each one cost real time or money once already.

## State / data

- **Do not** mark a card `review` until its `body` is non-trivial (`length(body) >= 200` is the agreed floor, or it carries a non-empty `cleo_chat` transcript). The current bug: 11+ cards sit in `review` with 0 words. The "Awaiting you" tier on mobile is the most visible casualty.
- **Do not** auto-promote `seeded → drafting` on a timer. Promotion happens via Composer activity (a Cleo chat turn, a transform/revise call, or an Edit save). If you put a cron in the loop, you will flood the pipeline again (the 218-card incident).
- **Do not** re-fire `trg_autoscore_content_idea` on body edits. It is one-shot by design — re-firing is the June cost runaway. If you want re-scoring, expose it as a manual "Re-score (Sonnet)" button.
- **Do not** reintroduce client-side `supabase.from('content_ideas').update({body})`. RLS is anon-SELECT / service-role-ALL. Drafts MUST go through `PATCH /api/content-ideas/:id` so `sanitizeVoice()` runs server-side. The old inline edit *silently failed*; users thought they were saving and weren't.

## UI / shell

- **Do not** mount mobile-only swipe primitives (`TriageCard`, `useCardDeck`) on desktop. Desktop has space for a board view; the swipe deck is a phone affordance.
- **Do not** add `overflow-x: auto` anywhere unbounded. Any horizontal scroller must have an explicit width and live in a self-contained section. The current `MultiSelectBar` is one offender; the seed rail is on the edge.
- **Do not** put more than one realtime channel per table per browser. ADR-002.
- **Do not** rip out the `AppFrame`. `h-[100dvh] overflow-hidden` is what makes the whole dashboard feel like an app, not a web page. The Content tab owns inner scroll only.
- **Do not** delete the Composer. It is the deep-work surface. Refactor the rail/draft canvas inside it; do not replace the overlay model.
- **Do not** open the Composer for `seeded` or `researching` cards from the lane card — those are still triage-state. Spec says only `review`/`approved`/`drafting` open the Composer.

## Behaviour / voice

- **Do not** strip the krish-voice corpus from any LLM call. Every `/revise`, `/transform`, `/challenge`, `/chat`, `/save-draft`, `/score` grounds in `system_config.content_voice_block` + `content_corpus`. If you skip it, output will read like ChatGPT.
- **Do not** leave em dashes in any user-facing string, ever. `sanitizeVoice()` + `voiceLint.ts` strip them. Includes UI copy you write in this rebuild.
- **Do not** invent sources in Challenge/enrich. Real Apify/NewsAPI/Perplexity. Apify token can be absent (graceful fallback to Perplexity forum pass) but never hand-roll citations.

## Publishing

- **Do not** auto-publish. Save Draft creates a Google Doc and pings Telegram. That is the floor. Krish hits the LinkedIn Distribution endpoint manually, guarded by `X-Agatha-Secret`. PUB-001 / PUB-005.
- **Do not** rename the `save-draft` route. `push-to-cleo` stays for back-compat; new code uses `save-draft`.

## Process

- **Do not** ship a phase without updating `STATE.md` in the same commit.
- **Do not** mark a "Done When" item green without running the verification snippet in `RUNBOOK.md`.
- **Do not** start a phase that another in-progress phase blocks. Re-read `STATE.md` for the dependency graph.
- **Do not** delete files referenced by `CONTEXT_POINTERS.md` without updating that file.
- **Do not** alter scope without asking Krish. If a phase reveals more work, split it; never quietly expand.

## Cost

- **Do not** call Sonnet 4.6 from a UI hover or autocomplete loop. Sonnet is for substance. Haiku for classification. MT-003.
- **Do not** call Opus from any code path. Opus is Agatha-chat only. MT-003.
- **Do not** poll-loop the API. Realtime is the path. ADR-002.
