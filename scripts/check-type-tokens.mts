// Guards the role type scale against re-fragmenting.
//
// On 2026-08-21 every bracket-literal text size in src/ (2,154 of them, 28
// distinct px values against a 9-token scale) was swept onto the role tokens
// (text-micro … text-hero, tailwind.config.js), and every small-caps tracking
// value was normalized to the <Eyebrow> recipe's 0.14em. That sweep only stays
// done if nothing new sneaks in: one text-[13px] is invisible in review and
// two years of them is how the app came to read as several design systems.
//
// So the invariant is mechanical: src/ contains no bracket-literal px text
// size, and no uppercase label carries a tracking other than 0.14em. New
// sizes belong in the fontSize scale, not inline.
//
//   npx tsx scripts/check-type-tokens.mts
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

let fail = 0
const bad = (m: string) => { console.log('FAIL: ' + m); fail++ }

function walk(dir: string, out: string[] = []): string[] {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e)
    if (statSync(p).isDirectory()) walk(p, out)
    else if (/\.tsx?$/.test(e)) out.push(p.replace(/\\/g, '/'))
  }
  return out
}

const SIZE = /text-\[\d+(?:\.\d+)?px\]/g
const TRACK = /tracking-\[(0\.\d+)em\]/g

let sizeHits = 0
let trackHits = 0

for (const file of walk('src')) {
  const text = readFileSync(file, 'utf8')
  const lines = text.split('\n')
  lines.forEach((line, i) => {
    for (const m of line.matchAll(SIZE)) {
      bad(`${file}:${i + 1} bracket text size ${m[0]} — use a role token (text-micro…text-hero)`)
      sizeHits++
    }
    if (line.includes('uppercase')) {
      for (const m of line.matchAll(TRACK)) {
        if (m[1] !== '0.14') {
          bad(`${file}:${i + 1} uppercase label tracks ${m[0]} — the eyebrow recipe is tracking-[0.14em] (use <Eyebrow>)`)
          trackHits++
        }
      }
    }
  })
}

if (fail) {
  console.log(`${fail} FAILURE(S)`)
  process.exit(1)
}
console.log('PASS  no bracket text sizes, uppercase tracking uniform at 0.14em')
