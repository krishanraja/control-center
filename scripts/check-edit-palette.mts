// Guards the one-click edit palette against the failure that produced this
// script: contentEngine.ts held 26 edits, the composer rendered all of
// them, and the separate v2 brief editor kept a private four-item list. Nothing was
// deleted and nothing was broken, so nothing caught it. The palette had simply
// never been wired to the surface the weekly brief actually opens in.
//
// Two things are checked. That the palette is whole, and that no surface has
// started keeping its own copy again.
//   npx tsx scripts/check-edit-palette.mts
import { readFileSync } from 'node:fs'
import {
  editGroups, TONE_PRESETS, HUMOR_PRESETS, LENGTH_PRESETS, ITERATE_CHIPS, ANALOGY_PRESETS,
  FORMAT_ADAPTS, CHANNEL_ADAPTS, VIDEO_FORMATS,
} from '../src/lib/contentEngine.js'
import { HUMOUR_REGISTERS } from '../api/_humor.js'

let fail = 0
const bad = (m: string) => { console.log(`FAIL ${m}`); fail++ }

// ── 1. the palette is whole ────────────────────────────────────────────────
const full = editGroups({ currentChannel: null })
const flat = full.flatMap(g => g.items)
const expected =
  TONE_PRESETS.length + HUMOR_PRESETS.length + LENGTH_PRESETS.length +
  ITERATE_CHIPS.length + 1 /* sharpest angle */ + ANALOGY_PRESETS.length +
  FORMAT_ADAPTS.length + CHANNEL_ADAPTS.length + VIDEO_FORMATS.length + 2 /* deepen: paid, built */
if (flat.length !== expected) bad(`palette has ${flat.length} edits, expected ${expected}`)

for (const g of full) {
  if (!g.items.length) bad(`group "${g.label}" is empty`)
  for (const it of g.items) {
    if (!it.label) bad(`an item in "${g.label}" has no label`)
    // The hint IS the instruction sent to the model. A chip without one is a
    // bare mode key, which is how "be sarcastic" quality happens.
    if (!it.hint || it.hint.length < 40) bad(`"${it.label}" has no usable hint`)
  }
}

// Every humour register the backend knows must be reachable as a chip, and
// must carry the register as `value` — that is what routes the pass to the
// examples-driven prompt and the stronger model instead of the generic one.
const humour = full.find(g => g.label === 'Humor')?.items ?? []
for (const r of HUMOUR_REGISTERS) {
  if (!humour.some(i => i.value === r)) bad(`humour register "${r}" is not reachable as a chip`)
}

// ── 2. the brief editor cannot answer these two ────────────────────────────
const brief = editGroups({ includeFormatAdapts: false, includeChannelCuts: false, includeDeepen: false })
// The brief keeps video: a weekly brief is exactly the kind of thing that
// becomes a 60 second cut and a 10 minute cut of the same argument.
if (!brief.some(g => g.label === 'Video script')) bad('brief palette lost video scripts')
if (brief.some(g => g.label === 'Change the format')) bad('brief palette offers format adapts')
if (brief.some(g => g.label === 'Cut for a channel')) bad('brief palette offers channel cuts')
if (brief.flatMap(g => g.items).length < 20) bad('brief palette lost too much')

// ── 3. no surface keeps its own list ───────────────────────────────────────
const SURFACES = [
  'src/components/content/ContentComposer.tsx',
  'src/components/content/BriefComposer.tsx',
]
for (const f of SURFACES) {
  const src = readFileSync(f, 'utf8')
  if (!src.includes('editGroups')) bad(`${f} does not use editGroups()`)
  // The four MAGIC modes are allowed to stay pinned in the brief footer, but
  // a surface mapping the preset arrays itself is building a rival palette.
  for (const arr of ['TONE_PRESETS.map', 'HUMOR_PRESETS.map', 'LENGTH_PRESETS.map', 'ANALOGY_PRESETS.map']) {
    if (src.includes(arr)) bad(`${f} maps ${arr} directly instead of using editGroups()`)
  }
}

// ── 4. one composer, one shell, one rail ──────────────────────────────────
// The palette drifted because there were two full-screen editors and only one
// of them was called the composer. CONTENT-ENGINE-V2-SPEC.md:75 said there
// would be one, opening ideas AND briefs. These checks are that sentence.
const app = readFileSync('src/App.tsx', 'utf8')
if (/<BriefEditor\b/.test(app)) bad('App still mounts a separate BriefEditor')
if ((app.match(/<ContentComposer\b/g) || []).length !== 1) {
  bad('App should mount exactly one ContentComposer, for both ?idea= and ?brief=')
}

const entry = readFileSync('src/components/content/ContentComposer.tsx', 'utf8')
if (!/week\s*\?\s*:?\s*string/.test(entry) || !/<BriefComposer\b/.test(entry)) {
  bad('ContentComposer no longer routes briefs; the two surfaces have split again')
}

for (const f of SURFACES) {
  const src = readFileSync(f, 'utf8')
  for (const shared of ['ComposerShell', 'ComposerRail', 'EditPalette']) {
    if (!src.includes(shared)) bad(`${f} does not use ${shared}; the shared chrome has split`)
  }
}

console.log(fail === 0
  ? `PASS ${flat.length} edits in ${full.length} groups, ${brief.flatMap(g => g.items).length} on the brief, ${HUMOUR_REGISTERS.length} humour registers reachable, one composer over one shell`
  : `${fail} FAILURES`)
process.exit(fail ? 1 : 0)
