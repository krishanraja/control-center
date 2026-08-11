// Guards the goal ladder against splitting back into two editors.
//
// The original bug was not bad data. Three surfaces read the same `goals`
// table, none of them filtered by horizon, and each presented its slice as a
// different concept. Fixing the rows did not fix the feeling that there was
// more than one version of a goal, because there was more than one editor.
//
// So the invariant is structural, not about data: exactly ONE component may
// write to the goal tables, and Home may not render a second goal editor.
//
//   npx tsx scripts/check-goal-ladder.mts
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

let fail = 0
const bad = (m: string) => { console.log('FAIL: ' + m); fail++ }

const LADDER = 'src/components/goals/GoalLadder.tsx'

function walk(dir: string, out: string[] = []): string[] {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e)
    if (statSync(p).isDirectory()) walk(p, out)
    else if (/\.tsx?$/.test(e)) out.push(p.replace(/\\/g, '/'))
  }
  return out
}

const files = walk('src')

// ── 1. only the ladder CREATES a goal ──────────────────────────────────────
// The invariant is about goal ENTRY, not about every write. Sub-resource
// writes are fine and are not a second version of a goal:
//   /api/objectives/:id/milestones      a step under an existing goal
//   /api/objectives/:id/nominate-*      accept or reject a proposal
//   /api/objectives/:id  (PATCH)        re-order, re-level, drop
//   /api/goals  (PATCH team_focus)      system_config, not a goal row
// What must stay singular is the POST to a bare collection endpoint, because
// that is what mints a new goal.
const CREATE = /fetch\(\s*[`'"](?:\$\{[^}]*\})?\/api\/(goals|objectives)[`'"][\s\S]{0,200}?method:\s*'POST'/

// Ratifying Marcus's re-level promotes a proposed objective, so it necessarily
// creates a row. It is not hand-entry: the title comes from the proposal and
// Krish only approves. Allowed on purpose, and named here so it stays a
// deliberate exception rather than drift.
const ALLOWED_CREATORS = new Set([LADDER, 'src/components/objectives/ObjectiveProposalReview.tsx'])

for (const f of files) {
  if (ALLOWED_CREATORS.has(f)) continue
  const src = readFileSync(f, 'utf8')
  if (CREATE.test(src)) {
    bad(`${f} POSTs a new goal; entry belongs to the ladder (${LADDER})`)
  }
}

// ── 2. Home renders the ladder and nothing that used to duplicate it ───────
for (const home of ['src/components/desktop/DesktopHome.tsx', 'src/components/mobile/MobileHome.tsx']) {
  const src = readFileSync(home, 'utf8')
  if (!/<GoalLadder\b/.test(src)) bad(`${home} does not render <GoalLadder>`)
  for (const dead of ['WeeklyGoals', 'ObjectivesPanel']) {
    if (new RegExp(`<${dead}\\b`).test(src)) bad(`${home} still renders the retired <${dead}>`)
  }
}

// ── 3. the ladder is never behind the ambient collapse ─────────────────────
// PulseGroup is the "informs but never asks" fold. A goal editor that asks for
// input cannot live inside it.
for (const home of ['src/components/desktop/DesktopHome.tsx', 'src/components/mobile/MobileHome.tsx']) {
  const src = readFileSync(home, 'utf8')
  // Both Home files branch on feature flags, so there is one PulseGroup per
  // branch. Check every one, not just the first.
  let from = 0
  for (;;) {
    const idx = src.indexOf('<PulseGroup>', from)
    if (idx === -1) break
    const close = src.indexOf('</PulseGroup>', idx)
    if (close === -1) break
    if (src.slice(idx, close).includes('<GoalLadder')) {
      bad(`${home} renders <GoalLadder> inside <PulseGroup>; the one goal editor cannot sit behind the ambient fold`)
    }
    from = close + 1
  }
}

// ── 4. every horizon is reachable from the one editor ──────────────────────
const ladder = readFileSync(LADDER, 'utf8')
for (const hz of ['os', 'mid_term', 'weekly', 'venture_objective']) {
  if (!new RegExp(`id:\\s*'${hz}'`).test(ladder)) {
    bad(`horizon '${hz}' has no rung in the ladder, so it can never be entered`)
  }
}

// ── 5. a non-OS rung must demand a parent ──────────────────────────────────
if (!/needsParent/.test(ladder) || !/What does it serve\?/.test(ladder)) {
  bad('the ladder no longer forces a non-OS goal to name its parent; orphans will return')
}

// ── 6. no second DISPLAY of the OS rung ────────────────────────────────────
// The original invariant guarded goal ENTRY, and that is what let this
// regress. `system_config.north_star` was a second store for "what the OS is
// for": one string, an API write path no UI ever called, rendered read-only in
// Home's hero beside the ladder's live OS rung. It POSTed nothing and was named
// neither retired component, so it passed every check above while showing a
// stale second version of the same concept. It went unwritten from 2026-04-14
// to 2026-08-11.
//
// north_star is now a derived mirror (api/_northStar.ts) kept only for readers
// outside this repo. Nothing in src/ may read it.
// Comments are stripped first: this file's own explanation of WHY north_star is
// gone would otherwise trip the rule that removed it. (Crude stripper -- a `//`
// inside a string literal drops the rest of that line. Good enough here, and it
// errs toward false PASS on that one line, never a false FAIL.)
const stripComments = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '')

for (const f of files) {
  const src = stripComments(readFileSync(f, 'utf8'))
  if (/north_?[Ss]tar/.test(src)) {
    bad(`${f} references north_star; the OS rung of the ladder is the store, and the hero reads os_goals`)
  }
}

// The hero must take its OS goals from the ladder's payload, not from anywhere
// else. If this binding is removed, the display has drifted off the one store
// again even if no new editor appeared.
{
  const home = 'src/components/desktop/DesktopHome.tsx'
  const src = readFileSync(home, 'utf8')
  // EVERY hero, not just one of them. Home renders OsMissionHero once per
  // feature-flag branch, so checking "does the binding appear anywhere" would
  // pass with one branch correct and the other drifted.
  const heroes = Array.from(src.matchAll(/<OsMissionHero\b[\s\S]*?\/>/g))
  if (heroes.length === 0) bad(`${home} no longer renders <OsMissionHero>`)
  for (const m of heroes) {
    if (!/osGoals=\{goalsData\?\.os_goals\}/.test(m[0])) {
      bad(`${home} renders an <OsMissionHero> that does not take os_goals from the ladder read`)
    }
  }
}

// ── 7. exactly one focus editor per surface ────────────────────────────────
// Deliberate split, not an accident: the desktop hero owns the focus line
// because its editor offers Marcus's recommendation, so the ladder is passed
// showFocus={false} there. Mobile has no hero, so the ladder owns it. Asserted
// rather than left to convention, because "two editors for one field" is the
// exact bug this file exists to prevent.
{
  const desktop = readFileSync('src/components/desktop/DesktopHome.tsx', 'utf8')
  for (const m of desktop.matchAll(/<GoalLadder\b[^>]*>/g)) {
    if (!/showFocus=\{false\}/.test(m[0])) {
      bad(`DesktopHome renders <GoalLadder> without showFocus={false}; the hero already owns the focus line`)
    }
  }
  const mobile = readFileSync('src/components/mobile/MobileHome.tsx', 'utf8')
  for (const m of mobile.matchAll(/<GoalLadder\b[^>]*>/g)) {
    if (/showFocus=\{false\}/.test(m[0])) {
      bad(`MobileHome disables the ladder's focus editor, and mobile has no hero to own it instead`)
    }
  }
}

// ── 8. one horizon vocabulary, everywhere ──────────────────────────────────
// The rungs are a closed set. Three places name them independently and a fourth
// enforces them in Postgres (goals_horizon_check). If they drift, a goal can be
// written at an altitude some surface does not filter for, which is how rows
// end up belonging to no surface and showing up on all of them.
{
  const CANON = ['os', 'mid_term', 'weekly', 'venture_objective']
  const sources: Array<[string, RegExp]> = [
    ['api/goals/ladder.ts', /const HORIZONS = \[([^\]]*)\]/],
    ['api/objectives/index.ts', /const ALLOWED_HORIZON = new Set\(\[([^\]]*)\]/],
  ]
  for (const [file, re] of sources) {
    const m = readFileSync(file, 'utf8').match(re)
    if (!m) { bad(`${file} no longer declares its horizon list where the guard can read it`); continue }
    const found = Array.from(m[1].matchAll(/'([a-z_]+)'/g)).map(x => x[1])
    if (found.join(',') !== CANON.join(',')) {
      bad(`${file} horizons are [${found.join(', ')}]; canon is [${CANON.join(', ')}]`)
    }
  }
  const rungIds = Array.from(ladder.matchAll(/id:\s*'([a-z_]+)'/g)).map(x => x[1])
  for (const id of rungIds) {
    if (!CANON.includes(id)) bad(`the ladder has a rung '${id}' that is not a canonical horizon`)
  }
}

console.log(fail === 0 ? 'PASS  one editor, one display, four rungs, parents enforced' : `${fail} FAILURE(S)`)
process.exit(fail ? 1 : 0)
