// The design-entropy ratchet.
//
// Every guard in this directory holds one invariant that already shipped
// broken once: the type scale, the icon stroke, the ink hierarchy, the theme
// contrast. Those are fenced. This script fences what was measured on
// 2026-10-09 and found growing with no fence at all (docs/design/corpus/
// 01-entropy.md, the ledger): about 40 distinct motion durations against ten
// tokens, one off-token easing written two ways, 33 `transition-all`, ten
// distinct z-index literals against five documented layers, 29 distinct
// `min-h-[…]` values, a second generation of opacity soup on `bg-white/[…]`
// and `border-white/[…]`, hardcoded colour in tsx, and inline `style={{`.
//
// It is a ratchet, not a ban. Each row in `scripts/design-entropy.baseline.json`
// is the count measured when the row was fenced. A count ABOVE its baseline
// fails the build and names the files. A count BELOW it passes and prints the
// line to lower the baseline to, so the number only ever goes down, by hand,
// after a sweep. Nothing else may move it.
//
//   npx tsx scripts/check-design-entropy.mts            fail above baseline
//   npx tsx scripts/check-design-entropy.mts --report   print the ledger, exit 0
//
// A row is counted as DISTINCT VALUES where the entropy is vocabulary (how
// many durations, how many z layers) and as OCCURRENCES where the entropy is
// a practice (transition-all, inline style, a hardcoded colour).
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

const BASELINE_PATH = 'scripts/design-entropy.baseline.json'
const REPORT = process.argv.includes('--report')

type Row = {
  key: string
  what: string
  mode: 'distinct' | 'occurrences'
  values: Map<string, string[]> // value -> locations
}

function walk(dir: string, out: string[] = []): string[] {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e)
    if (statSync(p).isDirectory()) walk(p, out)
    else if (/\.(tsx?|mts|css)$/.test(e)) out.push(p.replace(/\\/g, '/'))
  }
  return out
}

const row = (key: string, what: string, mode: Row['mode']): Row => ({ key, what, mode, values: new Map() })
const rows: Record<string, Row> = {
  durations: row('durations', 'distinct motion durations outside the --dur-* tokens', 'distinct'),
  easings: row('easings', 'distinct easings outside --ease-calm / --ease-out-soft / --ease-spring', 'distinct'),
  transition_all: row('transition_all', 'transition-all (animates every property; name the property instead)', 'occurrences'),
  z_values: row('z_values', 'distinct z-[…] literals (the stack has five documented layers)', 'distinct'),
  min_h_values: row('min_h_values', 'distinct min-h-[…] literals (phantom heights)', 'distinct'),
  bg_white_values: row('bg_white_values', 'distinct bg-white/[…] opacities', 'distinct'),
  border_white_values: row('border_white_values', 'distinct border-white/[…] opacities', 'distinct'),
  hardcoded_colour: row('hardcoded_colour', 'hex or rgb() colour literals in tsx (use a token)', 'occurrences'),
  inline_style: row('inline_style', 'style={{ in tsx (use a class or a token)', 'occurrences'),
}

// Files whose colour literals are the brand or a drawing, not a theme choice.
// Each entry carries its reason so the next reader does not widen it blind.
const COLOUR_ALLOW: Record<string, string> = {
  'src/components/shared/tokens.ts': 'the pod and status colour maps; the one place a fixed hue is defined',
  'src/components/growth/viz.tsx': 'instruments drawn in the accent channels; the ring sets its own stroke',
  'src/components/shared/MindmakeIdentity.tsx': 'the hash-pinned mark; identity is not a theme choice',
  'src/components/shared/AgentAvatar.tsx': 'an identity mark, bespoke by design (docs/DESIGN_SYSTEM.md, Iconography)',
  'src/components/shared/Sparkline.tsx': 'a hand-drawn sparkline, bespoke by design',
  'src/components/shared/AllClear.tsx': 'the drawn check mark, bespoke by design',
  'src/components/video-studio/VideoBrandLockup.tsx': 'a video frame carries no theme; the lockup is fixed on purpose',
  'src/lib/pilotColor.ts': 'the pilot colour wheel; a palette, defined once',
}

// The three easing tokens, spaces stripped, so a repeat of a token value in a
// keyframe does not count as a new easing. Anything else is off the family.
const EASE_TOKENS = new Set(['0.32,0.72,0,1', '0.22,1,0.36,1', '0.34,1.56,0.64,1'])

const isComment = (line: string) => {
  const t = line.trim()
  return t.startsWith('//') || t.startsWith('*') || t.startsWith('/*')
}

const add = (r: Row, value: string, where: string) => {
  const list = r.values.get(value) ?? []
  list.push(where)
  r.values.set(value, list)
}

