// Guards the n8n sync drift guard.
//
// scripts/n8n/sync.mjs pushes repo -> cloud and the reverse direction is
// deliberately manual, so snapshots go stale. A stale snapshot pushed with
// --apply silently DELETES newer cloud work. Three real cases on 2026-08-29:
//
//   1. lead-doc-ingest was missing `origin: 'user'`, which existed only in cloud.
//   2. nova-visibility-sweeper was missing the cloud's entire product-data lane.
//   3. Ten snapshots had `{{ }}` in jsonBody/url WITHOUT the leading `=` the
//      cloud copy had. Pushing those stops the expression interpolating, so the
//      literal text `={{ ... }}` reaches the model or the database. Confirmed in
//      production: three audit_log rows stored the raw template.
//
// The guard in sync.mjs blocks all three. This asserts it still does, because a
// guard nobody tests is a guard that quietly stops guarding.
//
//   npx tsx scripts/check-n8n-sync-guard.mts
import { readFileSync } from 'node:fs'

let fail = 0
const bad = (m: string) => { console.log('FAIL: ' + m); fail++ }

const src = readFileSync('scripts/n8n/sync.mjs', 'utf8')

// The guard must still be wired into the apply path, not just defined.
if (!/function driftBlockers\(/.test(src)) bad('sync.mjs has no driftBlockers function')
if (!/blockers\.length && !force/.test(src)) bad('driftBlockers is defined but not enforced before the PUT')
if (!/--force/.test(src)) bad('there is no --force escape hatch documented')
if (!/if \(failed \|\| blocked\) process\.exit\(1\)/.test(src)) bad('a blocked push does not fail the run')

// Three hazards the drift guard cannot see, each one a way an --apply damages
// production while reporting success. They are asserted at source level because
// they are properties of the PUSH PATH rather than of driftBlockers, and each
// one was found live on 2026-09-24.

// A push into an archived twin prints "updated" and changes nothing. The cloud
// map is keyed by name and last-wins, and "Nell | Mindmaker OS | Guest Speaker
// Briefing" exists twice - once live, once archived.
if (!/isArchived/.test(src)) {
  bad('listCloudWorkflows does not filter archived copies, so a push can land in an archived twin and report success')
}

// buildPayload throws on a missing placeholder. Outside the try that escaped to
// main().catch and exited mid-loop, leaving a half-finished deploy that read as
// a config error.
const applyLoop = src.slice(src.indexOf('for (const p of plan) {', src.indexOf('let pushed = 0')))
if (/const payload = buildPayload\(/.test(applyLoop)) {
  const tryAt = applyLoop.indexOf('try {')
  const payloadAt = applyLoop.indexOf('const payload = buildPayload(')
  if (tryAt < 0 || payloadAt < tryAt) {
    bad('buildPayload runs outside the per-workflow try, so one missing secret aborts the loop mid-deploy')
  }
}

// staticData is runtime cursor state. Pushing the repo's copy rewinds live
// poll triggers; zara-layer-1's mirror carries a Drive cursor dated 2026-09-02.
if (!/--no-static-data/.test(src)) {
  bad('there is no way to push without overwriting live staticData, which rewinds poll cursors')
}

// Lift the pure functions out and exercise them.
const start = src.indexOf('/** Every (nodeName, paramKey)')
const end = src.indexOf('function summary(')
if (start < 0 || end < 0 || end <= start) {
  bad('could not locate the guard functions to test')
} else {
  const mod = src.slice(start, end) + '\nexport { driftBlockers }\n'
  const { driftBlockers } = await import('data:text/javascript,' + encodeURIComponent(mod)) as
    { driftBlockers: (l: any, c: any) => string[] }

  const cases: Array<[string, any, any, number]> = [
    // The real nova product-lane case: cloud has a node the snapshot lacks.
    ['node deletion is blocked',
      { nodes: [{ name: 'A', parameters: {} }] },
      { nodes: [{ name: 'A', parameters: {} }, { name: 'Audit Log Success (Product)', parameters: {} }] }, 1],
    // The real guest-import case: the snapshot drops the '=' the cloud has.
    ['dropping the = expression prefix is blocked',
      { nodes: [{ name: 'N', parameters: { jsonBody: '{"a":"{{ $json.x }}"}' } }] },
      { nodes: [{ name: 'N', parameters: { jsonBody: '={"a":"{{ $json.x }}"}' } }] }, 1],
    ['an identical workflow pushes cleanly',
      { nodes: [{ name: 'N', parameters: { jsonBody: '={{ $json.x }}' } }] },
      { nodes: [{ name: 'N', parameters: { jsonBody: '={{ $json.x }}' } }] }, 0],
    // Adding a node locally is a legitimate push and must not be blocked.
    ['adding a node locally is allowed',
      { nodes: [{ name: 'A', parameters: {} }, { name: 'B', parameters: {} }] },
      { nodes: [{ name: 'A', parameters: {} }] }, 0],
    // No {{ }} means the prefix carries no meaning, so it is not a regression.
    ['a prefix diff with no expression is ignored',
      { nodes: [{ name: 'N', parameters: { url: 'https://x' } }] },
      { nodes: [{ name: 'N', parameters: { url: '=https://x' } }] }, 0],
    ['both blockers are reported together',
      { nodes: [{ name: 'N', parameters: { jsonBody: '{{ $json.x }}' } }] },
      { nodes: [{ name: 'N', parameters: { jsonBody: '={{ $json.x }}' } }, { name: 'Gone', parameters: {} }] }, 2],
  ]

  for (const [name, local, cloud, want] of cases) {
    const got = driftBlockers(local, cloud).length
    if (got !== want) bad(`${name}: expected ${want} blocker(s), got ${got}`)
  }
  console.log(`  ${cases.length} drift-guard cases exercised`)
}

console.log(fail === 0 ? 'PASS  the n8n sync drift guard is wired in and still blocks node loss and expression-prefix regressions' : `${fail} FAILURE(S)`)
process.exit(fail ? 1 : 0)
