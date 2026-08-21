// Guards the icon system against being bypassed.
//
// On 2026-08-21 every icon in src/ was routed through src/lib/icons.tsx: one
// wrapper applying a constant 1.75px physical stroke (absoluteStrokeWidth)
// and a snapped size scale, so ~660 call sites read as one engineered family.
// That only stays true if nothing imports lucide directly, nothing re-invents
// per-site stroke weights, and no text glyph stands in for an icon again —
// each of which is invisible in review and cumulative in effect.
//
//   npx tsx scripts/check-icons.mts
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

let fail = 0
const bad = (m: string) => { console.log('FAIL: ' + m); fail++ }

const ICONS_MODULE = 'src/lib/icons.tsx'

// The sanctioned strokeWidth call sites: the wrapper itself, the two nav
// chromes' 2.25 active weight, the FAB's 2.25 brand moment, and inline Check
// marks inside tiny filled checkboxes (2.5 for legibility under 12px).
const STROKE_OK = new Set([
  ICONS_MODULE,
  // Hand-drawn SVG marks, not lucide glyphs: the MRR sparkline draws its own
  // polyline (DrawnCheck and the shifts sparkline do the same with string
  // attributes, which this check already ignores).
  'src/components/MrrTicker.tsx',
  'src/components/BottomNav.tsx',
  'src/components/DesktopSidebar.tsx',
  'src/components/CreateSheet.tsx',
  'src/components/ContactCard.tsx',
  'src/components/content/BriefComposer.tsx',
  'src/components/content/ContentComposer.tsx',
])

// Text glyphs that stand in for icons. The middle dot, arrows in prose, and
// list markers are typography; these are chrome and render differently per
// platform, which is exactly the assembled-not-designed look.
const GLYPHS = ['🎙', '💭', '‹', '›']

function walk(dir: string, out: string[] = []): string[] {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e)
    if (statSync(p).isDirectory()) walk(p, out)
    else if (/\.tsx?$/.test(e)) out.push(p.replace(/\\/g, '/'))
  }
  return out
}

for (const file of walk('src')) {
  const text = readFileSync(file, 'utf8')
  const lines = text.split('\n')
  lines.forEach((line, i) => {
    if (file !== ICONS_MODULE && /from ['"]lucide-react['"]/.test(line)) {
      bad(`${file}:${i + 1} imports lucide-react directly — import from '@/lib/icons' so the stroke/size wrapper applies`)
    }
    if (!STROKE_OK.has(file) && /strokeWidth=\{/.test(line)) {
      bad(`${file}:${i + 1} sets strokeWidth inline — the wrapper owns icon weight (1.75; active chrome 2.25)`)
    }
    for (const g of GLYPHS) {
      if (line.includes(g)) {
        bad(`${file}:${i + 1} uses the text glyph ${g} as chrome — use the real icon from '@/lib/icons'`)
      }
    }
  })
}

if (fail) {
  console.log(`${fail} FAILURE(S)`)
  process.exit(1)
}
console.log('PASS  one icon source, one stroke system, no glyph stand-ins')
