# The design corpus: how Control Center stays one product

> **Scope.** The doctrine above the design system: why a surface decays, what
> Krish is asked at any one point, how a change is checked, and the number
> that says whether the whole is getting cleaner or dirtier. Eight short
> files. Written 2026-10-09 from a read of the code, not of the docs.
>
> **Not in this folder.** Tokens, primitives and their props:
> [`DESIGN_SYSTEM.md`](../../DESIGN_SYSTEM.md) is the authority. The
> per-capability index for a coding agent: the root
> [`AGENTS.md`](../../../AGENTS.md), "The house systems". Per-tab behaviour:
> [`PRODUCT.md`](../../PRODUCT.md). This corpus never restates a token and
> never overrules those three on repository matters. Where a line here is
> doctrine for every repository, it is a candidate for `krish-design` in the
> harness, proposed through `harness-maintainer`, never copied by hand.

## Why it exists

Krish, 2026-10-09: "build me a corpus on how to durably avoid design entropy
and ensure information hierarchy and what I'm being asked to do at any one
point is intelligent, sequential, haptic, interactive, and immersive, with
world-class interaction design and motion design and consistency in design
aesthetic. None of this can spiral out of control." And: "there's a lot going
on in here and it's sometimes too much for me. I don't need to get less done."

The repository has learned most of this the hard way already, one incident at
a time, and written each lesson into `DESIGN_SYSTEM.md` beside the primitive
it changed. What was missing is the layer above: the mechanism of decay, the
budget for what he is asked, and a number that a build fails on when the
whole starts to spiral. That is this folder.

## The shape of every file

Each file carries five headings, in this order, and nothing else:

| Heading | What goes under it |
|---|---|
| **The rule** | The doctrine, in plain English a 12-year-old can follow |
| **Learned from** | The dated incident in this repository that taught it, cited to the doc, the decision record or the commit |
| **Held by** | The guard, the test, or the honest words "review only" |
| **Measured by** | The number and where it is read |
| **Open** | What is not fenced yet, in order of blast radius |

A rule with no "Learned from" is an opinion. A rule with no "Held by" is a
wish. Both are allowed in this folder only while they say so.

## The files

| File | One line |
|---|---|
| [`01-entropy.md`](./01-entropy.md) | What design entropy is here, how it grows, the ledger of what is still unfenced, and the ratchet that fails a build when a number rises |
| [`02-hierarchy.md`](./02-hierarchy.md) | Information hierarchy: the Growth standard as law, marks not counts, one claim per surface, the accent language |
| [`03-the-ask.md`](./03-the-ask.md) | What he is asked at any one point: one queue, the shape of an ask, the ask budget, the "Done" trap |
| [`04-interaction.md`](./04-interaction.md) | Interaction craft: affordance, two paths for every gesture, the write side, what "haptic" honestly means on his phone, voice, immersion |
| [`05-motion.md`](./05-motion.md) | Motion: one curve family, one duration scale, the gesture vocabulary, what never animates |
| [`06-consistency.md`](./06-consistency.md) | Aesthetic consistency: the token layers that exist, the three that do not, the sibling test, one vocabulary per concept |
| [`07-review-ritual.md`](./07-review-ritual.md) | How a change is checked: the guards, the layout audit, measure never argue, the concept gate, the quarterly entropy read |

## How a new rule enters

In this order, never skipping a step:

1. **An incident.** Something shipped wrong and was seen: a screenshot from
   Krish, a failed gate, a number in the audit.
2. **The rule**, written under the file it belongs to, with the incident
   under "Learned from".
3. **The guard**, where a script or a test can see the rule. A guard that has
   never been seen to fail is a comment: plant the defect, watch it fail,
   remove the defect, then commit (`07-review-ritual.md`).
4. **The baseline**, when the rule is a count rather than a ban: the number
   measured on the day, written into `scripts/design-entropy.baseline.json`,
   lowered only after a sweep.

A rule that arrives as an opinion with no incident goes under "Open" until it
earns the other four.

## The quarterly entropy read

Once a quarter, or after any sweep, run the ledger in report mode and record
the table in `01-entropy.md` under "Measured by", dated:

```
npx tsx scripts/check-design-entropy.mts --report
```

Every row at or below its baseline is the system holding. Every row that a
sweep took down gets its baseline lowered in the same commit. A row that
needed its baseline raised is the one incident the corpus exists to make
visible, and it gets written up under "Learned from" before the baseline
moves.
