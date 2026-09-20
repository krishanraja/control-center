# Using the Content Engine

Written 2026-09-20. This is the **operator's guide**: which surfaces exist, how
to start a piece, how to shape it, and how to get it out. Every other
`CONTENT-ENGINE-*.md` in this tree is a build artifact (a spec, a ledger, an
ask, a calibration). None of them answers "what do I press", which is why this
file exists rather than a ninth spec.

Everything below was read from the live code and the live schedules on the date
above. Where a claim is inference rather than something read, it says so.

---

## The shortest version

| I want to… | Go here | What happens |
|---|---|---|
| Start from a topic I name, or research I already have | **+ button → Start from research**, or the Content tab's own button | Researches it, or files your paste, and opens a piece |
| Get a raw thought out of my head | **+ button → Capture an idea** | One line stored; Cleo enriches and dedupes later |
| Turn something that already happened into a piece | Content tab → **Supply drawer → seed rail** | A ranked list of real artifacts; pick one, it becomes an idea |
| Fold several half-ideas into one piece | Content tab → **In progress → Fold drafts together** | Synthesis into one format you choose |
| Shape a piece | Open it. `#/content?idea=<id>` | Full-screen composer with the edit palette |
| Shape the weekly brief | `#/content?brief=<week>` | Same composer, brief mode |
| Decide a pile quickly on a phone | Content tab → **Queue** | The decision deck, one card at a time |
| See what the machine has been doing | Content tab → **Supply drawer** | Sources, counts, and engine health |

The **+ button is the one way to create on a phone** (`CreateSheet` plus the
`src/lib/quickCreate.ts` bus). Never add a second inline create button on a
narrow viewport.

---

## Where it actually runs

Three systems, one database. Knowing which is which saves an hour when
something looks broken.

| System | What it owns | Where |
|---|---|---|
| **Control Center** | The desk. The Content tab, the composer, the mobile deck, the reviewer | This repo, `src/` |
| **Content Engine control plane** | Every route, cron and guard behind them | `content-engine/apps/control-plane`, its own Vercel project |
| **n8n (Cleo)** | Sourcing arms and distribution arms | n8n Cloud |

Control Center reaches the control plane through **rewrites in `vercel.json`**,
so every URL the browser uses is unchanged: `/api/content-ideas/*`,
`/api/briefs/*`, `/api/shifts/*`, `/api/arcs/*`, `/api/feed/*`,
`/api/investigations/*`, `/api/video-studio/*`, `/api/aeo/*` and
`/api/content-engine/*` all resolve to the content-engine deployment.
That move is [ADR-019](./DECISIONS/019-content-engine-owns-the-control-plane.md).

**Consequence worth remembering:** a content route failing is a
*content-engine* deploy problem, not a Control Center one, and its environment
variables live on that project. Vercel bakes env vars in at build time, so
changing one there needs a redeploy before any running function sees it.

---

## The three subchannels

Read from `venture_formats` in Mindmaker OS through `src/lib/formats.ts`. This
table is a convenience; **the code must always derive from `SUBCHANNELS`**, never
from a copy.

| Slug | Shown as | Cadence | Target/week | Hero |
|---|---|---|---|---|
| `mind_the_gap` | mind.the.gap | Fridays | 1 | yes |
| `split_the_bill` | split.the.bill | Wednesdays | 1 | |
| `lift_the_lid` | lift.the.lid | No fixed day | 0.5 | |

The boundary between them is a test on the **question**, not the surface:
*what it costs and who pays* is split.the.bill; *sharper or dependent* is
lift.the.lid; *what is happening against what everyone says is happening* is
mind.the.gap. Each room prints its own standing question under the heading.

Older rows carry retired spellings (`paid`, `built`, `money_of_ai`,
`built_with_ai`). `resolveFormat()` reads the alias ledger **first**, so those
rows still land in the right room. `formatSpelling()` tells you whether a value
is current, retired or unknown. Never write a retired spelling to a new row.

---

## Six ways to start something

### 1. Start from research
**+ button → Start from research**, or the button on the Content tab.
Name a topic and it goes and researches it, or paste research you already have,
or both. Hits `POST /api/content-ideas/research-topic`.

Both paths land in the same place on purpose: pasted material is stored in the
same `meta.materials[]` shape the composer and revise already read, so "research
this for me" and "here is my own research" are the same piece afterwards.

### 2. Capture an idea
**+ button → Capture an idea.** One sentence, stored raw. Cleo enriches and
dedupes it later. Use this when you do not want to stop what you are doing.

### 3. Seed from something that already happened
**Content tab → Supply drawer → seed rail.** The ranked list comes from
`GET /api/content-seed-candidates`; choosing one posts to `/api/content-ideas`.
All the judgement about what counts as content-grade (time-box, quality gates,
dedupe, exclude already-seeded, ranking) is server-side. If the engine has
nothing, the rail says so rather than scraping a dead table to look busy.

### 4. Fold several drafts into one
**Content tab → In progress → Fold drafts together.** Pick the target format
and it synthesises. `POST /api/content-ideas/synthesize`. Synthesis targets a
**format**, never the venture, because the three carry different registers.

