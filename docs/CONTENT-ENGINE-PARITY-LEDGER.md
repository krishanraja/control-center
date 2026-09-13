# Content Engine parity ledger

Written 2026-09-07 for the unification of the Content surface across
`control-center` and `mindmake-video-studio`. The rule this file enforces:
**nothing that landed in the last month is removed until its row here names a
live replacement.** The last consolidation lost the magic edits. This one
keeps a receipt.

Source: `git log --since=2026-08-07` on both repositories, read commit by
commit, plus the two surfaces as they rendered before this change.

## Control Center

| Feature | Landed | Where it was | Where it is now | Surfaced |
|---|---|---|---|---|
| Magic edits: direction sheet, before and after compare, use this version or keep current, return to parent | #260 to #266, 4 to 5 Sep | `components/video-studio/*`, opened only from the phone deck | Unchanged. Also opened from the desktop obligation strip (`ObligationStrip`, video review rows) | Both |
| Art director device review: per-beat choice, alternatives, simplify and governed invention | 13 Sep, engine branch `codex/art-director-repertoire` | New capability in the existing Studio review projection | `ArtDirectionReview` inside `VideoEngineReviewer`; alternative actions open the existing magic direction sheet, and sharp alternatives say that styleframes and an animatic are required | Both |
| Video review queue | #260 | Mobile deck only (`useVideoStudioReviews(mobile && ...)`) | Mobile deck, and desktop strip | Both |
| Editorial radar: two independent lenses, opportunity list, angle decisions | #274, #276, 7 Sep | `LaneRoom` list, `ContentComposer` gate | The single opportunity model in the lane, unchanged | Both |
| Production brief bridge to Studio | #278, 7 Sep | Composer Outputs panel | Composer Produce stage (same panel, opens by default for approved pieces) | Desktop |
| Unified content output registry | #276 | `src/lib/contentOutputs.ts` | Unchanged | Desktop |
| Build signals as supply | `2c83ff9`, 7 Sep | Feed room inside the lane | Supply drawer, feed section | Desktop |
| Portable Studio session gateway | #273 | `api/video-studio/mcp.ts` | Unchanged; learning proposals now have a reader (`api/video-studio/learning-proposals.ts`, Library panel) | Desktop and mobile Library |
| Next best action hero | pre-Aug, kept alive in v1 | v1 desktop and mobile | Top of each lane, both viewports (`LaneRoom`) | Both |
| Pipeline board by state, capped per state | v1 desktop | `DesktopContent` `ContentStateLane` | `content-v2/InProgress.tsx`, review and approved open by default, the rest folded | Both |
| Idea card actions: Approve, Refine, Develop, Research, Drop, Why, feedback | v1 desktop | `ContentIdeaCardActionable` | Same component inside `InProgress` | Both |
| Swipe triage of the upstream pile with reason chips | v1, `TriageDeck` | Mode-switched deck over the whole backlog | Mobile Queue deck: seeds and research cards after the rulings, Write this / Open / Not for me with the `content_ideas` reason bar (`useContentTriage`) | Mobile |
| Synthesis: fold several drafts into one | v1 desktop and mobile | Multi-select bar and `SynthesisModal` | `InProgress` fold flow, same modal | Desktop |
| Calendar with click a day to schedule | v1 desktop | `DesktopContent` `ContentCalendar` | `content-v2/ContentCalendar.tsx` in the Library | Desktop |
| Backburner, restore or promote | v1 | `BackburnerSection` in both v1 surfaces | Library, same component | Both |
| Content seed rail (behind `VITE_CONTENT_ENGINE_ENABLED`) | v1 desktop | Inline under cadence bar | Supply drawer; the flag is gone, so it always renders | Desktop |
| Lane toggle and cadence bar | v1 desktop | `LaneControls` | Retired. The lane is chosen by the room segment; the cadence bar rendered nothing for the current lanes and was removed with its file | none |
| Focus mode and focus lanes | v1 desktop, behind `VITE_FOCUS_MODE_ENABLED` | `FocusLanes` inside the board | Retired from Content. The flag is documented as removed in `.env.example` (2026-08-20 recompose); the component stays for the Focus tab | none |
| Draft clustering nudge | v1 | `useContentTriage` | Unchanged (the hook is now mounted by `ContentV2Tab`) | Both |
| Weekly brief, decision queue, shifts, arc cards, feed, library shelves | #179 onward | v2 rooms | Unchanged. Surfaced cards and shifts fold under "Also here" | Both |
| Challenge this (tiered counter-evidence) | June | `api/content-ideas/[id]/challenge.ts`, no caller since the Composer rewrite | Route kept for the Research panel to call; not yet wired in the UI. Recorded as an open gap, not a loss | none yet |
| Transform (parent to child lane rows) | June | `api/content-ideas/[id]/transform.ts`, no caller | Deleted. Channel cuts in the Composer replaced it in July | removed |
| Push to Cleo | June | `api/content-ideas/[id]/push-to-cleo.ts`, no caller | Deleted. Save Draft fires the same factory webhook | removed |

