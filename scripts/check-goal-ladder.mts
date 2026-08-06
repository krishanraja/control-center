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

console.log(fail === 0 ? 'PASS  one editor, four rungs, parents enforced' : `${fail} FAILURE(S)`)
process.exit(fail ? 1 : 0)
