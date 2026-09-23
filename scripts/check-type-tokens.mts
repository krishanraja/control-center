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
// The second invariant, added 2026-09-13: ONE spelling of the text hierarchy.
// `.text-strong / .text-muted / .text-faint` (component classes in index.css)
// and `text-ink / text-ink-muted / text-ink-faint` (Tailwind tokens) were the
// same three colour channels under two names, which is why neither won and
// most of src/ stayed on `text-white/NN` opacity soup. The tokens win: they
// take opacity modifiers and variants like any other utility. The three class
// spellings remain defined in index.css so an unswept file cannot render
// colourless, but nothing in src/ may use them again.
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

// Any bracketed FONT SIZE, not just pixels. The original pattern was
// `text-[<n>px]`, which let `text-[clamp(1.65rem,5vw,2.65rem)]` sit on the
// editorial gate's headline — 26.4px to 42.4px, off the nine-token scale in
// both directions, invisible to the guard that exists to prevent exactly that.
// Colours are also spelled `text-[...]`, so anything opening with #, rgb, hsl
// or a custom property is excluded; what is left is a length or a clamp.
//
// `em` is deliberately NOT caught. It sizes relative to the parent rather than
// asserting a size, which is the correct mechanism inside a prose renderer:
// `components/content/RichText.tsx` sizes markdown headings at 1.45/1.25/1.1em
// so the same document renders in proportion wherever it is embedded. Pinning
// those to absolute tokens would break that, and they are not a second type
// scale — they are one scale expressed as ratios. Absolute and viewport units
// (px, rem, vw, vh, ch) and clamp() all assert a size, and must be on the
// nine tokens.
const SIZE = /text-\[(?!#|rgb|hsl|var|--)[^\]]*(?:\d(?:px|rem|vw|vh|ch)|clamp\()[^\]]*\]/g
const TRACK = /tracking-\[(0\.\d+)em\]/g
// Matches the deprecated spelling only: `text-muted` but not `text-ink-muted`,
// and only where it is used as a class (start of string, whitespace, or a
// variant colon before it).
const LEGACY_INK = /(?:^|[\s'"`:{])(text-(?:strong|muted|faint))\b/g

// Tailwind's DEFAULT size scale, which is not this app's scale.
//
// The 2026-08-21 sweep caught `text-[13px]` and missed `text-2xl`, because a
// bracket literal looks like a mistake and a named Tailwind class looks like a
// system. It is not this system: `text-2xl` is 24px and the role scale runs
// 11/12/13/14/16/20/28/40/56, so there is no 24 on it. Measured live at
// 1440px on 2026-09-23, Visibility, Hunt and Systems each rendered their page
// title at 24px, off the scale, in the most prominent text on the page — and
// across twelve files the same heading carried four different recipes
// (`text-2xl`, `text-xl md:text-2xl xl:text-heading`, `text-xl md:text-2xl
// font-bold`). `shared/SurfaceHeader` is the one recipe now.
//
// `text-xs` and `text-sm` are additive-on-purpose leftovers the role tokens do
// not override, so they are left alone; the display sizes are what fragment a
// page's hierarchy.
const TW_DISPLAY_SIZE = /(?:^|[\s'"`:{])(text-(?:lg|xl|[2-9]xl))\b/g

let sizeHits = 0
let trackHits = 0
let inkHits = 0
const INK_FIX: Record<string, string> = {
  'text-strong': 'text-ink',
  'text-muted': 'text-ink-muted',
  'text-faint': 'text-ink-faint',
}

for (const file of walk('src')) {
  const text = readFileSync(file, 'utf8')
  const lines = text.split('\n')
  lines.forEach((line, i) => {
    // A comment explaining the rule is not a violation of it. Every guard in
    // this repo documents the class it bans by name, so the scan has to skip
    // comment lines or each one fails itself.
    const t = line.trim()
    if (t.startsWith('//') || t.startsWith('*') || t.startsWith('/*')) return
    for (const m of line.matchAll(SIZE)) {
      bad(`${file}:${i + 1} bracket text size ${m[0]} — use a role token (text-micro…text-hero)`)
      sizeHits++
    }
    for (const m of line.matchAll(TW_DISPLAY_SIZE)) {
      bad(`${file}:${i + 1} ${m[1]} is Tailwind's default scale, not the role scale — use a role token (text-lede/title/heading/display) or <SurfaceHeader>`)
      sizeHits++
    }
    for (const m of line.matchAll(LEGACY_INK)) {
      bad(`${file}:${i + 1} ${m[1]} is the retired spelling of the hierarchy — use ${INK_FIX[m[1]]}`)
      inkHits++
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
console.log('PASS  no bracket or default-Tailwind text sizes, uppercase tracking uniform at 0.14em, one spelling of the text hierarchy')
