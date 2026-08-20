// Locks the goal gate's tier calibration.
//
// The point of this file: SMART applied uniformly gives WRONG answers at both
// ends of the ladder. A blanket Time-bound rule rejects a standing OS
// constraint that correctly has no end date. A blanket Measurable rule demands
// a number from a weekly deliverable that should not carry one. Every case
// below is one of those, or one of the anti-patterns the gate exists to catch.
//
// Only the zero-LLM layer is exercised. The judgment layer needs a key and is
// covered by its schema validator, not by asserting model output.
//
//   npx tsx scripts/check-goal-gate.mts
import { runGoalChecks, type Horizon } from '../api/_goalGate.js'

let fail = 0
const bad = (m: string) => { console.log('FAIL: ' + m); fail++ }

type Case = {
  what: string
  title: string
  horizon: Horizon
  parentId?: string | null
  venture?: string | null
  expectPass?: string[]   // check ids that MUST pass
  expectFail?: string[]   // check ids that MUST fail
}

const CASES: Case[] = [
  {
    what: 'a weekly deliverable is not asked for a number or a date',
    title: 'Ship the product-truth refresher',
    horizon: 'weekly', parentId: 'goal:mid:truth',
    expectPass: ['non_empty', 'under_200', 'single_goal', 'has_parent', 'fits_a_week'],
  },
  {
    what: 'a standing OS constraint is not asked for an end date',
    title: 'Krish under 2 hours/day on ops',
    horizon: 'os',
    expectPass: ['non_empty', 'single_goal', 'not_a_task'],
  },
  {
    what: 'the retired north_star string is caught as several goals',
    title: '$20K MRR within 60 days, 200+ leaders served by end of 2026, Krish under 2 hours/day on ops, OS becomes licensable asset',
    horizon: 'os',
    expectFail: ['single_goal'],
  },
  {
    what: 'a task entered at the OS rung is caught',
    title: 'Ship the product-truth refresher',
    horizon: 'os',
    expectFail: ['not_a_task'],
  },
  {
    what: 'a project entered at the weekly rung is caught',
    title: 'Become the default decision tool for operators',
    horizon: 'weekly', parentId: 'goal:os:x',
    expectFail: ['fits_a_week'],
  },
  {
    what: 'an orphaned non-OS goal is caught',
    title: 'Ship the pricing page rewrite',
    horizon: 'weekly', parentId: null,
    expectFail: ['has_parent'],
  },
  {
    what: 'a weekly goal with a venture tag is not asked for anything extra',
    title: 'Ship the CTRL activation email',
    horizon: 'weekly', parentId: 'goal:os:x', venture: 'mm_ctrl',
    expectPass: ['non_empty', 'under_200', 'single_goal', 'has_parent', 'fits_a_week'],
  },
  {
    what: 'the OS rung is never asked for a number or a date',
    title: 'The OS runs the portfolio without Krish in the loop',
    horizon: 'os',
    expectFail: [],
  },
]

for (const c of CASES) {
  const checks = runGoalChecks(c.title, c.horizon, { parentId: c.parentId, venture: c.venture })
  const byId = new Map(checks.map(x => [x.id, x]))

  for (const id of c.expectPass || []) {
    const chk = byId.get(id)
    if (!chk) { bad(`${c.what}: check '${id}' did not run at rung '${c.horizon}'`); continue }
    if (!chk.pass) bad(`${c.what}: '${id}' should pass but failed (${chk.detail})`)
  }
  for (const id of c.expectFail || []) {
    const chk = byId.get(id)
    if (!chk) { bad(`${c.what}: check '${id}' did not run at rung '${c.horizon}'`); continue }
    if (chk.pass) bad(`${c.what}: '${id}' should fail but passed`)
  }
  // expectFail: [] means "nothing at all may fail"
  if (c.expectFail && c.expectFail.length === 0) {
    for (const chk of checks) if (!chk.pass) bad(`${c.what}: nothing should fail, but '${chk.id}' did (${chk.detail})`)
  }
}

// The rungs that must NEVER demand a number or a date, whatever else changes.
for (const [horizon, banned] of [['os', ['has_number', 'has_date']], ['weekly', ['has_number', 'has_date']]] as const) {
  const ids = runGoalChecks('Some goal', horizon as Horizon, { parentId: 'p' }).map(c => c.id)
  for (const b of banned) {
    if (ids.includes(b)) bad(`rung '${horizon}' runs '${b}'; that rung is measured differently and must not demand one`)
  }
}

console.log(fail === 0 ? `PASS  ${CASES.length} cases, tier calibration holds` : `${fail} FAILURE(S)`)
process.exit(fail ? 1 : 0)
