// Proves the card contract against the engine's own historical output.
//
// The acceptance criterion is mechanical: 100 percent of surfaced cards pass
// lint, so anything below 100 is a bug. That is only worth having if the lint
// itself is trustworthy, so this checks the lint, and checks it against the
// REAL rejected output rather than invented examples.
//
// Two corpora:
//   1. The 17 shift_proposal so-whats in the archive (2026-W28 to W33). Every
//      one must fail the_opening. 16 fail on the brief's enumerated banned
//      openers; the 17th needs the imperative-mood rule, which is why it exists.
//   2. The rejection reasons from the 40-idea ranked slate (27 Aug), rebuilt as
//      cards. Each must fail on the gate that the owner's own words describe.
//
//   npx tsx scripts/check-card-lint.mts
import { readFileSync } from 'node:fs'
import { lintCard, cardPasses, SATURATION_LIMIT, type Card } from '../api/_cardLint.ts'

let fail = 0
const bad = (m: string) => { console.log('FAIL: ' + m); fail++ }
const rules = (c: Card, ctx = {}) => lintCard(c, ctx).map(f => f.rule)

/** A card that passes everything. Each case below breaks exactly one thing, so
 *  a failure names the rule rather than a pile of unrelated noise. */
const GOOD: Card = {
  headline: 'Small models are taking the work frontier models were priced for',
  what_changed: "Cisco's 350M-parameter model beats GPT-5.5 on security tasks at 172x lower cost. Microsoft swapped frontier models for its own MAI models inside Office and said cost was the reason. Bridgewater reported 84.7% accuracy from a tuned Qwen3 against roughly 50% from the frontier three.",
  why_now: 'Three buyers published cost comparisons in the same quarter, which had not happened before.',
  the_opening: 'There is a repricing window here for anyone selling per-seat AI features on frontier margins, and nobody has taken the cheap-and-good position in publishing yet.',
  where_this_goes: 'By the end of 2027 the premium tier is a compliance and support product rather than a capability one, and the capability gap stops carrying the price.',
  reader_decision: 'Whether to keep pricing your AI features against frontier costs, or reprice now and take share while competitors are still paying the old rate.',
}

// 1. A correct card passes. A lint that fails everything is as useless as one
//    that fails nothing, and this is the case most likely to rot silently.
{
  const fs = lintCard(GOOD)
  if (fs.length) bad('the reference card fails: ' + fs.map(f => `${f.field}/${f.rule} (${f.detail})`).join(', '))
  else console.log('  the reference card passes all six fields and four gates')
}

// 2. Every historical so-what must still be rejected.
{
  const rows = JSON.parse(readFileSync('scripts/archive-review/rows_rich.json', 'utf8')) as
    Array<{ kind: string; title: string; summary: string | null; implication: string | null }>
  const historical = rows.filter(r => r.kind === 'shift_proposal' && r.implication)
  const survived: string[] = []
  for (const r of historical) {
    const fs = lintCard({ ...GOOD, headline: r.title, what_changed: r.summary || '', the_opening: r.implication! })
      .filter(f => f.field === 'the_opening')
    if (!fs.length) survived.push(r.implication!.slice(0, 80))
  }
  if (survived.length) {
    bad(`${survived.length} of ${historical.length} historical so-whats still pass:`)
    for (const s of survived) console.log('        - ' + s)
  } else console.log(`  all ${historical.length} historical so-whats rejected`)
}

// 3. The imperative rule does real work rather than riding on the banned list.
{
  const c = { ...GOOD, the_opening: 'Build government-relations and compliance capacity now; review windows will affect your timelines.' }
  if (!rules(c).includes('imperative_mood')) {
    bad('the one so-what the enumerated list misses is not caught by the imperative rule')
  }
}

