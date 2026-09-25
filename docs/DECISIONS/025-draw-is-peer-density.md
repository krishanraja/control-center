# ADR-025: Draw is peer density, not technical-leader density

**Date:** 2026-09-24
**Status:** Accepted
**Amends:** `docs/MINDMAKE_OS_ARCHITECTURE.md` §3 "Events: the attend lane" (the two-axis design stands; one axis is redefined)

## Context

Krish, 2026-09-24:

> I feel like the events I should be attending are not very well researched, do
> not change based on my city and are stale - and I want to meet successful
> entrepreneurs and those running successful businesses, not AI developers or
> adtech people.

Four complaints, four different causes. Three were plain defects and are fixed
alongside this decision: the tab labelled Events was reading `visibility_targets`
(live queue that day: 46 press contacts, 9 podcasts, one call for papers whose
deadline had passed in June, and no events at all); sourcing was three Python
scripts on the OpenClaw VPS that are not in version control and had written
nothing since 2026-09-09, watched by nothing; and there was no `home_city`
anywhere in the repo, while `location` was NULL on every agent-sourced row
because the Nova prompt never asked for it.

The fourth is not a defect. It is the specification working as written.

§3 defined the two axes as **Draw** ("technical-leader density, where Krish wants
to be") and **Demand** ("commercial-leader density, who could hire or buy"), and
justified Draw through podcast supply: every technical leader in a room is a
potential Signal & Noise guest, so a high-Draw room serves an active goal.

That is a coherent argument and it produced exactly what it asked for. The live
recommendable lane on 2026-09-24, top first: London PyTorch #28, LLMday NYC Q4,
AWS AI In Practice #7, an Agentic AI workshop on Claude Code, and the Harness
Engineering & Model Wrangling Hackathon. Every one of those is a room of people
who build AI. Krish's ask is a room of people who own businesses. So the
disagreement is with the definition, not with the implementation of it.

Worth recording alongside it: scoring had barely run at all. Of 18 recommendable
upcoming rows, 7 carried any non-zero score, across two distinct values per axis,
and `named_attendees` — the only hard evidence of who is actually in a room — was
empty on all 18.

## Decision

**Draw becomes peer density.** What share of the room are founders, owners, CEOs
or MDs actually running a business with real revenue: people Krish can learn from
and swap notes with as an equal.

**Demand stays buyer density,** unchanged.

**Practitioner density flips from the thing Draw measured to a penalty,** and the
penalty is heavier on Draw than on Demand. A room of engineers holds no peers
under any reading; it may still hold someone who could buy, so Demand is dented
rather than erased.

**Vendor density becomes a separate penalty** on both axes.

**Guest supply survives as a bounded bonus,** not an axis. It was a real benefit
and only ever went wrong when it steered the whole lane. A named attendee who
clears the peer bar is worth up to 12 points on Draw, and nothing below that bar.

The five densities are judged 0-100 by the model and stored as columns; both axes
are computed in TypeScript in `api/_eventScore.ts`, per architecture rule 15.5
(numbers are computed, never LLM-emitted).

### What "not adtech people" is read as, and what it is not

This is the part most likely to be misread later, so it is recorded explicitly.

`api/_mission.ts` locks `FACE` as *"leaders of PE and VC backed media, **adtech**
and data businesses Krish already knows"* and `DOOR` as the paid three-week pilot
sold to them. Those people are his buyers. Scoring them down would aim the attend
lane away from the one thing being sold this quarter.

So the instruction is read as three narrower things:

1. **Adtech journalists are not events.** They were 46 of the 56 rows in the lane
   labelled Events, because that lane read the press register. They move to
   Speaking & Press, where they belong.
2. **Vendor-hosted rooms** are full of people selling rather than owning, and are
   penalised on both axes.
3. **Practitioner rooms** are penalised hard.

A retail media summit whose room is CMOs and P&L owners still ranks. A retail
media summit whose room is martech vendors does not. Splitting vendor density
from buyer density is what makes that distinction expressible, and it is the
reason the two are separate dimensions rather than one "adtech" flag.

If this reading is wrong, the correction is a weight in one place
(`WEIGHTS` in `api/_eventScore.ts`) and not a rewrite.

## Consequences

- 328 rows carrying scores produced under the old definition are marked
  `scored_source = 'vps_legacy'` by
  `supabase/migrations/20260924120000_events_attend_lane.sql` and re-scored. A
  number produced by "technical density is good" cannot be compared with one
  produced by the opposite, so they are not left in place to average out.
- `score_version` is stamped on every row, so a corpus scored under two sets of
  weights is detectable rather than quietly incomparable.
- `scripts/check-events-honesty.mts` runs the arithmetic over the five real rooms
  named above and fails if any of them scores above zero on Peers. A shape check
  cannot tell whether a developer meetup is actually rejected, and that is the
  whole point of the change. It also fails if the practitioner penalty turns
  positive again, which is the precise shape of a revert to §3's definition.
- The same guard asserts that a room of media and adtech P&L owners keeps a
  Demand score of at least 50, so a future tightening of "no adtech" cannot
  quietly aim the lane away from `FACE`.
- The Peers axis is now a much better podcast-guest signal than the old Draw was
  for its stated purpose, because `named_attendees` is filled for the first time.
  A room of technical leaders is still reachable through the Speaking & Press
  lane, which is where a podcast pitch was always actioned.

## Alternatives considered

**Reweight rather than redefine** — keep Draw as technical density and weight
Demand far above it. Rejected: developer meetups keep appearing, ranked lower. A
developer meetup at position nine is still a developer meetup in the attend lane,
and the ask was not "fewer of these".

**Collapse to one axis** — a single 0-100 for commercial-operator density.
Rejected for the reason §3 gave when it chose two: one number cannot express the
asymmetry between a room he learns from and a room that could buy, and those come
apart often enough to be worth seeing separately. Both axes are now commercial,
but they remain different questions.
