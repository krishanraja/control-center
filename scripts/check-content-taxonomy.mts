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
//   4. A retired BRAND lives in a `label:`, and until 2026-09-19 nothing here
//      read one. Every check below section 2 reads a `value:` or a `channel:`,
//      which is where a storage key lives, and a storage key is not what goes
//      stale when a publication relaunches. The publication relaunched on
//      2026-09-17 and this guard stayed green through it. Section 2b reads
//      labels.
//
//   npx tsx scripts/check-content-taxonomy.mts
import { readFileSync } from 'node:fs'

const ce = readFileSync('src/lib/contentEngine.ts', 'utf8')
const ct = readFileSync('api/_content.ts', 'utf8')
const ps = readFileSync('src/lib/publicSeries.ts', 'utf8')

let fail = 0
const bad = (m: string) => { console.log('FAIL: ' + m); fail++ }

// ── 1. every adapt value is a real corpus key ──────────────────────────────
// LANE_ADAPTS became `[...FORMAT_ADAPTS, ...CHANNEL_ADAPTS]` in a refactor, and
// this check's old string-split silently stopped parsing anything, so the whole
// adapt-value guard was passing vacuously on main. Parse the source arrays, and
// FAIL LOUD if either disappears again rather than degrading to an empty list.
const blockOf = (name: string) => ce.split(`const ${name}: LaneAdapt[] = [`)[1]?.split('\n]')[0] ?? ''
const formatBlock = blockOf('FORMAT_ADAPTS')
const channelBlock = blockOf('CHANNEL_ADAPTS')
if (!formatBlock) bad('could not parse FORMAT_ADAPTS')
if (!channelBlock) bad('could not parse CHANNEL_ADAPTS')
const adaptBlock = `${formatBlock}\n${channelBlock}`
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
  'builder_economy_ig', 'techonomic', 'mymu',
  'mymu_weekly', 'investigation', 'builder_economy',
]