// Time literals: `280ms`, `0.3s`, `duration-200`, inside `animate-[… 260ms …]`.
const TIME = /\b(\d*\.?\d+)(ms|s)\b/g
const TW_DURATION = /\bduration-(\d+)\b/g
const CUBIC = /cubic-bezier\(([^)]*)\)/g
const Z = /\bz-\[(\d+)\]/g
const MIN_H = /\bmin-h-\[([^\]]+)\]/g
const BG_WHITE = /\bbg-white\/\[([^\]]+)\]/g
const BORDER_WHITE = /\bborder-white\/\[([^\]]+)\]/g
// A colour literal. `#fff` inside `text-[#fff]` is the sanctioned spelling for
// white on a coloured fill (docs/DESIGN_SYSTEM.md, the keystone convention)
// and is excluded; `rgb(var(--…))` is a token read, not a literal.
// A three-digit hex counts only where a colour can sit (after a bracket, a
// quote or a paren): "PR #389" in a label is a pull request, not a colour.
const HEX = /(?:#(?:[0-9a-fA-F]{6}|[0-9a-fA-F]{8})\b|(?<=[\['"(`])#[0-9a-fA-F]{3}\b)/g
const RGB = /\brgba?\((?!\s*var\()/g
const INLINE_STYLE = /style=\{\{/g

const normaliseTime = (n: string, unit: string) => {
  const ms = unit === 's' ? Math.round(parseFloat(n) * 1000) : Math.round(parseFloat(n))
  return `${ms}ms`
}

for (const file of walk('src')) {
  const text = readFileSync(file, 'utf8')
  const isCss = file.endsWith('.css')
  const isTsx = file.endsWith('.tsx')
  text.split('\n').forEach((line, i) => {
    if (isComment(line)) return
    const where = `${file}:${i + 1}`
    const t = line.trim()

    // Durations. The token declarations are the scale, not entropy; a
    // `var(--dur-x)` use is on the scale. The reduced-motion kill block's
    // near-zero values are the mechanism that switches motion off. In ts and
    // tsx a time literal counts only on a line that animates something:
    // "refresh in ~30s" is copy and a 30-second video hook is a format.
    const motionLine = isCss || /\b(transition|animation|animate-\[)/.test(line)
    if (!/^--/.test(t) && motionLine) {
      for (const m of line.matchAll(TIME)) {
        const v = normaliseTime(m[1], m[2])
        if (v === '0ms' || v === '1ms') continue
        add(rows.durations, v, where)
      }
    }
    for (const m of line.matchAll(TW_DURATION)) add(rows.durations, `${m[1]}ms`, where)
    // Easings.
    if (!/^--ease-[a-z-]+:/.test(t)) {
      for (const m of line.matchAll(CUBIC)) {
        const v = m[1].replace(/\s+/g, '')
        if (!EASE_TOKENS.has(v)) add(rows.easings, `cubic-bezier(${v})`, where)
      }
    }
    if (!isCss) {
      for (const _ of line.matchAll(/\btransition-all\b/g)) add(rows.transition_all, where, where)
      for (const m of line.matchAll(Z)) add(rows.z_values, `z-[${m[1]}]`, where)
      for (const m of line.matchAll(MIN_H)) add(rows.min_h_values, `min-h-[${m[1]}]`, where)
      for (const m of line.matchAll(BG_WHITE)) add(rows.bg_white_values, `bg-white/[${m[1]}]`, where)
      for (const m of line.matchAll(BORDER_WHITE)) add(rows.border_white_values, `border-white/[${m[1]}]`, where)
    }
    if (isTsx && !(file in COLOUR_ALLOW)) {
      const scrubbed = line.replace(/text-\[#fff\]/g, '')
      for (const m of scrubbed.matchAll(HEX)) add(rows.hardcoded_colour, `${where} ${m[0]}`, where)
      for (const _ of scrubbed.matchAll(RGB)) add(rows.hardcoded_colour, `${where} rgb(`, where)
    }
    if (isTsx) {
      for (const _ of line.matchAll(INLINE_STYLE)) add(rows.inline_style, where, where)
    }
  })
}

const count = (r: Row) =>
  r.mode === 'distinct' ? r.values.size : [...r.values.values()].reduce((n, l) => n + l.length, 0)

type Baseline = { measured: string; rows: Record<string, number> }
const baseline: Baseline = JSON.parse(readFileSync(BASELINE_PATH, 'utf8'))

let fail = 0
const lower: string[] = []
const table: string[] = []

for (const r of Object.values(rows)) {
  const n = count(r)
  const b = baseline.rows[r.key]
  if (b === undefined) {
    console.log(`FAIL: ${BASELINE_PATH} has no row for ${r.key}; add it at ${n}`)
    fail++
    continue
  }
  const mark = n > b ? 'OVER' : n < b ? 'under' : 'at'
  table.push(`${r.key.padEnd(20)} ${String(n).padStart(4)} / ${String(b).padStart(4)}  ${mark.padEnd(5)}  ${r.what}`)
  if (n > b && !REPORT) {
    fail++
    console.log(`FAIL: ${r.key} is ${n}, baseline ${b} (${r.what})`)
    // Name what grew. For a distinct row that is the values; for an
    // occurrence row, the locations. Eight is enough to find it.
    const sample = r.mode === 'distinct'
      ? [...r.values.entries()].map(([v, l]) => `${v}  (${l.length}, first ${l[0]})`)
      : [...r.values.values()].flat()
    for (const s of sample.slice(0, 8)) console.log(`      ${s}`)
    if (sample.length > 8) console.log(`      … and ${sample.length - 8} more`)
  }
  if (n < b) lower.push(`ratchet: lower the baseline for ${r.key} to ${n} (was ${b})`)
}

console.log(`design entropy ledger (baseline measured ${baseline.measured})`)
console.log(`${'row'.padEnd(20)} ${'now'.padStart(4)} / ${'base'.padStart(4)}`)
for (const l of table) console.log(l)
for (const l of lower) console.log(l)

if (REPORT) process.exit(0)
if (fail) {
  console.log(`${fail} FAILURE(S): design entropy grew. Use the token or primitive the row names, or sweep and lower the baseline on purpose (docs/design/corpus/01-entropy.md).`)
  process.exit(1)
}
console.log('PASS  no entropy row is above its baseline')
