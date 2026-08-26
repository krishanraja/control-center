# Content Engine Restart: what we need, and why

Written 2026-08-26 for someone with no prior context. Plain English throughout.
Also published as a page: https://claude.ai/code/artifact/455073dd-8e3a-4225-8826-34e98743325e

---

## Part one: what the thing actually is

Krish runs Mindmaker. Part of that business is publishing: a weekly written brief plus two
regular publications. He needs a steady supply of good story ideas to feed it.

To do that he has an internal web app called the Control Center. One tab of it is called
Content. Behind that tab sits a set of automated jobs we call the content engine. Every day it
reads the news, and once a week it tries to spot patterns worth writing about. It puts what it
finds on screen as a small stack of cards. Krish flicks through them and says yes or no.

The two publications are **Built with AI** (how companies are actually building things and what
they learned doing it) and **The Money of AI** (who pays, who captures the money, and what
changed in the mechanism). Every story the engine finds should belong to one of those two, or be
thrown away.

The readers are commercial leaders at businesses turning over roughly five to fifty million:
revenue chiefs, general managers, founders. Their job is to find opportunities, not to prevent
disasters. That distinction turns out to matter enormously.

---

## Part two: what went wrong, which is two unrelated problems

### Problem one: the screen was stuck

The Content tab showed the same card at the top for six weeks, dated 10 July. Nothing removed
it, and nothing recent could be reached.

The cause was a plain software fault. The screen asked for the thirty oldest unanswered cards.
There were seventy four. So it showed the oldest thirty, oldest first, and the newest forty were
invisible. Nothing anywhere cleared a card once its moment had passed, so cards only left the
screen if Krish personally tapped one. He rarely did.

**This is fixed.** Self-contained bug, done.

### Problem two: the engine writes the wrong kind of thing

Not a bug. The engine does exactly what it was built to do. It was built to the wrong
specification.

It reads AI industry trade press, so it produces AI industry trade press. The vocabulary it was
given has words for security, governance and compliance, but none for pricing, packaging,
distribution, buyer behaviour or margin. A machine cannot find a story about pricing if it has no
concept of pricing.

So it writes safety advice for a compliance officer, aimed at a reader whose job is to find
opportunities. Of twenty two story cards produced over six weeks, twenty one opened by telling
the reader to do something defensive. Real examples:

- "Audit every unattended agent deployment now."
- "Treat agent output as unaudited until you have logging in place."
- "Reforecast your AI infrastructure budget."
- "Do not wait for federal AI governance frameworks."

What was wanted instead, in shape:

- "There is a repricing window for anyone selling per-seat AI features on frontier margins, and
  nobody has taken the cheap-and-good position in publishing yet."

Shows an opening. Does not issue an instruction.

Second piece of evidence: across its whole life the engine has produced fifty four story
candidates and Krish has accepted **none** of them. He has also never formally rejected one, so
the system has received no feedback at all and has learned nothing since July.

---

## Part three: what is already done, so nobody redoes it

| State | What |
|---|---|
| Done | **The stuck screen is fixed.** List limited to the current cycle, newest first, plus a weekly job that clears cards once their moment has passed. |
| Done | **Sixty four stale cards filed away.** Nothing deleted. Each keeps its full text and links, in a separate archive state so they never get confused with things Krish actually turned down. |
| Done | **A quality checker built.** Automatically rejects the bossy, instruction-shaped writing above. Tested against all seventeen real examples from the archive: rejects every one, accepts a correctly written card. |
| Done | **A factual bug fixed.** The system credited numbers to whoever owned the website they appeared on. A figure belonging to a company called Stuut was published as belonging to Andreessen Horowitz, because a16z's newsletter reported it. That text publishes word for word, so it was a false statement going out under Krish's name. |
| Blocked | **The actual rebuild.** New sources, new vocabulary, stories that build over months rather than being re-found weekly. Needs the four asks below. |

---

## Part four: the four asks

Three need Krish personally, because they are judgment calls about taste. The fourth is a
business and budget question that can start without him.

### Ask 1: Ten stories he would actually have published

Ten real stories from roughly the last three months that Krish would genuinely have written
about, chosen from his own reading.

**Send:**
- Ten stories. Five for Built with AI, five for The Money of AI.
- For each: a link or the headline, plus roughly when it appeared.
- Which of the two publications it belongs to.
- One sentence on what the opportunity in it is. What could a reader do with this, or see that
  others have not?

**Why it matters more than anything else here.** It is the only way to find out whether the
rebuilt engine works. We point it at the same three months of sources and see how many of these
ten it finds on its own. Six or more means the sources are right and the rest is tuning. Fewer
means the sources are wrong, and no amount of clever software fixes that; we stop and change
where it reads. Without these ten we cannot tell those two situations apart, and could spend
weeks polishing a machine pointed at the wrong newspapers.

**One hard rule.** These ten must be kept back and not used while building. If the engine is
adjusted until it happens to find them, finding them proves nothing. They stop being a test the
moment they become a target. Send them and expect not to hear them mentioned again until there is
a result.

They must come from his own reading, not from anything the current system produced. Picking from
its output only measures whether it agrees with itself.

*Time: roughly 30 to 60 minutes. Only Krish can do this.*

### Ask 2: Ten questions worth following for months

Krish asked for something the original plan did not have: a way for the system to build up
understanding over time rather than starting from nothing every week. His words were that it
should compound like little brains on specific theme areas.

Each question becomes a permanent folder. Every story the engine finds gets filed under whichever
question it sheds light on. After six months a question has a history and a considered view
attached, rather than a heap of links. It is also where Krish drops in his own theories.

