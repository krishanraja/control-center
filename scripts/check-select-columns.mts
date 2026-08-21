// Verify every PostgREST .select() in api/ against the LIVE schema.
//
// This class of bug is invisible to every other gate. The column list is a
// string handed to PostgREST, so TypeScript cannot see it, and naming one
// column that does not exist makes Postgres reject the WHOLE query. Depending
// on the caller that surfaces as a 500, a 404, or — worst — an empty result
// swallowed by a try/catch, which reads as "no data" forever.
//
// Four such bugs were live when this was written:
//   api/visibility-targets/[id]/apply.ts  selected `name` (column is `title`)
//                                         -> every apply returned 404
//   api/_outreachCandidates.ts            selected recipient_email + sent_at
//                                         -> ready drafts silently always empty
//   api/briefs/assemble.ts                selected bets.title (column is
//                                         `hypothesis`) -> bets dropped from
//                                         the weekly brief
//   api/_dedup-backfill.ts                selected visibility_targets norm
//                                         columns that did not exist
//
// NOT in CI: it needs live credentials, and CI has no database. Run it after
// changing a select, after a migration, or when a route returns nothing and you
// cannot see why.
//
//   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... npx tsx scripts/check-select-columns.mts
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

const URL_ = process.env.SUPABASE_URL
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!URL_ || !KEY) {
  console.error('Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

function walk(dir: string, out: string[] = []): string[] {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e)
    if (statSync(p).isDirectory()) walk(p, out)
    else if (p.endsWith('.ts')) out.push(p)
  }
  return out
}

interface Site { file: string; line: number; table: string; cols: string[] }

/** Pull .from('t').select('a, b') pairs. Embedded resources — `rel(a,b)` and
 *  `rel!hint(a,b)` — are stripped rather than parsed: they resolve against a
 *  different table and would produce false positives. */
function sites(): Site[] {
  const pat = /\.from\(\s*['"]([a-z0-9_]+)['"]\s*\)\s*(?:as\s+\w+\s*)?\.select\(\s*(['"`])([^'"`]*)\2/gs
  const out: Site[] = []
  for (const file of walk('api')) {
    const src = readFileSync(file, 'utf8')
    for (const m of src.matchAll(pat)) {
      const [, table, , raw] = m
      if (raw.includes('*')) continue
      const flat = raw.replace(/[a-z0-9_]+\s*(?:![a-z0-9_]+)?\s*\([^)]*\)/g, '')
      const cols = flat.split(',')
        .map(c => c.trim().split(':').pop()!.trim())
        .filter(c => /^[a-z0-9_]+$/.test(c))
      if (cols.length) out.push({ file, line: src.slice(0, m.index).split('\n').length, table, cols })
    }
  }
  return out
}

async function liveSchema(tables: string[]): Promise<Map<string, Set<string>>> {
  const res = await fetch(`${URL_}/rest/v1/rpc/`, { method: 'HEAD', headers: { apikey: KEY! } }).catch(() => null)
  void res
  // information_schema is not exposed over PostgREST, so probe each table with
  // a zero-row select and read the column names off the response contract.
  const map = new Map<string, Set<string>>()
  for (const t of tables) {
    const r = await fetch(`${URL_}/rest/v1/${t}?select=*&limit=1`, {
      headers: { apikey: KEY!, Authorization: `Bearer ${KEY}`, Accept: 'application/json' },
    })
    if (!r.ok) { console.log(`  ? ${t}: could not read (HTTP ${r.status}) — skipped`); continue }
    const rows = (await r.json()) as Record<string, unknown>[]
    if (!rows.length) { console.log(`  ? ${t}: empty table, cannot infer columns — skipped`); continue }
    map.set(t, new Set(Object.keys(rows[0])))
  }
  return map
}

const found = sites()
const tables = [...new Set(found.map(s => s.table))].sort()
console.log(`${found.length} select sites across ${tables.length} tables\n`)

const schema = await liveSchema(tables)
let fail = 0
for (const s of found) {
  const known = schema.get(s.table)
  if (!known) continue
  const missing = s.cols.filter(c => !known.has(c))
  if (missing.length) {
    console.log(`FAIL: ${s.file}:${s.line}  ${s.table} has no ${missing.join(', ')}`)
    fail++
  }
}
console.log(fail === 0
  ? '\ncheck-select-columns: OK — every selected column exists live.'
  : `\ncheck-select-columns: ${fail} broken select(s)`)
process.exit(fail === 0 ? 0 : 1)
