# The AEO research machine: subjects, probes, digests, actions

> Spec, 2026-09-09. Krish's ask, from a LinkedIn post describing a
> Profound-built research agent: "i want to create this sort of thing for
> all my ventures ... or companies I want to aspire to, companies I want to
> sell to ... so many clues to figure out how to be in front of them in AEO.
> UI lives in control center to empower the current product growth engine,
> machine in AEO-Engine repo. Automated, autonomous, always orient to
> insight and action." This file is the answer that ships. The machine is
> `krishanraja/AEO-Engine`; this repo is where its work lands and is acted on.

## Why

Nobody is asking Google first any more. The buyers of CTRL, Circle and
Pulse, the leaders Mindmake wants in the Room, and the companies Krish
measures himself against are all asking an answer engine, and the answer
either names us or it does not. Before this the OS asked twelve questions a
week through Perplexity and recorded the miss (`api/growth/geo-probe.ts`);
nothing read the calls, nothing proposed what to write, nothing compared
week to week, and nothing knew about a prospect or a benchmark at all.

Three charter jobs served with one machine: fill the room (a prospect's
read is the clue for how to get in front of them), feed the demand engine
(the recommendations are content supply with a target query attached), keep
the edge (a benchmark's playbook says what wins).

## What it is not

Not a new tab, room, format or channel. One registry, one probe table
extended in place, two new tables for the corpus and the read, and one new
`source_type` into the existing content spine:

```
growth_aeo_subjects (ventures seeded; prospects and aspirations added on the tab)
  -> GET  /api/aeo/context           what the engine reads: subjects, geo touchpoints,
                                     striking-distance keywords, 28 days of probes,
                                     the Room target for a prospect, last week's digest
  -> krishanraja/AEO-Engine          Sunday 04:00 UTC, GitHub Actions, one packet per subject
  -> POST /api/aeo/ingest            probes -> growth_geo_probes
                                     queries -> growth_aeo_queries
                                     digest  -> growth_aeo_digests
                                     recommendations -> content_ideas (aeo_signal, max 3)
  -> api/content-opportunities/refresh.ts   both lenses judge an aeo_signal like a build
  -> api/growth/council-run.ts       Sunday 17:00 UTC reads the digest as evidence
  -> Growth tab, Signals             the read, the movements, the actions
```

## The subject

| kind | what the engine asks | what "we are cited" means | the extra the digest carries |
|---|---|---|---|
| `venture` | what this product's buyers ask (call themes, geo touchpoints, striking-distance keywords, last week's watch list, competitor gaps) | the venture's domains | themes from calls |
| `prospect` | what this company's senior leaders ask an assistant about their own strategic problem (the Room target's `why_face` and trigger, the face ICP, the sector) | Mindmake's domains and Krish himself | `approach_hook`, one cited opening line |
| `aspiration` | the category's questions where this company competes | the company's own domains (`they_cited`) | `playbook`: which of their pages the engines cite, and why |

A subject row: `kind`, `slug`, `name`, `domains[]`, `competitor_domains[]`,
`icp_line`, `seed_topics[]`, `never_say[]`, `product_slug` (ventures only),
`room_target_id` (prospects only), `active`. Retiring is `active=false`;
nothing is deleted because the digests hang off the row. A competitor list
starts empty on purpose: the engine tallies who is actually cited instead of
us and never invents a rival.

## It already knows how he writes and who he rates

Krish said both of these to the OS once, on the Content side, and neither
should ever be repeated:

- **`system_config.content_voice_block`** is the krish-voice body, the same
  text every content call is grounded in. The context route sends it, so a
  recommendation title and angle are written in his voice rather than in
  generic marketing register.
