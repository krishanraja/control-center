// Guards the icon stroke against being overridden from CSS.
//
// `scripts/check-icons.mts` guards the IMPORT path: nothing may import lucide
// directly, so every glyph goes through the wrapper in src/lib/icons.tsx and
// picks up `absoluteStrokeWidth` plus the 1.75 house stroke. That guard cannot
// see the other way the system dies.
//
// Lucide writes the stroke as an SVG PRESENTATION ATTRIBUTE. Any CSS
// declaration beats a presentation attribute, so a single stylesheet rule
// targeting the glyphs silently overrides all ~660 call sites at once, with
// nothing in src/ changed and every existing guard still green.
//
// That is not hypothetical. `src/index.css` carried
//
//     svg.lucide,
//     svg[fill='none'][stroke-linecap='round'][stroke-linejoin='round'] {
//       stroke-width: 1.5px;
//     }
//
// from before the wrapper existed. Measured live on #/home, it rendered every
// icon at 0.75px (12px glyph), 0.88px (14px) and 1.00px (16px) against an
// intended constant 1.75px, and flattened the nav's 2.25 active-tab weight to
// the same 1.00px as an inactive tab. `1.5px` inside a 24-unit viewBox is 1.5
// USER units, so the physical stroke scaled with size again — the precise
// defect `absoluteStrokeWidth` exists to remove.
//
//   npx tsx scripts/check-icon-stroke.mts
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

let fail = 0
const bad = (m: string) => { console.log('FAIL: ' + m); fail++ }

/** Every stylesheet the app ships, plus the pre-hydration inline styles. */
function sheets(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === 'dist' || name.startsWith('.')) continue
    const full = join(dir, name)
    if (statSync(full).isDirectory()) sheets(full, out)
    else if (/\.(css|scss)$/.test(name)) out.push(full)
  }
  return out
}

const files = [...sheets('src'), 'index.html'].filter(f => {
  try { statSync(f); return true } catch { return false }
})

// A rule is a bypass when it sets stroke-width in a block whose selector can
// match a lucide glyph. Hand-drawn marks (DrawnCheck, the sparklines) are not
// lucide glyphs and are addressed by their own class, so they stay allowed.
const LUCIDE_SELECTOR = /svg\.lucide|stroke-linecap\s*=\s*['"]round['"]|\bsvg\s*\{|\bsvg\s*,/

for (const file of files) {
  // Comments first. This file's own prose names the offending rule verbatim,
  // and so does the tombstone comment left in index.css where it used to live;
  // scanning raw text flags the explanation instead of a real rule.
  const src = readFileSync(file, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')
  // Split into rule blocks so a selector is judged with its own declarations.
  for (const block of src.split('}')) {
    if (!/stroke-width\s*:/.test(block)) continue
    const selector = block.slice(block.lastIndexOf('{') === -1 ? 0 : 0, Math.max(block.lastIndexOf('{'), 0))
    if (!LUCIDE_SELECTOR.test(selector)) continue
    const decl = (block.match(/stroke-width\s*:[^;]+/) || [''])[0].trim()
    bad(
      `${file}: a CSS rule sets \`${decl}\` on lucide glyphs. CSS beats the SVG ` +
      `presentation attribute, so this overrides ICON_STROKE and ` +
      `absoluteStrokeWidth for every icon in the app. The stroke is owned by ` +
      `src/lib/icons.tsx — change it there.`,
    )
  }
}

console.log(fail === 0
  ? `check-icon-stroke: OK (${files.length} stylesheets, no CSS stroke override)`
  : `check-icon-stroke: ${fail} problem(s)`)
process.exit(fail === 0 ? 0 : 1)
