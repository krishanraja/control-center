import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  parseLaneState, laneBody, laneReasoning, errorCode, decideLane, decisionSentence, isModelEvidence,
  recordLaneRow, shadowPaused, ACCOUNT_PAUSE_MS, MIN_SAMPLES, type LaneRow, type Agreement,
} from '../../api/_cheapLane.js'
import { judgmentAgreement, RANKING_FIELDS, type Judgment } from '../../api/_personEnrich.js'
import { CHEAP_LANE_CANDIDATES, type CheapLaneCandidate } from '../../api/_models.js'

// The cheap lane moves a bulk job off Claude only on evidence, and moves it
// back when the evidence turns. These tests are the rule, written down where a
// change to it fails a build.

const FIELDS = RANKING_FIELDS
const all = (v: boolean): Agreement => Object.fromEntries(FIELDS.map(f => [f, v]))
const except = (field: string): Agreement => ({ ...all(true), [field]: false })

/** n rows; `per` says how each candidate answered row i. */
function rows(n: number, per: (c: CheapLaneCandidate, i: number) => LaneRow['candidates'][CheapLaneCandidate], self?: (i: number) => Agreement | null): LaneRow[] {
  return Array.from({ length: n }, (_, i) => ({
    v: 1, agent: 'enrich-person',
    claude_self: self ? self(i) : all(true),
    candidates: Object.fromEntries(CHEAP_LANE_CANDIDATES.map(c => [c, per(c, i)])),
  }))
}

test('an agent nobody has decided yet is in shadow, so Claude still serves', () => {
  assert.equal(parseLaneState(null).mode, 'shadow')
  assert.equal(parseLaneState('not json').mode, 'shadow')
})

test('the kill switch is one hand-written row', () => {
  assert.equal(parseLaneState('{"mode":"off"}').mode, 'off')
})

test('"on" with nothing to serve reads as shadow, never as a request with no model', () => {
  const s = parseLaneState('{"mode":"on"}')
  assert.equal(s.mode, 'shadow')
  assert.equal(s.reason, 'on_without_primary')
})

test('a fallback equal to the primary is no fallback', () => {
  const s = parseLaneState(JSON.stringify({ mode: 'on', primary: 'openai/gpt-6-luna', fallback: 'openai/gpt-6-luna' }))
  assert.equal(s.fallback, null)
})

test('the lane only sends to hosts that do not keep data, and asks for the real cost', () => {
  const b = laneBody({ model: 'openai/gpt-6-luna', fallback: 'deepseek/deepseek-v4-flash', system: 's', user: 'u', maxTokens: 900 })
  assert.deepEqual(b.provider, { data_collection: 'deny' })
  assert.deepEqual(b.usage, { include: true })
  assert.deepEqual(b.models, ['openai/gpt-6-luna', 'deepseek/deepseek-v4-flash'])
  // No temperature: GPT-6 Luna takes none, and a sampling parameter is a 400 on that class.
  assert.equal('temperature' in b, false)
})

test('no candidate spends a bulk JSON budget thinking', () => {
  assert.deepEqual(laneReasoning('openai/gpt-6-luna'), { effort: 'none' })
  assert.deepEqual(laneReasoning('deepseek/deepseek-v4-flash'), { enabled: false })
  assert.deepEqual(laneReasoning('anthropic/claude-haiku-4.5'), { enabled: false })
})

test('provider errors become countable codes and carry no provider text', () => {
  assert.equal(errorCode(new Error('lane_429:Rate limit exceeded for key sk-or-abc')), 'lane_429')
  assert.equal(errorCode(new Error('lane_timeout_25000ms')), 'lane_timeout')
  assert.equal(errorCode(new Error('lane_unavailable:no_openrouter_key')), 'lane_unavailable')
  assert.equal(errorCode(new Error('lane_empty_response')), 'lane_empty_response')
  assert.equal(errorCode(new Error('fetch failed')), 'error')
})

test('a row where every candidate hit an account error is not evidence about the models', () => {
  const r: LaneRow = { v: 1, agent: 'enrich-person', claude_self: null, candidates: {
    'openai/gpt-6-luna': { ok: false, error: 'lane_unavailable' },
    'deepseek/deepseek-v4-flash': { ok: false, error: 'lane_402' },
  } }
  assert.equal(isModelEvidence(r), false)
  r.candidates['anthropic/claude-haiku-4.5'] = { ok: false, error: 'lane_timeout' }
  assert.equal(isModelEvidence(r), true)
})

test('a dead key rests shadow for a while instead of paying for comparisons that teach nothing', async () => {
  // Not recorded (so the lane is never rejected for a funding slip), and not
  // repeated on every enrichment either. Nothing here reaches the database:
  // a row that is not evidence returns before it.
  const refused: LaneRow = {
    v: 1, agent: 'enrich-person', claude_self: null,
    candidates: Object.fromEntries(CHEAP_LANE_CANDIDATES.map(c => [c, { ok: false, error: 'lane_402' }])),
  }
  const t0 = Date.parse('2026-10-03T10:00:00Z')
  assert.equal(shadowPaused('enrich-person', t0), false)
  await recordLaneRow('shadow', refused, t0)
  assert.equal(shadowPaused('enrich-person', t0 + 1), true)
  assert.equal(shadowPaused('enrich-person', t0 + ACCOUNT_PAUSE_MS - 1), true)
  // It comes back by itself.
  assert.equal(shadowPaused('enrich-person', t0 + ACCOUNT_PAUSE_MS + 1), false)
})

