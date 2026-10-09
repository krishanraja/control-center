# ADR-030: Doctrine ships with a guard, and an ask is advice, prepared or autonomous

- Status: Accepted
- Date: 2026-10-09
- Deciders: Krish

## Context

Krish, 2026-10-09: "build me a corpus on how to durably avoid design entropy
and ensure information hierarchy and what I'm being asked to do at any one
point is intelligent, sequential, haptic, interactive, and immersive, with
world-class interaction design and motion design and consistency in design
aesthetic. None of this can spiral out of control." Then: "there's a lot
going on in here and it's sometimes too much for me. I don't need to get less
done." And on the pipeline: "I don't want advice in here. I want outcomes and
actions to be doable. Or autonomous."

Three read-only sweeps of `main` at `da789c6` the same day, counts from the
code:

- The capabilities that already have a CI guard (type, icons, stroke, ink
  hierarchy, theme contrast, safe dates, text integrity) have stayed swept.
  Everything without one is growing: 18 motion durations outside the tokens,
  one off-token easing, 33 `transition-all`, ten z-index literals against
  five documented layers, 28 phantom heights, 19 plus 15 opacity values, 56
  hardcoded colours in tsx, 60 inline styles.
- About 28 navigable surfaces, about 12 overlays over every tab, about 30
  pending-count displays, and up to seven asks on Home in the longest honest
  morning, against a written rule of one ask per screen.
- Of 180 `api/` routes, 10 make a Gmail draft and 2 can reach another
  person. Every move button records his reaction or puts a line on his list.
  The autonomy ladder has promotion columns nothing runs. The outcome ledger
  `walkthrough_steps` is written by sessions and read by nothing. The battle
  plan of 2026-10-07 proved it: "Done" meant "help me", and two days later
  none of ten steps was done.

## Decision

1. **Doctrine ships with a guard and a baseline.** The design corpus lives at
   `docs/design/corpus/`, eight files, each carrying the rule, the incident
   it was learned from, the guard that holds it, the number that measures it
   and what is still open. A rule with no guard says "review only". A rule
   that is a count rather than a ban has a baseline in
   `scripts/design-entropy.baseline.json`, held by
   `scripts/check-design-entropy.mts` in CI: a count above its baseline
   fails the build and names the files; a sweep lowers the baseline by hand;
   nothing else moves it. `DESIGN_SYSTEM.md` stays the authority on tokens
   and primitives; the corpus is the layer above and never restates a token.
2. **An ask is one of three kinds, and says which.** *Advice*: a sentence and
   an Open. *Prepared*: the artifact exists, and one press commits it, or at
   a wall one press is his. *Autonomous*: finished inside the walls, reported
   after. The walls (send, post, spend, delete, permission) do not move.
   Advice is the floor, not the target. The vocabulary is fixed here so the
   code that follows (`prepared` on `SurfaceMove`, `walkthrough_steps` as the
   one outcome ledger, `homeQueue`) builds on one set of words.
3. **Three rulings, recorded.**
   - Ruling (Krish, 2026-10-09): after the corpus, the guard and the audit
     land, continue straight into the code phases, one PR each.
   - Ruling (Krish, 2026-10-09): in the one Home queue, a reply waiting on
     him outranks today's move. Today's move keeps slot 1 of Today and takes
     the queue head once the reply is handled.
   - Ruling (Krish, 2026-10-09): a move that stops at a spend wall is
     prepared to the wall with the figure printed. The order is built and
     linked, the primary button is his and says the amount, and nothing is
     paid without his press.

## Alternatives considered

- **A corpus as an essay.** Rejected. The repository has five sweeps on
  record and the lesson of each is that the guard written the same day is
  what kept it swept. Doctrine that nothing can fail on is a wish.
- **Ban every ledger row now.** Rejected. Eighteen durations and 56 colours
  are sweeps of their own, and a PR that changes doctrine and 30 component
  files at once cannot be reviewed on a phone. The ratchet holds the line
  while each sweep lowers it.
- **A `Move` type beside `SurfaceMove`, a `move_outcomes` table, a new
  tab for the queue.** Rejected, each as a sibling: Growth's `NextMove`
  already carries a typed action, `walkthrough_steps` already carries the
  honest outcomes with a `suggestion_id`, and Home already has the hero.
- **Let the ladder promote a surface to `autonomous`.** Rejected. Nothing
  touching a wall is ever autonomous, and the review route has no code path
  that writes the word.

## Consequences

- `check-design-entropy` joins CI beside `check-theme-tokens`, and the root
  `AGENTS.md` house-systems table names the corpus and the guard.
- The audit, `docs/audits/2026-10-09-data-to-action-audit.md`, classifies
  every move on the three kinds with a grade and a raise condition, and
  sequences five code phases. Each phase is its own PR with its own tests,
  revertible alone.
- Two n8n workflows send through Resend with no approval filter and sit under
  neither ladder (`maya-dunning-auto-send`, daily; `acquisition-ctrl-capture-intake`
  touch 1, on capture). They are flagged for Krish's ruling and not changed.
- Where a line of the corpus is doctrine for every repository, it is proposed
  to `krish-design` in the harness through `harness-maintainer`, never copied
  by hand.
