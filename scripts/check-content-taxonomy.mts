// Guards the seams where the content taxonomy silently rots.
//
// Two of these have already bitten in production:
//   1. LANE_ADAPTS `value` is passed VERBATIM to corpusForChannel() by
//      api/content-ideas/[id]/revise.ts. A value that is not a CHANNEL_HEADING
//      key does not error, it just returns no corpus, and the adapt quietly
//      degrades into a generic rewrite. ("mymu_teardown" did exactly this.)
//   2. Corpus headings must match exactly ONE lookup key. The investigation
//      pattern is tested first, and the hero format is literally called
//      "MYMU: Teardown", so titling the weekly section with "Teardown" hands
//      every weekly piece the teardown bar.
//
//   npx tsx scripts/check-content-taxonomy.mts
import { readFileSync } from 'node:fs'

const ce = readFileSync('src/lib/contentEngine.ts', 'utf8')
const ct = readFileSync('api/_content.ts', 'utf8')

let fail = 0
const bad = (m: string) => { console.log('FAIL: ' + m); fail++ }

// ── 1. every adapt value is a real corpus key ──────────────────────────────
const adaptBlock = ce.split('export const LANE_ADAPTS')[1]?.split('\n]')[0] ?? ''
const adaptValues = [...adaptBlock.matchAll(/value:\s*'([^']+)'/g)].map(m => m[1])
const corpusKeys = new Set([...ct.matchAll(/^ {2}([a-z_]+):\s*\//gm)].map(m => m[1]))
if (!adaptValues.length) bad('no LANE_ADAPTS values parsed')
for (const v of adaptValues) {
  if (!corpusKeys.has(v)) bad(`LANE_ADAPTS value '${v}' is not a CHANNEL_HEADING key`)
}

// ── 2. no retired venture value is offered as a choice ─────────────────────
for (const dead of ['builder_economy_ig', 'techonomic', 'mindmaker_live']) {
  if (new RegExp(`value:\\s*'${dead}'`).test(ce)) bad(`retired value '${dead}' is still offered as a choice`)
}

// ── 3. MYMU is a venture, never an adapt target ────────────────────────────
if (/value:\s*'makeyourmindup'/.test(adaptBlock)) {
  bad("'makeyourmindup' is offered as an adapt target; MYMU is a venture with three formats, not one register")
}

console.log(
  fail === 0
    ? `PASS  ${adaptValues.length} adapt values, all resolve to corpus keys: ${adaptValues.join(', ')}`
    : `${fail} FAILURE(S)`,
)
process.exit(fail ? 1 : 0)
