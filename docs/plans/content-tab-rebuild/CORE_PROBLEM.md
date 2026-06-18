# THE core problem — everything rolls under this

> Read this before `PRINCIPLES.md`. This is the apex. The 21 principles and 16 jobs are the *how*; this is the *what* and *why*. If any phase does not serve this, it does not ship. (Krish, 2026-06-17: "this is the core problem to solve for here, everything else you have done rolls in under that.")

## The problem in one sentence

The Content tab is **four implementations of the same workflow** that all *relabel* a card's state but **none of which develop the card**, so moving content forward feels like switching between identical broken screens where every button fires into a void and no two counts agree.

## The four duplicated surfaces (code-confirmed 2026-06-17)

All four operate on `content_ideas` and all four reimplement the same `seeded→researching→drafting→review` advance map:

| # | Surface | File | What its primary action does |
|---|---|---|---|
| 1 | Vertical lanes list | `src/components/desktop/DesktopContent.tsx` + `ContentIdeaCardActionable.tsx` | `Open` → deep-links to Composer (**the only one that develops**) |
| 2 | Swipe deck (center ✗ / →) | `src/lib/triageConfig.tsx` `buildContentTriageConfig` | `→` = `PATCH {state: next}` — relabel only |
| 3 | Right "IDEA" rail (Greenlight / Research / Kill) | `src/lib/decisionActions.ts` case `'idea'` | `PATCH {state}` — relabel only |
| 4 | Triage brain | `src/hooks/useContentTriage.ts` | duplicate `ADVANCE_NEXT` / `STATE_PRIORITY` / `patchState` of #2 |

> #2 and #4 are literal copy-paste: `CONTENT_ADVANCE_NEXT` (triageConfig) === `ADVANCE_NEXT` (useContentTriage); `patchIdeaState` === `patchState`. Same map, twice.

## The three failures that flow from it

### F-1. Advancing a card does not develop it
Every "advance" path — the deck's `→`, the rail's **Greenlight → drafting**, the rail's **Send to research** — is `PATCH /api/content-ideas {id, state}`. It changes the *label*, not the *content*.

- **Greenlight → drafting** moves an empty card from `researching` to `drafting`. Still empty. Nothing on screen changes. The card reappears with the same button.
- **Send to research** sets `state='researching'` and toasts *"Sent to Zara for research."* — **but there is no Zara call in the handler.** No webhook. No agent. It is a relabel with a fabricated confirmation. This is why "it says it's sent and I never hear back." (`decisionActions.ts`, case `'idea'`, "Research" action: only `json('/api/content-ideas', {state:'researching'}, 'PATCH')`.)
- The deck's "already handled" memory is session-only React state (`useContentTriage` `committed: useState<Set>`). Exit + re-enter → wiped → the just-advanced card is back on top with the same `→`. "Same card, same green button, same nothing."

**The only surface that develops a card is the Composer** (`#/content?idea=<id>`). But in the triage deck the primary action advances state instead of opening the Composer, so triage *structurally cannot reach* the develop surface. You can only shove cards through empty stages.

### F-2. Two skins, one workflow, no continuity
Switching from the main tab to the Triage deck is switching from one rendering of the state machine to another rendering of the same state machine. Neither lets you "pick up an existing card and keep developing it." The lanes list at least opens the Composer; the deck takes that away and replaces it with relabel buttons. So the deck is a strict downgrade for the actual job (moving a piece forward).

### F-3. Every count is a different population
No single definition of "the pile." Confirmed populations on one screen:

| Label | Population | Source |
|---|---|---|
| "25 active" | not dropped/published/buried | `useContentTriage.activeCount` |
| "12 in review" | `state='review'` | NextActionStrip |
| "Up next 13 / 13 left" | seeded+researching+drafting only (**excludes review/approved**) | `buildContentTriageConfig.items` |
| By-state aside incl. "Dropped 205" | every state | `DesktopContent` groupByState |
| "197+ more to triage" | yet another population (≈ the 205 dropped) | (mobile/deck overflow string) |

Five labels, five filters, five numbers. The user cannot trust any of them, so the queue stops being a queue.

## The target state (what "solved" means)

> **One pile. One card. One set of actions. The primary action develops the card. One count.**

1. **One workflow object.** A single `useContentPipeline` hook owns the pile, the ordering, the counts, and the actions. The deck view and the workbench view are two *renderings* of it — never two implementations. Delete the duplication (#2/#3/#4 collapse into one).
2. **The primary action develops, never just relabels.**
   - "Research" actually fires the research path and the card shows it's running, then shows what came back. If research isn't wired, the button does not exist (no lying toasts).
   - "Draft" opens/produces a draft — it never moves a card to `drafting` with an empty body.
   - State is a *consequence* of content existing, not a thing you push a card through. (See `J-01` honest state machine.)
3. **You can always pick up a card and continue it.** From any surface — list row, deck card, calendar cell — the primary tap lands you in the develop surface (Composer) on that exact card, mid-flight, with its materials and history. Triage's `→` becomes "develop next," not "relabel and hide."
4. **Persistence + feedback.** Every action persists server-side (through `/api/*`, never the anon client) and the UI reflects the new truth immediately and after reload. No session-only memory that forgets what you did.
5. **One count, everywhere.** "The pile" is computed once and every surface reads the same number. A card is in exactly one place. The deck count == the list count == the header count for the same filter.

## How this reorganises the rest of the harness

- `PRINCIPLES.md` P-1 (honest screen), P-3 (click goes where promised), P-4 (one concept one name one place), P-6 (two modes both first-class) are the principle-level expression of this. They stay, but **this file is the thing they serve.**
- `NIRVANA.md` jobs J-01 (honest state), J-04 (workbench not feed), J-07 (one save path), J-10 (inline actions) all collapse toward "one pile, one card, develop-not-relabel." They get re-pointed at this file.
- `PLAN.md` phase order is rewritten: **P-3/P-4 (state machine + dedupe the four surfaces into one pipeline) become the first real work**, because every other phase sits on top of a single honest pipeline. A second pass wires the actions to actually develop (real research, real draft) instead of relabel.

## The one test that proves it's solved

> Pick any card in any surface. Press the primary action. Within one interaction you are either (a) looking at the next real artifact the action produced, or (b) in the Composer continuing that exact card. Reload the page — the card is exactly where you left it. Every count on the screen that includes that card agrees it moved. No toast ever claims something happened that didn't.
