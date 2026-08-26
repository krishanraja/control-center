// Guards G1 against naming an entity the sentence never credited.
//
// The terminal layer is the one thing the investigation pipeline promises to
// publish honestly, and G6 blocks any draft that does not carry it verbatim.
// So a wrong name in the rung-0 question does not get caught downstream: it
// ships under Krish's name.
//
// It shipped on 2026-08-13. a16z.news carried Stuut's figure that 81.7% of B2B
// collection emails are sent by AI, and the card published:
//
//   "how did an undenominated number from Andreessen Horowitz reach 5 outlets
//    across 10 days"
//
// The number is Stuut's. a16z is the outlet. classifyOrigin set
// `attributed: true` for every URL on a lexicon domain, conflating "this domain
// belongs to X" (certain, from the URL) with "this sentence credits X with this
// number" (not certain, and here false). The `hit` variable one line above was
// already the correct test and was being used for `origin` but not attribution.
//
// The honest fallback matters as much as the fix: with no attribution G1 asks
// "how did an undenominated vendor number reach N outlets ... without anyone
// naming who measured it", which is a better question than the wrong one.
//
//   npx tsx scripts/check-anchor-attribution.mts
import { classifyOrigin, gateAnchor } from '../api/_gates.ts'

let fail = 0
const bad = (m: string) => { console.log('FAIL: ' + m); fail++ }

const anchor = (url: string, sentence: string) => gateAnchor({
  ref: 'guard', headline: 'guard', url, numberSentence: sentence,
  loadBearingNumber: true, circulationDomains: 5, circulationWindowDays: 10,
})

// 1. The real card. A vendor domain relaying someone else's number must not
//    put the domain owner's name on it.
{
  const s = "Stuut's data shows 81.7% of B2B collection emails are now sent by AI."
  const o = classifyOrigin('https://www.a16z.news/p/what-it-takes-to-get-paid', s)
  if (o.attributed) bad('a sentence that never names a16z is still recorded as attributed to them')
  if (o.origin !== 'self_relayed') bad(`expected self_relayed for a relayed number, got ${o.origin}`)

  const q = anchor('https://www.a16z.news/p/what-it-takes-to-get-paid', s).rung0Question || ''
  if (/Andreessen Horowitz/i.test(q)) {
    bad('rung-0 question credits Andreessen Horowitz with a number the sentence gives to Stuut:\n        ' + q)
  }
  if (!/without anyone naming who measured it/.test(q)) {
    bad('unattributed vendor number lost its honest fallback question: ' + q)
  }
}

// 2. The case the old code was right about. When the sentence DOES name the
//    entity, attribution is real and the name must still be printed.
{
  const s = 'Andreessen Horowitz said its portfolio companies grew revenue 40% last year.'
  const o = classifyOrigin('https://www.a16z.news/p/travis-is-back', s)
  if (!o.attributed) bad('a sentence that names the vendor is no longer attributed to them')
  if (o.origin !== 'self') bad(`expected self when the vendor names itself, got ${o.origin}`)

  const q = anchor('https://www.a16z.news/p/travis-is-back', s).rung0Question || ''
  if (!/Andreessen Horowitz/.test(q)) bad('an attributed vendor number stopped naming the vendor: ' + q)
}

// 3. The vendor block itself must not have moved. Attribution decides whether a
//    NAME is printed; origin decides whether the number can be a rung-0 thesis.
//    Loosening the first must never loosen the second.
{
  const s = "Stuut's data shows 81.7% of B2B collection emails are now sent by AI."
  const r = anchor('https://www.a16z.news/p/what-it-takes-to-get-paid', s)
  if (r.thesisMode !== 'circulation') {
    bad(`an unattributed vendor-domain number stopped being blocked from a mechanism thesis (mode ${r.thesisMode})`)
  }
}

// 4. A non-lexicon domain is untouched by any of this.
{
  const o = classifyOrigin('https://www.cnbc.com/2026/08/17/anthropic-revenue.html',
    'Anthropic said annualized revenue climbed to $65 billion in July.')
  if (o.domainInLexicon) bad('cnbc.com is being treated as a vendor domain')
}

console.log(fail === 0
  ? 'PASS  a name is printed only where the sentence gives one, and the vendor block is unmoved'
  : `${fail} FAILURE(S)`)
process.exit(fail ? 1 : 0)
