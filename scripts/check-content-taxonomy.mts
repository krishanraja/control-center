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

// ── 4. the LIVE fan-out must be format-level too ───────────────────────────
// FACTORY_FANOUT (contentV2) is the list Krish actually sees when pushing,
// because v2 is the live system and v1 does not render while the flag is on.
// Fixing v1's LANE_ADAPTS while v2 was live changed nothing he could see, which
// is precisely the miss this check exists to prevent.
const cv2 = readFileSync('src/lib/contentV2.ts', 'utf8')
const fanBlock = cv2.split('FACTORY_FANOUT')[1]?.split('\n]')[0] ?? ''
const fanChannels = [...fanBlock.matchAll(/channel:\s*'([^']+)'/g)].map(m => m[1])
if (!fanChannels.length) bad('no FACTORY_FANOUT channels parsed')
for (const c of fanChannels) {
  if (!corpusKeys.has(c)) bad(`FACTORY_FANOUT channel '${c}' is not a CHANNEL_HEADING key`)
  if (c === 'makeyourmindup') bad('FACTORY_FANOUT offers the MYMU venture as one destination; it has three formats')
  if (c === 'builder_economy_ig') bad('FACTORY_FANOUT still offers the retired builder_economy_ig')
}

console.log(
  fail === 0
    ? `PASS  ${adaptValues.length} adapt values + ${fanChannels.length} live fan-out channels all resolve to corpus keys`
    : `${fail} FAILURE(S)`,
)
process.exit(fail ? 1 : 0)