// 4. The two new fields, against the owner's own rejection reasons.
{
  // "too opinion based and not enough analysis + prediction"
  if (!rules({ ...GOOD, where_this_goes: '' }).includes('required')) {
    bad('a card with no forward claim is accepted')
  }
  // "not just a linear 'the open web is dying'": continuation is not a claim.
  if (!rules({ ...GOOD, where_this_goes: 'This trend will continue as more buyers move down-market.' })
      .includes('continuation_not_claim')) {
    bad('a restatement of the current direction passes as a forward claim')
  }
  // A forward claim nobody could ever check is not falsifiable.
  if (!rules({ ...GOOD, where_this_goes: 'The market eventually reshapes around cheaper models.' })
      .includes('not_falsifiable')) {
    bad('a forward claim with no number and no timeframe is accepted')
  }
  // "so what? ... I dont understand why it matters or who it matters to"
  if (!rules({ ...GOOD, reader_decision: '' }).includes('required')) {
    bad('a card with no reader consequence is accepted')
  }
  // "Not an action they should take. A decision they already own."
  if (!rules({ ...GOOD, reader_decision: 'Reprice your AI features before the next renewal.' })
      .includes('action_not_decision')) {
    bad('an instruction passes as a reader decision')
  }
  if (!rules({ ...GOOD, reader_decision: 'This matters a great deal for margins across the sector.' })
      .includes('no_decision_named')) {
    bad('an observation with no decision in it passes as a reader decision')
  }
}

// 5. The three new gates.
{
  // "needs to be easy for non technicals to understand why this is important"
  if (!rules({ ...GOOD, the_opening: 'There is a repricing window for anyone selling agentic inference on frontier margins.' })
      .includes('legibility')) {
    bad('technical jargon in the claim passes the legibility gate')
  }
  // ... but jargon in the EVIDENCE is explicitly allowed.
  const evidenceJargon = { ...GOOD, what_changed: GOOD.what_changed + ' Token throughput per agentic run rose 1000x.' }
  if (rules(evidenceJargon).includes('legibility')) {
    bad('jargon in the evidence is being failed, but the brief allows it there')
  }
  // "a million people will do a linkedin post on this one"
  if (!rules(GOOD, { coverageDensity: SATURATION_LIMIT + 0.1 }).includes('saturation')) {
    bad('a saturated story is not being rejected')
  }
  if (rules(GOOD, { coverageDensity: SATURATION_LIMIT - 0.1 }).includes('saturation')) {
    bad('an uncrowded story is being rejected as saturated')
  }
  // An unmeasured story must not be failed on a measurement nobody took.
  if (rules(GOOD, {}).includes('saturation')) bad('a card with no coverage measurement is failed on saturation')
  // "it just feels like a crusade when I read it"
  if (!rules({ ...GOOD, headline: 'The predatory pricing here is simply appalling', the_opening: 'It is wrong that this is allowed to continue unchecked.', where_this_goes: 'By 2027 someone stops it.', reader_decision: 'Whether to say something.' })
      .includes('tone')) {
    bad('a claim made entirely of indignation passes the tone gate')
  }
  // Moral language ON TOP of a real claim is fine. Only a claim made OF moral
  // language fails, per "strip the framing and see whether a claim remains".
  if (rules({ ...GOOD, the_opening: "There is a repricing window, and the incumbents' pricing looks frankly predatory next to Cisco's 172x." })
      .includes('tone')) {
    bad('the tone gate is failing a real claim that happens to carry a judgement')
  }
}

// 6. Every mechanical rule fires on a card built to trip it, so a green run
//    means the rules ran rather than that nothing reached them.
{
  const cases: Array<[string, Partial<Card>]> = [
    ['no_em_dash', { why_now: 'Three buyers published this quarter, a first.'.replace(', a first', ' — a first') }],
    ['buzzword', { the_opening: 'There is a chance to unlock a new position here.' }],
    ['no_colon', { headline: 'The repricing: small models take the work' }],
    ['no_week_framing', { headline: 'The week that small models took the work' }],
    ['hedge_stack', { what_changed: 'Cisco may potentially begin to ship a 350M model. It beat GPT-5.5 in 2026.' }],
    ['risk_owner', { the_opening: 'There is a compliance angle worth owning here.' }],
    ['satisfiable_by_doing_nothing', { the_opening: 'There is a framework worth owning here.' }],
    ['banned_opener', { the_opening: 'Audit your model spend against the cheaper alternatives.' }],
  ]
  for (const [rule, patch] of cases) {
    if (!rules({ ...GOOD, ...patch }).includes(rule)) bad(`rule "${rule}" did not fire on a card built to trip it`)
  }
}

// 7. cardPasses agrees with lintCard, since callers will use the boolean.
{
  const empty = { headline: 'x', what_changed: '', why_now: '', the_opening: '', where_this_goes: '', reader_decision: '' }
  if (cardPasses(empty) !== (lintCard(empty).length === 0)) bad('cardPasses disagrees with lintCard')
}

console.log(fail === 0
  ? 'PASS  six fields, four gates, every historical so-what rejected, a correct card accepted'
  : `${fail} FAILURE(S)`)
process.exit(fail ? 1 : 0)
