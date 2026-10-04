# The network: what it is for, and how it comes together

Written 2026-10-04, after the relationship sync, the LinkedIn imports, shared
history and plays went live. It is the brief for the next builds. Every number
in it was measured against production on the day, not estimated.

## The one job

Krish's weak point is asking his own network for help, and his failure mode is
the blank page. His network is good. So the system's job is narrow and it is
not "a CRM" or "a better search":

**Every week, put three specific, warm, well-shaped asks in front of him that he
only has to edit and send, then learn from what happens.**

Every build below is judged by whether it makes those three asks more likely to
be right, more likely to be sent, or more likely to land. A feature that makes
the network more browsable but no ask more likely is decoration.

## What exists now

Four layers, each feeding the next.

| Layer | What it holds | State |
|---|---|---|
| **Identity** | One person, many handles. `correspondent_stats.person_key` is the email where known, else `li:<slug>` | Live. 3,773 LinkedIn-only contacts are now visible |
| **Evidence** | What the record can prove: mail, calendar and LinkedIn messages each way, meetings, who wrote last, how long since; shared employers | Live. 3,146 measured, 1,070 two-way, 826 alumni |
| **Meaning** | What each person can do for Krish: `contact_intelligence.plays` (alumni, multiplier, buyer, amplifier, subject) | Live, v1, rules on title and headline |
| **Action** | The ask flow: need in, three people out with reason, proof, shaped wording | Live, reactive only |

Measured on 2026-10-04: alumni 826, buyer 2,207, multiplier 182, amplifier 152,
subject 348.

## The rules that keep it honest

These were each learned by nearly shipping the opposite. Keep them.

- **Say what the record proves and stop.** Career rows carry a duration, not
  dates, so the system says "also at Nine", never "you worked together".
- **A guess is labelled as a guess.** Warmth from an import is capped at 50 and
  marked `inferred`; only evidence can score higher. A guessed 100 once ranked
  above people he emails weekly.
- **Measure before you match.** Every pattern was run against live data first.
  "Nine" matched Group Nine Media; "Excite" matched a travel company; a domain
  rule silenced two journalists at news.com.au.
- **Where someone is now comes only from a fresh profile read.** 360 contacts
  still read "Amobee", renamed in 2023.
- **Never count a row you have not paged to.** PostgREST returns 1,000 rows by
  default; that once hid five sixths of an exclusion list and would have
  created a hundred duplicates.

## The back catalogue (2026-10-04)

The Meta export brought in Krish's Facebook friends, his Instagram and the
phone contacts Meta holds: 1,325 people, mostly from before LinkedIn. Each is
now on the record as a personal tie (`contact_intelligence.tie`), browsable
through the "Know you outside work" door, with his schools as a second row
the way employers sit under alumni. A school shared in the same years is the
one place the record can say "at the same time", because education rows carry
years and career rows do not.

Apify had guessed LinkedIn profiles for a third of them and was right 59% of
the time against his own connections, so a guess is believed only where his
record, his connections, his schools or a close employer agree. The rest are
questions in People to check, value first. The people worth his time there
are the ones a confirmed profile would turn into a buyer or a multiplier he
already knows personally.

## How it comes together: the next five builds, in order

### 1. The weekly three (the blank page dies)

**What.** Unprompted, once a week, three asks appear on Focus, one from each
source of a good reason to write:

- a **moment**: someone who wrote last and is owed a reply, or someone new in a
  seat (under 120 days)
- a **quiet alumnus**: a former colleague, now senior, not spoken to in months
- a **multiplier**: someone who reaches many buyers, with a warm path

Each is an `AskWho` card, already built. Taking one seeds today's ask through
the strategist seed path, so there is still one ask a day in one place.

**Why first.** It is the only build that removes the need to type a need, which
is the step he skips. Everything it needs exists.

**Where.** Extend the daily move (ADR-028), not a second proposer. One move a
day becomes three a week, with the same answer bank.

### 2. Ask from a person, not only from a need

**What.** The person sheet gets "Ask them". It opens the ask flow pointed at
this one person: the shared history line, the proof line, and wording shaped by
their play.

**Why.** Today the flow runs need to person. Half the time he is looking at a
person and wondering what to say. Small build: the route already takes a pool;
give it a pool of one.

### 3. The outcome loop

**What.** When the daily ask resolves (yes, no, alternative, no reply), write it
against the contact as evidence. The next proposal knows "asked in October,
said yes" or "asked twice, no reply".

**Why.** The card already records his prediction and the outcome, and both are
thrown away as far as the network is concerned. That is the best training data
the system will ever have about who answers him.

### 4. The role-change watch

