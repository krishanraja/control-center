# Build signals, week 37: what Krish built, why it is content, and what each repo is missing

> Written 2026-09-07 by hand, the way `api/discover-build-signals.ts` will do it
> every Saturday from now on. Seven repos changed in the seven days to 7
> September: roughly 240 commits and 90,000 changed lines. This is the first
> week's packet and the template for the cron's output. It is written so it
> also works as a Friday build note if the cron never runs. Spec:
> `docs/CONTENT-ENGINE-BUILD-SIGNALS.md`.
>
> Two things surfaced that matter regardless of content, at the end.

## The call

The same commits the scorecard counts against Krish (Rule 6, hours building
unasked) are the best owned artifact the publication has. Canon already asks
for a solo variant of Built with AI on exactly this material. The Money of AI
gets the pricing, packaging and positioning decisions inside the builds, never
a figure. Five products are named; everything else is "a side build" whose
lesson travels and whose name does not.

Sharper alternative: no code. Write this note every Friday from `git log` and
paste it in as a manual idea. That is the fallback if the cron is not merged
within a week.

Counterpoints. This branch's own commits register on the tripwire. A
repo-week digest yields one Built and one Money candidate per repo, which
loses depth a per-PR read would keep; the highlights carry every long body so
the writer can dig.

## Routing rule, restated

If the interesting thing is a person's decision to make something, it is
Built with AI. If the interesting thing is a flow of money or a pricing,
packaging or positioning decision, it is The Money of AI. Both, then two
assets with two spines, never a hybrid. The event is never the story. No
revenue, price, cash or rate card is ever disclosed.

---

## 1. Control Center (named)

**What changed.** ADR-016: the OS repointed to the ikigai v4, one mission,
five jobs, the face. The Room (25 named leaders, warm intro only, drafts never
send). The scorecard: sent, calls, paid, cash, pieces, hours building unasked,
with a Saturday commit count as the tripwire's evidence. Pull-only OS: every
Telegram push killed, `notifyOps` made record-only, three upserts Postgres
could never infer fixed. n8n git and cloud parity rebuilt (154 drift to 0),
Kai retired after returning "issues_detected" 83 consecutive times into a
void, the secret guard hardened for three classes GitHub's push protection
caught and ours missed. The architecture doc's filename split closed (surface
2 had diverged silently since the rebrand). Unified content spine: editorial
radar v2, independent Money and Built readings of one neutral source, one
output registry. Video Studio control plane hardened. The Spend tab.

**Built with AI angles.**

- *I built the machine that fines me for building.* The scorecard reads
  commits as unasked hours; the charter's "public by default" then turns the
  same commits into supply. The human why: a founder who builds in private
  putting a meter on it. Source: `api/scorecard/github-sync.ts`, commit
  9861fd0, `docs/plans/one-swing/CHARTER.md`.
- *The sensor was unplugged and stuck on green.* HARO ingestion had failed 94
  of 94 runs on a deleted credential while `credential_health` held 20 rows
  all marked healthy, verified three months earlier. Kai, the monitor, was
  the workflow that shared the blind spot. Source: commit 301df4f body,
  `api/health/fleet-reconcile.ts` header.
- *A document asserting behaviour the system no longer has is worse than no
  document.* Seventeen statements describing pushes to Krish as live, purged
  rather than appended. Source: commit 4197306.
- *The script was faithfully syncing a file nobody reads.* The architecture
  doc existed under two spellings; the sync wrote the untracked one for a
  week and nothing errored. Source: commits e03ce3c, a611520.
- *Three upserts Postgres could never infer.* A partial unique index cannot
  be an ON CONFLICT target without repeating its predicate, which
  supabase-js cannot express, so `system_health` was failing every write and
  the panel that read it was reading stale health. Source: commit 30c63d7.

**Money of AI angles.**

- *The OS is engine, not product.* The ikigai parks the OS as a licensable
  asset and makes the room the door; every task must name which of five jobs
  it serves or is refused. Positioning by subtraction. Source: ADR-016,
  `api/_mission.ts`.
