# The theme layer

Not in the rewrite brief. It comes from Krish's answers to §9 on 2026-08-26,
and it changes C2, C4 and C5, so it is written down before anything is built on
it.

## The two asks are one object

Answering Q1 (proposer, rebuilt properly) he added:

> I do have areas where I can drop in a thesis, corpus or idea which you should
> unite and align holistically into the overall engine ... the proposal engine
> should learn from the ideas and theses I put in there too, but not bend all
> the way to just proposing things that look like my ideas, as the whole point
> of the proposer is I am seeing things I would not be thinking about.

Answering Q2 he added:

> The system should also have a sophisticated way of archiving old ideas into a
> schema that enables us to track broad level trends, shifts and movements ...
> designed to compound like little brains on specific theme areas (eg "how is
> token based pricing evolving and penetrating B2B businesses?") ... not so
> rigid that we can never build new long term tracking but not so loose that
> everything is disparately stored.

These are the same object seen from two ends. A **theme** is a long-running
question that accumulates evidence and arcs over months. Krish seeds some; the
engine discovers others. It is simultaneously:

- the place a dropped-in thesis lives, so a drop-in is not a side door
- the compounding archive, because an arc that resolves is filed under the
  theme it belonged to rather than deleted
- the prior the proposer reads, so it knows what is already understood

One object, three jobs. Three separate structures for the same three jobs is
what §0 of the brief forbids.

## Shape

```
theme
  id
  question              -- "how is token-based pricing penetrating B2B?"
  origin                -- seeded | discovered
  channel               -- built | money        (shifts.lane values)
  lens                  -- one of the six, C2
  state                 -- open | settled | dormant
  standing_view         -- what we currently believe, revisable, dated
  view_history[]        -- {view, at, changed_by_arc_id}
  confidence            -- how well evidenced the standing view is
  opened_at
  last_movement_at
  arcs[]                -- arcs filed under this theme
  disconfirming[]       -- evidence AGAINST the standing view, kept deliberately
```

Arcs stay as designed in C4 and gain `theme_id`. An arc is a movement; a theme
is the question the movement is evidence about. A theme with no arcs is a
question nobody has answered yet, which is a legitimate and useful state: it is
a standing instruction to the corpus.

## The anti-collapse rule, which is the hard part

Krish's constraint is the interesting one: learn from his theses, but do not
collapse onto them. Left alone, any relevance scorer that reads the theme set
converges on it. The engine stops surprising him, which is the only reason it
exists.

So `theme_id` must never be a scoring input on its own. Two rules:

**1. Themes raise the floor, not the ceiling.** Matching an open theme makes a
candidate *admissible* when it would otherwise be discarded for low
`vertical_fit`. It does not add score. A candidate cannot outrank another
because Krish happens to be interested in its subject.

**2. A reserved slot for the unthemed.** Of the 7 cards C6 allows on screen,
at least 2 must belong to no existing theme. If fewer than 2 qualify, the slots
stay empty rather than being filled from themed candidates. An empty slot is
information: it says the corpus produced nothing Krish was not already looking
at, which is the failure this rule exists to make visible.

Neither rule can be satisfied by prompt guidance, so both belong in code and
both get a guard.

## What it changes upstream

| Brief | Change |
|---|---|
| C2 lens | Unchanged, but a theme also carries one, and an arc must agree with its theme's lens or the mismatch is flagged |
| C4 arcs | Gain `theme_id`. A resolving arc writes its closing account onto the theme's `view_history`, which is what makes the archive compound rather than accumulate |
| C5 scoring | `theme_match` is explicitly NOT a component. It gates admissibility only |
| C6 surfacing | 7 slots become 5 themed plus 2 reserved for the unthemed |

## What it does not change

The card contract (C3) is untouched: a theme-derived card is written to the same
four fields and passes the same lint. Nothing about the theme layer excuses a
card from `why_now` or lets an opening be an instruction.

## Voice, per Q2

Krish's Q2 answer also sets a constraint on everything the engine writes, not
just the cards it archives:

> Everything should be proposed and written and drafted in plain english,
> understandable by a 12 year old, in my voice, no AI sounding or bossy or
> over intellectualized or assumptive copy.

"Bossy" is now enforceable: `api/_cardLint.ts` fails an opening written in the
imperative mood, which is what bossy means mechanically. The rest of that
constraint (12-year-old plain English, his voice) stays a `krish-voice` handoff
per C3, because it is judgment and a lint would only produce false confidence.

## Open, and worth deciding before C4

**A theme's granularity is a taste call and the schema cannot make it.** "How is
token-based pricing penetrating B2B?" is the right size. "AI pricing" is too
broad to ever settle; "Cisco's 350M model price" is an arc, not a theme. Ten
seeded themes from Krish would set the scale by example far better than a rule
would, the same way the golden ten sets the quality bar. Worth asking for at the
same time.
