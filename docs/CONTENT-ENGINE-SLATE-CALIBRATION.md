# The ranked slate: what forty verdicts actually tell us

**27 Aug 2026.** Krish ran a separate Claude session to generate forty candidate
pieces, ruled every one of them **lead / yes / maybe / no**, and returned the
whole set along with the ranker itself.

Until now only his commentary on that exercise had reached this repo. That is
why the eleven theme folders carry `seed_items` referencing codes like `M11` and
`B07` that resolved to nothing in the database. They resolve now.

- The forty rows live in `content_slate_rulings`, seeded by
  `scripts/migrations/2026-08-27-slate-rulings.sql`.
- The format vocabulary they revealed lives in `api/_formats.ts`.
- `scripts/check-slate-calibration.mts` holds both, and runs in CI.

---

## 1. The thing to be clear about first

This set is a **precision** test. It answers: of the things the engine produces,
which would Krish publish?

It is **not** the golden ten, and it cannot be turned into one.

The golden ten was a **recall** test: ten stories Krish picked himself, out of
his own reading, used to ask what the engine *never surfaced*. This set cannot
answer that, because every item in it was generated first and judged second.
Agreement with a generated list is the exact failure the original work request
named. Seventeen approvals is a real and useful result, and it is not evidence
that the engine finds what Krish would have found on his own.

Both facts are load bearing, so both are written into the migration comment, the
format file and the guard rather than left in a commit message.

---

## 2. The read-out

Forty items, ruled 1 lead / 16 yes / 15 maybe / 8 no. "Converted" below means
lead or yes.

### By format

| Format | Converted | Outlet | Note |
|---|---|---|---|
| The Word For It | 3 of 3 (100%) | Shorts | The only clean sweep |
| The Threshold | 3 of 5 (60%) | Substack | |
| How It Actually Works | 2 of 4 (50%) | Shorts | |
| The Teardown | 2 of 4 (50%) | Substack | |
| Follow the Money | 3 of 7 (43%) | Substack | Carries the single Lead |
| One Number | 2 of 5 (40%) | Shorts | See below, the most useful result |
| Nobody's Taken This | 1 of 3 (33%) | Shorts | |
| The Receipt | 1 of 5 (20%) | Substack | |
| The Lag | 0 of 4 (0%) | Substack | Marked `underReview`, not deleted |

### By channel, evidence, outlet and purpose

| Cut | Converted | | Converted |
|---|---|---|---|
| **Built with AI** | 10 of 16 (62%) | **The Money of AI** | 7 of 24 (29%) |
| **Owned** evidence | 9 of 17 (53%) | **Sourced** evidence | 5 of 15 (33%) |
| **Shorts** | 8 of 15 (53%) | **Substack** | 9 of 25 (36%) |
| **GTM** | 8 of 15 (53%) | **Brain** | 9 of 25 (36%) |

### By the generator's own arc grouping

| Arc | Converted |
|---|---|
| Defaults left on | 2 of 2 |
| Internal agent fleets | 1 of 1 |
| Selling in an agentic world | 2 of 3 |
| The threshold to try | 2 of 3 |
| The price of done | 4 of 7 |
| Who owns the eval | 1 of 2 |
| Teardown of my own engine | 2 of 5 |
| The licensing market | 1 of 4 |
| Engineered extraction | 1 of 5 |
| The unwritten bargain | 1 of 6 |
| Two compute markets | 0 of 1 |
| The machine reader | 0 of 1 |

**On the numbers.** Forty items across nine formats averages four per format.
Treat every percentage above as a direction and not a measurement. That is why
nothing here deletes a format for scoring badly, and why none of it touches the
scorer.

---

## 3. What it settles

**The arc rule is right, and it came from Krish rather than from the brief.**

One Number split two approved and two rejected, and the split was not about the
format at all:

- `M10` (per seat pricing fell 21% to 15%) and `M13` (Atlassian's first fall in
  seats) were **approved**. Both are beats of *The price of done*, an arc with
  seven items and four approvals.
- `M04` (Wikipedia most cited, losing readers) and `M07` (chatbot referrals up
  200% and still rounding to zero) were **rejected**. Both stood on their own.

