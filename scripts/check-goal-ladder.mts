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

// ── 1. only the ONE WIRE PATH creates a goal ───────────────────────────────
// The invariant is about goal ENTRY, not about every write. Sub-resource
// writes are fine and are not a second version of a goal:
//   /api/objectives/:id/nominate-*      accept or reject a proposal
//   /api/goals  (PATCH)                 mutate an existing goal by id
// What must stay singular is the POST to a bare collection endpoint, because
// that is what mints a new goal.
//
// The original rule allowed exactly one COMPONENT. That held until the Focus
// Ritual's weekly step also legitimately needed to create weekly goals, so the
// rule is now one MODULE: every surface that writes a goal goes through
// src/lib/goalsApi.ts, and only that module may speak the wire protocol.
const CREATE = /fetch\(\s*[`'"](?:\$\{[^}]*\})?\/api\/(goals|objectives)[`'"][\s\S]{0,200}?method:\s*'POST'/

const ALLOWED_CREATORS = new Set(['src/lib/goalsApi.ts'])

for (const f of files) {
  if (ALLOWED_CREATORS.has(f)) continue
  const src = readFileSync(f, 'utf8')
  if (CREATE.test(src)) {
    bad(`${f} POSTs a new goal; entry belongs to the one wire path (src/lib/goalsApi.ts)`)
  }
}

// ── 2. Home renders the canon and nothing that used to duplicate it ────────
// The canon is GoalLadder (OS + week) + TodayList (today's 3). Everything in
// the dead list was, at some point, a second rendering of one of those layers.
for (const home of ['src/components/desktop/DesktopHome.tsx', 'src/components/mobile/MobileHome.tsx']) {
  const src = readFileSync(home, 'utf8')
  if (!/<GoalLadder\b/.test(src)) bad(`${home} does not render <GoalLadder>`)
  if (!/<TodayList\b/.test(src)) bad(`${home} does not render <TodayList>`)
  for (const dead of ['WeeklyGoals', 'ObjectivesPanel', 'OsMissionHero', 'AltitudeSpine', 'BoardDaily', 'DecisionsInbox', 'PulseGroup', 'GrowthScoreboard']) {
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
// The composer must be openable at both rungs, or a horizon exists that no UI
// can enter (which is how two of the four old rungs sat empty for months).
const ladder = readFileSync(LADDER, 'utf8')
for (const hz of ['os', 'weekly']) {
  if (!new RegExp(`openAdd\\('${hz}'\\)`).test(ladder)) {
    bad(`horizon '${hz}' has no composer entry in the ladder, so it can never be entered`)
  }
}

// ── 5. a non-OS rung must demand a parent ──────────────────────────────────
// The asking UI moved from an inline "What does it serve?" select into the
// shared <ServesPicker> (goals/GoalPickers.tsx) when dropdowns left the
// write side; the invariant is the same — the composer renders a parent
// chooser and save refuses without one.
if (!/needsParent/.test(ladder) || !(/<ServesPicker\b/.test(ladder) || /What does it serve\?/.test(ladder))) {
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

// ── 7. no second store for "what is this week about" ───────────────────────
// team_focus (system_config) was a free-text weekly focus line living beside
// the weekly rung of the ladder — the last second store. It is retired: the
// weekly rung IS the answer. Nothing in src/ may read or write it again.
for (const f of files) {
  const src = stripComments(readFileSync(f, 'utf8'))
  if (/team_focus/.test(src)) {
    bad(`${f} references team_focus; the weekly rung of the ladder is the one answer to "what is this week about"`)
  }
}

// ── 8. one horizon vocabulary, everywhere ──────────────────────────────────
// The rungs are a closed set. Three places name them independently and a fourth
// enforces them in Postgres (goals_horizon_check). If they drift, a goal can be
// written at an altitude some surface does not filter for, which is how rows
// end up belonging to no surface and showing up on all of them.
{
  const CANON = ['os', 'weekly']
  const sources: Array<[string, RegExp]> = [
    ['api/goals/ladder.ts', /const HORIZONS = \[([^\]]*)\]/],
    ['api/objectives/index.ts', /const ALLOWED_HORIZON = new Set\(\[([^\]]*)\]/],
    ['api/_goalGate.ts', /const HORIZONS: Horizon\[\] = \[([^\]]*)\]/],
  ]
  for (const [file, re] of sources) {
    const m = readFileSync(file, 'utf8').match(re)
    if (!m) { bad(`${file} no longer declares its horizon list where the guard can read it`); continue }
    const found = Array.from(m[1].matchAll(/'([a-z_]+)'/g)).map(x => x[1])
    if (found.join(',') !== CANON.join(',')) {
      bad(`${file} horizons are [${found.join(', ')}]; canon is [${CANON.join(', ')}]`)
    }
  }
  const rungIds = Array.from(ladder.matchAll(/openAdd\('([a-z_]+)'\)/g)).map(x => x[1])
  for (const id of rungIds) {
    if (!CANON.includes(id)) bad(`the ladder's composer opens at '${id}', which is not a canonical horizon`)
  }
}

console.log(fail === 0 ? 'PASS  one wire path, one display, two rungs, parents enforced' : `${fail} FAILURE(S)`)
process.exit(fail ? 1 : 0)
