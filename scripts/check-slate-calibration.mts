// Guards the ranked slate: the forty rulings, the format record derived from
// them, and the one rule that makes the whole thing safe to keep.
//
// Four things here would each be invisible in production and each is the kind
// of edit that looks like an improvement at the time:
//
//   the anti-echo rule    Wiring seventeen approvals into scoreArc() turns the
//                         proposer into a mirror, and the mirror still returns
//                         seven cards a week so nothing looks broken. This is
//                         the single most important assertion in the file.
//   folder coverage       Every item Krish approved lands in one of the eleven
//                         folders today. Edit the folders and that can quietly
//                         stop being true, which means the memory no longer
//                         has a home for the work he actually wants.
//   the code/data split   FORMAT_SPEC restates counts that live in the seed
//                         migration. Two copies drift; drifting silently is
//                         worse than not having the second copy at all.
//   no quiet deletions    Deleting The Lag because it converted at zero would
//                         erase the finding and leave nothing behind saying
//                         why the format is gone.
//
//   npx tsx scripts/check-slate-calibration.mts
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { FORMATS, FORMAT_SPEC, SLATE_CHANNEL_RECORD, slateJudged, slateConversion,
  type Format } from '../api/_formats.ts'

let fail = 0
const bad = (m: string) => { console.log('FAIL: ' + m); fail++ }

const MIGRATIONS = 'scripts/migrations'
const read = (f: string) => readFileSync(join(MIGRATIONS, f), 'utf8')
const allMigrations = readdirSync(MIGRATIONS).filter(f => f.endsWith('.sql'))

const find = (needle: RegExp) => {
  const f = allMigrations.find(x => needle.test(read(x)))
  return f ? read(f) : null
}

// ── parse the seeded rulings ────────────────────────────────────────────────
// The migration is the source of truth: it is what was applied to Postgres.
const rulingSql = find(/create table if not exists public\.content_slate_rulings/)
if (!rulingSql) {
  bad('no migration creates content_slate_rulings, so the forty verdicts exist nowhere in the repo')
  console.log('1 FAILURE(S)')
  process.exit(1)
}

/** Split one VALUES tuple into its quoted fields, honouring SQL's doubled
 *  apostrophe. A naive split on "','" loses every row containing "Nobody''s". */
function fields(tuple: string): string[] {
  const out: string[] = []
  let i = 0
  while (i < tuple.length) {
    if (tuple[i] !== "'") { i++; continue }
    i++
    let s = ''
    while (i < tuple.length) {
      if (tuple[i] === "'" && tuple[i + 1] === "'") { s += "'"; i += 2; continue }
      if (tuple[i] === "'") { i++; break }
      s += tuple[i++]
    }
    out.push(s)
  }
  return out
}

type Ruling = {
  id: string; arc: string; channel: string; format: string; outlet: string
  purpose: string; headline: string; thesis: string; tier: string; verdict: string
}

