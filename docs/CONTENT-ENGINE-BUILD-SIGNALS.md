# Build signals: Krish's own builds as Content Engine supply

> Spec, 2026-09-07. Krish's ask: "I build a lot of stuff in Codex and Claude in
> my github. How do you recommend what I build, why I build it etc are able to
> be used as ideas for the Content Engine under Build With AI, flagging that
> this is a mindmake build?" This file is the answer that ships. The first
> week's packet, with the doc audit per repo, is
> `docs/audits/2026-09-07-build-signals-week-37.md`.

## Why

Every Saturday `api/scorecard/github-sync.ts` reads Krish's commits across
`GITHUB_REPOS` and counts them against him as hours building unasked (Rule 6,
`docs/plans/one-swing/CHARTER.md`). Until now nothing read the same commit
stream for content, although three canon rules say it should:

- The publication's Built with AI channel needs guests and booking is the
  bottleneck, so canon keeps "a solo variant running (Krish's own builds, held
  to the same three-why standard on himself) so the pipeline does not stall
  when the calendar is empty" (`mindmake/project-documentation/02_PUBLICATION.md`).
- The one-swing charter: "Public by default. Every build is shown or announced
  the week it exists. The Monday note lists the week's builds."
- `krish-principles`: "Operational exhaust is the content." His commit bodies
  are already editorial ("the sensor was unplugged and stuck on green").

So the same commits that trip the Rule 6 wire become the week's Built with AI
supply, and the pricing and positioning decisions inside them become The Money
of AI material. Job 4 (feed the demand engine) and job 2 (the Monday note) of
the charter, served by data the OS already holds.

## What it is not

Not a new pipeline, room, format or channel. One new `source_type` flows into
the existing spine:

```
GitHub (GITHUB_REPOS, same token as the tripwire)
  -> api/discover-build-signals.ts           Sat 05:00 UTC, one row per repo-week
  -> content_ideas  source_type='build_signal', meta.mindmake_build=true
  -> api/content-opportunities/refresh.ts    daily, both lenses, same as a headline
  -> Money room / Built room                 "Ideas ready to shape", chip: Mindmake build
  -> api/content-ideas/[id]/editorial-route  approve -> one publication child, evergreen
  -> the outputs registry                    Substack, LinkedIn, video script, carousel
```

The lens output is the same `EditorialOpportunityV2` shape, the approval is the
same gate, the child is the same row. Nothing here writes a piece, picks a
channel or invents a format.

## The row

