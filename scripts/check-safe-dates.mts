/**
 * No surface may format a timestamp it has not proved is a timestamp.
 *
 * `formatDistanceToNow(new Date(x))` throws `RangeError: Invalid time value`
 * when x is null, undefined or unparseable. In a React render that is not a
 * blank label, it is an unmounted tab: the error boundary eats the whole
 * surface and the reader sees "Customers failed to render / Invalid time
 * value" where the board should be.
 *
 * Measured 2026-09-23 across the whole-app layout audit: 17 unguarded call
 * sites in 10 files, two of which took their tab down against ordinary data
 * with a single nullable column unset. `relativeTime()` /
 * `relativeTimeOr()` in `src/lib/ageHelpers.ts` are the one way to render a
 * relative time; they return null instead of throwing.
 *
 * date-fns `format()` throws the same way, so a bare `format(new Date(x))` is
 * flagged too. A `new Date(...)` that has been through an explicit
 * `Number.isNaN(d.getTime())` check in the same function is fine — this looks
 * only for the inline form, which cannot have been checked.
 */
import fs from 'node:fs'
import path from 'node:path'

const ROOT = path.join(process.cwd(), 'src')
const ALLOW = new Set([path.join('lib', 'ageHelpers.ts')])

// formatDistanceToNow(new Date(…)) / format(new Date(…)) / …(parseISO(…)),
// including the Intl form `…DateTimeFormat(…).format(new Date(x))`, which
// throws on an invalid date exactly the same way.
const INLINE = /(formatDistanceToNow|formatDistanceToNowStrict|formatDistance|\.?format)\s*\(\s*(new Date\s*\(|parseISO\s*\()/
// `new Date(Date.UTC(y, m, d))` is built from integers the caller already
// parsed, so it cannot be an invalid date and is not what this guard is for.
const FROM_PARTS = /new Date\s*\(\s*Date\.UTC\s*\(/

function walk(dir: string, out: string[] = []): string[] {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name)
    if (e.isDirectory()) walk(p, out)
    else if (/\.tsx?$/.test(e.name)) out.push(p)
  }
  return out
}

const bad: string[] = []
for (const file of walk(ROOT)) {
  const rel = path.relative(ROOT, file)
  if (ALLOW.has(rel)) continue
  const lines = fs.readFileSync(file, 'utf8').split('\n')
  lines.forEach((line, i) => {
    if (INLINE.test(line) && !FROM_PARTS.test(line)) bad.push(`${rel}:${i + 1}  ${line.trim().slice(0, 110)}`)
  })
}

if (bad.length) {
  console.error(
    `\n${bad.length} unguarded date format${bad.length === 1 ? '' : 's'}. ` +
    `These throw on a null or unparseable value and take the whole tab down.\n` +
    `Use relativeTime() / relativeTimeOr() from src/lib/ageHelpers.ts instead.\n`,
  )
  for (const b of bad) console.error(`  ${b}`)
  console.error('')
  process.exit(1)
}

console.log('check-safe-dates: no unguarded date formatting in src/.')
