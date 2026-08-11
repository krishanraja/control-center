// Guards the seams where the content taxonomy silently rots.
//
// Three of these have already bitten in production:
//   1. LANE_ADAPTS `value` is passed VERBATIM to corpusForChannel() by
//      api/content-ideas/[id]/revise.ts. A value that is not a CHANNEL_HEADING
//      key does not error, it just returns no corpus, and the adapt quietly
//      degrades into a generic rewrite. ("mymu_teardown" did exactly this.)
//   2. Corpus headings must match exactly ONE lookup key.
//   3. A format name that is also an ordinary English word will capture the
//      wrong section unless its pattern is ANCHORED to the start of the
//      heading. "Built" appears inside the real heading "How a piece gets
//      built (the pipeline, per channel)", which sits ABOVE the playbooks, so
//      an unanchored /Built/ hands every Built piece the pipeline preamble
//      instead of its playbook. "Paid" has the same problem against prose
//      about the publication's paid tiers.
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

// ── 2. no retired value is offered as a choice ─────────────────────────────
// These are all reachable as LEGACY aliases so old rows still resolve; what
// must never happen is one being offered for NEW work.
const RETIRED = [
  'builder_economy_ig', 'techonomic', 'mymu', 'makeyourmindup',
  'mymu_weekly', 'investigation', 'builder_economy',
]
const choiceBlocks = [
  ['LANE_ADAPTS', adaptBlock],
  ['VENTURE_FORMATS', ce.split('export const VENTURE_FORMATS')[1]?.split('\n]')[0] ?? ''],
  ['MEDIA_VENTURES', ce.split('export const MEDIA_VENTURES')[1]?.split('\n]')[0] ?? ''],
  ['LANES', ce.split('export const LANES')[1]?.split('\n]')[0] ?? ''],
] as const
for (const [name, block] of choiceBlocks) {
  if (!block) bad(`could not parse ${name}`)
  for (const dead of RETIRED) {
    if (new RegExp(`'${dead}'`).test(block)) bad(`retired value '${dead}' is still offered as a choice in ${name}`)
  }
}

// ── 3. Mindmaker Live is a venture, never an adapt target ──────────────────
if (/value:\s*'mindmaker_live'/.test(adaptBlock)) {
  bad("'mindmaker_live' is offered as an adapt target; it is a venture with two formats, not one register")
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
  if (c === 'mindmaker_live') bad('FACTORY_FANOUT offers the Mindmaker Live venture as one destination; it has two formats')
  if (RETIRED.includes(c)) bad(`FACTORY_FANOUT still offers the retired '${c}'`)
}

// ── 5. format patterns must be ANCHORED (trap 3 above) ─────────────────────
// Checked structurally rather than by eyeballing: a format key whose pattern
// can match mid-heading is the exact bug that has recurred.
for (const key of ['paid', 'built']) {
  const m = new RegExp(`^ {2}${key}:\\s*(/.*/)[a-z]*,`, 'm').exec(ct)
  if (!m) { bad(`no CHANNEL_HEADING pattern found for the '${key}' format`); continue }
  const src = m[1]
  if (!src.startsWith('/^')) bad(`CHANNEL_HEADING.${key} is not anchored to the start of the heading: ${src}`)
  if (src.includes('|')) bad(`CHANNEL_HEADING.${key} has an alternation that can match mid-heading: ${src}`)
}

// ── 6. the two format patterns must not both match one heading ─────────────
// Simulates the real matcher against the headings the live corpus carries.
const HEADINGS = [
  '0. Mindmaker Live house register (applies to EVERY Mindmaker Live format)',
  '1. Paid (the investigation)',
  '2. Built (builder conversations)',
  '3. Signal & Noise (distribution channel, co-hosted with Rio Longacre and Brett House)',
  '4. Maven (free lessons only)',
  'How a piece gets built (the pipeline, per channel)',
  'The Five Standards (every channel, no exceptions)',
  'Channel Router (which instrument is this?)',
]
const LIVE_KEYS = ['paid', 'built', 'mindmaker_live', 'signal_noise', 'maven'] as const
const patternFor = (k: string) => {
  const m = new RegExp(`^ {2}${k}:\\s*/(.*)/([a-z]*),`, 'm').exec(ct)
  return m ? new RegExp(m[1], m[2]) : null
}
for (const h of HEADINGS) {
  const hits = LIVE_KEYS.filter(k => patternFor(k)?.test(h))
  if (hits.length > 1) bad(`heading "${h}" matches ${hits.length} live keys (${hits.join(', ')}); headings must be disjoint`)
}
for (const k of LIVE_KEYS) {
  if (!HEADINGS.some(h => patternFor(k)?.test(h))) bad(`live key '${k}' matches NO corpus heading; its playbook will never load`)
}

console.log(
  fail === 0
    ? `PASS  ${adaptValues.length} adapt values + ${fanChannels.length} live fan-out channels resolve to corpus keys; ${LIVE_KEYS.length} live keys are disjoint across ${HEADINGS.length} headings`
    : `${fail} FAILURE(S)`,
)
process.exit(fail ? 1 : 0)
