// Proves the C3 card lint against the engine's own historical output.
//
// The acceptance criterion is mechanical: "100 percent of surfaced cards pass
// C3 lint. This is mechanical, so anything below 100 is a bug." A lint that
// cannot be trusted turns that gate into theatre, so this checks the lint
// itself, and it checks it against the REAL so-whats the audit objected to
// rather than invented ones.
//
// The 17 shift_proposal so-whats in scripts/archive-review/rows_rich.json are
// the engine's actual 2026-W28 to W33 output. Every one of them must fail.
// 16 fail on the brief's enumerated banned openers; the 17th, "Build
// government-relations and compliance capacity now", needs the imperative-mood
// rule, which is exactly why that rule exists.
//
//   npx tsx scripts/check-card-lint.mts
import { readFileSync } from 'node:fs'
import { lintCard, cardPasses, type Card } from '../api/_cardLint.ts'

let fail = 0
const bad = (m: string) => { console.log('FAIL: ' + m); fail++ }

const rows = JSON.parse(readFileSync('scripts/archive-review/rows_rich.json', 'utf8')) as
  Array<{ kind: string; title: string; summary: string | null; implication: string | null }>
const historical = rows.filter(r => r.kind === 'shift_proposal' && r.implication)

// 1. Every historical so-what must fail. This is the whole point of C3.
{
  const survived: string[] = []
  for (const r of historical) {
    const card: Card = {
      headline: r.title,
      what_changed: r.summary || '',
      why_now: 'It became visible this week.',
      the_opening: r.implication || '',
    }
    const fs = lintCard(card).filter(f => f.field === 'the_opening')
    if (!fs.length) survived.push(r.implication!.slice(0, 80))
  }
  if (survived.length) {
    bad(`${survived.length} of ${historical.length} historical so-whats still pass the lint:`)
    for (const s of survived) console.log('        - ' + s)
  } else {
    console.log(`  all ${historical.length} historical so-whats rejected`)
  }
}

// 2. The imperative rule must be doing real work, not riding on the list.
{
  const c: Card = {
    headline: 'Governments claim pre-release veto power over frontier AI',
    what_changed: 'The US Commerce Department pulled two models offline for 18 days in June 2026. Illinois signed binding AI safety law.',
    why_now: 'Two separate governments acted inside the same fortnight.',
    the_opening: 'Build government-relations and compliance capacity now; review windows will affect your deployment timelines.',
  }
  const rules = lintCard(c).map(f => f.rule)
  if (!rules.includes('imperative_mood')) {
    bad('the one so-what the brief\'s banned list misses is still not caught by the imperative rule')
  }
}

// 3. A card written the way the brief asks must PASS. A lint that fails
//    everything is as useless as one that fails nothing.
{
  const good: Card = {
    headline: 'Small models are taking the work frontier models were priced for',
    what_changed: "Cisco's 350M-parameter model beats GPT-5.5 on security tasks at 172x lower cost. Microsoft swapped frontier models for its own MAI models inside Office and said cost was the reason. Bridgewater reported 84.7% accuracy from a tuned Qwen3 against roughly 50% from the frontier three.",
    why_now: 'Three buyers published cost comparisons in the same quarter, which had not happened before.',
    the_opening: 'There is a repricing window here for anyone selling per-seat AI features on frontier margins, and nobody has taken the cheap-and-good position in publishing yet.',
  }
  const fs = lintCard(good)
  if (fs.length) {
    bad('a card written to the brief still fails: ' + fs.map(f => `${f.field}/${f.rule} (${f.detail})`).join(', '))
  } else {
    console.log('  a correctly written card passes')
  }
}

// 4. Each mechanical rule fires on its own, so a green run means the rules ran
//    rather than that nothing reached them.
{
  const base: Card = {
    headline: 'Small models are taking work frontier models were priced for',
    what_changed: 'Cisco shipped a 350M model in 2026. It beat GPT-5.5 on security tasks.',
    why_now: 'Three buyers published cost comparisons this quarter.',
    the_opening: 'There is a repricing window nobody has taken in publishing yet.',
  }
  const cases: Array<[string, Partial<Card>]> = [
    ['no_em_dash', { why_now: 'Three buyers published this quarter — a first.' }],
    ['buzzword', { the_opening: 'There is a chance to unlock a new position here.' }],
    ['no_colon', { headline: 'The repricing: small models take the work' }],
    ['no_week_framing', { headline: 'The week that small models took the work' }],
    ['hedge_stack', { what_changed: 'Cisco may potentially begin to ship a 350M model. It beat GPT-5.5.' }],
    ['risk_owner', { the_opening: 'There is a compliance angle worth owning here.' }],
    ['satisfiable_by_doing_nothing', { the_opening: 'There is a framework worth owning here.' }],
    ['banned_opener', { the_opening: 'Audit your model spend against the cheaper alternatives.' }],
    ['imperative_mood', { the_opening: 'Rethink your per-seat pricing before the next renewal.' }],
  ]
  for (const [rule, patch] of cases) {
    const rules = lintCard({ ...base, ...patch }).map(f => f.rule)
    if (!rules.includes(rule)) bad(`rule "${rule}" did not fire on a card built to trip it`)
  }
}

// 5. cardPasses agrees with lintCard, since callers will use the boolean.
{
  const c: Card = { headline: 'x', what_changed: '', why_now: '', the_opening: '' }
  if (cardPasses(c) !== (lintCard(c).length === 0)) bad('cardPasses disagrees with lintCard')
}

console.log(fail === 0
  ? 'PASS  every historical so-what rejected, a correct card accepted, all rules firing'
  : `${fail} FAILURE(S)`)
process.exit(fail ? 1 : 0)
