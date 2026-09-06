// Guards the one rule that keeps this app readable in both themes.
//
// Every colour here is supposed to come from a channel token that flips with
// `data-theme` (tailwind.config.js + the two :root blocks in index.css). A
// colour written as a fixed hex does not flip, and the failure is always the
// same shape: a FIXED value paired with an ADAPTIVE one. It looks deliberate in
// the theme it was picked for and becomes unreadable in the other.
//
// Both halves of that pairing are individually reasonable, which is why review
// keeps missing it. Two shipped:
//
//   1. `command.surface` was a fixed #14131b while the text sitting on it was
//      `text-white/90`, which resolves to the --fg channel. In daylight the
//      surface stayed obsidian and the ink turned black: the Home door pills
//      (Focus / Signals / Intel) and the critical alert banner rendered
//      dark-on-dark. Reported from a phone, 2026-08-30.
//   2. The whole `*-300` accent tier was fixed pastel. Tuned for obsidian
//      (9-11:1), it measures 1.6-2.0:1 on the light paper, and 467 of its 489
//      uses are text.
//
// The rule is NOT "every colour must be a channel". A fixed mid-tone that clears
// a contrast floor on BOTH grounds is fine, and several are deliberate: the
// command semantics (success/warning/error/info) and the `*-400` fill tier read
// on obsidian and on paper alike. What is not fine is a fixed colour used as
// TEXT that only clears on one ground, or a `command` surface that adaptive text
// sits on. So this checks the property that actually matters, against the same
// 2.0:1 floor e2e/theme-contrast.spec.ts holds at runtime.
//
// e2e/theme-contrast.spec.ts measures the real composited result in a browser;
// this catches the cause without one, which is what lets it run in CI.
//
//   npx tsx scripts/check-theme-tokens.mts
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

let fail = 0
const bad = (m: string) => { console.log('FAIL: ' + m); fail++ }

const CONFIG = readFileSync('tailwind.config.js', 'utf8')

// The two page grounds a fixed colour has to survive, from the :root blocks.
const OBSIDIAN: RGB = [10, 16, 13]    // --bg-base, dark
const PAPER: RGB = [242, 241, 234]    // --bg-base, light
const FLOOR = 2.0                     // matches e2e/theme-contrast.spec.ts

type RGB = [number, number, number]

function hex(h: string): RGB | null {
  const m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(h.trim())
  if (!m) return null
  const v = m[1].length === 3 ? m[1].split('').map(c => c + c).join('') : m[1]
  return [0, 2, 4].map(i => parseInt(v.slice(i, i + 2), 16)) as RGB
}
const chan = (c: number) => { const s = c / 255; return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4) }
const lum = (c: RGB) => 0.2126 * chan(c[0]) + 0.7152 * chan(c[1]) + 0.0722 * chan(c[2])
const contrast = (a: RGB, b: RGB) => {
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}

/** family-shade -> literal value, for every colour the config defines. */
function tokenValues(): Map<string, string> {
  const out = new Map<string, string>()
  // `family: { shade: 'value', ... }` and `family: 'value'`
  const nested = /(\w+):\s*\{([^}]*)\}/g
  for (const m of CONFIG.matchAll(nested)) {
    const family = m[1]
    for (const s of m[2].matchAll(/(\w+|DEFAULT):\s*'([^']+)'/g)) {
      out.set(`${family}-${s[1] === 'DEFAULT' ? '' : s[1]}`.replace(/-$/, ''), s[2])
    }
  }
  for (const m of CONFIG.matchAll(/^\s{8}(\w+):\s*'([^']+)'/gm)) out.set(m[1], m[2])
  return out
}

