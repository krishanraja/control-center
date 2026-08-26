// Asserts the content engine is CONNECTED, not merely correct.
//
// This guard exists because of a specific failure. Steps 1 to 7 of the rewrite
// all shipped and all passed their own guards: six lenses agreed with their
// CHECK constraint, the card lint rejected the right cards, the scorer blocked
// single-event arcs and reserved two slots, forty verdicts were recorded and
// kept away from the ranking. Every one of those was true, and none of it ran.
//
//   scoreArc()            called by nothing
//   surface()             called by nothing
//   lintCard()            reached by nothing
//   shifts.lens           null on all 54 live arcs
//   shifts.theme_id       null on all 54 live arcs
//   the Content tab       still served entirely by content_decisions
//
// A whole rewrite sat beside the running system, and every existing guard was
// green, because each one checked a component against its own contract and
// nothing checked that the components were joined up. That is the gap this
// closes: it walks the chain link by link and fails when any stage stops
// feeding the next.
//
//   npx tsx scripts/check-content-chain.mts
import { readFileSync, existsSync } from 'node:fs'

let fail = 0
const bad = (m: string) => { console.log('FAIL: ' + m); fail++ }
const src = (f: string) => (existsSync(f) ? readFileSync(f, 'utf8') : '')

/** Production files only. A symbol "used" solely by its own guard is exactly
 *  the dead code this exists to catch, so scripts/ is never a consumer. */
type Link = {
  stage: string
  /** Where the capability is defined. */
  from: string
  /** Files that must actually use it, any one of them. */
  into: string[]
  /** What must appear in a consumer. */
  symbol: RegExp
  why: string
}

const CHAIN: Link[] = [
  {
    stage: 'classify',
    from: 'api/_classify.ts',
    into: ['api/shifts/detect.ts'],
    // The CALL SITE, not the definition. classifyUnclassified lives in
    // detect.ts, so matching its name matched its own `export function` line
    // and the link passed with the call commented out.
    symbol: /await\s+classifyUnclassified\s*\(/,
    why: 'nothing assigns a lens, so every arc stays invisible to the scorer. This was true of all 54 live arcs until 26 Aug',
  },
  {
    stage: 'compose',
    from: 'api/_compose.ts',
    into: ['api/arcs/surface.ts'],
    symbol: /buildComposePrompt/,
    why: 'nothing builds a card, so the lint and the scorer have nothing to judge',
  },
  {
    stage: 'lint',
    from: 'api/_cardLint.ts',
    into: ['api/_arcScore.ts'],
    symbol: /lintCard/,
    why: 'the card contract stops being enforced and bad cards score normally',
  },
  {
    stage: 'score',
    from: 'api/_arcScore.ts',
    into: ['api/arcs/surface.ts'],
    symbol: /scoreArc/,
    why: 'nothing scores, so the queue falls back to age or momentum, which is the bug the rewrite began with',
  },
  {
    stage: 'surface',
    from: 'api/_arcScore.ts',
    into: ['api/arcs/surface.ts'],
    symbol: /\bsurface\s*\(/,
    why: 'nothing applies the seven slots or the two reserved for unthemed arcs',
  },
  {
    stage: 'format vocabulary',
    from: 'api/_formats.ts',
    into: ['api/_compose.ts'],
    symbol: /FORMAT_SPEC|FORMATS/,
    why: 'the nine formats and what the slate said about them are recorded and never consulted',
  },
  {
    stage: 'serve',
    from: 'api/arcs/surface.ts',
    into: ['src/hooks/useContentV2.ts'],
    symbol: /from\(\s*['"]arc_cards['"]\s*\)/,
    why: 'the engine decides seven cards a week and Krish never sees them, which is where this whole rewrite was on 26 Aug',
  },
]

for (const link of CHAIN) {
  if (!src(link.from).trim()) { bad(`${link.stage}: ${link.from} is missing`); continue }
  const consumer = link.into.find(f => link.symbol.test(src(f)))
  if (!consumer) {
    bad(`${link.stage} is dead code. ${link.from} is not used by ${link.into.join(' or ')}, so ${link.why}`)
  } else {
    console.log(`  ${link.stage.padEnd(18)} ${link.from}  ->  ${consumer}`)
  }
}

// The surfacing job must be scheduled, or the chain is connected and never runs.
{
  const vercel = JSON.parse(src('vercel.json') || '{}')
  const crons: Array<{ path: string; schedule: string }> = vercel.crons || []
  const has = (p: string) => crons.find(c => c.path === p)
  const detect = has('/api/shifts/detect')
  const surf = has('/api/arcs/surface')
  const assemble = has('/api/briefs/assemble')
  if (!surf) {
    bad('/api/arcs/surface has no cron, so cards are only ever composed by hand')
  } else if (detect && assemble) {
    // Ordering is real: surfacing before detection scores last week's arcs, and
    // surfacing after the brief means the brief cannot see this week's cards.
    const min = (s: string) => { const [m, h] = s.split(' '); return Number(h) * 60 + Number(m) }
    if (!(min(detect.schedule) < min(surf.schedule) && min(surf.schedule) < min(assemble.schedule))) {
      bad(`cron order is wrong: detect ${detect.schedule}, surface ${surf.schedule}, assemble ${assemble.schedule}. Surfacing must run after detection and before the brief`)
    } else {
      console.log(`  cron order          detect -> surface -> assemble`)
    }
  }
}

// A discard must never be silent. The single most repeated complaint about the
// previous engine was 54 proposals with no explanation of any of them.
{
  const surface = src('api/arcs/surface.ts')
  if (!/surface_reason/.test(surface)) {
    bad('api/arcs/surface.ts does not write surface_reason, so a card that loses gives no reason and "why is this not in my queue" is unanswerable again')
  }
  if (!/preBlocked|pre_blocked/.test(surface)) {
    bad('api/arcs/surface.ts does not record the arcs it blocked before composing, so they vanish silently')
  }
  const classify = src('api/shifts/detect.ts')
  if (!/classify_reason/.test(classify)) {
    bad('the classifier does not write classify_reason, so a discarded arc gives no reason')
  }
}

console.log(fail === 0
  ? 'PASS  classify -> compose -> lint -> score -> surface -> serve, scheduled in order, with reasons written at every drop'
  : `${fail} FAILURE(S)`)
process.exit(fail ? 1 : 0)
