// Guards content_ideas against filling up with rows that can never be purged.
//
// The Content tab was ~85% permanent backlog: 274 of 323 rows had
// expires_at = NULL. api/purge/run.ts only deletes rows where expires_at is
// NOT NULL and in the past, so a row written without one lives forever, and
// "this week" quietly became "everything since May".
//
// ELEVEN code paths insert into content_ideas. Requiring each of them to
// remember an expiry is a rule the twelfth will break, so the invariant lives
// in Postgres instead: expires_at carries a DEFAULT of the purge boundary. An
// explicit null still overrides it, which is what makes the evergreen path work.
//
// This guard therefore checks the three things that keep that true:
//   1. the migration declaring the default is still present
//   2. only the evergreen writer may write an explicit null
//   3. the purge still refuses to delete null-expiry rows
//
//   npx tsx scripts/check-content-expiry.mts
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

let fail = 0
const bad = (m: string) => { console.log('FAIL: ' + m); fail++ }

// Paths are normalised to forward slashes. join() emits '\' on Windows, so the
// EVERGREEN_WRITER comparison below never matched there and the check failed
// locally while passing in Linux CI. Local runs are how a bad push gets caught
// before it reaches CI, so the check has to be honest on both.
function walk(dir: string, out: string[] = []): string[] {
  for (const e of readdirSync(dir)) {
    if (e === 'node_modules' || e.startsWith('.')) continue
    const p = join(dir, e).replace(/\\/g, '/')
    if (statSync(p).isDirectory()) walk(p, out)
    else if (p.endsWith('.ts') || p.endsWith('.tsx')) out.push(p)
  }
  return out
}

// The one place allowed to write an evergreen row with a null expiry.
const EVERGREEN_WRITER = 'api/content-decisions/[id].ts'

// 1. The default must still be declared in a migration. Without it every one of
//    the eleven insert paths silently goes back to writing NULL.
{
  const migs = readdirSync('supabase/migrations').filter(f => f.endsWith('.sql'))
  const declares = migs.some(f => {
    const s = readFileSync(join('supabase/migrations', f), 'utf8')
    return /alter\s+column\s+expires_at[\s\S]{0,120}set\s+default/i.test(s)
  })
  if (!declares) {
    bad('no migration declares a DEFAULT on content_ideas.expires_at — the eleven insert paths will write NULL again')
  }
}

// 2. Null is reserved for evergreen.
for (const f of walk('api').concat(walk('src'))) {
  const src = readFileSync(f, 'utf8')
  if (!src.includes('content_ideas') && !src.includes('expires_at')) continue
  if (f !== EVERGREEN_WRITER && /expires_at:\s*null/.test(src)) {
    bad(`${f} writes expires_at: null. Only ${EVERGREEN_WRITER} may do that, and only for evergreen rows.`)
  }
}

// 3. The purge must keep excluding null, or the reserved meaning of NULL
//    silently flips from "keep forever" to "delete me".
{
  const purge = readFileSync('api/purge/run.ts', 'utf8')
  if (!/\.not\(\s*['"]expires_at['"]\s*,\s*['"]is['"]\s*,\s*null\s*\)/.test(purge)) {
    bad('api/purge/run.ts no longer excludes null expires_at, so evergreen rows are now deletable')
  }
}

console.log(fail === 0
  ? 'PASS  expiry default declared, null reserved for evergreen, purge still excludes it'
  : `${fail} FAILURE(S)`)
process.exit(fail ? 1 : 0)