## Studio

| Feature | Landed | Change here |
|---|---|---|
| Carousel director, visual direction, wordmark alignment | 7 Sep | Approvals now carry a bound `confirmation_ref`; otherwise unchanged |
| Production brief intake | #39 | Unchanged |
| Portable session contracts | #37 | Unchanged; every gate now accepts the portable prefix the doc promised |
| Drive inbox discovery, runner recovery, remount identity | #29, #35 | Unchanged |
| Visual story director, evidence overlays, kinetic captions, official wordmarks, treatment presets | #13 to #23 | Unchanged |
| Art director repertoire and sharp alternative | 13 Sep, awaiting engine PR | The same technique registry gains eligibility, deterministic selection traces, recipes, analysis-only observations and inactive learning proposals. No second effects registry or UI is introduced |
| Radar ranking | #9 | Removed. It returned `editorial_eligible: false` for every input; editorial judgement lives in Control Center |
| `cadence` config | #1 | Removed. Nothing read it |
| Three same-day carousel docs | 7 Sep | Folded into `CAROUSEL_ENGINE_STATE.md` as appendices, verbatim |

## Moved to `content-engine` (2026-09-08, ADR-019)

The same rule applies to the move: nothing is removed here until this row names
where it now runs. Every path below is `apps/control-plane/` in that repo, and
every URL is unchanged because Control Center rewrites to it.

| What | Was | Now | Reached by |
|---|---|---|---|
| Content ideas, the Composer's routes, capture, cluster, synthesize, research | `api/content-ideas*` | same paths in the engine | rewrite |
| Weekly brief, shifts, arcs, decisions, purge | `api/briefs`, `api/shifts`, `api/arcs`, `api/content-decisions`, `api/purge` | same paths | rewrite |
| Feed ingest, editorial radar, build signals, lens radar, creator scout, seeds, investigations | `api/feed`, `api/content-opportunities`, `api/discover-*`, `api/content-seed-candidates.ts`, `api/investigations` | same paths | rewrite |
| The whole Video and Carousel control plane, the runner protocol, the MCP gateway, learning proposals | `api/video-studio/**` | same paths | rewrite; the runner's pinned URL is unchanged |
| The fourteen content crons | `vercel.json` here | the engine's own `vercel.json` | Vercel schedules them there |
| The machinery guards and the Postgres projection replay | `scripts/check-*.mts`, the CI Postgres job | `apps/control-plane/scripts`, the engine's `control-plane-sql` job | engine CI |
| The eval harness and the shift backfill scripts | `scripts/eval`, `scripts/backfill-shifts.ts` | the engine | engine |
| `withContentRun`, the ledger writer | `api/_runs.ts` | the engine | the ledger table is unchanged and this repo still reads it |

Kept here on purpose: the Content tab and every component under `content/`,
`content-v2/` and `video-studio/`; the hooks and the browser types they read;
the reject-reason taxonomy (`api/feedback.ts`), which serves fourteen surfaces;
the triage routes reject, promote, calibrate and relevance-sweep, which leads,
guests and contacts also call; `api/concepts/[id]/close.ts`, which cascades
tasks and leads; and the applied migration history.

New here: `src/hooks/useEngineHealth.ts` reads the engine's job list and says on
the tab when this dashboard's schedule table and the engine's disagree.

## Known gaps left open on purpose

- Two lockup systems draw the same two publications: `VideoBrandLockup` (video, official assets by data URI) and `SeriesIdentity` (lanes, public assets by hash). Since 2026-09-08 they share plate colour, border and shadow so they read as one brand; folding them into one component is the follow-up.

- Studio `active_preferences` are prose that is hashed and counted, never
  parsed. The treatment registry is the only learning that changes renders.
- The editorial radar had written nothing in production as of this change
  (165 ideas, none with radar output). Its run now lands in the ledger, so the
  first failure will be said on the tab rather than found in a log.
- The Windows runner is one machine. `runner_watch` surfaces its silence when
  work is waiting; it cannot wake it.