// `makeyourmindup` WAS on the list above. It is the publication's own name as of
// the 2026-09-17 relaunch, so leaving it there meant the guard was standing
// ready to reject the one name that is now correct. Pinned so it cannot creep
// back in on a merge.
if (RETIRED.includes('makeyourmindup')) {
  bad("'makeyourmindup' is listed as retired; since 2026-09-17 it is the publication's own name")
}
const choiceBlocks = [
  ['FORMAT_ADAPTS', formatBlock],
  ['CHANNEL_ADAPTS', channelBlock],
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

// ── 2b. no retired BRAND NAME is offered as a label ────────────────────────
//
// WHY THIS SECTION EXISTS. The publication relaunched on 2026-09-17 and this
// guard did not notice, because every check above reads a `value:` or a
// `channel:` and a brand name in this repo never lives in either. It lives in a
// `label:`, which nothing here had ever looked at. The guard was green on the
// morning the names it is supposed to police went out of date, and being green
// is how it stayed out of CI and out of mind.
//
// Storage keys are NOT the target. `paid`, `built`, `money_of_ai` and
// `built_with_ai` are CHECK-constraint values in Supabase and a wire contract
// with the Omnichannel Content Factory in n8n cloud, so retiring them is a
// migration plus a coordinated n8n change and not a lint's business. What a
// lint can decide is whether a retired name is being shown to Krish or to a
// reader, and that is what this checks.
//
// The live vocabulary is `venture_formats` in Mindmaker OS, where the two
// retired rows carry `active = false` and `cadence_label = 'retired
// 2026-09-17'`. This list is a copy of that fact, which is exactly the kind of
// copy that drifts, so it carries its date and should be re-read against the
// table whenever it is touched.
const RETIRED_LABELS = [
  'The Money of AI',
  'Built with AI',
  'Mindmaker',        // also catches 'Mindmaker Live'. 'Mindmake' is LIVE and is shorter, so it cannot match.
  'Techonomic',
  'The Builder Economy',
  'lift.the.lid',
  'inspect.the.build',
  'follow.the.money',
  'Newsflash',
]

// DELIBERATELY NOT ENFORCED, pending a ruling from Krish. 'The Artifact',
// 'Follow the Money', 'Money Trace', 'First Version' and 'The Third Why' are
// named as retired publication formats in the 2026-09-19 fleet brief, and all
// five are ALSO live entries in a different vocabulary: the nine story shapes in
// content-engine's api/_formats.ts, whose own header says it records "form, not
// subject". 'Follow the Money' and 'The Artifact' are live there today, and
// 'The Artifact' was itself the 2026-08-29 rename away from a retired name.
// Two vocabularies collide on those five strings and a lint must not pick a
// winner. See docs/DECISIONS/ARC-FORMAT-VOCABULARY-CONFLICT.md.
const CONTESTED = ['The Artifact', 'Follow the Money', 'Money Trace', 'First Version', 'The Third Why']
for (const c of CONTESTED) {
  if (RETIRED_LABELS.includes(c)) {
    bad(`'${c}' is enforced as a retired label while it is still a live story shape; that ruling is Krish's, not this guard's`)
  }
}

// The matcher, proved in both directions before it is trusted on real files. A
// retired-name check that silently matches nothing is worse than no check, and
// 'Mindmake' is a live brand that 'Mindmaker' must not swallow.
const hitsRetired = (label: string) =>
  RETIRED_LABELS.some(r => label.toLowerCase().includes(r.toLowerCase()))
for (const dead of ['The Money of AI', 'Built With AI', 'Mindmaker Live', 'Techonomic']) {
  if (!hitsRetired(dead)) bad(`self-test: '${dead}' is retired and the matcher missed it`)
}
for (const live of ['mind.the.gap', 'split.the.bill', 'makeyourmindup', 'Mindmake', 'Signal & Noise', 'Maven']) {
  if (hitsRetired(live)) bad(`self-test: '${live}' is live and the matcher flagged it as retired`)
}

const labelBlocks = [
  ['VENTURE_FORMATS', ce.split('export const VENTURE_FORMATS')[1]?.split('\n]')[0] ?? ''],
  ['LANES', ce.split('export const LANES')[1]?.split('\n]')[0] ?? ''],
  ['FACTORY_CHANNELS', ce.split('export const FACTORY_CHANNELS')[1]?.split('\n]')[0] ?? ''],
  ['MEDIA_CHANNELS', ce.split('export const MEDIA_CHANNELS')[1]?.split('\n]')[0] ?? ''],
  // Anchored on the colon. Without it this splits on PUBLIC_SERIES_SOURCE_REVISION,
  // ten lines earlier, and the block comes back with no labels in it at all.
  ['PUBLIC_SERIES', ps.split('export const PUBLIC_SERIES:')[1]?.split('\n})')[0] ?? ''],
] as const

for (const [name, block] of labelBlocks) {
  if (!block) { bad(`could not parse ${name}`); continue }
  const labels = [...block.matchAll(/label:\s*'([^']+)'/g)].map(m => m[1])
  // FAIL LOUD on a block that parsed to nothing. A silent zero is how the
  // LANE_ADAPTS check above came to pass vacuously on main for weeks, and the
  // PUBLIC_SERIES entry in this very list did it again on the first draft of
  // this section: the prefix matched PUBLIC_SERIES_SOURCE_REVISION and the
  // check reported clean over two retired labels.
  if (!labels.length) { bad(`${name} parsed to zero labels; the check is not looking at anything`); continue }
  for (const label of labels) {
    const dead = RETIRED_LABELS.find(r => label.toLowerCase().includes(r.toLowerCase()))
    if (dead) bad(`${name} offers the retired name '${label}' as a label (retired 2026-09-17)`)
  }
}

// ── 3. Publication is a venture, never an adapt target ──────────────────
if (/value:\s*'publication'/.test(adaptBlock)) {
  bad("'publication' is offered as an adapt target; it is a venture with two formats, not one register")
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
  if (c === 'publication') bad('FACTORY_FANOUT offers the Publication venture as one destination; it has two formats')
  if (RETIRED.includes(c)) bad(`FACTORY_FANOUT still offers the retired '${c}'`)
}

// ── 5. format patterns must be ANCHORED (trap 3 above) ─────────────────────
// Checked structurally rather than by eyeballing: a format key whose pattern
// can match mid-heading is the exact bug that has recurred.
for (const key of ['money_of_ai', 'built_with_ai', 'paid', 'built']) {
  const m = new RegExp(`^ {2}${key}:\\s*(/.*/)[a-z]*,`, 'm').exec(ct)
  if (!m) { bad(`no CHANNEL_HEADING pattern found for the '${key}' format`); continue }
  const src = m[1]
  if (!src.startsWith('/^')) bad(`CHANNEL_HEADING.${key} is not anchored to the start of the heading: ${src}`)
  if (src.includes('|')) bad(`CHANNEL_HEADING.${key} has an alternation that can match mid-heading: ${src}`)
}

// ── 6. the two format patterns must not both match one heading ─────────────
// Simulates the real matcher against the headings the live corpus carries.
const HEADINGS = [
  '0. Publication house register (applies to EVERY channel of the publication)',
  '1. The Money of AI (the investigation)',
  '2. Built with AI (builder conversations)',
  '3. Signal & Noise (distribution channel, co-hosted with Rio Longacre and Brett House)',
  '4. Maven (free lessons only)',
  'How a piece gets built (the pipeline, per channel)',
  'The Five Standards (every channel, no exceptions)',
  'Channel Router (which instrument is this?)',
]
// CANON 2026-08-28: the publication runs exactly two channels. 'paid' and
// 'built' remain as LEGACY aliases resolving to the same two playbooks, so they
// are deliberately not live keys and are exempt from the disjointness check.
const LIVE_KEYS = ['money_of_ai', 'built_with_ai', 'publication', 'signal_noise', 'maven'] as const
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
