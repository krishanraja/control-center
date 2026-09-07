# Docs steward: the uniform layer

Status: Current
Owner: Krish Raja
Last verified: 2026-09-07 against `scripts/steward/validate.mjs`

The steward adds exactly two files to every repo in `fleet.json`. Everything
else in a repo keeps its own structure, voice, naming, stamp form and archive
location. The two files are a router and a log, not a second copy of the
repo's documentation. A fact copied into them goes stale silently, so they
point at the repo's own docs instead of restating them.

## 1. `NOW.md` at the repo root

The first and only file an agent has to read to know what the tool is, where
it is right now, what is new, why Mindmake's buyer should care, and where the
detail and the history live. Validated by `scripts/steward/validate.mjs`.

### Frontmatter (all keys required, this order is conventional not enforced)

```yaml
---
repo: krishanraja/<name>
product: <the name as it is sold or spoken>
as_of: YYYY-MM-DD
head: <short sha of the last non-steward commit this file was reconciled against>
lifecycle: live | beta | building | dormant | archived
production_url: <https url, or none>
state_doc: <repo-relative path of the repo's own deepest current-state doc>
history_log: docs/history/LOG.md
truth_files: [<machine-readable files that must move with the prose>]
authority_order: [<the repo's own precedence list, copied from its docs, never invented>]
steward: https://github.com/krishanraja/control-center/blob/main/docs/steward/RUNBOOK.md
never_publish: [<optional: what a writer must never reveal about this repo, beyond the registry default>]
---
```

`never_publish` is optional and read by the Content Engine's build-signal
ingest (`api/_buildSignals.ts`, `withNeverPublish`), which merges it into the
repo's never-reveal note. Put client names, private prices, machine names,
sheet ids, family names and credential names here. The registry in
`api/_buildSignals.ts` carries a default per repo; the repo knows better.

Rules the validator enforces:

- `head` is an ancestor of `HEAD`, and every commit after it has a subject
  starting `docs(steward):`. That is what makes `as_of` trustworthy: nothing
  but the steward has touched the repo since the file was reconciled.
- `as_of` is not older than the date of the `head` commit.
- `lifecycle` is one of the five words above.
- `state_doc`, `history_log` and every `truth_files` entry exist. Entries in
  `authority_order` that look like paths must exist too; prose entries such
  as "production readback" are allowed.
- Under 200 lines. No em dash anywhere in the file.

### Body (seven H2 sections, this order, these exact headings)

```markdown
# <Product>: where it is right now

## What it is
One paragraph. The first sentence must stand on its own as the sales line.

## Who it is for and why it matters for Mindmake
The ICP link. For a Mindmake product: the buyer and the pain, as the room_face
ICP in control-center/docs/ICP.md describes them. For anything else: what this
repo proves about Krish and Mindmake to that buyer, and which story or lead
angle it supports. Write it so a content agent can quote it.

## Where it is right now (as of YYYY-MM-DD)
Lifecycle. What is live and verified. What is built but not live. What is
broken, blocked, or waiting. Every claim points at code, a migration, a
readback, or a truth file.

## What changed recently
Dated bullets, newest first, rolling 30 days. On each run the steward rolls
anything older into docs/history/LOG.md. Each bullet carries the why, not
just the what: the decision, the failure, the wrong assumption, the number
where one exists, and a pointer (PR, commit, file). These bullets are what
the Content Engine's Built with AI and Money of AI lenses read
(docs/CONTENT-ENGINE-BUILD-SIGNALS.md), so a bullet that only lists files
or features is a bullet a writer cannot use.

## What is next and what is waiting on Krish
Open decisions and the single next action.

## Read next
The repo's own docs in its own authority order, one line each on what that
document settles. Link, do not summarise.

## Do not trust
Every superseded or contradictory document still in the tree, with the date
it was superseded and where the replacement lives. The section is always
present; "Nothing at the moment." is a valid body.
```

Voice: plain English, specific, no motivational filler, no buzzwords, no
em dashes. Product nouns stay. British spelling.

## 2. `docs/history/LOG.md`

The chronological record. Append-only, newest entry first. The steward
writes to it; nobody rewrites it.

```markdown
# History log

Newest first. Entries are written by the docs steward (see the steward link in
NOW.md) and by humans doing the same job by hand. Nothing in this file
describes current behaviour; NOW.md and the state doc do.

## 2026-09-07

- moved `docs/OLD-ROADMAP.md` to `docs/history/2026-09-07-OLD-ROADMAP.md`, superseded by `docs/current/release-state.md`, because it described the June phase plan as current.
- rolled from NOW.md: 2026-08-05 advisory sales reopened under the room thesis.
- reconciled at `abc1234`: three current docs disagreed on launch state; `12-roadmap.md` and `13-agent-handoff.md` re-headed to live beta.
```

Entry line forms (free text after the colon is fine, the lead words are the
convention): `moved`, `rolled from NOW.md`, `reconciled at`, `decision`,
`archived` (for an existing archive dir the LOG now indexes).

## 3. Files moved into `docs/history/`

A moved file keeps its body verbatim below a three-line banner:

```markdown
> **Historical.** Archived 2026-09-07 by the docs steward. Not current guidance.
> Replaced by: `docs/current/release-state.md`
> Reason: described the June 2026 phase plan as current.
```

Naming: `docs/history/YYYY-MM-DD-<original-basename>`. If a repo already has
an archive directory (`docs/_archive/`, `project-documentation/history/`), the
existing directory stays and the LOG gains one `archived` line per file it
now indexes. The steward never deletes a file and never creates a second
archive directory in a repo that already has one.

## 4. What the steward may write

Per repo, `fleet.json` lists a `write_allowlist`. By default that is every
`*.md` file plus the repo's `truth_files`. Anything outside the allowlist,
including source, config, workflows and lockfiles, is off limits to the
steward and fails the validator when `--since` is given.

## 5. Who reads these files

- **Lead generation and content agents** read NOW.md first. It is the only
  file they are promised is current at its `head`.
- **The Content Engine's Saturday build-signal ingest**
  (`api/discover-build-signals.ts` in control-center) reads NOW.md's "What it
  is", "Who it is for and why it matters for Mindmake" and "What changed
  recently" sections as the lens context in place of the README opening,
  merges `never_publish` into the never-reveal note, and reads
  `docs/history/LOG.md` as a build-log candidate when a commit in the week
  touched it. Named products are named; every other repo is "a side build"
  and its name never travels, whatever NOW.md says.
- **The architecture engine** (`api/architecture/weekly.ts`) writes the
  weekly section 20 entry of control-center's `docs/MINDMAKE_OS_ARCHITECTURE.md`
  on Sundays. The steward never edits an entry carrying an
  `<!-- engine-week:... -->` mark and never writes a ruling into section 0a;
  rulings are a person's.

## 6. Worked example

`control-center/NOW.md` is the reference implementation. Read it before
writing one for another repo.
