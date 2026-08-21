// Guards the "why am I seeing this / why am I binning this" contract.
//
// The bug this encodes already shipped, three times over. The reject-reason
// taxonomy lived in three files that nobody could diff by eye: api/feedback.ts
// (the allow-list the server validates against), src/lib/triageReasons.ts and
// FeedbackButton.tsx. Measured on 2026-08-20 they disagreed on 26 codes, and
// 18 codes the UI could emit were missing from the server list entirely -- so
// every rejection of a task, bet, customer, opportunity or correction wrote
// through as an unknown code and Vera clustered it as 'other'. 114 of 328
// live rejections carry no usable reason as a result.
//
// So the invariants are structural, not about data:
//   1. One vocabulary. src/lib/servedSurfaces.ts is the source; the API list
//      is a mirror and must contain every code the registry can emit.
//   2. One surface set. ALLOWED_TABLES and ServedTable are the same set.
//   3. Every surface can explain itself and can be refused: reasons, a default
//      that is one of its own codes, and a why resolver.
//   4. Nobody declares a private reason list again.
//   5. Symmetry. If a component can reject a thing, it can also say why that
//      thing is there. Anything not yet wired is named below, so the gap is a
//      list that shrinks rather than a silence.
//
//   npx tsx scripts/check-served-surfaces.mts
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { SERVED_TABLES, SURFACES } from '../src/lib/servedSurfaces.ts'

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

/** The literal contents of a `new Set([...])` / `= [...]` block, by name. */
function setLiteral(src: string, decl: string): Set<string> {
  const i = src.indexOf(decl)
  if (i === -1) return new Set()
  let d = 0, j = src.indexOf('[', i)
  const start = j
  for (; j < src.length; j++) {
    if (src[j] === '[') d++
    else if (src[j] === ']') { d--; if (d === 0) break }
  }
  const body = src.slice(start, j + 1)
  // Strip line comments so a code mentioned in prose is not counted.
  const clean = body.replace(/\/\/[^\n]*/g, '')
  return new Set([...clean.matchAll(/'([a-z_A-Z]+)'/g)].map(m => m[1]))
}

const api = readFileSync('api/feedback.ts', 'utf8')
const allowedTables = setLiteral(api, 'const ALLOWED_TABLES')
const apiCodes = setLiteral(api, 'const REASON_OPTIONS')

// ── 1. every registry code is accepted by the server ───────────────────────
for (const t of SERVED_TABLES) {
  for (const r of SURFACES[t].reasons) {
    if (!apiCodes.has(r.code)) {
      bad(`'${r.code}' (${t}) is not in REASON_OPTIONS in api/feedback.ts; Vera would cluster it as 'other'`)
    }
  }
}

// ── 2. the two surface sets are the same set ───────────────────────────────
for (const t of SERVED_TABLES) {
  if (!allowedTables.has(t)) bad(`ServedTable '${t}' is missing from ALLOWED_TABLES in api/feedback.ts`)
}
for (const t of allowedTables) {
  if (!(SERVED_TABLES as string[]).includes(t)) {
    bad(`ALLOWED_TABLES has '${t}' but it is not a ServedTable in src/lib/servedSurfaces.ts`)
  }
}

// ── 3. every surface can explain itself and can be refused ─────────────────
for (const t of SERVED_TABLES) {
  const s = SURFACES[t]
  if (!s.label?.trim()) bad(`${t} has no label`)
  if (s.reasons.length < 2) bad(`${t} has ${s.reasons.length} reason chip(s); a one-chip bar is not a choice`)
  if (!s.reasons.some(r => r.code === s.defaultReason)) {
    bad(`${t} defaultReason '${s.defaultReason}' is not one of its own chips`)
  }
  const codes = s.reasons.map(r => r.code)
  const dupes = codes.filter((c, i) => codes.indexOf(c) !== i)
  if (dupes.length) bad(`${t} repeats reason code(s): ${[...new Set(dupes)].join(', ')}`)
  if (typeof s.why !== 'function') bad(`${t} has no why resolver`)
  // The resolver must survive a row it does not recognise: a malformed row
  // cannot be allowed to take down the card it is attached to.
  try {
    const w = s.why({})
    if (!w || typeof w.headline !== 'string' || typeof w.recorded !== 'boolean') {
      bad(`${t}.why({}) did not return a Why`)
    } else if (w.recorded) {
      bad(`${t}.why({}) claims a reason was recorded for an empty row`)
    }
  } catch (e) {
    bad(`${t}.why({}) threw: ${(e as Error).message}`)
  }
}

const files = walk('src')

// ── 4. nobody declares a private reason vocabulary again ───────────────────
const REGISTRY = 'src/lib/servedSurfaces.ts'
const PRIVATE_VOCAB = /\{\s*code:\s*'[a-z_]+'\s*,\s*label:\s*'/
for (const f of files) {
  if (f === REGISTRY) continue
  if (PRIVATE_VOCAB.test(readFileSync(f, 'utf8'))) {
    bad(`${f} declares its own {code,label} reason list; the vocabulary lives in ${REGISTRY}`)
  }
}

// ── 5. if you can reject it, you can ask why it is there ───────────────────
// Components still to be wired. Delete a line as you wire it; never add one
// without saying why the symmetry does not apply.
const WHY_EXEMPT = new Set<string>([
  // Reject UI itself. These ARE the refusal control; they do not serve an item.
  'src/components/shared/RejectReasonBar.tsx',
  'src/components/shared/ReasonChipBar.tsx',
  'src/components/shared/FeedbackButton.tsx',
  // Deck shells that render a card component which carries the badge itself.
  'src/components/content/TriageDeck.tsx',
  'src/components/content-v2/MobileDecisionDeck.tsx',
  'src/components/content/BriefComposer.tsx',
  'src/components/mobile/primitives.tsx',
])

const REJECTS = /<(FeedbackButton|RejectReasonBar|ReasonChipBar)\b/
const missing: string[] = []
for (const f of files) {
  if (WHY_EXEMPT.has(f)) continue
  const src = readFileSync(f, 'utf8')
  const explains = /<WhyBadge\b/.test(src) || /\bwhy=\{/.test(src)
  if (REJECTS.test(src) && !explains) missing.push(f)
}
for (const f of missing) {
  bad(`${f} can reject an item but never says why it was served; add <WhyBadge> or name it in WHY_EXEMPT`)
}

console.log(
  fail === 0
    ? `OK: ${SERVED_TABLES.length} served surfaces, ${apiCodes.size} accepted codes, vocabulary in one place.`
    : `\n${fail} failure(s).`,
)
process.exit(fail ? 1 : 0)
