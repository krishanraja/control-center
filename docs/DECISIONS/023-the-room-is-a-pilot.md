# ADR-023: The room is a pilot

**Date:** 2026-09-16
**Status:** Accepted
**Amends:** [ADR-016](./016-ikigai-v4-one-swing.md) (naming only; the decision stands)

## Context

ADR-016 locked the door for this quarter: a three week private diagnostic,
fixed fee, sold to people Krish already knows. In the repo that door was called
"the room", and the word spread from `api/_mission.ts` into the table name, the
ladder states, the scorecard column, two job ids, the tab label and, worst, the
prompts.

Krish opened People, Room on a phone on 2026-09-16 and read this on a card:

> Ask David if he knows an agency leader who should hear about the room.

That sentence is not in the source. It is written per person by
`CLASSIFY_SYSTEM` in the seed route, which interpolates `DOOR`, and `DOOR`
opened "A confidential room". The model did what it was told. So did every
other prompt reading the same constant. His ruling: *"we talk about 'the room'
as if it's a real thing... Talk in plain English."* And on what it is actually
for: *"this is about how I can get pilot customers for my mindmake business
offering."*

The repo's own copy rule already forbade this - "no insider metaphors", plain
English a twelve year old can follow (`AGENTS.md`). The rule was being enforced
on hand-written strings and not on generated ones, which is where most of the
words a reader actually sees now come from.

## Decision

The thing being sold is **a pilot**. The surface is **Pilots**. The rename goes
all the way down: UI strings, prompts, the mission constant, the job ids, the
routes, and the database.

`DOOR` carries the correction itself ("Always call it a pilot, never a room"),
and both prompts that write user-visible sentences repeat it, so a future
prompt inheriting `DOOR` inherits the ban. The ask line also gained a twelve
word cap, because it is read on a phone and the old lines wrapped one word onto
a second line.

### Why `pilot_deals`, not `pilot_targets`

`pilot` was already taken. `pilot_checkins`, `pilot_asks`, `pilot_daily`,
`api/pilot/*`, `src/components/pilot/*` and `docs/PILOT-LAYER.md` are the
**operator** layer: the part of the dashboard that monitors Krish rather than
the fleet. None of it is user-visible, so the label "Pilots" was free, but
`pilot_targets` sitting beside `pilot_asks` would read as one family and
mislead the next reader. `pilot_deals` does not.

## Consequences

- Migration `20260916100000_pilots_not_rooms.sql` is renames and bounded
  updates only, so no row is recreated. Verified by readback against
  production: 2 deals preserved, RLS still enabled and forced, the scorecard
  week intact, the `meter_daily` agent row carried across so spend history is
  not split between a retired unit and a new one.
- `?lane=room` and `?room=` still resolve to the Pilots lane. Old links work.
- `ROOM_ASK_LABEL`, which had drifted into a second copy in `triageConfig.tsx`,
  is deleted; the labels now have one home in `hooks/usePilots.ts`.
- The ICP lane `room_face` is now `pilot_face`. Nothing was stored under the
  old key (checked: 0 of 284 leads), so no data moved.
- ADR-016's substance is unchanged. Only the word changed.
