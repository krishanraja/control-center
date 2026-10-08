import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readFileSync } from 'node:fs'
import { checkAction, DECLINE_REASONS } from '../../src/lib/hunterActions.ts'
import { nextBatchUtc } from '../../src/lib/hunterSchedule.ts'

// A press is checked before it is queued, and hunter writes column A from it,
// so a decline reason must be one column A offers, word for word.

test('a decline reason must be one hunter\'s column A offers, word for word', () => {
  const py = readFileSync(new URL('../../../hunter/src/hunter/verdicts.py', import.meta.url), 'utf8')
    .split('TASTE_CODES = {')[1]?.split('}')[0] ?? ''
  if (py) {
    const labels = [...py.matchAll(/:\s*"([^"]+)"/g)].map(m => m[1])
    assert.deepEqual([...DECLINE_REASONS], labels)
  }
  assert.ok('action' in checkAction({ kind: 'verdict', job_id: 'a:b', payload: { verdict: 'declined', reason: 'stage wrong' } }))
  assert.ok('error' in checkAction({ kind: 'verdict', job_id: 'a:b', payload: { verdict: 'declined', reason: 'meh' } }))
})

test('only the three kinds, and every press names a role', () => {
  assert.ok('action' in checkAction({ kind: 'verdict', job_id: 'a:b', payload: { verdict: 'yes' } }))
  assert.ok('action' in checkAction({ kind: 'prepare', job_id: 'a:b' }))
  assert.ok('action' in checkAction({ kind: 'outcome', job_id: 'a:b', payload: { outcome: 'interview' } }))
  assert.ok('error' in checkAction({ kind: 'submit', job_id: 'a:b' }))
  assert.ok('error' in checkAction({ kind: 'verdict', payload: { verdict: 'yes' } }))
  assert.ok('error' in checkAction({ kind: 'outcome', job_id: 'a:b', payload: { outcome: 'hired?' } }))
})

test('nothing in the act route can send, submit or post', () => {
  const src = readFileSync(new URL('../../api/hunter/act.ts', import.meta.url), 'utf8')
  assert.doesNotMatch(src, /sendEmail|sendMail|_google|submit\(/i)
})

test('the next batch is Sunday 13:00 London or Thursday 08:27 UTC', () => {
  // Thursday 8 October 2026, 15:00 UTC: next is Sunday 11 October, 13:00 BST = 12:00 UTC.
  assert.equal(nextBatchUtc(new Date('2026-10-08T15:00:00Z')), '2026-10-11T12:00:00.000Z')
  // Monday 12 October: next is Thursday 15 October 08:27 UTC.
  assert.equal(nextBatchUtc(new Date('2026-10-12T09:00:00Z')), '2026-10-15T08:27:00.000Z')
  // After the clocks go back (25 October), Sunday 13:00 London is 13:00 UTC.
  assert.equal(nextBatchUtc(new Date('2026-10-30T09:00:00Z')), '2026-11-01T13:00:00.000Z')
})
