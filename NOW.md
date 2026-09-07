---
repo: krishanraja/control-center
product: Control Center
as_of: 2026-09-08
head: 7dcd0259
lifecycle: live
production_url: https://controlcenter.krishraja.com
state_doc: docs/plans/one-swing/STATE.md
history_log: docs/history/LOG.md
truth_files: [docs/icp.json]
authority_order: [production readback (Vercel deployment and Supabase), docs/MINDMAKE_OS_ARCHITECTURE.md, docs/DECISIONS, docs/plans/one-swing/STATE.md, README.md, docs/PRODUCT.md, docs/ARCHITECTURE.md, docs/GLOSSARY.md]
steward: https://github.com/krishanraja/control-center/blob/main/docs/steward/RUNBOOK.md
never_publish: [the Supabase project id, any credential or secret name, the cron secret, the private rate card, any named lead or room target, any figure from the scorecard or Compound]
---
# Control Center: where it is right now

## What it is

Control Center is the single pane of glass for mind/make OS, the fleet of AI agents that runs Krish Raja's business portfolio (Mindmake, the publication with its Paid and Built formats, mm-ctrl, Fractionl). A React and TypeScript dashboard on Vercel, reading Supabase directly and writing back through thin serverless routes, it exists to keep one promise: Krish opens one tab, sees every decision the OS is waiting on him for, decides in one click, and the rest runs in the background. The agents themselves are not in this repo; they are Supabase rows and n8n workflows. This is the dashboard slice, plus the crons that keep the OS honest.

## Who it is for and why it matters for Mindmake

Control Center is not sold. It is the proof asset behind everything Mindmake does sell. The room_face buyer (`docs/ICP.md`: a senior leader at a PE or VC backed media, adtech, publishing or data business, quietly behind on what is coming and unable to say so inside their organisation) is being asked to trust that one person can run a business on AI agents and stay in charge of it. This repo is the evidence, in public, with the failures left in.

Angles a writer can use without asking Krish:

- **The OS never pings him.** Since 6 September 2026 the OS is pull-only (ADR in `docs/MINDMAKE_OS_ARCHITECTURE.md` section 0b): every Telegram push was killed, including a fourth undocumented layer found in this repo's own API. Krish goes to the dashboard; nothing comes to him.
- **A green run with nothing sent is a failure.** The scorecard on Home counts approaches sent, calls, paid rooms, cash, pieces published, and hours building unasked. The last one is counted against him every Saturday from every commit in his repos, whoever the committer was, including this steward's own commits (ruling 7 September: "every repo in GITHUB_REPOS is his, so every commit in it is his build").
- **Operational exhaust is the content.** Since 7 September the same Saturday commit read feeds the Content Engine as build signals, and the architecture doc writes its own weekly changelog entry from them.
- **Self-healing is built in.** Four tiers of silent-failure detection surface value failures, not just exceptions. Several fixes in the last month are the OS catching itself lying: a Subscriptions tab that read as current while its ledger had been dead since July, a documentation sync that wrote to an untracked path for nine days.

Objection it answers: "AI agents in a real business just make noise." Here is the dashboard that made them quiet.

## Where it is right now (as of 2026-09-07)

