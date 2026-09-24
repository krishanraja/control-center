// Ranking a lane's ready pieces when the panel's standing cannot.
//
// On 2026-09-24 all 25 ready pieces stood at exactly 7, so a sort on the
// standing was a no-op and the lane listed them in arrival order. The order
// now comes from the marks underneath. Every spread below is copied from
// judge_verdicts for a real ready piece on that day, because a fixture written
// from imagination is how this repo keeps testing shapes the backend never
// writes.

import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  JUDGE_ASK, compareReady, judgeAsk, ladderVerdict, readyStanding,
  type JudgeScore, type LadderVerdict,
} from '../../src/lib/ladder.ts'

const ADVERSARIAL = new Set(['prosecutor'])
const DETERMINISTIC = new Set(['voice_mechanics', 'substance', 'duplicate'])

/** `judge=score` pairs, null for an abstention, as the view reports them. */
function marks(spread: Record<string, number | null>): JudgeScore[] {
  return Object.entries(spread).map(([judge, score]) => ({
    judge, score, adversarial: ADVERSARIAL.has(judge), deterministic: DETERMINISTIC.has(judge),
  }))
}

function verdict(weakest: string, score = 7, judgedAt = '2026-09-24T19:00:00Z'): LadderVerdict {
  const v = ladderVerdict({ meta: { ladder: {
    final: { band: 'ready', score, weakest }, judged_at: judgedAt, panel_run_id: 'x',
  } } })
  assert.ok(v)
  return v
}

// lift.the.lid, all three standing at 7.
const KOA = marks({ prosecutor: 3, novelty: 6, connection: 7, evidence: 7, fun: 7, consequence: 7, buyer: 7, reader: null, standing: null })
const DECISION_LAYER = marks({ consequence: 3, voice_mechanics: 4, prosecutor: 6, novelty: 6, connection: 7, evidence: 7, fun: 7, standing: 7, buyer: 7, reader: 7 })
const MUSE_TOGGLES = marks({ standing: 2, reader: 3, buyer: 3, voice_mechanics: 4, evidence: 7, consequence: 7, connection: 7, prosecutor: 7, novelty: 7, fun: 7 })

// split.the.bill, all three standing at 7.
const MUSE_PRICING = marks({ voice_mechanics: 4, prosecutor: 6, novelty: 7, reader: 7, evidence: 7, consequence: 7, standing: 7, fun: 8, connection: 8, buyer: 8 })
const INTERCOM = marks({ consequence: 3, prosecutor: 6, reader: 7, evidence: 7, novelty: 7, standing: 7, buyer: 8, connection: 8, fun: 8 })
const FRONTIER_PREMIUM = marks({ consequence: 3, voice_mechanics: 4, novelty: 6, standing: 6, fun: 7, evidence: 7, prosecutor: 7, reader: 7, buyer: 7, connection: 8 })

// mind.the.gap: the pair where praise and floor disagree, which is the case
// that decides the order of the two keys.
const MENU = marks({ prosecutor: 3, consequence: 3, novelty: 6, buyer: 7, evidence: 7, fun: 8, connection: 8, reader: 8, standing: 8 })
const APP_FUNNEL = marks({ prosecutor: 6, standing: 6, consequence: 7, evidence: 7, fun: 7, novelty: 7, reader: 7, buyer: 7, connection: 7 })

test('the prosecutor never sets the floor', () => {
  const s = readyStanding(KOA)
  assert.equal(s?.floor, 6)
  assert.equal(s?.floorJudge, 'novelty')
})

test('a deterministic check never sets the floor', () => {
  // The voice check gives a flat 4 whenever a rule trips. It says a rule broke,
  // not how good the piece is.
  const s = readyStanding(MUSE_PRICING)
  assert.equal(s?.floor, 7)
  assert.notEqual(s?.floorJudge, 'voice_mechanics')
})

test('an abstention is missing, never a zero', () => {
  const s = readyStanding(KOA)
  assert.notEqual(s?.floor, 0)
  assert.equal(s?.praised, 0)
})

test('praise counts only model judges at 8 or more', () => {
  assert.equal(readyStanding(MUSE_PRICING)?.praised, 3)
  assert.equal(readyStanding(FRONTIER_PREMIUM)?.praised, 1)
  assert.equal(readyStanding(marks({ prosecutor: 8, voice_mechanics: 4 })), null)
})

const rank = (pieces: Array<[string, string, JudgeScore[]]>) => pieces
  .map(([id, weakest, js]) => ({ id, verdict: verdict(weakest), standing: readyStanding(js) }))
  .sort(compareReady)
  .map(p => p.id)

test('all tied at 7: lift.the.lid ranks on its lowest model judge', () => {
  assert.deepEqual(
    rank([['decision-layer', 'consequence', DECISION_LAYER], ['muse-toggles', 'standing', MUSE_TOGGLES], ['koa', 'novelty', KOA]]),
    ['koa', 'decision-layer', 'muse-toggles'],
  )
})

test('all tied at 7: split.the.bill ranks on praise, then floor', () => {
  assert.deepEqual(
    rank([['frontier', 'consequence', FRONTIER_PREMIUM], ['intercom', 'consequence', INTERCOM], ['muse-pricing', 'voice_mechanics', MUSE_PRICING]]),
    ['muse-pricing', 'intercom', 'frontier'],
  )
})

test('praise outranks floor when they disagree', () => {
  // Four judges rating the menu piece 8 beats a piece nobody rated 8 whose
  // lowest mark is higher. consequence sits at 3 on 17 of 25 ready pieces, so
  // a floor-first order would mostly be ranking on one rubric.
  assert.deepEqual(
    rank([['app-funnel', 'standing', APP_FUNNEL], ['menu', 'consequence', MENU]]),
    ['menu', 'app-funnel'],
  )
})

test('the standing still comes first', () => {
  const eight = { verdict: verdict('fun', 8), standing: readyStanding(marks({ fun: 8 })) }
  const praisedSeven = { verdict: verdict('consequence', 7), standing: readyStanding(MUSE_PRICING) }
  assert.ok(compareReady(eight, praisedSeven) < 0)
})

test('a piece whose marks never arrived ranks after a marked one, never above', () => {
  const marked = { verdict: verdict('consequence'), standing: readyStanding(MUSE_TOGGLES) }
  const unread = { verdict: verdict('consequence', 7, '2026-09-24T20:00:00Z'), standing: null }
  assert.ok(compareReady(marked, unread) < 0)
})

test('every judge on the 2026-09-24 roster has words', () => {
  const roster = ['novelty', 'evidence', 'consequence', 'reader', 'buyer', 'connection', 'fun', 'standing',
    'prosecutor', 'voice_mechanics', 'substance', 'duplicate']
  for (const j of roster) assert.ok(JUDGE_ASK[j], `no words for ${j}`)
  assert.notEqual(judgeAsk('voice_mechanics'), judgeAsk(null))
})