test('nothing is decided before every candidate has fifty rows', () => {
  const d = decideLane(rows(MIN_SAMPLES - 1, () => ({ ok: true, agree: all(true), usd: 0.0003 })), FIELDS)
  assert.equal(d.decision, 'wait')
})

test('the best agreeing candidate serves, and the fallback comes from another provider', () => {
  // All three agree everywhere, so the tie is broken on measured cost.
  const d = decideLane(rows(MIN_SAMPLES, c => ({
    ok: true,
    agree: all(true),
    usd: c === 'openai/gpt-6-luna' ? 0.0003 : c === 'deepseek/deepseek-v4-flash' ? 0.00005 : 0.003,
  })), FIELDS)
  assert.equal(d.decision, 'promote')
  if (d.decision !== 'promote') return
  // A three-way tie on agreement goes to the cheapest; the fallback must not
  // share its provider.
  assert.equal(d.primary, 'deepseek/deepseek-v4-flash')
  assert.ok(d.fallback && d.fallback.split('/')[0] !== 'deepseek')
})

test('one reply that does not parse is enough to fail a candidate', () => {
  const d = decideLane(rows(MIN_SAMPLES, (c, i) => (c === 'openai/gpt-6-luna' && i === 7
    ? { ok: false, error: 'unparseable' }
    : { ok: true, agree: all(true) })), FIELDS)
  const luna = d.stats.find(s => s.candidate === 'openai/gpt-6-luna')
  assert.equal(luna?.pass, false)
  assert.equal(luna?.why, 'not_every_reply_parsed')
})

test('a shift on roles alone fails, even when the average looks fine', () => {
  // The 2026-10-03 smoke test pattern: Claude labels introducer and partner,
  // the candidate labels operator_peer. Four fields agree, roles does not.
  const d = decideLane(rows(MIN_SAMPLES, (c, i) => ({
    ok: true,
    agree: c === 'openai/gpt-6-luna' && i % 2 === 0 ? except('roles') : all(true),
  }), i => (i % 10 === 0 ? except('roles') : all(true))), FIELDS)
  const luna = d.stats.find(s => s.candidate === 'openai/gpt-6-luna')
  assert.equal(luna?.overall, 0.9)
  assert.equal(luna?.pass, false)
  assert.equal(luna?.why, 'field_below_claude:roles')
})

test('a candidate as consistent with Claude as Claude is with itself passes, even under 90%', () => {
  // Claude agrees with itself 80% of the time on confidence: a candidate that
  // does the same is as good as a second Claude run, and the bar says so.
  const noisy = (i: number) => (i % 5 === 0 ? except('confidence') : all(true))
  const d = decideLane(rows(MIN_SAMPLES, () => ({ ok: true, agree: all(true) }), noisy), FIELDS)
  assert.equal(d.decision, 'promote')
})

test('when no candidate clears the bar, the lane says so and Claude keeps serving', () => {
  const d = decideLane(rows(MIN_SAMPLES, () => ({ ok: true, agree: except('roles') })), FIELDS)
  assert.equal(d.decision, 'reject')
  assert.match(decisionSentence('enrich-person', d), /stays on Claude/)
})

test('a drift check borrows the ceiling the promotion was judged against', () => {
  const drift = rows(MIN_SAMPLES, c => (c === 'openai/gpt-6-luna' ? { ok: true, agree: all(true) } : undefined), () => null)
  const ceiling = { overall: 0.86, fields: Object.fromEntries(FIELDS.map(f => [f, 0.86])) }
  const d = decideLane(drift, FIELDS, { minSamples: 0, ceiling })
  assert.equal(d.stats.find(s => s.candidate === 'openai/gpt-6-luna')?.pass, true)
})

test('judgments agree field by field, and roles as overlapping sets', () => {
  const base: Judgment = {
    who: 'w', why_them: 'y', hook: 'h', risk: 'r', roles: ['introducer', 'partner'], seniority: 'vp',
    best_channel: 'email', reachable_via: [], confidence: 'medium', sells_competing_services: false,
  }
  const same = judgmentAgreement(base, { ...base, roles: ['partner', 'introducer'] })
  assert.deepEqual(same, all(true))
  const shifted = judgmentAgreement(base, { ...base, roles: ['operator_peer', 'guest'], confidence: 'low' })
  assert.equal(shifted.roles, false)
  assert.equal(shifted.confidence, false)
  // Half the union shared is agreement.
  assert.equal(judgmentAgreement(base, { ...base, roles: ['partner'] }).roles, true)
  // An unanswered competitor verdict is compared as false, as the route writes it.
  assert.equal(judgmentAgreement(base, { ...base, sells_competing_services: undefined }).sells_competing_services, true)
})
