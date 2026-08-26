// Guards steps 4, 5 and 6: the arc as the publishable unit, the revised score,
// and the surfacing rule including the anti-echo reservation.
//
// Three of these encode decisions that a later edit is very likely to undo as a
// convenience, and each would be invisible in production until the queue was
// quietly wrong again:
//
//   a single event cannot surface   The most repeated rejection in the ranked
//                                   slate. An arc with one independent beat is
//                                   blocked, not merely scored low, because a
//                                   low score still competes.
//   independence is not volume      "Five outlets syndicating one wire scores
//                                   as one." Counting stories instead of
//                                   origins is exactly what `momentum` did.
//   empty slots stay empty          Backfilling the two reserved slots with
//                                   themed items removes the only signal that
//                                   the week produced nothing unfamiliar.
//
//   npx tsx scripts/check-arc-scoring.mts
import { readFileSync } from 'node:fs'
import { scoreArc, surface, surfacingReason, WEIGHTS, VISIBLE_SLOTS,
  RESERVED_FOR_UNTHEMED, MIN_INDEPENDENT_BEATS, type Arc } from '../api/_arcScore.ts'
import type { Card } from '../api/_cardLint.ts'

let fail = 0
const bad = (m: string) => { console.log('FAIL: ' + m); fail++ }

const CARD: Card = {
  headline: 'Small models are taking the work frontier models were priced for',
  what_changed: "Cisco's 350M-parameter model beats GPT-5.5 on security tasks at 172x lower cost. Microsoft swapped frontier models for its own MAI models inside Office and said cost was the reason. Bridgewater reported 84.7% accuracy from a tuned Qwen3 against roughly 50% from the frontier three.",
  why_now: 'Three buyers published cost comparisons in the same quarter, which had not happened before.',
  the_opening: 'There is a repricing window here for anyone selling per-seat AI features on frontier margins, and nobody has taken the cheap-and-good position in publishing yet.',
  where_this_goes: 'By the end of 2027 the premium tier is a compliance and support product rather than a capability one, and the capability gap stops carrying the price.',
  reader_decision: 'Whether to keep pricing your AI features against frontier costs, or reprice now and take share while competitors are still paying the old rate.',
}

const ARC: Arc = {
  id: 'a1', headline: CARD.headline, lens: 'pricing_packaging', channel: 'paid',
  theme_id: 'seats-dying', independent_beats: 4, primary_beats: 3,
  coverage_density: 0.2, card: CARD,
}

// 1. The weights are the brief's, and they sum to 1. A silent reweighting is
//    the easiest way to change what surfaces without anyone noticing.
{
  const sum = Object.values(WEIGHTS).reduce((a, b) => a + b, 0)
  if (Math.abs(sum - 1) > 1e-9) bad(`weights sum to ${sum}, not 1`)
  const expected = { arc_maturity: 0.25, reader_consequence: 0.25, forward_claim: 0.20, legibility: 0.15, non_obviousness: 0.15 }
  for (const [k, v] of Object.entries(expected)) {
    if ((WEIGHTS as Record<string, number>)[k] !== v) bad(`weight ${k} is ${(WEIGHTS as Record<string, number>)[k]}, brief says ${v}`)
  }
  if ('money_proximity' in WEIGHTS) {
    bad('money_proximity is back. It was absorbed into reader_consequence because Krish accepted org-design and selling items with no price attached')
  }
}

// 2. A good arc scores, and scores well.
{
  const s = scoreArc(ARC)
  if (s.blocked) bad('the reference arc is blocked: ' + s.blocks.join('; '))
  else if (s.total < 0.6) bad(`the reference arc scores only ${s.total.toFixed(2)}`)
  else console.log(`  reference arc scores ${s.total.toFixed(2)}`)
}

// 3. THE central rule: a single event cannot surface, however good it looks.
{
  const single = scoreArc({ ...ARC, independent_beats: 1, primary_beats: 1 })
  if (!single.blocked) bad('a one-beat arc is not blocked. A single event is evidence for an arc, not an arc')
  if (single.total !== 0) bad('a blocked arc has a non-zero score, so it can still compete')
  if (!single.blocks.some(b => b.includes('independent beat'))) {
    bad('a one-beat arc is blocked for the wrong reason: ' + single.blocks.join('; '))
  }
  if (MIN_INDEPENDENT_BEATS < 2) bad('MIN_INDEPENDENT_BEATS dropped below 2')
}

// 4. Every other hard block fires, and blocks rather than merely lowering.
{
  const cases: Array<[string, Partial<Arc>]> = [
    ['no lens', { lens: null }],
    ['no channel', { channel: null }],
    ['no tracked folder and no plausible new one', { theme_id: null }],
  ]
  for (const [needle, patch] of cases) {
    const s = scoreArc({ ...ARC, ...patch })
    if (!s.blocked) bad(`an arc with "${needle}" is not blocked`)
    else if (!s.blocks.some(b => b.includes(needle.split(' ')[1]))) {
      bad(`"${needle}" blocked for the wrong reason: ${s.blocks.join('; ')}`)
    }
  }
  // ... but an unthemed arc that could open a new folder is NOT blocked, or the
  // two reserved slots could never be filled by anything.
  const plausible = scoreArc({ ...ARC, theme_id: null, plausible_new_theme: true })
  if (plausible.blocked) {
    bad('an unthemed arc that could open a new folder is blocked, so the reserved slots can never fill: ' + plausible.blocks.join('; '))
  }
  // A lint failure blocks too.
  const linty = scoreArc({ ...ARC, card: { ...CARD, where_this_goes: 'This trend will continue.' } })
  if (!linty.blocked) bad('an arc whose card fails lint still scores')
}

