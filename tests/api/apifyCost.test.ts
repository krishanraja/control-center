import test from 'node:test'
import assert from 'node:assert/strict'
import { loadPrices, quote, peopleWithin, money, type MeterRow } from '../../api/_apifyCost.js'

// These are the real numbers from the day this was written: a backfill ran on
// an estimate of $0.0013 per profile when the meter said $0.0090, and the posts
// actor at $0.0158 was never priced at all. The day came to $58 against a plan
// that includes $29, and the first honest signal was Apify's monthly hard limit
// tripping. The arithmetic below is what stops that being a guess again.
const ROWS: MeterRow[] = [
  { unit_label: 'dev_fusion/Linkedin-Profile-Scraper', usd: 31.84, runs: 3529, day: '2026-09-15' },
  { unit_label: 'harvestapi/linkedin-profile-posts', usd: 26.28, runs: 1666, day: '2026-09-15' },
  { unit_label: 'apify/web-scraper', usd: 0.05, runs: 2, day: '2026-09-15' },
]
const fetchRows = async () => ROWS

test('prices come from observed runs, not from a constant', async () => {
  const p = await loadPrices(fetchRows)
  const profile = p.get('dev_fusion/linkedin-profile-scraper')
  assert.ok(profile)
  assert.ok(Math.abs((profile as { usdPerRun: number }).usdPerRun - 0.00902) < 0.0001)
})

// The meter labels the actor with the capitalisation Apify reports, which is
// not the capitalisation in the registry. Matching on it exactly would silently
// price the most expensive actor at nothing.
test('actor lookup ignores the capitalisation Apify happens to use', async () => {
  const p = await loadPrices(fetchRows)
  assert.ok(p.get('DEV_FUSION/LINKEDIN-PROFILE-SCRAPER'))
  assert.ok(p.get('dev_fusion/linkedin-profile-scraper'))
})

test('a day with more runs weighs more than a day with fewer', async () => {
  const p = await loadPrices(async () => [
    { unit_label: 'a/b', usd: 100, runs: 10000, day: '2026-09-15' },  // $0.01
    { unit_label: 'a/b', usd: 1, runs: 1, day: '2026-09-14' },        // $1.00, one run
  ])
  const price = p.get('a/b')
  assert.ok(price)
  // Weighted by runs: ~$0.0101, nowhere near the $0.505 a naive mean would give.
  assert.ok((price as { usdPerRun: number }).usdPerRun < 0.02)
})

test('a quote sums every actor the run will invoke', async () => {
  const p = await loadPrices(fetchRows)
  const q = quote(p, 1000, ['dev_fusion/linkedin-profile-scraper', 'harvestapi/linkedin-profile-posts'])
  assert.equal(q.unpriced.length, 0)
  assert.equal(q.parts.length, 2)
  // About 2.5 cents a person, which is the number that was quoted as 0.3 cents.
  assert.ok(q.usdPerPerson > 0.024 && q.usdPerPerson < 0.026, `${q.usdPerPerson}`)
  assert.ok(q.usdTotal > 24 && q.usdTotal < 26)
})

// A total that silently omits an actor is exactly the failure this module
// exists to prevent, so an unknown actor is named rather than treated as free.
test('an unpriced actor is named, never counted as zero', async () => {
  const p = await loadPrices(fetchRows)
  const q = quote(p, 100, ['dev_fusion/linkedin-profile-scraper', 'some/brand-new-actor'])
  assert.deepEqual(q.unpriced, ['some/brand-new-actor'])
  assert.equal(q.parts.length, 1)
})

test('no meter data at all yields no price rather than a plausible one', async () => {
  const p = await loadPrices(async () => [])
  assert.equal(p.get('dev_fusion/linkedin-profile-scraper'), null)
  const q = quote(p, 500, ['dev_fusion/linkedin-profile-scraper'])
  assert.equal(q.usdTotal, 0)
  assert.equal(q.unpriced.length, 1)
})

// A ceiling that rounds up is not a ceiling.
test('the budget floors, so it is never exceeded', () => {
  assert.equal(peopleWithin(5, 0.0248), 201)      // 201 x 0.0248 = 4.98
  assert.equal(peopleWithin(5, 0.009), 555)       // 555 x 0.009  = 4.995
  assert.equal(peopleWithin(0, 0.009), 0)
  assert.equal(peopleWithin(5, 0), 0)
})

test('rows with no runs cannot divide by zero', async () => {
  const p = await loadPrices(async () => [{ unit_label: 'a/b', usd: 5, runs: 0, day: '2026-09-15' }])
  assert.equal(p.get('a/b'), null)
})

test('money reads as money at both scales', () => {
  assert.equal(money(0.009), '$0.0090')
  assert.equal(money(31.84), '$31.84')
})