### 5. Open something directly
The Content tab is hash-routed, so these are shareable and bookmarkable:

```
#/content?idea=<uuid>      the composer on one piece
#/content?brief=<week>     the composer on a weekly brief
#/content?video=<reviewId> the video reviewer
```

### 6. Let the machine do it
See the next section. Most supply arrives this way.

---

## What the machine starts on its own

### Content Engine crons (`content-engine/apps/control-plane/vercel.json`)

| UTC | Path | What it is |
|---|---|---|
| `30 11` daily | `/api/feed/ingest` | Feed ingest |
| `0 12` daily | `/api/content-opportunities/refresh` | Editorial radar |
| `0 3` daily | `/api/triage/sweep` | Triage sweep |
| `0 4` daily | `/api/content-ideas/cluster` | Draft clustering |
| `0 10` daily | `/api/content-ideas/archive-stale` | Stale idea archive |
| `0 */2` | `/api/inspiration/drive-scan` | Drive inspiration scan |
| `0 9` Mon | `/api/discover-lens-radar` | Lens radar |
| `0 8` Tue | `/api/discover-creator-posts` | Creator scout |
| `0 5` Sat | `/api/discover-build-signals` | Build signals from your own repos |
| `0 21` Thu | `/api/investigations/run` | Investigations |
| `30 17` Fri | `/api/shifts/detect` | Shift detection |
| `50 17` Fri | `/api/arcs/surface` | Weekly surfacing |
| `0 18` Fri | `/api/briefs/assemble` | **The weekly brief is assembled** |
| `0 14` Mon | `/api/purge/run` | Monday purge |
| `0 16` Sun | `/api/learning/compile` | Learning compiler |

`src/lib/contentEngineSchedule.ts` in **this** repo holds the same list with
staleness tolerances, which is what the tab reads to say a job has gone quiet.

**It is a second copy and nothing guards it.** The guard is real but it lives in
the other repo (`content-engine/apps/control-plane/scripts/check-content-engine-schedule.ts`)
and checks that repo's own copy against that repo's `vercel.json`. Since
ADR-019 moved the crons, none of these paths is a cron in Control Center's
`vercel.json`, so no local guard could check them. The two lists agreed
job-for-job when last compared (17 each, 2026-09-20). **Add or remove a cron and
you must edit both by hand.**

### n8n (Cleo)

| Workflow | Trigger |
|---|---|
| Inspiration Sweep | Twice daily. Observed firing at **10:00 and 22:00 UTC** |
| Content Lane Sourcing | Daily 13:00, plus webhook `content-lane-sourcing` |
| Synthesis Engine | **Wed and Sun 12:00 UTC** (`0 12 * * 0,3`) |
| Omnichannel Content Factory | Webhook `content-factory` |
| Draft Post on Demand | Webhook `content-draft-post` |
| Content Transform | Webhook `cleo/transform` |
| LinkedIn Distribution | Webhook `content-distribute-linkedin` |
| Log Content Performance | Webhook `content-log-performance` |
| Newsletter Sweep | Sub-workflow only, called by others |
| Content Idea Capture | Webhook `idea-capture`. **Currently inactive** |

The Inspiration Sweep's trigger nodes are named "Daily 06:00 ET" and "Intraday
18:00 UTC". The observed execution times are 10:00 and 22:00 UTC, which matches
06:00 and 18:00 Eastern. The second node's name is therefore wrong; the times
above are what the execution list actually shows.

---

## Ideating on a piece

Once a piece exists, these act on it. All are `POST /api/content-ideas/<id>/…`.

| Route | What it does |
|---|---|
| `deepen` | Goes and researches, and **saves the research against the piece** rather than rewriting it |
| `dive-deeper` | Pushes further into the existing angle |
| `challenge` | Argues against the piece |
| `chat` | Conversation about this specific piece |
| `score` | Scores it |
| `judge` | Puts it in front of the panel |
| `materials` | Attach or read source material (`meta.materials[]`) |
| `editorial-route` | Decide which subchannel it belongs to |

---

## Iterating: the composer and the edit palette

Open a piece and you get the full-screen composer. The palette is built by
`buildEditGroups()` in `src/lib/contentEngine.ts` and is context-aware: a brief
does not get format adapts or channel cuts, because it is the master that gets
fanned out to them.

| Group | Options | Count |
|---|---|---|
| Tone | Punchier, More contrarian, Warmer, More formal | 4 |
| Humor | Witty, Sarcastic, Absurd, Satirical, Deadpan, Periodic | 6 |
| Length | Short (LinkedIn), Mid (teaching), Full essay | 3 |
| Sharpen | Shorter, Sharper hook, More data, Harder ending, Sharpest angle | 5 |
| Analogy | Add one, Carry it further, Break it honestly, Cut it | 4 |
| Change the format | The three subchannels, minus the one it already is | 3 |
| Deep research | Follow the money, Find who shipped it | 2 |
| Video script | 15s, 30s, 60s, 3min, 10min, 20min | 6 |
| Cut for a channel | Substack, LinkedIn, YouTube script, Instagram, Podcast, Signal & Noise | 6 |