**What.** Once a month, re-read the profiles of the people whose next role
matters: alumni and buyers with measured warmth, about 500 people. A changed
title writes `role_changed_at`, which feeds "new in seat" in the weekly three.

**Why.** "Newly appointed CRO, first 90 days" was his second category, and it is
a change, not a state, so search can never find it. `role_changed_at` and
`contact_role_history` already exist and hold **zero** rows, because nothing
refreshes profiles.

**Cost.** About $3 a month at the observed $0.005 a profile, inside the $25 cap.

### 5. Engagement on his own posts

**What.** Weekly, who liked, commented on or reshared Krish's LinkedIn posts.

**Why.** It is goodwill made visible, and it is the cheapest way to find
amplifiers: people who already carry his ideas to their own audience.

**Cost.** About $10 a month.

### Smaller, worth doing

- **Plays v2.** Rules over-match "chair" (board chairs are not peer-group
  chairs). A model pass on ambiguous titles, and a one-tap "not a multiplier"
  correction that writes an override. A correction is training data.
- **Merge duplicates.** Built 2026-10-04; the merge step itself goes live
  when Krish confirms it (it deletes the merged-away row). `merge_contacts()` keeps everything
  and records it in `contact_merges`. It runs on its own only where two rows
  share an identity key (the same LinkedIn profile, or the same name at the
  same work address). Everything that rests on a name is a question in People
  to check, because two people with the same name is still a coin toss.
- **Fresh LinkedIn export each quarter.** Free, five minutes of his time. The
  current one is from February, so every LinkedIn conversation since is
  invisible.

## The multiplier project

Krish's bet (2026-10-03): multipliers are where the 1000x comes from, because
one relationship puts Brain and GTM in front of ten to thirty leaders at once,
and you cannot get there one leader at a time.

**The bet is probably right. The network does not hold it yet.**

| Kind | In the network | With a measured relationship |
|---|---|---|
| PE and VC operating, platform, portfolio | 20 | |
| Chairs, coaches, peer groups | 88 (over-counted: includes board chairs) | |
| Fractional CRO and CMO | 25 | |
| Agency and consultancy partners | 56 | |
| **All multipliers** | **182** | **71** |
| Multipliers who are also former colleagues | **8** | |

This is a supply problem, not a retrieval problem. No ranking change finds
people who are not there. So it is a project of its own, in this order.

### Phase 0. The offer, before the list (week 1, free)

What does a PE operating partner get from putting Mindmake in front of their
portfolio? What does a Vistage chair get? Without a packaged answer (a
portfolio programme, a chair-led session, a referral or resale share), a list
of multipliers is a list of people to pitch badly. Write the multiplier offer
first, one page per kind.

Then work the 71 measured multipliers and the 8 alumni multipliers with it.
They are the test of the offer, and they cost nothing to reach.

### Phase 1. The target list (one-off, about $20 to $40)

Build named targets in his five multiplier kinds, narrowed to his markets
(Sydney, New York, London) and his sectors (media, publishing, marketing
services, adtech):

- operating partners and value-creation leads at media, publishing and
  marketing-services PE funds
- platform and portfolio-support heads at Series A to C funds
- Vistage, YPO and Chief-style chairs
- fractional CRO and CMO collectives
- boutique strategy and agency principals with no AI practice

Source: LinkedIn search by title within a named list of funds and firms,
through the existing Apify path with a hard dollar ceiling. A few hundred
profiles at about $0.005 each. Import as contacts with source
`multiplier_target`, play `multiplier`, tier cold. Never mixed into warmth:
they have no relationship, and the system must say so.

### Phase 2. The warm path (free, the part only this system can do)

For each target, find who in Krish's measured network can introduce him:

- someone who shares a current employer with the target
- someone who shares a past employer with both the target and Krish
- a two-way relationship at the target's fund or firm

The ask then goes to the introducer, not the target, in a new ask shape:
"introducer". That is how a cold list becomes a warm one.

### Phase 3. Track it as a channel

A small pipeline per multiplier: identified, warm path found, intro asked,
met, pilot, reselling. The measure is not meetings. It is **leaders reached per
relationship**. Ten active multipliers reaching twenty leaders each is 200
qualified conversations, which is the 1000x in practice.

## Budget

Inside the agreed $25 a month cap:

| Item | Monthly |
|---|---|
| Role-change watch (about 500 profiles) | ~$3 |
| Engagement on his posts | ~$10 |
| Ask-time deep reads (three people per ask) | ~$5 |
| Headroom | ~$7 |

The multiplier target list is a one-off of about $20 to $40, approved
separately when Phase 0 is done.

## What success looks like

Not a better-looking network tab. Measured monthly:

- asks sent per week (target: three)
- reply rate on those asks, against his own predictions
- leaders reached through multipliers
- the share of proposals he takes without rewriting them
