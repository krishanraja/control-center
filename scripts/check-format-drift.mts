/**
 * Does src/lib/formats.generated.json still agree with the live table?
 *
 * The snapshot exists because format lists are build-time constants and a module
 * that cannot boot without the network cannot be tested. The cost of a snapshot
 * is that it becomes a copy, and a copy drifts: that is exactly how four
 * hardcoded lists came to offer names retired three days earlier. This closes
 * that cost. It reads public.venture_formats and public.format_aliases and
 * fails naming the slug that differs, never asserting a count.
 *
 * Needs SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY. Without them it says NOT
 * CHECKED rather than passing, because a guard that quietly skips is worse than
 * no guard: it reports green for a thing it never looked at.
 *
 *   npx tsx scripts/check-format-drift.mts
 */
import { readFileSync } from 'node:fs'

const snap = JSON.parse(readFileSync('src/lib/formats.generated.json', 'utf8'))
const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || ''
const key = process.env.SUPABASE_SERVICE_ROLE_KEY || ''

if (!url || !key) {
  console.log(
    'NOT CHECKED  SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are needed to read the live table.\n' +
    `             The snapshot says it was read at ${snap.read_at}. That is a claim, not a check.`,
  )
  process.exit(0)
}

const get = async (table: string, cols: string) => {
  const r = await fetch(`${url}/rest/v1/${table}?select=${cols}`, {
    headers: { apikey: key, authorization: `Bearer ${key}` },
  })
  if (!r.ok) throw new Error(`${table} read failed: ${r.status}`)
  return await r.json() as Record<string, unknown>[]
}

let fail = 0
const bad = (m: string) => { console.log(`FAIL: ${m}`); fail++ }

const COLS = ['slug', 'label', 'cadence_label', 'target_per_week', 'hero', 'gear', 'sort_order', 'kind']
const live = await get('venture_formats', COLS.join(','))
const liveAliases = await get('format_aliases', 'alias,slug,retired_on')

const bySlugLive = new Map(live.map(r => [String(r.slug), r]))
const bySlugSnap = new Map((snap.formats as Record<string, unknown>[]).map(r => [String(r.slug), r]))

for (const [slug, l] of bySlugLive) {
  const s = bySlugSnap.get(slug)
  if (!s) { bad(`venture_formats has '${slug}' and the snapshot does not. Run scripts/sync-formats.mts.`); continue }
  for (const c of COLS) {
    const a = l[c] ?? null, b = s[c] ?? null
    if (String(a) !== String(b)) bad(`'${slug}'.${c} is ${JSON.stringify(a)} live and ${JSON.stringify(b)} in the snapshot`)
  }
}
for (const slug of bySlugSnap.keys()) {
  if (!bySlugLive.has(slug)) bad(`the snapshot has '${slug}' and venture_formats does not; it was deleted or renamed live`)
}

const aliasLive = new Map(liveAliases.map(r => [String(r.alias), String(r.slug)]))
const aliasSnap = new Map((snap.aliases as Record<string, unknown>[]).map(r => [String(r.alias), String(r.slug)]))
for (const [a, s] of aliasLive) {
  if (!aliasSnap.has(a)) bad(`format_aliases has '${a}' -> '${s}' and the snapshot does not; a historical row would stop resolving`)
  else if (aliasSnap.get(a) !== s) bad(`alias '${a}' resolves to '${s}' live and '${aliasSnap.get(a)}' in the snapshot`)
}
for (const a of aliasSnap.keys()) {
  if (!aliasLive.has(a)) bad(`the snapshot has alias '${a}' and format_aliases does not`)
}

console.log(fail === 0
  ? `PASS  ${bySlugLive.size} formats and ${aliasLive.size} aliases match the live table`
  : `${fail} FAILURE(S)  Run scripts/sync-formats.mts to regenerate the snapshot, then read the diff before committing it.`)
process.exit(fail ? 1 : 0)