const adaptive = (v: string) => /rgb\(var\(--/.test(v)

function walk(dir: string, out: string[] = []): string[] {
  for (const e of readdirSync(dir)) {
    if (e === 'node_modules' || e.startsWith('.')) continue
    const p = join(dir, e)
    if (statSync(p).isDirectory()) walk(p, out)
    else if (/\.(tsx|ts)$/.test(p)) out.push(p)
  }
  return out
}

const files = walk('src')
const source = files.map(f => readFileSync(f, 'utf8')).join('\n')
const values = tokenValues()

// ── 1. A fixed colour used as TEXT must be legible on BOTH grounds ─────────
// Catches `text-emerald-300`, `placeholder:text-white/25`, `hover:text-sky-300`.
const textUsed = new Set<string>()
for (const m of source.matchAll(/(?:^|[\s"'`:])(?:[a-z-]+:)*text-([a-z]+)(?:-(\d{2,3}))?(?:\/\[?[\d.]+\]?)?(?=[\s"'`]|$)/gm)) {
  textUsed.add(m[2] ? `${m[1]}-${m[2]}` : m[1])
}
let fixedTextChecked = 0
for (const token of [...textUsed].sort()) {
  const v = values.get(token)
  if (!v) continue                      // not a config colour (text-left, text-ui, ...)
  if (adaptive(v)) continue             // flips with the theme: nothing to prove
  const rgb = hex(v)
  if (!rgb) continue                    // not a literal we can reason about
  fixedTextChecked++
  const onDark = contrast(rgb, OBSIDIAN)
  const onLight = contrast(rgb, PAPER)
  if (onDark < FLOOR || onLight < FLOOR) {
    const weak = onDark < onLight ? `obsidian (${onDark.toFixed(2)}:1)` : `paper (${onLight.toFixed(2)}:1)`
    bad(`text-${token} is the fixed ${v}, which reads ${onDark.toFixed(2)}:1 on obsidian and `
      + `${onLight.toFixed(2)}:1 on paper. It is used as TEXT and fails the ${FLOOR}:1 floor on `
      + `${weak}. Either give it a channel (dark keeps the hex, light gets the deep --ac-* value, `
      + `as the *-300 tier does) or stop using it as text.`)
  }
}

// ── 2. The command surfaces carry adaptive text, so they must flip too ──────
for (const surface of ['command-bg', 'command-surface', 'command-card', 'command-border', 'command-text']) {
  const v = values.get(surface)
  if (!v) { bad(`${surface} is missing from tailwind.config.js`); continue }
  if (!adaptive(v)) {
    bad(`${surface} is a fixed value (${v}). Adaptive text (text-white/NN) sits on `
      + `these, so a fixed surface means dark-on-dark in one of the two themes.`)
  }
}

// ── 3. Every channel a colour references must exist in BOTH themes ──────────
// A token that flips to nothing is worse than one that never flips: the utility
// compiles and silently paints transparent.
const css = readFileSync('src/index.css', 'utf8')
const rootDark = css.slice(css.indexOf(':root {'), css.indexOf(":root[data-theme='light']"))
const lightStart = css.indexOf(":root[data-theme='light']")
const rootLight = css.slice(lightStart, css.indexOf('\n}', lightStart))

const referenced = new Set<string>()
for (const v of values.values()) {
  for (const m of v.matchAll(/var\((--[\w-]+)\)/g)) referenced.add(m[1])
}
for (const chan of [...referenced].sort()) {
  const inDark = new RegExp(`${chan}\\s*:`).test(rootDark)
  const inLight = new RegExp(`${chan}\\s*:`).test(rootLight)
  if (!inDark) bad(`${chan} is referenced by tailwind.config.js but never defined in :root (dark)`)
  // A channel that is only defined in dark simply inherits; that is fine and
  // intended for the accent fills. Only flag the reverse, which cannot inherit.
  if (inLight && !inDark) bad(`${chan} is defined for light but not dark`)
}

if (fail) {
  console.log(`\n${fail} theme-token violation(s).`)
  process.exit(1)
}
console.log(`theme tokens: ${textUsed.size} text utilities checked `
  + `(${fixedTextChecked} fixed, each legible on both grounds), ${referenced.size} channels resolved`)