- *Twenty-five names, warm intro only, drafts never send.* An acquisition
  model that caps volume by design and moves the only lever to price. No
  figures. Source: `api/room/*`, ADR-016 item 5.

**Citable.** 123 workflows, 108 live, 87 active, 15 archived; 154 drift items
to 0; Kai's 29,320 snapshot rows with zero consumers; 17 Telegram statements
purged; 13 em dashes swept. All in commit bodies 301df4f and 4197306.

**Docs.** Grade A. ADRs and commit bodies carry the why; `docs/plans/one-swing/`
carries the charter and the ledger. Nothing to raise. Never publish: Supabase
project ids, credential names, named leads or contacts, the private rate card.

---

## 2. The Mindmake site (named)

**What changed.** The edge rewrite: what the work answers, said once, with
no public duration (PR #154). The privacy strip fixed after being photographed
wrong on a phone. Twenty-one social plates painted by a browser and committed,
one list feeding both the crawler and the share card. The wordmark and mark
rebuilt as vectors (a megabyte of raster inside an SVG, 659-stop gradients to
seven). The entrance: a fifteen-strip curtain, and the next day the finding
that it had never rendered. The departures board measured against the real
news cache. Seventeen CSS declarations that could never win, 508 repeated
words cut. Testimonials edited by hand on 7 September.

**Built with AI angles.**

- *The day's measurements were all true readings of the wrong thing.* The
  curtain's root marker shared the strips' class name, so `display: none`
  matched `<html>` and put the whole document out of render. Every "curtain"
  reading recorded on 3 September was of a blank document with good numbers.
  The gate now refuses an arrival more than 400 ms before first paint.
  Source: commit cf2b2d0, `06_CURRENT_STATE.md`.
- *A gate proves what it measures, and the first two measured the wrong
  thing.* The privacy strip bug was 39 px tall by design and 65 px in
  reality since the day the rule was written; a height budget let it through,
  counting the sentence's lines let it through, because it was the button
  that dropped. Source: commit 96bf37e.
- *A designer's export is a starting material, not an asset.* And the poster
  preload had never been emitted anywhere because React writes `srcSet` and
  the pattern was written for `srcset`. Source: commit fd8c07e.
- *Honest filtering is not personalisation.* A role chip that returns the
  same list as "Everything" reads as broken, so a test holds that no role may
  match the whole board. The needle was briefly driven by scroll position and
  reverted within the hour: a gauge carries a value, never where the reader
  has scrolled to. Source: commits 506822c, 9abedbb.

**Money of AI angles.**

- *A services site with no price and no duration is not hiding.* Once the
  fee is private, a public "thirty days" is the only number left to anchor
  on, and it anchors on the calendar instead of the result. It was the most
  repeated phrase on the site and the least interesting thing about the work.
  Source: PR #154 body, `00_NORTH_STAR.md`.
- *A model reading llms.txt is a buyer's first researcher.* It described a
  hand-off the site no longer ran, for two rebuilds, and nothing measured it.
  Source: commit 0704583.
- *On a site with no price, every sentence is a cost the reader pays.* Story
  deck 502 to 338 words because each card said its outcome, drew it in a
  figure, then had the client say it again. Source: commit 41d4f27,
  `03_DESIGN_CONTRACT.md`.
- *Positioning by threat and positioning by antithesis both got cut, and the
  argument still had to be made.* Source: commit f7f6889.

**Citable.** Rendered words: home 2,103 to 1,844, /ai-brain 1,202 to 1,025,
/ai-gtm 910 to 838. Seven days of the board is 73 items and 13.7 KB; 28 days
is 389 and 66 KB. The honest entrance lead reads under 180 ms against a
defect reading of 1,180 ms. All in commit bodies.

**Docs.** Grade B. Raise to A: reconcile the 7 September testimonial edit
(see the end of this doc) and update the proof file's date stamp. Never
publish: the rate card, floor, ceiling and revisit triggers in `01_CANON.md`;
the archetype marked internal; anything in `04_PROOF_RECORDS.md`; the
synthetic lead's address and deployment ids; attendee brands as clients.

---

## 3. CTRL (named)

**What changed.** The audience axis: every card in the daily headline pool
now carries which of eight divisions it lands on and a stance (opportunity,
shift, risk, damage), from the same batched classifier call that already
writes the headline, so no new cost per story. Damage is deleted before cache.
A one-file verification commit moving the claim from "merged" to "deployed and
read back". Radar evidence preserved across rolling news: clusters keep every
URL, repeats across days merge by fingerprint, corroboration becomes a count
of receipts, not a claim.

**Built with AI angles.**

- *One field can only hold one truth.* "What is it about" silently ate "who
  does it hit" for 488 stories; staff replaced by AI, filed under model, never
  reached the people lane. No keyword pass can tell the team you manage from
  a team of AI agents, but a classifier that has read the text can. Source:
  PR #372, `news-synthesis.ts` header.
- *The idempotency marker is the stance, not the audience.* An empty audience
  is a real answer ("lands on nobody") and cannot mean "not yet classified".
  Source: `live-headlines/index.ts` backfill comment.
- *A story that lands on everyone lands on no one.* Five divisions maximum,
  because a filter that returns everything reads as broken. Source: prompt
  text in `news-synthesis.ts`.
- *The commit that adds no code is the one that makes the feature true.* The
  first draft estimated 15 percent people stories; readback measured 8 and
  the retraction is in git, 38 minutes later. Source: PR #373.
- *A corroboration number without the URLs behind it is a claim, not
  evidence.* Before #375 a card said three sources and exposed one URL.
  Source: `video-radar-contract.test.ts` diff.

**Money of AI angles.**

- *A single seat that refuses to sell seats.* "A leader asking for team access
  is describing an engagement, not a product tier." No admin console, no SSO,
  nothing an IT admin must approve, as product contract. The public tier is a
  product, not a trial. Source: `docs/current/commercial.md`,
  `public/.well-known/product.json`. The public price exists on that page and
  may be cited from it; this packet does not restate it.
- *One curation pipeline, two outputs.* The news engine built for the product
  now also feeds Krish's own content supply at zero marginal cost. Source:
  `video-radar-export`, PR #371.

**Citable.** 34 days backfilled; 476 items, 473 classified, 12 damage
dropped, 3 too thin, 0 over-assigned; people share about 8 percent on
backfill. `CHANGELOG.md` lines 10 to 14.

**Docs.** Grade B minus. `docs/current/`, `CHANGELOG.md` and `CHALLENGE.md`
are A-grade and CI-gated; `docs/` root is an ungoverned dump (a June upload of
76 files under the old domain, six of them literally named "md (1).md").
Raise to A: CHANGELOG entries for #371 and #375 with one why sentence each; an
"archive, June 2026, old domain" header on the upload; and remove the
credential flagged at the end of this doc. Never publish: the Supabase project
ref, deployment ids, test credentials, the line in `commercial.md` about
operator DB access with no audit log.

---

## 4. contentarchives (named)

**What changed.** The whole repo is a week old: the toolkit extracted from a
live consolidation of about 87,000 photos and videos across a drive, two cloud
accounts, two machines and a failing enclosure; 25 numbered learnings; a
rescue of a 2008 640 GB drive; a Windows machine-hygiene runbook; a mirror
plan; the archive split into personal and communal.

**Built with AI angles.** This repo is almost entirely Built with AI, and it
is the strongest supply of the week.

- *The rigour was applied to the safe operation and withheld from the
  dangerous one.* An exclusion rule matched a phone backup nested in a
  downloads folder; 45 irreplaceable files deleted with a call that bypasses
  the recycle bin. The founding incident, told once, then "do not re-narrate
  it". Source: `docs/LEARNINGS.md` 12 to 33, `RESUME.md` 216.
- *Journal before deleting, not after.* A purge wrote its journal after the
  loop, so the run that crashed mid-way was the exact run that left no
  record. Also: `flush()` is not `fsync()`. Source: `LEARNINGS.md` 406 to 434.
- *A resolution is evidence only if a camera could not produce it.* A
  screenshot classifier flagged 14,826 files; about 3,000 were photographs at
  sizes an iPad and a camera share. Aspect ratio discriminates. Source:
  `LEARNINGS.md` 529 to 570.
- *Cloud stream mounts hang rather than fail.* Two transfer-count samples
  twenty seconds apart separated "wait" from "never". Source: `LEARNINGS.md`
  297 to 338.
- *The mount is not the cloud, twice.* A 2 TB account read as 133 GB and
  nearly ruled out a backup; later, 17,102 of 17,102 files verified by hash
  against the mount while the last-written files were absent from the cloud.
  The answer came from the sync client's own database. Source: `LEARNINGS.md`
  377 to 394 and 673 to 710.
- *Once the source is going away, declining to copy is deleting.* 19,209
  payloads skipped on path and size; hashing 156 GB found 174 that were not
  redundant. A skip looks like efficiency and shows up in the metrics as
  speed. Source: `LEARNINGS.md` 647 to 669, `docs/ORGANISING.md` 297.
- *Export part numbers are not stable identities.* One file added anywhere
  cascades every later boundary of a fixed-size split. Source: `LEARNINGS.md`
  714 to 752.
- *A tool that grades its own homework.* The Windows image health check reads
  a recorded flag, and the repair returns Healthy having repaired nothing.
  Source: `docs/MACHINE-HYGIENE.md` 295 to 308.
- *A hook that validates is not a hook that runs.* Dead for three months
  through a path-escaping quirk, and nobody noticed. Source: `MACHINE-HYGIENE.md`
  319 to 328.
- *An AI session grading its own work is the worst vantage point there is.*
  So the first step of resuming is an audit of the previous session, which
  failed six of nine checks on its first run. Source: `RESUME.md` 12 to 25.

**The rescue as a story.** A drive that read as dead was healthy; the blocker
was ownership records from a machine that no longer existed, and denied reads
enumerated as zero files, which looks exactly like corruption. Then a backup
container format reverse-engineered off by one byte, 297 phantom failures.
Then 29 family photographs destroyed by a path collision and recovered from
their own subtree. Output: 17,102 files, 140.62 GB, 4,758 redundant copies
collapsed. Source: `docs/rescues/2026-09-06-wd6400.md`.

**Money of AI angle, thin but real.** Cloud quota is a billing fact, not a
filesystem fact; the price of believing the mount was nearly a destroyed
drive. "Bandwidth is cheap; the file is not." Human attention is the scarce
input, and the mirror plan places the human check where a correction costs
seconds rather than a re-upload.

**Citable.** 87,000 files across five sources; 59,504 placed; 26,576
hardlinked at 293 GB zero cost; 9,644 duplicates rejected by hash; library
61,906 files at 493 GB; 185 GB reclaimed by machine hygiene; session logs at
2 GB each. `docs/HANDOVER.md`, `state/PROGRESS.md`, `MACHINE-HYGIENE.md`.

**Docs.** Grade A minus. Every rule has its incident, number, mechanism and
commit; a writer can produce pieces without asking. Raise to A: a one-paragraph
dated timeline of the underlying consolidation. Never publish: family names
(they appear in `docs/ORGANISING.md`, the rescue doc, and a pseudonym map in
`publish_state.py` that defeats itself); `state/origin-folders.csv`; local
paths carrying a user name; any identity, immigration, medical or estate
document reference. Write about the mechanism, never the documents.

---

## 5. video-studio (named)

**What changed.** Ten days old, eighteen commits this week. The Visual Story
Director: every approval binds to a SHA-256 of the artifact, never a label;
guests are job-local labels; an ambiguous identity match stays unknown. A
durable Windows runner that must never depend on a model being up. Lock
identity across three process-time providers, battery settings, and a
three-line fail-closed on readback drift. A Drive inbox that never decides
anything. Chain-safe receipts with compare-and-swap on an event hash. A
folder identity marker that survives remounts. Carousel v1, whose first
render was rejected despite green tests. Portable session contracts. Then the
heuristic hook generator deleted and every raw signal marked not editorially
eligible.

**Built with AI angles.**

- *The first production outage of an AI video engine was a laptop lid, not a
  model.* Task Scheduler kills tasks on battery by default; Windows reuses
  PIDs after a crash; two providers reported the same process at different
  precision so a live lock looked stale. The fix rounded ticks and, if the
  readback drifts, uninstalls itself rather than run unverified. Source: PRs
  #26, #27, #28.
- *The agent is optional; the ledger is not.* A tap on a phone is a proposal;
  the laptop ratifies it against a signed lineage. Source: PR #24, `AGENTS.md`.
- *A watch folder is the most dangerous automation in a media pipeline.* So
  this one waits for a file to be unchanged across two scans and thirty
  seconds, holds telemetry-shaped subtitle files for review, and creates no
  jobs. Source: PR #29, `docs/OPERATIONS.md` 104.
- *The fix for "my folder keeps changing identity" was to write a business
  card into the folder.* A UUID marker synced by Drive itself. Source: PR #35.
- *Green tests, rejected render.* The first carousel treatment passed every
  deterministic test and was rejected for repeated dark backgrounds, inert
  space, duplicate labelling and generic authority-posturing. Three
  generators, two blinded judges, one winner. Source: `docs/CAROUSEL_DECISIONS.md`,
  `docs/CAROUSEL_RESET_TRACE.md`.
- *The most valuable commit this week deleted the part that made ideas.* A
  capable feature removed because it was the wrong owner of taste;
  opportunities belong in the pull-only Content surface. Source: PR #38,
  `packages/core/src/radar.ts`.

**Money of AI angles.**

- *A repeatable aesthetic is easy to copy; the defensible system is the
  owner's contextual judgement.* Stated as the product's moat, with a learning
  rule that refuses to infer taste from one object. Source:
  `docs/CAROUSEL_DECISIONS.md`.
- *A per-job cloud ceiling as cost policy, local-first by default.* The
  ceiling figure is in `config/studio.json` and may be cited from there; this
  packet does not restate it. Positioning language: "it does not promise
  virality."
- *A client-neutral engine behind a capability-gated gateway is a licensing
  shape, not a chatbot wrapper.* Source: PR #37, `docs/ENGINE_SESSION.md`.

**Citable.** 42 test files, 368 tests; up to 32 sources per job; 1.2 second
identity moment; 50 render-pixel minimum lettering; 64 GiB hash budget per
scan; sequence cap 16 parts; restart every 5 minutes for 3,650 days; judge
scores 72.0 and 71.5 of 80. All in docs and commit bodies.

**Docs.** Grade C plus. Only the carousel has a dated decision record; the
runner, Drive and director changes are documented as present-tense spec, so
"why" lives only in commit bodies. Raise to B: `docs/BUILD_LOG.md` with one
dated paragraph per PR (the failure that forced it, what was tried first) and
a `docs/PUBLIC_FACTS.md` of quotable numbers. Raise to A: pilot outcomes and
a changelog generated from PR bodies. Never publish: the Drive path, the
Supabase ref and Control Center endpoints in config, credential target names,
the speech-recognition vocabulary that names a former client, the face
template profile id.

---

## 6. A side build: a daily narration pipeline (never named)

**What changed.** Fifty-nine commits: an evidence pipeline, a claim
laboratory, six persona writers, eleven deterministic gates, two hard judges
and twelve qualitative judges scoring one to five, a bounded repair loop,
licensed synthetic voices, publication at a fixed hour. Launched by founder
override with most human gates waived. One show published to date.

**Built with AI angles.**

- *An LLM rubric without anchors is a mood, not a standard.* Nothing said what
  a four meant, so every judge graded against its private idea of excellent;
  the one published script re-scored 3 of 12 and two professional reports
  averaged 1.7. Writing "4 is a good professional piece with real
  shortcomings" restored it to 11 of 14. Source: PRs #63, #64.
- *Calibrate the bar against writing everyone already agrees is good.* A 0 of
  6 run was ambiguous until the identical judge code ran over a published
  script and a professional report for cents. Source: PR #62.
- *Most of your failure rate is two prompts disagreeing.* The judge scored a
  dimension the writer was never told existed; the writer was told to give a
  percentage while the number gate refused any number not in the evidence.
  Source: PRs #50, #66.
- *A confident wrong conclusion is the most expensive output a pipeline
  produces.* An API spend cap failed all fourteen judges, each defaulted to
  score one, and the calibration harness reported "the judges have moved".
  Now a judge that never answered returns no score and the verdict checks
  infrastructure first. Source: PRs #52, #66.
- *Six writers failing together is one shared input.* "Four substitutions"
  naming five players, licensed as truth, repeated by every writer, rejected
  by every judge. A count that names members must name as many as it counts.
  Source: PRs #34, #48.
- *Null and absent are different words and your upsert does not know that.*
  A statistic vanished from a provider payload at a month boundary; the upsert
  wrote every field read, so re-ingesting would have nulled real data. Only
  sent values are written now. Source: PRs #44, #45, #51.

**Money of AI angles.**

- *Measure before optimising; the lever you assumed may be a fifth of the
  bill.* A measured run split roughly half writer, half judges, a twentieth
  claims; a judge reads thousands of cached tokens for a fraction of a cent
  and writes hundreds for several. That killed the planned "batch the judges"
  optimisation. Source: `docs/06-ops.md` 53 to 79. The per-run dollar figures
  are in that file and may be cited from it; this packet does not restate
  them.
- *A caching regression never errors; only the invoice moves.* The harness
  name rendered first in each judge's prompt, so twelve judges shared no
  prefix. Stable blocks first, varying part last, cache counters logged every
  call. Source: PR #38.
- *Guess high, trip early.* A per-step spend ceiling that prices unknown
  models at the dearest rate and killed a run one cent over. Source: PR #40.
- *Your cost per experiment matters more than cost per run.* A diagnostic run
  of one writer and one attempt costs roughly a tenth of the product run: a
  month of budget buying forty experiments instead of four. Source: PR #66.
- *A repair loop that changes prose without moving the verdict is a
  treadmill.* Six rounds to two, with stall detection on an identical set of
  failed gates. Source: PRs #32, #39, #43.
- *Stop paying for the same fact 170 times.* Judges carry the whole evidence
  pack fourteen times per attempt per writer; adding two sources doubled it.
  Source: PR #60.

**Citable.** Repair rounds 3 to 6 to 2; calibration 12 of 12 to 3 of 12 to 11
of 14; claim dedup 35 to 16; pack 4,993 to 9,742 to 6,909 characters; six
faults found from stored data in #65, four in #66; about 257 test cases in 29
files; shows published: 1.

**Docs.** Grade B plus. Commit bodies are exceptional first-person notebook
prose with numbers and causes; the ops doc carries the measured cost table.
Raise to A: reconcile the product and roadmap docs to the launch override, and
add a narration cost line. Never publish: the name, domain, sport, teams,
players, data provider and plan tier, voice vendor and voice ids, deployment
ids, price ids.

---

## 7. A side build: a matching pipeline (never named, purpose private)

**What changed.** Thirty-four commits: sources, gates, deterministic scoring,
a sheet layer, two-way reconciliation, a bridge layer with lazy enrichment,
reporting into Control Center's fleet surfaces.

**Built with AI angles, all told without the purpose.**

- *The bugs that cost the most never raise.* Every database read passed a
  limit of 5,000 and got 1,000 back; the dedupe guard saw 1,000 of 1,888 ids
  and re-inserted rows it already held, every run, with no error. Source:
  commit aff59ed.
- *Any feedback loop with one shared channel for human and machine writes
  will eventually train on itself.* The re-gate wrote its verdict where the
  owner wrote his; forty machine decisions became taste evidence. Verdicts
  now carry provenance and the learner skips anything the agent wrote.
  Source: commit 3ce0bb1.
- *An exclusion list grows forever; an inclusion list is finished the day you
  write it.* Inverting to a positive archetype gate deleted the whole
  taste-inference half of the loop. Source: commit 0d0975d.
- *Measure your threshold against the decisions the human already made.*
  Sixteen of seventeen approved items scored below the bar; the gate filters,
  the score only orders. Source: commit 0508194.
- *"I could not check" collapsed into "fine" is the commonest lie a dashboard
  tells.* Live, dead and unverifiable are three states, and unverifiable is
  never reported as live. Source: commit 1acb743.
- *Order your checks so that failure to fetch cannot become a pass.* Seven
  items survived a re-gate only because their link could not be resolved.
  Source: commit 4cd1fc7.
- *Never inherit a predecessor's confidence, only its history.* Source:
  commit 128568b.
- *If the model fails your check seventy times in a row, audit the check.*
  The prompt never stated the length cap; the grounding compared strings with
  commas against strings without. Source: commit e7780c0.
- *Telemetry that flatters one agent can blind you to the rest.* One row per
  run, never a heartbeat, because fleet liveness is a global max. Source:
  commit aeb63d7.

**Money of AI note.** A paid scraping run whose 2,924 results were discarded
because the clock ran out; the fix takes what the dataset holds and aborts so
it charges no further. Every actor input carries a hard charge ceiling. Model
calls are capped structurally, not by budget: one per new item, one retry,
then a deterministic fallback.

**Docs.** Grade B plus for the lessons; commit messages are incident reports
and every module docstring states the rule and the failure that produced it.
Raise to A: one dated design note recording the ugly first version and the
owner's own words for why he distrusted it. Never publish: the repo name or
purpose; any company, role or person it evaluates; sheet and tab names;
anything under the people or package directories.

---

## The doc convention, so next week is better than this one

The ingest reads: the README's first 600 characters; every commit and PR body
over 200 characters; the first of `docs/LEARNINGS.md`, `docs/BUILD-LOG.md`,
`CHANGELOG.md`, `docs/BUILD-CHRONICLE.md` that a commit in the window touched.

| Repo | Grade | The one change that raises it |
|---|---|---|
| control-center | A | none |
| contentarchives | A minus | a dated timeline paragraph |
| mindmake | B | reconcile the testimonial edit with the proof file and its test |
| full-time | B plus | reconcile product and roadmap docs to the launch override |
| hunter | B plus | one dated design note for the first version |
| mm-ctrl | B minus | CHANGELOG entries for #371 and #375; archive header on the June upload; remove the credential below |
| mindmake-video-studio | C plus | `docs/BUILD_LOG.md`, one dated paragraph per PR, plus a public-facts list |

Two habits matter more than any file: keep writing commit bodies that name
the failure, the number and the wrong assumption; and put a never-publish
list near the top of the README.

## Two things that need Krish's eye regardless of content

1. **A production login and password sit in plain text in two docs in the
   CTRL repo, which is public.** The exact paths were given to Krish directly
   rather than written here. Remove them and rotate the credential.
2. **The 7 September testimonial edit in the mindmake repo breaks its own
   proof rule.** Canon says a shortened quote is an exact substring of the
   full text; after the edit ten of thirty-three excerpts are not, the test
   at `src/test/testimonials.test.ts` fails, one quote no longer matches the
   approved wording in `04_PROOF.md`, and two carry typos. Reconcile before
   quoting from that file.

## Next step, 24 to 72 hours

Merge this branch. Saturday's cron writes the first eight signals. On Sunday,
approve one Built with AI candidate from the contentarchives or Control
Center row through the existing gate. That is the first solo-variant piece,
and it counts on the scorecard.
