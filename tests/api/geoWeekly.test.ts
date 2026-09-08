// The weekly pick.
//
// This runs unattended. A wrong choice is not a bad page once, it is a bad
// page every Monday until somebody notices, so the selection rule is worth
// more tests than its size suggests.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { chooseCandidate } from '../../api/geo/weekly.js'

const NOW = new Date('2026-09-08T08:00:00.000Z')

type Row = Record<string, any>

function idea(over: {
  id: string
  demand?: number
  why?: string | null
  product?: string
  created?: string
  staged?: boolean
  query?: string
}): Row {
  return {
    id: over.id,
    idea: `A page for ${over.id}`,
    created_at: over.created ?? '2026-09-07T10:00:00.000Z',
    meta: {
      aeo: {
        target_query: over.query ?? `question ${over.id}`,
        why_you_can_win: over.why === undefined ? 'A thing the cited sites structurally cannot have.' : over.why,
        demand: over.demand ?? 20,
        product_slug: over.product ?? 'ctrl',
      },
      ...(over.staged ? { geo: { staged_at: '2026-09-01T00:00:00.000Z', slug: 's' } } : {}),
    },
  }
}

test('picks the highest demand', () => {
  const pick = chooseCandidate([
    idea({ id: 'low', demand: 10 }),
    idea({ id: 'high', demand: 40 }),
    idea({ id: 'mid', demand: 25 }),
  ], NOW)
  assert.equal(pick?.id, 'high')
})

test('breaks a demand tie on freshness', () => {
  const pick = chooseCandidate([
    idea({ id: 'older', demand: 20, created: '2026-09-01T00:00:00.000Z' }),
    idea({ id: 'newer', demand: 20, created: '2026-09-07T00:00:00.000Z' }),
  ], NOW)
  assert.equal(pick?.id, 'newer')
})

test('a recommendation with no reason it can be won is not a candidate', () => {
  const pick = chooseCandidate([
    idea({ id: 'no-reason', demand: 90, why: null }),
    idea({ id: 'has-reason', demand: 10 }),
  ], NOW)
  assert.equal(pick?.id, 'has-reason', 'a page with nothing to argue must never be chosen over one that has an argument, however popular the question')
})

test('an empty reason counts as no reason', () => {
  const pick = chooseCandidate([idea({ id: 'blank', why: '   ' })], NOW)
  assert.equal(pick, null)
})

test('a page already staged is not written again', () => {
  const pick = chooseCandidate([
    idea({ id: 'done', demand: 90, staged: true }),
    idea({ id: 'todo', demand: 10 }),
  ], NOW)
  assert.equal(pick?.id, 'todo')
})

test('a subject with no site to publish to is skipped', () => {
  const pick = chooseCandidate([
    idea({ id: 'nowhere', demand: 90, product: 'legibility' }),
    idea({ id: 'somewhere', demand: 10, product: 'circle' }),
  ], NOW)
  assert.equal(pick?.id, 'somewhere', 'writing a page with nowhere to put it wastes the week')
})

test('a stale recommendation is not written, because the picture has moved', () => {
  const pick = chooseCandidate([
    idea({ id: 'stale', demand: 90, created: '2026-07-01T00:00:00.000Z' }),
    idea({ id: 'fresh', demand: 10 }),
  ], NOW)
  assert.equal(pick?.id, 'fresh')
})

test('nothing usable returns null rather than a bad pick', () => {
  assert.equal(chooseCandidate([], NOW), null)
  assert.equal(chooseCandidate([idea({ id: 'x', why: null })], NOW), null)
  assert.equal(chooseCandidate([{ id: 'junk', created_at: '2026-09-07T00:00:00.000Z', meta: {} }], NOW), null)
})

test('the pick carries what a reader needs to judge it', () => {
  const pick = chooseCandidate([idea({ id: 'a', demand: 33, query: 'How do I pick an AI tool?' })], NOW)
  assert.equal(pick?.target_query, 'How do I pick an AI tool?')
  assert.equal(pick?.demand, 33)
  assert.match(pick!.why, /structurally cannot have/)
  assert.equal(pick?.product_slug, 'ctrl')
})

test('every mapped venture is a valid destination', async () => {
  const { SITE_REPO } = await import('../../api/_geoRun.js')
  for (const slug of ['ctrl', 'circle', 'pulse', 'full-time', 'mindmake']) {
    assert.ok(SITE_REPO[slug], `${slug} must map to a site or its pages have nowhere to go`)
    assert.match(SITE_REPO[slug], /^krishanraja\/[a-z-]+$/)
  }
})