- **Live** at `controlcenter.krishraja.com`, auto-deployed from `main` on Vercel, Supabase behind it. CI runs lint, three typechecks and thirty structural guards on every push (`.github/workflows/ci.yml`).
- **The one swing is the operating frame** (ADR-016, `docs/plans/one-swing/CHARTER.md`): one mission, five jobs in priority order. Jobs 1 (the Room) and 2 (the scorecard) are built and live since 5 September. Jobs 3, 4 and 5 are gated on the first paid room. Gate G1 is open; G2 to G4 are closed. Ledger and Vercel state: `docs/plans/one-swing/STATE.md`.
- **Content Engine**: unified editorial system merged 7 September (independent Money of AI and Built with AI lenses, one content output registry, approved ideas flow straight into Studio production). Build signals from Krish's repos ingest every Saturday 05:00 UTC.
- **Architecture doc**: `docs/MINDMAKE_OS_ARCHITECTURE.md` on `main` is the only OS architecture surface (ruling 7 September; VPS and Drive copies deleted). The engine writes section 20 on Sundays 13:00 UTC and stamps the header's "Last engine refresh" line each time.
- **Docs steward** (this file and `docs/steward/`) adopted 7 September (PR #279), bootstrapped by hand across all eight fleet repos the same day (`docs/steward/LEDGER.md`), automated by `.github/workflows/docs-steward.yml` on every push to `main` and nightly. Proven end to end on 7 September: the token gate, the digest, Claude's run and the strict validator all passed on a live dispatch.
- **Waiting on evidence, not code**: the scorecard's "hours building unasked" reads "not measured yet" until a Saturday GitHub read has written a week.
- **Parked**: the hunter job-search lane is hidden behind `VITE_BRIDGES_LANE_ENABLED` and the agent row is left active by Krish's choice.

## What changed recently

- 2026-09-08 **Goals canon aligned: shutdown feeds tomorrow, weeks close on Saturday, Today is manual first** (ADR-018). Why: the shutdown prompt returned on every new tab (sessionStorage), no evening row had ever been saved, `daily_focus` was empty, Home carried two weekly composers (one expanded inline on a no-scroll screen), and nothing ever closed a week. One writer for tomorrow's 3 (`api/_dailyFocus.ts`), `goals.week_start` plus a Saturday `week-close` cron and a `missed` status, editable Today slots, the ritual as the one weekly composer, and the goal spine now carries today's frame and the last four weeks into every Ask.
- 2026-09-07 **The scorecard counts every commit, not one login** (`37af6d3c`, guard `e86e31b8`). Why: a dry run showed most session commits carry the coding agent's address (36 of 38 in one repo, 18 of 34 here), so the Rule 6 tripwire "was reading roughly half the truth". `GITHUB_AUTHOR` is no longer read anywhere and the guard fails if either reader brings it back.
- 2026-09-07 **Architecture doc: the one-surface retirement closed out** (#280, #281). The last three references to a VPS or Drive copy removed; the three weekly Documentation Refresh Routines recorded as deleted by Krish; the fleet's last reference to the trashed Drive file removed.
- 2026-09-07 **Build signals** (`2c83ff90`, `e11f2ab5`). Why: every Saturday the scorecard counted Krish's commits against him as unasked hours, and nothing read the same stream for content, although canon asks for a solo Built with AI variant on exactly that material. One new `source_type` flows into the existing content spine; nothing new to run.
- 2026-09-07 **One architecture surface, kept current by the engine** (`ec7f05e7`, `31fc3162`, `1be3dddb`). Why: six copies of the OS architecture doc drifted silently; the sync script had written a misspelled filename into an untracked path for nine days and nothing errored. Krish deleted the VPS and Drive copies for good. A Sunday cron now writes the weekly entry.
- 2026-09-07 **Unified Content system** (PRs #274 to #278). Editorial radar with independent lenses, one output registry, approved ideas joined to Studio production.
- 2026-09-07 **People: one graph, three doors, a Hunt lane** (`1410ae8c`). "Process my verdicts" fires a repository dispatch on the job-search tool so a run starts within a minute.
- 2026-09-07 **Subscriptions read as stale** (`e960bb4f`). Why: the customers ledger had not been written since 17 July because a nightly n8n reconciliation had errored on every run after an account key expired, and the header still looked fresh.
- 2026-09-07 **n8n git and cloud parity rebuilt, Kai retired, secret guard hardened** (#270). Why: git claimed to be the source of truth while 43 snapshots stood against 123 cloud workflows with 154 drift items, so an apply would have overwritten live definitions with stale ones.
- 2026-09-06 **Pull-only OS** (#267, then #271, #272). Every Telegram push killed, including four callers in this repo's own API; the Maa reminders switched off and the doc that named them an exception corrected.
- 2026-09-06 **One filename for the architecture doc** (#268, #269). Why: the repo tracked `MINDMAKE_`, the VPS and skills tracked `MINDMAKER_`, and surface 2 diverged from the rebrand for nine days without an error.
- 2026-09-05 **The one swing shipped** (`efcfe51e` to `e1f81545`): canon repointed to Ikigai v4, the Room (25 leaders who fit the face, drafted by the OS, sent by Krish), the scorecard, the demand-engine feed, the job search parked, and a runway sentence in COMPOUND.
- 2026-09-04 **COMPOUND Spend and Property tabs** (#253 to #259) and the **Video Engine control plane** (#260 to #266).
- 2026-09-01 to 02 **Bridges lane** for warm-intro candidates and a gated inspiration lane from favourite creators.
- 2026-08-29 **Mindmake rebrand** of the OS and the architecture doc; a committed Telegram bot token removed and a guard added so the next one fails the build.

## What is next and what is waiting on Krish

- Next: jobs 1 and 2 of the one swing are the work in play. `docs/plans/one-swing/STATE.md` carries the ledger; the Monday note carries the week.
- Waiting on Krish (`docs/plans/one-swing/STATE.md`, "Ops steps owed"): `PARTNER_EMAIL` when a partner exists; whether to set the hunter agent inactive; a cash balance in COMPOUND Settings; saying the mission out loud to one person.

## Read next

1. `docs/MINDMAKE_OS_ARCHITECTURE.md`: the whole OS. When this repo's docs disagree with it, it wins. Read sections 0a to 0c first; they override older prose below them.
2. `README.md`: what this repo is and should be, the tech stack, the layout.
3. `docs/plans/one-swing/CHARTER.md` and `STATE.md`: the operating frame and the live ledger.
4. `docs/DECISIONS/`: why things are the way they are. ADR-016 is the current frame.
5. `docs/PRODUCT.md` and `docs/ARCHITECTURE.md`: per-tab spec and the engineering contract.
6. `docs/ICP.md` and `docs/icp.json`: who the OS sources, scores and drafts for. `api/_icpScore.ts` is the executable copy.
7. `docs/CONTENT-ENGINE-BUILD-SIGNALS.md`: how this repo's commits become content.
8. `AGENTS.md`: rules for coding agents working in this repo (house systems, tests, CI).

## Do not trust

- `docs/ICP.md`, section "The six v2 lanes" and below: the v2 lane detail from 2026-06-20. Lane order and which lanes are live or parked are the table at the top of that file and `api/_icpScore.ts` (ADR-016, 2026-09-06).
- `n8n/workflows/README.md`: its 2026-05-25 claim that the n8n cloud editor is canonical was superseded by `scripts/n8n/README.md` (git wins). Banner added 2026-09-07; the snapshots stay as history.
- `docs/CONTENT_TAB_SPEC.md`: the June 2026 build spec, superseded taxonomy, banner in the file.
- `docs/pr-2` to `docs/pr-8` and `docs/visibility-followups-2026-05.md`: change notes from the May rebuild, a changelog supplement, not architecture.
- Any doc that names a VPS or Drive copy of the architecture doc: gone since 2026-09-07.