Same format, same channel, opposite verdicts, and the difference is whether an
arc was already running underneath. `MIN_INDEPENDENT_BEATS = 2` and "a beat with
no arc is discarded silently" were written from the brief. This is independent
confirmation of them from live judgement.

It also **narrows** a claim made in `2026-08-27-arcs-and-beats.sql`, which said
the One Number format was being retired. Too broad. It is retired as a reason a
proposal exists, and kept as a way to present a beat inside one. That is now
`arcOnly: true` in `api/_formats.ts`, and the guard holds it.

**The eleven folders cover everything he approved.** All 17 lead-and-yes items
land in one of the eleven, with none orphaned. The folder set is not missing a
category, which was a real open risk when they were seeded from commentary.

**One folder is thin, and it is now visible.** `content_themes.slate_support`
records the verdicts behind each folder:

| Folder | Support |
|---|---|
| seats-dying | 1 lead, 2 yes |
| moat-vs-pricing | 2 yes |
| why-ai-output-homogenises | 2 yes |
| learning-from-you-not-the-average | 2 yes, 1 maybe |
| when-trying-costs-nothing | 2 yes, 1 maybe |
| selling-a-product-that-rebuilds-itself | 2 yes, 1 maybe |
| judgment-kept-or-codified | 1 yes, 1 maybe |
| what-replaces-the-open-web | 1 yes, 2 maybe |
| attention-by-susceptibility | 1 yes, 2 maybe |
| who-gets-paid-when-machines-read | 1 yes, 1 maybe, 1 no |
| **how-media-makes-money-now** | **1 maybe, 1 no** |

`how-media-makes-money-now` has no approval behind it. Its two seed items were
`M15`, which Krish rejected, and `M22`, from an arc he dropped entirely. It stays,
because it is his own question in his own words ("the whole media channel is the
impact of AI on..."), not something the slate invented. But it is the one folder
founded on nothing he said yes to, and that is now recorded rather than hidden
behind eleven folders that all looked equally well founded.

**Two arcs died.** *Two compute markets* and *The machine reader* produced one
item each and neither converted. Neither has a folder, and neither should get one.

---

## 4. What it does not settle, and the cheaper way to close it

The recall question is still open: **what does the engine never show you that you
would have published?**

Nothing in this set can answer it. The nearest substitute that does not mean
assembling ten stories from scratch:

1. Name pieces you **actually read** in the last month and would have run, from
   memory or from your reading history. Five is enough to start. They do not need
   to be polished or evenly spread.
2. For each, the engine gets checked at two levels, and the two failures mean
   different things:
   - **Was it in the corpus at all?** If not, that is a sources problem, and it
     is fixable by adding a feed. This is testable today against the eleven
     registered sources without any model run.
   - **Was it in the corpus and still not surfaced?** That is a scoring or
     classification problem, and it is the expensive one to fix.

Splitting recall into those two failures is the useful part, and it costs a list
of five headlines rather than ten written cases.

---

## 5. Why none of this touches the scorer

The seventeen approvals are the most concentrated statement of interest in the
system. Feeding them into `scoreArc()` would rank candidates by how much they
resemble what Krish already said yes to, which is the anti-echo rule's exact
prohibition and would quietly remove the proposer's only reason to exist. The
failure would be invisible: a mirror still returns seven cards a week.

So the split is:

- **Form** is recorded in `api/_formats.ts`. Which shape of piece Krish finishes
  is a fact about him as a writer.
- **Subject** is not recorded anywhere the engine can reach. What he approves of
  is the thing the proposer is supposed to be able to surprise him about.

`check-slate-calibration.mts` asserts that `api/_arcScore.ts` cannot see the
slate at all, and that neither `useContentV2` nor the detector reads the rulings
table. That negative assertion is the most important line in the guard.

---

## 6. Not yet wired

The format vocabulary is vocabulary. Nothing in production composes a six-field
card yet, so nothing selects a format at write time. `api/_cardLint.ts` and
`api/_arcScore.ts` both consume a `Card`; no code path builds one. Composition,
lens assignment and folder matching all still need a live model run with keys,
which is the same gap flagged after the detector work.
