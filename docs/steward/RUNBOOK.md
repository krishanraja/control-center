# Docs steward runbook

Status: Current
Owner: Krish Raja
Last verified: 2026-09-07 against `.github/workflows/docs-steward.yml` and `scripts/steward/`

This is the authoritative, versioned procedure. The GitHub Actions workflow
points here and adds nothing of its own. Change this file to change what the
steward does. It runs in an unattended session: nobody is watching, nothing
can be asked, and a run that waits for an answer is a run that is lost.

## Why it exists

Krish writes heavily to GitHub during build sessions and reconciles docs by
hand afterwards, when he remembers. Between those moments the repos carry
two or three documents that each claim to be current and disagree, dated
files from months ago with no warning label, and machine-readable truth files
that lag the prose. An AI agent doing lead generation or content marketing
for Mindmake reads one of those and quotes the wrong product. The steward's
job is to make every repo in `fleet.json` answer, without ambiguity: what is
this, where is it right now, what is new, why does Mindmake's buyer care,
where is the detail, where is the history.

## The contract

1. **The repo's own rules outrank this runbook** on structure, naming,
   voice, stamp form and archive location. Read the `rules_files` listed in
   this repo's `fleet.json` entry before touching anything. This runbook only
   adds `NOW.md`, `docs/history/LOG.md`, and the guards below.
2. **Additive, never destructive.** Nothing is deleted. A document that is
   wrong, duplicated or superseded moves to `docs/history/` with its banner
   and a LOG entry (`SCHEMA.md` section 3). Krish's detail survives; only
   its claim to be current is removed.
3. **Ground truth is the code.** When a doc and the code disagree, the code
   wins, unless the doc describes intent the code has not caught up to, in
   which case the doc keeps the claim and NOW.md marks it as built-but-not-
   live or planned. Never invent a feature, metric, price, customer, date or
   outcome. What cannot be verified is marked unverified, not removed.
4. **Do not touch source.** Only files matching the repo's `write_allowlist`.
5. **Silence is correct.** A run with nothing to do writes one ledger line
   and stops. No commit, no report beyond the summary.
6. **No em dashes** in anything the steward writes. Hyphens, commas, full
   stops.

## The procedure

Budget: 25 minutes of wall clock per repo. Over budget is a finding to report,
not a reason to keep going.

### Step 1: orient

- Read this repo's entry in `.steward/docs/steward/fleet.json`.
- Read every file in `rules_files`, then `README.md`, then `state_doc`, then
  the existing `NOW.md` if there is one.
- Read `.steward/digest.md`. It was produced by `scripts/steward/digest.mjs`
  from the last head recorded in `NOW.md` (or from the fleet's `bootstrap_head`
  on a first run). It lists every commit since then, which files moved,
  which docs were touched and which were not, stamps that are older than
  the last code change to the area they cover, files that claim to be current,
  and duplicate-name candidates.

### Step 2: decide whether there is work

There is work if any of these is true: the digest lists at least one commit
since `head` that touched something outside the steward's own files; the
validator (`node .steward/scripts/steward/validate.mjs . --strict`) fails;
`NOW.md` has "What changed recently" bullets older than 30 days; the digest
lists a stale stamp, an unlabelled duplicate, or two files claiming current.

If none is true, append a "no change" line to the job summary and stop.

If the only change is new commits with no documentation consequence (a
refactor, a test, a dependency bump), update `head` and `as_of` in NOW.md
and commit that alone. That commit is the proof an agent relies on that the
file is current at that sha.

### Step 3: reconcile the repo's own documents

- For every doc the digest marks as touched or stale, read it against the
  code the diff changed. Update the drifted sections in the repo's own
  voice. Preserve structure and anything still accurate. Do not rewrite
  wholesale.
- Bump the repo's own stamp (`Last verified:`, `Last updated:`,
  `**Last reconciled:**`, `- **Last reviewed:**`, whichever form the file
  uses) only on files whose body was actually checked. Changing a date
  without checking the content is drift, not maintenance.
- Update every `truth_files` entry in the same commit as the prose it mirrors.
  Where the repo's own docs check pins a value inside a script (full-time's
  `asOf`), the `write_allowlist` names that script and it moves in lockstep.
- Where the repo has an index (`docs/README.md`, `DOCS.md`,
  `docs/current/README.md`), reconcile it last so it lists what now exists.

### Step 4: resolve conflicts

For every pair of documents that both claim to be current and disagree:

- If the code settles it, the document the code supports stays. The other
  moves to `docs/history/YYYY-MM-DD-<basename>` with the banner, and the LOG
  gains a `moved` line naming the replacement and the reason.
- An unlabelled duplicate of a labelled file (same basename in two places,
  a `(1)` copy, an upload with no header) moves the same way.
