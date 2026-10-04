import test from 'node:test'
import assert from 'node:assert/strict'
import { readPaged, POSTGREST_MAX_ROWS, type PageResult } from '../../api/_paged.js'
import { rollUpUnits, meterTotals } from '../../api/_meter.js'
import { priceFamily, isPriced, priceUsdDetailed } from '../../api/_prices.js'

// A fake PostgREST: it honours range() but never returns more than `cap` rows
// per request, which is what this project's server does at 1,000 whatever
// limit() asks for. The meter window on 2026-10-04 held 1,408 rows.
function server<T>(table: T[], cap = POSTGREST_MAX_ROWS) {
  let requests = 0
  const page = async (from: number, to: number): Promise<PageResult<T>> => {
    requests++
    const end = Math.min(to + 1, from + cap)
    return { data: table.slice(from, end), error: null }
  }
  return { page, requests: () => requests }
}

const METER = Array.from({ length: 1408 }, (_, i) => ({
  provider: i % 3 === 0 ? 'apify' : 'anthropic',
  unit_kind: i % 3 === 0 ? 'actor' : 'agent',
  unit_key: `unit-${i % 7}`,
  // Newest first, as readUnits orders it: the oldest rows are the ones a
  // single capped request used to drop.
  day: `2026-09-${String(30 - Math.floor(i / 50)).padStart(2, '0')}`,
  bucket: '',
  unit_label: null,
  category: null,
  usd: 0.1,
  runs: 1,
  failed: 0,
  units: 1,
  unit_name: null,
}))

test('every row comes back, not the first 1,000', async () => {
  const s = server(METER)
  const { rows, error, truncated } = await readPaged(s.page)
  assert.equal(error, null)
  assert.equal(truncated, false)
  assert.equal(rows.length, 1408)
  // Two full pages, one short page, and the empty page that proves the end.
  assert.equal(s.requests(), 3)
})

test('a server cap below the page size still reads every row', async () => {
  // The case a short-page stop would get wrong: 500 back for 1,000 asked.
  const s = server(METER, 500)
  const { rows } = await readPaged(s.page)
  assert.equal(rows.length, 1408)
})

test('the ceiling is reported, not hidden', async () => {
  const { rows, truncated } = await readPaged(server(METER).page, { max: 1200 })
  assert.equal(rows.length, 1200)
  assert.equal(truncated, true)
})

test('an error comes back as an error', async () => {
  const { error } = await readPaged(async () => ({ data: null, error: { message: 'boom' } }))
  assert.equal(error, 'boom')
})

test('the 30-day roll-up sums the whole window', async () => {
  const { rows } = await readPaged(server(METER).page)
  const { total_usd, units } = rollUpUnits(rows, '2026-09-28')
  assert.equal(Math.round(total_usd * 100) / 100, 140.8)
  assert.equal(units.reduce((a, u) => a + u.runs, 0), 1408)
  // The oldest day is in it: the capped read stopped short of it.
  assert.ok(units.every(u => u.last_day === '2026-09-30'))
})

test('the meter line counts dollars from every provider and calls from all but n8n', () => {
  // The October shape: Anthropic and Apify dollars, n8n executions at $0.
  const t = meterTotals([
    { provider: 'anthropic', usd: 30.29, runs: 410 },
    { provider: 'apify', usd: '24.90', runs: 3100 },
    { provider: 'n8n', usd: 0, runs: 3985 },
    { provider: 'google', usd: 0, runs: 12 },
  ])
  assert.deepEqual(t, { usd: 55.19, calls: 3522 })
})

// ── 7. Prices match the exact model, or its dated snapshot ───────────────

test('claude-opus-5-5 prices as itself, not as claude-opus-5', () => {
  assert.equal(priceFamily('claude-opus-5-5'), 'claude-opus-5-5')
  assert.equal(priceFamily('claude-opus-5'), 'claude-opus-5')
  // $4/$20 with $0.20 cache reads (claude-api reference, cached 2026-09-25).
  const usd = priceUsdDetailed('claude-opus-5-5', { input: 1e6, output: 1e6, cacheRead: 1e6 })
  assert.equal(Math.round(usd * 100) / 100, 24.2)
})

test('a dated snapshot prices off its family', () => {
  assert.equal(priceFamily('claude-haiku-4-5-20251001'), 'claude-haiku-4-5')
})

test('a longer id that is not a snapshot stays unpriced', () => {
  // A model with no published row must read as a visible gap, never borrow
  // the nearest shorter key's rate.
  assert.equal(priceFamily('claude-opus-5-9'), null)
  assert.equal(isPriced('claude-sonnet-4-6-extended'), false)
  assert.equal(isPriced('constructor'), false)
  // claude-fable-5 has no stated cache-read rate in the reference, so no row.
  assert.equal(isPriced('claude-fable-5'), false)
})

test('the rows already in meter_daily keep their prices', () => {
  // The model ids meter_daily held on 2026-10-04.
  for (const m of ['claude-haiku-4-5', 'claude-haiku-4-5-20251001', 'claude-opus-5', 'claude-sonnet-4-6', 'claude-sonnet-5']) {
    assert.equal(isPriced(m), true, m)
  }
  assert.equal(isPriced('pinned-test'), false)
})
