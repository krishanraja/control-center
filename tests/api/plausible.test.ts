import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import { test } from 'node:test'
import { plausibleFacts, parsePlausibleResults } from '../../api/_plausible.js'

// The Plausible adapter is how mindmake.co gets a real visit count, since Google
// there only counts visitors who press Allow. These cases pin the v2 wire shape,
// the no-key path, a refused key, and that the key goes out in the header and
// never comes back in the answer. The fetch is injected per call; nothing here
// touches the network or globalThis.fetch.

const RANGE = { cur: ['2026-09-20', '2026-09-26'] as [string, string], prev: ['2026-09-13', '2026-09-19'] as [string, string] }

type Call = { url: string; headers: Record<string, string>; body: any }

function fakeFetch(answer: (body: any) => { status: number; json: unknown }, calls: Call[]): typeof fetch {
  return (async (url: string | URL | Request, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body ?? '{}'))
    calls.push({ url: String(url), headers: init?.headers as Record<string, string>, body })
    const a = answer(body)
    return new Response(JSON.stringify(a.json), { status: a.status, headers: { 'Content-Type': 'application/json' } })
  }) as typeof fetch
}

// A v2 answer as documented at plausible.io/docs/stats-api: results rows of
// { metrics, dimensions } plus meta and the echoed query.
function v2(body: any) {
  const dims: string[] = body.dimensions ?? []
  if (dims[0] === 'visit:source') return { results: [{ metrics: [31], dimensions: ['Google'] }], meta: {}, query: body }
  if (dims[0] === 'visit:entry_page') return { results: [{ metrics: [27], dimensions: ['/'] }], meta: {}, query: body }
  if (dims[0] === 'event:goal') return { results: [{ metrics: [4], dimensions: ['door_click'] }, { metrics: [1], dimensions: ['scoping_request'] }], meta: {}, query: body }
  if (body.date_range?.[0] === RANGE.prev[0]) return { results: [{ metrics: [40], dimensions: [] }], meta: {}, query: body }
  return { results: [{ metrics: [52, 61, 140], dimensions: [] }], meta: {}, query: body }
}

test('parsePlausibleResults reads the v2 results rows, metrics in the order asked', () => {
  const rows = parsePlausibleResults({
    results: [{ metrics: [99, '98', null], dimensions: ['Estonia', 'Tallinn'] }],
    meta: { imports_included: false }, query: { site_id: 'mindmake.co' },
  })
  assert.deepEqual(rows, [{ dimensions: ['Estonia', 'Tallinn'], metrics: [99, 98, 0] }])
  assert.deepEqual(parsePlausibleResults({}), [])
  assert.deepEqual(parsePlausibleResults(null), [])
})

test('no key gives null and makes no request', async () => {
  const calls: Call[] = []
  const saved = process.env.PLAUSIBLE_API_KEY
  delete process.env.PLAUSIBLE_API_KEY
  try {
    const r = await plausibleFacts('mindmake.co', RANGE, { fetchImpl: fakeFetch(b => ({ status: 200, json: v2(b) }), calls) })
    assert.equal(r, null)
    assert.equal(calls.length, 0)
    assert.equal(await plausibleFacts('mindmake.co', RANGE, { key: '   ', fetchImpl: fakeFetch(b => ({ status: 200, json: v2(b) }), calls) }), null)
  } finally {
    if (saved !== undefined) process.env.PLAUSIBLE_API_KEY = saved
  }
})

test('a 401 on the first query is ok:false with its status, and every count stays unknown', async () => {
  const calls: Call[] = []
  const r = await plausibleFacts('mindmake.co', RANGE, {
    key: randomBytes(16).toString('hex'),
    fetchImpl: fakeFetch(() => ({ status: 401, json: { error: 'Invalid API key or site ID.' } }), calls),
  })
  assert.ok(r)
  assert.equal(r.ok, false)
  assert.equal(r.status, 401)
  assert.match(String(r.error), /401/)
  assert.equal(r.visitsPrev7d, null)
  assert.equal(r.goals, null)
  assert.equal(calls.length, 1, 'stops after the first refusal')
})

test('the key goes out as Bearer and never comes back in the result', async () => {
  const key = `k${randomBytes(12).toString('hex')}`
  const calls: Call[] = []
  const r = await plausibleFacts('mindmake.co', RANGE, { key, fetchImpl: fakeFetch(b => ({ status: 200, json: v2(b) }), calls) })
  assert.ok(r)
  assert.equal(r.ok, true)
  assert.equal(calls.length, 5)
  for (const c of calls) {
    assert.equal(c.url, 'https://plausible.io/api/v2/query')
    assert.equal(c.headers.Authorization, `Bearer ${key}`)
    assert.equal(c.body.site_id, 'mindmake.co')
  }
  assert.deepEqual(r, {
    ok: true, status: 200, error: null, visitors7d: 52, visits7d: 61, pageviews7d: 140, visitsPrev7d: 40,
    topSource: 'Google', topPage: '/', goals: [{ name: 'door_click', events: 4 }, { name: 'scoping_request', events: 1 }],
  })
  assert.ok(!JSON.stringify(r).includes(key))

  // The request bodies are the documented v2 shape.
  const top = calls.find(c => c.body.dimensions?.[0] === 'visit:source')
  assert.deepEqual(top?.body, {
    site_id: 'mindmake.co', metrics: ['visits'], dimensions: ['visit:source'], order_by: [['visits', 'desc']],
    pagination: { limit: 1 }, date_range: RANGE.cur,
  })
  const goals = calls.find(c => c.body.dimensions?.[0] === 'event:goal')
  assert.deepEqual(goals?.body, { site_id: 'mindmake.co', metrics: ['events'], dimensions: ['event:goal'], date_range: RANGE.cur })
})

test('a refused key in an error never leaks, and an empty goal list means no goals are set', async () => {
  const key = `k${randomBytes(12).toString('hex')}`
  const calls: Call[] = []
  const r = await plausibleFacts('mindmake.co', RANGE, {
    key,
    fetchImpl: fakeFetch(b => {
      if (b.dimensions?.[0] === 'event:goal') return { status: 200, json: { results: [], meta: {}, query: b } }
      if (b.date_range?.[0] === RANGE.prev[0]) return { status: 500, json: { error: `boom Bearer ${key}` } }
      return { status: 200, json: v2(b) }
    }, calls),
  })
  assert.ok(r)
  assert.equal(r.ok, true)
  assert.deepEqual(r.goals, [])
  assert.equal(r.visitsPrev7d, null, 'a failed prev read is unknown, never 0')
  assert.ok(!JSON.stringify(r).includes(key))
})