- If the code cannot settle it (two commercial positions, two roadmaps,
  a design intent with no implementation yet), both stay. NOW.md's
  "Do not trust" section names the conflict and the job summary reports it
  as waiting on Krish.
- A repo that already has an archive directory keeps it. The steward moves
  files into `docs/history/` only where that is the repo's archive or the
  repo has none. Where the repo's archive is elsewhere, move there instead
  and record it in the LOG with an `archived` line.

### Step 5: write NOW.md

Per `SCHEMA.md`. Roll every "What changed recently" bullet older than 30 days
into the LOG under its date with `rolled from NOW.md:`. Set `head` to the
last non-steward commit and `as_of` to today. Write the Mindmake section for
the buyer, not for the engineer: what this proves, what story it carries,
which objection it answers.

Write each "What changed recently" bullet the way the Content Engine needs
it (`docs/CONTENT-ENGINE-BUILD-SIGNALS.md`, "What a sibling repo should
carry"): the date, what was built, and the why in the commit's own terms:
the failure, the number, the wrong assumption, the strange decision. Quote
the commit or PR body where it already says it well. Never invent a number,
a failure or a quotation the record does not contain. A bullet that is a
list of files or features is not a bullet.

Keep `never_publish` current: anything the repo's own docs mark private
(client names, prices, machine names, sheet ids, credential names) goes on
the list.

### Step 6: guards before anything is pushed

All of these must pass. A single failure sends the run to the fallback.

1. `node .steward/scripts/steward/validate.mjs . --strict --since <head-before-run> --fleet .steward/docs/steward/fleet.json --repo <name>`
2. The repo's own gate from `docs_check`, if there is one.
3. `git diff --name-status <head-before-run>` shows no `D` lines and nothing
   outside `write_allowlist` (the validator checks both; read its output).
4. No secret pattern in any changed file (the validator checks).
5. Read the diff of NOW.md and the LOG once more for em dashes, invented
   numbers, and claims with no pointer.

Fallback: commit to a branch `steward/YYYY-MM-DD`, push it, open a pull
request titled `docs(steward): YYYY-MM-DD needs review`, and put the failing
guard's output in the body. Never force anything onto main.

### Step 7: commit and push

One commit: `docs(steward): YYYY-MM-DD <one line on what changed>`. Body:
the drift table (file, disposition, why). Push to `main`. The workflow's
`github_token` is the default token, which GitHub never uses to retrigger a
workflow, so there is no loop; the caller workflows also skip any push whose
message starts with `docs(steward):`.

### Step 8: report

Write to the job summary (`$GITHUB_STEP_SUMMARY`):

- Repo, head before, head after, disposition (`no change`, `stamped`,
  `reconciled`, `fallback PR`).
- The drift table.
- Contradictions resolved, each with what won and why.
- Waiting on Krish: what could not be settled from the code.
- Trust delta: one paragraph on what an agent reading yesterday's docs would
  have got wrong.

The control-center nightly run reads every fleet repo's `NOW.md` frontmatter
and appends one line per repo to `docs/steward/LEDGER.md`. That file is the
cross-repo chronology.

## Repo notes

- **control-center.** `docs/MINDMAKE_OS_ARCHITECTURE.md` is the one OS
  architecture surface (ruling 2026-09-07). The architecture engine writes
  its section 20 entry every Sunday with `[skip ci]`, so the steward does
  not run on that push. The steward never edits an entry carrying an
  `<!-- engine-week:... -->` mark and never writes into section 0a, 0b or 0c;
  rulings are a person's. NOW.md links to the doc and restates nothing from
  it.
- **mindmake.** Krish's decision, 2026-09-07: the "no history file" rule in
  `project-documentation/README.md` is replaced by
  `project-documentation/history/LOG.md`. Canon files `00_NORTH_STAR.md` and
  `01_CANON.md` are never edited by the steward; a contradiction with canon
  is reported, not resolved.
- **full-time.** `scripts/check-documentation.mjs` pins `asOf`; it moves in
  lockstep with `docs/product-state.json` and is on the allowlist for that
  reason alone.
- **fractionl-circle.** The archive is `docs/_archive/`; moves go there and
  the LOG records them with `archived` lines.

## What the steward never does

- Delete a file, rewrite the LOG, or edit anything in `docs/history/` other
  than to add a banner on arrival.
- Change prices, offers, ICP definitions, or commercial claims on its own
  judgement. Those come from `krishanraja/mindmake` canon
  (`project-documentation/00_NORTH_STAR.md`, `01_CANON.md`). If a repo doc
  contradicts canon, NOW.md says so and the run reports it.
- Touch source, tests, config, lockfiles, workflows, or secrets.
- Push to any branch but `main` (normal) or `steward/YYYY-MM-DD` (fallback).
- Merge its own fallback pull request.
- Run longer than its budget to finish a repo. Report and stop.