The whole thing rests on the questions being the right size, and that is a judgment the software
cannot make. Ten examples settle it better than any rule.

- **Right:** "How is token-based pricing evolving and penetrating B2B businesses?" Big enough to
  run for a year, specific enough to eventually have an answer.
- **Too big:** "AI pricing." Never settles, so never teaches. Everything lands in it.
- **Too small:** "Cisco cut the price of its small model this week." A single event. Something to
  file, not a folder to file it in.

**Send:**
- Ten questions, written as questions.
- Ideally five leaning Built with AI, five leaning The Money of AI.
- Where he already holds a view, one line saying what he currently believes. That gets stored as
  a starting position the system can later confirm or contradict.

*Time: roughly 20 to 30 minutes. Only Krish can do this.*

### Ask 3: A yes or no on one rule

Krish set a condition that pulls in two directions. In his words:

> The proposal engine should learn from the ideas and theses I put in there, but not bend all the
> way to just proposing things that look like my ideas, as the whole point of the proposer is I am
> seeing things I would not be thinking about.

Both halves are right and they fight. Any system that scores stories by how well they match his
interests drifts towards showing him his own opinions back, which destroys the one thing the
engine is for.

**Proposed rule, needs a yes or a better idea:**

**a. Matching one of his questions gets a story through the door, but never moves it up the
queue.** If a story would otherwise be filtered out for being off-topic, matching a tracked
question saves it. It never ranks higher than a story he was not expecting. His interests widen
what he sees and never narrow it.

**b. Two of the seven slots on screen are held for stories matching none of his questions.** If
nothing qualifies in a given week those slots stay visibly empty rather than being filled with
familiar material. An empty slot is useful information: the week produced nothing he was not
already looking at.

*Time: a few minutes. Only Krish can do this.*

### Ask 4: Somewhere new to read

Does not need Krish, and is probably the biggest single reason the engine produces the wrong
material.

Everything the engine currently reads, counted from the database. 220 items, all AI newsletters
and headline feeds:

| Source | Count |
|---|---|
| Newsletter sweeps | 117 |
| Topic sourcing | 56 |
| Headline pool | 43 |
| Chat and requests | 4 |
| Company filings | **0** |
| Pricing pages | **0** |
| Ad market data | **0** |
| Job postings | **0** |

A publication about how money moves is being built on sources where money is never mentioned.
This is not a rebalancing. The financial half has to be built from nothing.

**Needed:** which of the following we already have, which we can get, and roughly what the rest
would cost per year. Facts, not a recommendation, so a buying decision can be made.

1. **Company results and filings.** Earnings calls, transcripts and annual reports for listed
   media, publishing and AI companies.
2. **Advertising and subscription figures.** Revenue per user, take rates, renewal and churn
   commentary.
3. **Pricing page tracking.** A way to watch a named list of products and spot when prices or
   packages change. Some of these tools are cheap.
4. **Rights and licensing deals.** Announcements, and terms where public.
5. **Commercially specific trade press.** Digiday, AdExchanger, Press Gazette, The Rebooting,
   Toolkits. Some free, some paid.
6. **Job postings.** For a named list of companies. Hiring tells you what a business is about to
   do before it announces it.
7. **Traffic and search referral data.** Where obtainable.

**Also needed:** a watchlist of twenty to forty companies worth following closely. Media,
publishing, entertainment, plus the AI companies selling into them. A business judgment rather
than a technical one, so a first draft from whoever knows the market, then a look from Krish.

*Time: a few hours of research. Does not need Krish to start.*

---

## Part five: what happens once these land

The work runs in order, because each stage depends on the one before. Guessing at a later stage
before an earlier one is settled is how the current version ended up wrong.

1. **Point it at the new sources.** Needs ask four.
2. **Replace the vocabulary.** The nine existing categories are all technical. They get replaced
   with six covering pricing, distribution, defensibility, buyer behaviour, category position and
   build practice.
3. **Change what a card contains.** Four parts instead of two, including a new one that has to
   explain why this is visible now and was not before. That separates a genuine shift from
   ordinary news. The quality checker for this is already built.
4. **Make stories persist.** Today the engine re-finds the same story weekly and files it as new
   each time, so it can never show movement. It gets memory, and the question folders from ask two
   are where that memory lives.
5. **Change how stories are ranked.** Currently by how many outlets covered something, which
   measures loudness rather than importance.
6. **Fix what appears on screen.** Seven cards maximum, best first, two slots reserved per ask
   three.
7. **Test it.** Against the ten stories from ask one.

Asks one to three take about an hour of Krish's time in total. Ask four can start immediately and
in parallel.

### What to send back

1. Ten stories, split five and five, each with a channel and a one-line opening.
2. Ten questions, ideally split five and five, with a current view where he has one.
3. Yes or no on the two-part rule in ask three, or a better version.
4. The source list priced up, plus a first draft of the company watchlist.

---

## Words used here

- **Control Center** Krish's internal web app. The Content tab is one part of it.
- **Content engine** The automated jobs behind that tab. Reads the news daily, proposes stories
  weekly.
- **Card** One proposal on screen waiting for a yes or no. A story idea, a suggestion to stop
  following something, or the weekly brief itself.
- **Built with AI** One of the two publications. How companies build things and what they learned.
- **The Money of AI** The other one. Who pays, who captures the money, what changed in the
  mechanism.
- **The golden ten** Ask one. The ten stories used to test the rebuilt engine. Kept back, never
  used during building.
- **Theme, or question** Ask two. A long-running question the system follows for months,
  collecting evidence under it.
- **The opening** The part of a card saying what a reader could do or see. Must show an
  opportunity, not issue an instruction. That difference is the entire point of the rewrite.