const rulings: Ruling[] = []
for (const line of rulingSql.split('\n')) {
  const t = line.trim()
  if (!/^\('[MB]\d\d',/.test(t)) continue
  const f = fields(t)
  if (f.length !== 10) { bad(`ruling row has ${f.length} fields, expected 10: ${t.slice(0, 40)}`); continue }
  rulings.push({ id: f[0], arc: f[1], channel: f[2], format: f[3], outlet: f[4],
    purpose: f[5], headline: f[6], thesis: f[7], tier: f[8], verdict: f[9] })
}

// 1. The slate is all forty, and the verdict split is the one Krish returned.
{
  if (rulings.length !== 40) bad(`${rulings.length} rulings seeded, expected 40`)
  const count = (v: string) => rulings.filter(r => r.verdict === v).length
  const expected: Array<[string, number]> = [['lead', 1], ['yes', 16], ['maybe', 15], ['no', 8]]
  for (const [v, n] of expected) {
    if (count(v) !== n) bad(`${count(v)} items ruled "${v}", Krish returned ${n}`)
  }
  const ids = new Set(rulings.map(r => r.id))
  if (ids.size !== rulings.length) bad('duplicate item ids in the seed')
  if (!ids.has('M11')) bad('M11 is missing, and it is the only Lead in the slate')
  else if (rulings.find(r => r.id === 'M11')!.verdict !== 'lead') {
    bad('M11 is no longer the Lead. It was the single strongest item Krish named')
  }
  console.log(`  ${rulings.length} rulings, ${count('lead')} lead / ${count('yes')} yes / ${count('maybe')} maybe / ${count('no')} no`)
}

const strong = rulings.filter(r => r.verdict === 'lead' || r.verdict === 'yes')

// 2. THE central assertion: the verdicts must not reach the scorer.
//
//    Not a style rule. The brief's anti-echo reservation exists because a
//    proposer that ranks by what Krish already approved stops being able to
//    show him anything he was not already thinking about, which is the entire
//    reason the proposer exists.
{
  const scorer = readFileSync('api/_arcScore.ts', 'utf8')
  if (/_formats|FORMAT_SPEC|slateConversion|SLATE_CHANNEL_RECORD/.test(scorer)) {
    bad('api/_arcScore.ts reads the slate record. Verdicts must never boost a rank: seventeen approvals are a stated interest, and the anti-echo rule exists precisely for this')
  }
  if (/content_slate_rulings|\bverdict\b/.test(scorer)) {
    bad('api/_arcScore.ts references the slate rulings. The set is for measuring the scorer, never for feeding it')
  }
  // And the table itself must not have quietly become an input to surfacing.
  for (const f of ['src/hooks/useContentV2.ts', 'api/shifts/detect.ts']) {
    if (/content_slate_rulings/.test(readFileSync(f, 'utf8'))) {
      bad(`${f} reads content_slate_rulings. It is a record to be measured against, not a queue input`)
    }
  }
}

// 3. Folder coverage: everything Krish approved has somewhere to accumulate.
{
  const themeSql = find(/create table if not exists public\.content_themes/)
  if (!themeSql) bad('no migration creates content_themes')
  else {
    const seeded = new Set([...themeSql.matchAll(/'\{([^}]*)\}'/g)]
      .flatMap(m => m[1].split(',').map(s => s.trim()).filter(Boolean)))
    const orphaned = strong.filter(r => !seeded.has(r.id))
    if (orphaned.length) {
      bad(`${orphaned.length} approved item(s) belong to no folder (${orphaned.map(r => r.id).join(', ')}). The eleven folders are the memory, so an approved item with no folder has nowhere to compound`)
    } else {
      console.log(`  all ${strong.length} approved items land in a folder`)
    }
    // A folder seeded by nothing at all is a different problem: it means the
    // provenance is fictional rather than thin.
    const slugs = [...themeSql.matchAll(/^\s*\('([a-z0-9-]+)',/gm)].map(m => m[1])
    const known = new Set(rulings.map(r => r.id))
    for (const stray of [...seeded].filter(id => !known.has(id))) {
      bad(`folder seed "${stray}" matches no item in the slate, so a folder claims provenance that does not exist`)
    }
    if (slugs.length !== 11) bad(`${slugs.length} folders, expected 11`)
  }
}

// 4. The format record in code matches the seeded data exactly.
{
  const bySeed = new Map<string, { lead: number; yes: number; maybe: number; no: number }>()
  for (const r of rulings) {
    const b = bySeed.get(r.format) ?? { lead: 0, yes: 0, maybe: 0, no: 0 }
    b[r.verdict as 'lead' | 'yes' | 'maybe' | 'no']++
    bySeed.set(r.format, b)
  }

  for (const f of bySeed.keys()) {
    if (!(FORMATS as readonly string[]).includes(f)) {
      bad(`format "${f}" is used by the slate but missing from api/_formats.ts`)
    }
  }
  for (const f of FORMATS) {
    const seen = bySeed.get(f)
    if (!seen) { bad(`FORMAT_SPEC declares "${f}", which no slate item uses`); continue }
    const spec = FORMAT_SPEC[f].slate
    for (const k of ['lead', 'yes', 'maybe', 'no'] as const) {
      if (spec[k] !== seen[k]) {
        bad(`FORMAT_SPEC["${f}"].slate.${k} is ${spec[k]}, the seed says ${seen[k]}`)
      }
    }
    const outlets = new Set(rulings.filter(r => r.format === f).map(r => r.outlet))
    if (outlets.size === 1 && !outlets.has(FORMAT_SPEC[f].outlet)) {
      bad(`FORMAT_SPEC["${f}"].outlet is ${FORMAT_SPEC[f].outlet}, the slate ran it to ${[...outlets][0]}`)
    }
    if (!FORMAT_SPEC[f].covers?.trim()) bad(`format "${f}" has no "covers" text`)
  }
}

// 5. One Number stays arc-only, and nothing is deleted for converting badly.
{
  if (!FORMAT_SPEC['One Number'].arcOnly) {
    bad('One Number is no longer arcOnly. M10 and M13 were approved as beats of a running arc while M04 and M07 were rejected standing alone, which is the arc rule in Krish\'s own judgement')
  }
  for (const f of FORMATS) {
    const c = slateConversion(f)
    const n = slateJudged(FORMAT_SPEC[f].slate)
    if (c === 0 && n >= 4 && !FORMAT_SPEC[f].underReview) {
      bad(`"${f}" converted at zero across ${n} judged items and is not marked underReview`)
    }
    if (c !== null && c > 0 && FORMAT_SPEC[f].underReview) {
      bad(`"${f}" is marked underReview but Krish approved ${Math.round(c * 100)}% of it`)
    }
  }
  if (!(FORMATS as readonly string[]).includes('The Lag')) {
    bad('The Lag has been deleted. It converted at zero across four items, which is a finding to keep, not a format to remove: four items is not a verdict and deleting it erases the reason')
  }
}

// 6. The channel record matches the seed, because it is the one number most
//    likely to be quoted back later as a reason to change the content plan.
{
  for (const ch of ['built', 'paid'] as const) {
    const generated = rulings.filter(r => r.channel === ch).length
    const approved = strong.filter(r => r.channel === ch).length
    const rec = SLATE_CHANNEL_RECORD[ch]
    if (rec.generated !== generated) bad(`SLATE_CHANNEL_RECORD.${ch}.generated is ${rec.generated}, the seed has ${generated}`)
    if (rec.approved !== approved) bad(`SLATE_CHANNEL_RECORD.${ch}.approved is ${rec.approved}, the seed has ${approved}`)
  }
}

// 7. The set must never be described as a recall test, in the migration or in
//    the code. This is a claim about what has been proven, and getting it wrong
//    means believing the engine was measured when it was not.
{
  const claims = [rulingSql, readFileSync('api/_formats.ts', 'utf8')].join('\n')
  if (!/NOT (the golden ten|a recall test)/i.test(claims)) {
    bad('nothing states that the slate is not the golden ten. Every item was generated before it was judged, so agreement with it measures precision and says nothing about what the engine never surfaced')
  }
}

console.log(fail === 0
  ? 'PASS  forty verdicts intact, every approval has a folder, the format record matches the seed, and the scorer cannot see any of it'
  : `${fail} FAILURE(S)`)
process.exit(fail ? 1 : 0)