One per repo per scorecard week (Saturday to Friday, operator's zone), built by
`buildSignalRow` in `api/_buildSignals.ts`.

| Field | Value |
|---|---|
| `idea` | `<public_name>: the week's build, week ending YYYY-MM-DD` |
| `thesis` | the three subjects most likely to carry the story: PR titles, then the commits with the longest bodies |
| `source_type` | `build_signal` |
| `source_ref` | `build:<owner/repo>:<week_ending>`; one live source row per ref, enforced by `content_ideas_build_signal_ref_live_uq` |
| `source_url` | the GitHub compare URL for the window |
| `horizon`, `expires_at` | `news`, ingest plus 21 days. A build week is time-bound supply; undecided, it expires like any seed. The story Krish approves is the evergreen row. |
| `meta.mindmake_build` | `true`. The flag Krish asked for. Rides onto the routed child. |
| `meta.build` | repo, product key, public name, role, mode, never-reveal note, week bounds, commit and PR counts, diffstat, every PR (title, body, URL), every commit subject, the commit and PR bodies over 200 characters as `highlights`, and the doc excerpts |

Granularity is one signal per repo per week, not one per PR. The lens sees
every long body and every subject inside the digest and anchors its angle to
one of them; the target is one published piece a week, so one Built and one
Money candidate per repo per week is the right supply. A busier week ranks
first when the per-run cap of eight bites.

## The registry: who may be named

`NAMED_BUILD_PRODUCTS` in `api/_buildSignals.ts`. Exactly five, in code, not
env. `scripts/check-build-signals.mts` fails CI if the count or a public name
changes.

| Repo | Public name | Role the lens reads |
|---|---|---|
| krishanraja/control-center | Control Center | the OS that runs the business |
| krishanraja/mindmake | the Mindmake site | mindmake.co and the business canon |
| krishanraja/mm-ctrl | CTRL | the AI brain product |
| krishanraja/contentarchives | contentarchives | the engine that keeps machines and cloud accounts clean |
| krishanraja/mindmake-video-studio | video-studio | the bespoke AI video production agency |

Every other repo in `GITHUB_REPOS` is anonymous: public name "a side build",
and the lens is told never to name the repository, product, domain, purpose or
users. Two carry an extra never-reveal note because the purpose itself is
private (the job-search tool; the narration product's sport, providers and
vendors). "Cool stuff built in there" is still usable: the engineering lesson
travels, the name does not.

## The gates, in code

`api/_editorialRadar.ts` appends a build block to the lens prompt only when the
batch carries a build (so pool headlines are not regenerated at cost), and
adds two deterministic hard blocks in `parseEditorialLensResponse`:

- **No figures in The Money of AI.** `MONEY_FIGURE` rejects a candidate whose
  title, angle, mechanism, hook, payoff or version text discloses an amount:
  a currency figure, MRR, ARR, "revenue was N". Pricing, packaging,
  positioning and monetisation reasoning is the piece; the number is private
  (canon, `01_CANON.md`, Pricing).
- **Side builds are never named.** A candidate on an anonymous repo that
  contains the repo's name (`forbiddenTermsFor`) is rejected.

The prompt block itself says: the solo variant is held to the three-why
standard on Krish himself; enter through the strange decision, the failure or
the first imperfect version; a candidate that is mostly a list of tools, files
or features is `no_angle`; never invent a number, failure or quotation the
commit text does not contain; where the record is thin, say what is missing.

## Anti-flood

In order: the open-card governor (the run skips while twelve or more build
rows are undecided), the per-run cap of eight, the `source_ref` refresh (a
re-run updates the week's row, never duplicates it), the tiered
`checkDuplicate`, and the partial unique index. Without `GITHUB_TOKEN` and
`GITHUB_REPOS` the route says `github_not_configured` and writes nothing,
because a quiet run written as "no builds" would read as a clean week.

## The Monday note

`api/scorecard/monday.ts` gains "Built last week": commit counts per named
product from the same `build_activity_weeks` row the tripwire reads, one
anonymous line for the rest, and how many build signals were offered, judged
and found an angle. Charter compliance for "public by default". Nothing
sends beyond what the note already does.

## What a sibling repo should carry

The ingest reads what is there. It is better when the repo carries:

1. **A README that opens with what the thing is and for whom.** The first 600
   characters go to the lens as context.
2. **Commit and PR bodies that name the failure, the number and the wrong
   assumption.** Anything over 200 characters becomes a highlight. Krish's
   current bodies are the model; the ones that read "Add files via upload"
   carry nothing.
3. **A dated build log**, first of `docs/LEARNINGS.md`, `docs/BUILD-LOG.md`,
   `CHANGELOG.md`, `docs/BUILD-CHRONICLE.md`, read when a commit in the window
   touched it. `contentarchives/docs/LEARNINGS.md` (numbered, dated, each
   with its incident and mechanism) is the model.
4. **A never-publish list** near the top of the README or the log: client
   names, private price, machine names, sheet ids, family names, credentials.
   The registry carries a default per repo; the repo knows better.

Per-repo grades and raise conditions: the audit doc.

## Verification

- `npm run check:build-signals` (CI) plus `check:editorial-radar`,
  `check:content-spine`, `check-content-expiry`, `check-content-vocabulary`.
- `npm run typecheck:api`, `npx tsc --noEmit`, `npm run lint`.
- A dry run against production reads: `GET /api/discover-build-signals?dry=1`
  with the cron secret, then `?week_ending=2026-09-04` to backfill last week.
- The migration `20260907160000_build_signals.sql` is idempotent: constraint
  drop-and-add, index `if not exists`.

## Counterpoints recorded

- The scorecard counts this branch's commits as unasked hours. True. Krish
  asked for it and it serves two charter jobs; the audit doc names it.
- One signal per repo-week loses some hidden depth. The highlights carry every
  long body, and the writer opens the compare URL. If a week's story is one PR,
  the lens will say so in `visual_proof` and `mechanism`.
- Zero code was an option: hand-write a Friday build note from `git log` and
  paste it in as a manual idea. The audit doc is written so it works as that
  note if this is not merged in a week.