- **`content_creators`** is the registry of the writers he rates, each with
  the move he rates them for ("named concept plus one-line economics plus
  proof plus CTA", "story-led essays that build the audience before the
  product"). The Tuesday creator scrape and the editorial lens already read
  it; the AEO digest reads the same rows, so the moves it reaches for are the
  ones he admires.

Adding a voice on the Content tab improves the next AEO digest with nothing
to copy across. Both are sent empty rather than invented when the read fails:
a machine writing in a voice it guessed at is worse than one writing plainly.
This is also the natural seed list for aspiration subjects, which are
companies rather than people, so the two lists stay separate on purpose.

## The packet

`docs/AEO-PACKET.schema.json` (identical to `docs/packet.schema.json` in the
engine repo). One per subject per week. `week_start` is the Monday that owns
the week (UTC, `mondayOf` in `api/_growth.ts`), so the Sunday 04:00 run
reports the week that began six days earlier and the council at 17:00 reads
the same week.

Every string is plain English with no em dashes (`sanitizeVoice` on the way
in). Call material is paraphrase only, keyed by an opaque eight-character
`call_ref`, never a transcript id, a name or a quote. A packet carrying an
email address or an `@handle` is refused as a whole (400 with every problem
listed), because `themes` and `call_evidence` are read on the tab with the
anon key.

## Demand is a proxy, and says so

There is no prompt-volume corpus here. `demand_score` (0 to 100) is three
labelled parts in `demand_basis`: `llm_demand` (0 to 40, whether the engines
return a substantive, cited answer at all), `transcript_evidence` (0 to 30,
matched calls), `rising_volume` (0 to 30, Google volume from
`maya_striking_distance` when a tracked keyword matches, else week-over-week
movement only). `labels` always carries "no prompt-volume corpus; proxies
only". If four weeks of ledgers show the proxy is useless, DataForSEO's
keyword volume through the existing n8n credential is the next rung, not a
vendor contract.

## Idempotency and the three attempts

The engine's workflow tries three times with fifteen minutes between them.
The ingest makes that safe: the same `run_id` for the same subject-week is
`deduped: true` and writes nothing; a different `run_id` replaces the week
(that run's probes and the week's queries removed, the digest upserted,
a dismissal carried across when the same query is recommended again).

## Into the content spine

Up to `MAX_IDEAS_PER_SUBJECT` (3) recommendations become `content_ideas`
rows: `source_type='aeo_signal'`, `source_ref='aeo:<kind>:<slug>:<week>:<n>'`
(one live row each, `content_ideas_aeo_signal_ref_live_uq`), `expires_at` 21
days out, `meta.aeo` carrying the target query, the angle, the evidence, the
engines where we are absent and the demand, `touchpoint_id` when a geo
touchpoint matched. The governor is the build-signal one: at twelve
undecided `aeo_signal` rows the digest still lands and no idea is added
(`content: { skipped: 'backlog_governor' }` in the response). The radar
reads an aeo row through `aeoSignalSummary` and the routed child keeps
`meta.aeo`, so a piece can be checked against the question it was written
to win.

## The council

`Evidence.aeo` in `api/growth/council-run.ts`: status present or missing,
`themes_status`, the themes, the strongest signal, the biggest gap, the top
three undismissed recommendations and the watch list. A missing digest is
pushed to `unknowns` ("a missing run, not no demand"); `no_calls`,
`no_attributed_calls` and `fireflies_unavailable` each get their own unknown
sentence. The measured line gains an AEO segment and the writing prompt is
told that when the research is present, one finding or double-down must
address it.

## Run now

`POST /api/aeo/run` writes an `aeo_commands` row first, then fires
`repository_dispatch` (`aeo-run`) on `AEO_REPO` with `AEO_DISPATCH_TOKEN`.
The response says `dispatched: true` or the GitHub error. The engine reports
`running` and `failed` through `PATCH /api/aeo/run`; the ingest marks the
command `done`, and a scheduled packet supersedes any stale queued row. No
drain exists: a press that could not start is said on the tab and waits for
Sunday.

## When it goes quiet

`aeo_ingest` is an external job in `src/lib/contentEngineSchedule.ts` (a
week plus a day of grace), wrapped in `withContentRun`, so the Content tab's
obligation strip says "AEO research has not succeeded in N days" like any
other job. `scripts/check-content-engine-schedule.mts` learned that an
external job must not be a cron and must still record.

## The surface

The Growth tab's Signals section is rebuilt around this read, subject-first,
read first, rows second, the action on the card: a portfolio sentence with a
trend, what moved since last week, then each subject grouped by kind (your
ventures, companies you want to sell to, companies you want to be like) with
the strongest signal, the gap, and folded recommendations, queries, themes,
approach or playbook. Each recommendation is one tap from today's list, a
clip, the idea in the Composer, the Room (prospects) or the map
(aspirations). Per krish-design a materially new surface is approved as a
rendered mock before it is coded; the data lands and the council reads it
in the meantime.

## What is owed

- Retire the Monday `api/growth/geo-probe` cron after two green Sundays;
  keep the route as a manual fallback.
- Legibility as a subject once the two venture key spaces are normalised.
- A service-only evidence table if a theme ever needs a verbatim quote.
- Prospects and aspirations are Krish's to name; the registry ships empty of
  them by design.

## Verification

- `npm run typecheck:api`, `npx tsc --noEmit`, `npm run lint`,
  `npx tsx --test tests/api/aeo.test.ts`, `check-content-engine-schedule`,
  `check-build-signals`, `check-env-example`, `check-content-expiry`.
- Against the live database after the migration: the probe CHECKs read back,
  the realtime publication carries the new tables, `select count(*) from
  growth_aeo_subjects` is five.
- The first live run: one `growth_aeo_digests` row per subject, one
  `content_engine_runs` row `job='aeo_ingest' status='ok'`, ideas visible in
  the Content rooms with the "AEO research" pill, and a Run now press that
  moves an `aeo_commands` row from queued to done.

## Counterpoints recorded

- Cost: five ventures plus a handful of prospects and benchmarks at twenty
  probed queries on three engines is 600 to 900 web-search calls, roughly
  $15 to $30 a run. The cap drops seeds first and reports
  `probes_skipped_cap`; it never hides them.
- Private call material readable with the anon key is the same posture as
  `content_ideas` and `contacts`; the controls are paraphrase-only, no names,
  and the ingest's refusal.
- The engine could have been a Vercel cron in this repo. It is not, because
  a research run exceeds the function limit and because Krish asked for the
  machine to live in its own repo, where the docs steward and the build
  signals read it like any other build.