**The modes are not all the same thing, and this matters:**

- `tone`, `humor`, `length`, `feedback`, `zoom` **revise**. They preview over
  the draft and you keep or discard.
- `deepen` **saves research** against the piece. It does not rewrite.
- `video` **saves a script**. It does not preview over the draft.
- `channel` **saves a cut** into `transformed_outputs`. Also not a preview.

If an edit seems to have "done nothing", check which of those four it was. Three
of them deliberately leave the draft alone.

---

## Producing and shipping

| Step | Route or surface |
|---|---|
| Final pass | `POST /api/content-ideas/<id>/final-pass` |
| Save a draft | `POST /api/content-ideas/<id>/save-draft` |
| Cut for a channel | `POST /api/content-ideas/<id>/channel-cut` |
| Video script | `POST /api/content-ideas/<id>/video-script` |
| Production brief | `POST /api/content-ideas/<id>/production-brief` |
| Schedule it | `POST /api/content-ideas/<id>/schedule`, body `{ date: 'YYYY-MM-DD' | null }` |
| Push the weekly brief out | `POST /api/briefs/<week>/push` |
| Revise the brief | `POST /api/briefs/<week>/revise` |
| LinkedIn | n8n webhook `content-distribute-linkedin` |

---

## The week, in order

1. **Daily.** Feed ingest, editorial radar, triage, clustering, stale archive.
   Sweeps run twice. Supply accumulates without you.
2. **Mon.** Lens radar. Purge.
3. **Tue.** Creator scout.
4. **Wed.** split.the.bill is due. Synthesis engine runs at noon.
5. **Thu.** Investigations.
6. **Fri.** mind.the.gap is due. Shift detection, then weekly surfacing, then
   the **weekly brief assembles at 18:00 UTC**.
7. **Sat.** Build signals from your own repos.
8. **Sun.** Synthesis engine again. Learning compiler.

lift.the.lid has no fixed day and a target of 0.5 a week, so it is the one you
place by hand when a product change deserves it.

---

## When it looks broken

- **The alert mark in the top bar** carries engine failures, not the Content
  tab. Ruling (Krish, 2026-09-17): "Move to the alert mark entirely." A broken
  cron is the same "something is on fire" as fleet silence, so it says it in the
  same place and Content says nothing about it at all.
- **Retry a failed job** from there: `POST /api/content-engine/runs/replay`.
- **Health**: `GET /api/content-engine/health`, `GET /api/content-engine/ping`.
- **A job that has never reported at all** is the loud case. A job that returned
  nothing on a quiet day is not, and `starvationIsNormal` marks the ones where
  silence is legitimate (the learning compiler, the Drive scan).

**Read the numbers, not the green tick.** Several parts of this pipeline are
designed to degrade rather than fail, which means a run can report success while
having done almost nothing:

- The inspiration sweep records `had_response`. False means no model answered
  and the newsletters stay unread, deliberately.
- The lane sourcing heartbeat reports `planned` and `due` separately, plus
  `lanes_without_a_format`.
- AEO packets carry `digest_writer: fallback` when the model call failed and the
  deterministic writer produced the digest instead.

---

## Known gaps, honestly

- **No subchannel has a wordmark.** Both existing PNGs name formats retired on
  2026-09-17, so rooms set the format in type. Declared as `NO_WORDMARK_FOR` in
  `src/lib/publicSeries.ts` and held honest by
  `scripts/check-content-taxonomy.mts`. Ruling (Krish, 2026-09-20): type only,
  no plate, because the plate read as a black bar repeating the room chip.
- **mind.the.gap has no corpus section.** Declared as `NO_CORPUS_PLAYBOOK` in
  `content-engine/api/_content.ts`.
- **Retired names still appear in three places in the UI.** The mobile Queue
  passes the retired slug `built` into `LaneRoom`
  (`ContentV2Tab.tsx`), the Deep research chips are labelled "Paid:" and
  "Built:" (`contentEngine.ts`), and `ShiftsRoom.tsx` prints
  `publicSeriesLabel('built')` and `publicSeriesLabel('paid')` in a caption.
  The alias ledger means none of these is broken; they are wrong words on a
  working surface.

---

## What this file is not

| File | What it is for |
|---|---|
| `CONTENT-ENGINE-V2-SPEC.md` | The locked build spec for the brief and shifts |
| `CONTENT-ENGINE-THEME-LAYER.md` | How themes and theses enter the engine |
| `CONTENT-ENGINE-BUILD-SIGNALS.md` | Your own repos as supply |
| `CONTENT-ENGINE-SLATE-CALIBRATION.md` | What forty of your verdicts taught the ranker |
| `CONTENT-ENGINE-PARITY-LEDGER.md` | What moved where during the 2026-09 unification |
| `CONTENT-ENGINE-RESTART-ASK.md` | The plain-English restart brief |
| `CONTENT-ENGINE-REWRITE-RECONCILIATION.md` | Brief names against real schema |
| `CONTENT_TAB_SPEC.md` | **Historical.** June 2026 lanes model, taxonomy dead |