// 5. Independence is weighted by tier, so trade press alone cannot top out.
{
  const allPrimary = scoreArc({ ...ARC, independent_beats: 6, primary_beats: 6 })
  const allSecondary = scoreArc({ ...ARC, independent_beats: 6, primary_beats: 0 })
  const m = (s: ReturnType<typeof scoreArc>) => s.components.find(c => c.name === 'arc_maturity')!.value
  if (!(m(allPrimary) > m(allSecondary))) {
    bad('primary-tier beats do not score above secondary-tier ones')
  }
  if (m(allSecondary) >= 1) bad('an arc built only from secondary sources reaches full maturity')
}

// 6. An unmeasured story cannot win on non_obviousness.
{
  const measured = scoreArc({ ...ARC, coverage_density: 0.05 })
  const unmeasured = scoreArc({ ...ARC, coverage_density: undefined })
  const n = (s: ReturnType<typeof scoreArc>) => s.components.find(c => c.name === 'non_obviousness')!.value
  if (!(n(measured) > n(unmeasured))) {
    bad('an unmeasured story scores as high on non_obviousness as one measured to be uncrowded')
  }
}

// 7. Surfacing: score order, never age; cap of 7; two reserved; empty stays empty.
{
  const mk = (id: string, score: number, theme: string | null) => ({ id, score, theme_id: theme })

  // Ten themed, none unthemed. Only five themed slots may fill, and the two
  // reserved must be reported empty rather than given to the themed queue.
  const many = Array.from({ length: 10 }, (_, i) => mk(`t${i}`, 0.9 - i * 0.05, 'f1'))
  const r = surface(many)
  if (r.themed.length !== VISIBLE_SLOTS - RESERVED_FOR_UNTHEMED) {
    bad(`${r.themed.length} themed shown, expected ${VISIBLE_SLOTS - RESERVED_FOR_UNTHEMED}`)
  }
  if (r.unthemed.length !== 0) bad('unthemed items appeared from nowhere')
  if (r.emptyReserved !== RESERVED_FOR_UNTHEMED) {
    bad(`${r.emptyReserved} empty reserved slots reported, expected ${RESERVED_FOR_UNTHEMED}. Backfilling them removes the only signal that the week produced nothing unfamiliar`)
  }
  if (r.themed.length + r.unthemed.length > VISIBLE_SLOTS) bad('more than seven cards surfaced')

  // A high-scoring themed item must never displace a reserved slot.
  const mixed = [mk('t1', 0.99, 'f1'), mk('t2', 0.98, 'f1'), mk('t3', 0.97, 'f1'),
    mk('t4', 0.96, 'f1'), mk('t5', 0.95, 'f1'), mk('t6', 0.94, 'f1'),
    mk('u1', 0.10, null)]
  const r2 = surface(mixed)
  if (!r2.unthemed.some(a => a.id === 'u1')) {
    bad('the lowest-scoring unthemed arc lost its reserved slot to a higher-scoring themed one')
  }
  if (r2.emptyReserved !== 1) bad(`expected 1 empty reserved slot, got ${r2.emptyReserved}`)

  // Order is by score, and age is not an input at all.
  const shuffled = [mk('a', 0.1, 'f1'), mk('b', 0.9, 'f1'), mk('c', 0.5, 'f1')]
  const r3 = surface(shuffled)
  if (r3.themed.map(a => a.id).join('') !== 'bca') bad('surfacing is not ordered by score descending')
}

// 8. Every arc state has a reason line, and an unthemed one says so.
{
  for (const st of ['emerging', 'building', 'peaking', 'resolving', 'resolved', 'stalled', 'reversed']) {
    const line = surfacingReason(st, true)
    if (!line || /surfaced on a change of state/i.test(line)) bad(`arc state "${st}" has no reason line of its own`)
  }
  if (!/matches none of your tracked questions/i.test(surfacingReason('building', false))) {
    bad('an unthemed card does not say that it matches no tracked question')
  }
}

// 9. Merged arcs are KEPT now rather than deleted, so every list reader must
//    exclude them. Miss one and a folded arc reappears beside the arc it was
//    folded into, which looks like the merge silently failed.
{
  const readers: Array<[string, string]> = [
    ['src/hooks/useContentV2.ts', "from('shifts')"],
    ['api/briefs/assemble.ts', "from('shifts')"],
    ['api/shifts/detect.ts', "from('shifts')"],
    ['api/discover-guest-scout.ts', "from('shifts')"],
  ]
  for (const [file] of readers) {
    const src = readFileSync(file, 'utf8')
    if (!/\.is\(\s*['"]superseded_by['"]\s*,\s*null\s*\)/.test(src)) {
      bad(`${file} lists shifts without excluding superseded_by, so merged arcs reappear`)
    }
  }
  // And the merge itself must not go back to deleting the source row.
  const ruling = readFileSync('api/shifts/[id].ts', 'utf8')
  const mergeBlock = ruling.slice(ruling.indexOf("b.action === 'merge'"))
  const upToEnd = mergeBlock.slice(0, mergeBlock.indexOf('await supabase.from(\'content_decisions\')'))
  if (/from\('shifts'\)\s*\.delete\(\)/.test(upToEnd)) {
    bad('api/shifts/[id].ts deletes the source arc on merge again. Merging must be reversible and logged')
  }
  if (!/superseded_by:\s*target/.test(upToEnd)) {
    bad('api/shifts/[id].ts no longer marks the merged arc with superseded_by')
  }
}

console.log(fail === 0
  ? 'PASS  one beat cannot surface, independence beats volume, seven slots with two reserved and empty staying empty'
  : `${fail} FAILURE(S)`)
process.exit(fail ? 1 : 0)
