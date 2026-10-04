# Shift proposal (draft, not inserted): The review queue is where agent oversight goes to die

Drafted 2026-10-04 from the OS Queue audit. This file is a draft for Krish. Nothing was written to `content_decisions` or `shifts`; if he wants it tracked, it goes in through the Content tab like any other shift.

**Format:** mind.the.gap (Fridays). **Gap it works:** between what is claimed and what is actually happening.

## The shift

Teams keep adding a human approval step to their AI agents, and the step quietly turns into a pile nobody reads, so the agents run on unchecked while everyone believes someone is checking.

## Evidence

1. Ten rule changes that agents proposed for their own instructions sat waiting for a human yes or no for 41 days. In the life of the system only 2 were ever approved, 0 were rejected, and 11 were overtaken by later versions before anyone looked.
2. Of 27 items waiting for a human ruling, 20 (74%) were stale or already replaced by a newer version, and 21 (78%) were shown somewhere else as well. A "persistent gap" alert first raised on 17 July was still open 79 days later, and a calibration card meant to tune the agents had 0 answers, ever.
3. Four "growth stalled" cards opened between 12 and 19 August were never refreshed. One still said 4 paid subscribers when the live number was 2, so the card asking for a decision was wrong about the very number it was asking about.

## The angle for mind.the.gap

The common story says agents need a human in the loop. The pattern underneath is that the loop is real and the human is not: approval steps are added once, at launch, and nobody budgets the reading time they need, so the queue grows, the alerts never close and the numbers on the cards go stale while the agents carry on. The piece names that half-noticed thing (a review step is a promise, and a backlog is a broken one) and traces it across public cases: incident reports where an approval existed on paper, vendors selling "human in the loop" as a feature, and teams that measure how many items reach review but never how long they sit there.

The evidence above is private and must not become the subject. The mandate's not-us gate rules out Krish's own operating loop, so these numbers are the reason to look, not the story. The published piece has to stand on public cases.

**Draft call, for Krish to rule on:** By 31 March 2027, at least one major agent platform will ship a default that expires or escalates an unreviewed approval after a set number of days, and will market it as a safety feature. How sure we are: (Krish sets the number).
