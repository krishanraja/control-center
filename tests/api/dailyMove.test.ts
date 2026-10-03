import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  parseDaily, parseChallenge, parseDecision, reorderMoves, challengeRecord, dueNow, localHour, stripWire,
  servedByFallback, CHALLENGER_LABEL,
} from '../../api/_dailyMove.js'
import {
  buildStrategistSystem, buildValidationCtx, renderGroundingText, suggestionRowsFor, readShapeFor,
  type StrategistGrounding, type OpenDraft,
} from '../../api/_strategist.js'
import type { StrategistRead } from '../../src/types/strategist.js'

// The daily move is the one read nobody asked for, so the rules that keep it
// honest have to hold without him there to catch them: it names nobody in the
// line that lands on his Today list, it points only at drafts that exist, and
// the card says exactly what the move survived.

const DRAFT: OpenDraft = {
  pilot_deal_id: '00000000-0000-4000-8000-00000000d001', contact_id: 'c-dana', full_name: 'Dana Clark',
  title: 'Agency partnerships lead', company: 'AdNorth', ask_kind: 'intro', ask_line: 'an intro to an agency leader',
  drafted_at: '2026-09-17T10:00:00Z',
}

function grounding(over: Partial<StrategistGrounding> = {}): StrategistGrounding {
  return {
    today: '2026-10-03', tz: 'America/New_York', week_start: '2026-09-28',
    subject: { source: 'daily' },
    canon: [{ id: 'goal:os:mission', title: 'Fill the pilots', horizon: 'os' }],
    today_picks: [],
    scorecard: null,
    stop_rule: { on: '2026-10-05', reads: 'Fewer than 2 of 25 take a call, or no paid pilot.' },
    pilot_deals: { drafted: 1 },
    today_ask: null,
    week_notes: [],
    last_week_close: null,
    previous_read: null,
    network_counts: null,
    candidates: [{
      contact_id: 'c-rowan', full_name: 'Rowan Jarvis', title: 'CEO', company: 'Brightline Software',
      network_tier: '2_core_network', roles: ['buyer'], who: null, hook: null, best_channel: 'linkedin',
    }],
    open_drafts: [DRAFT],
    ...over,
  }
}

const SYSTEM = buildStrategistSystem({ source: 'daily' })
const ctx = () => buildValidationCtx({ shape: 'daily', system: SYSTEM, grounding: grounding() })

const line = (o: Record<string, unknown>) => JSON.stringify(o)
const HEADLINE = line({ kind: 'headline', text: 'The stop rule reads in 2 days with no calls taken.', rule: 'slow_pay' })
const CLOSE = line({ kind: 'close', stop: 'By tonight the ask is sent.' })
const END = line({ kind: 'end' })

test('a daily read is its own shape, written from the morning state', () => {
  assert.equal(readShapeFor({ source: 'daily' }), 'daily')
  const text = renderGroundingText(grounding())
  assert.match(text, /THIS MORNING: he has said nothing yet/)
  assert.match(text, /OPEN DRAFTS/)
  // The draft's age is in the grounding, so the read may cite it.
  assert.match(text, /16 days ago/)
  // The draft body and any private judgement never reach the model.
  assert.doesNotMatch(text, /why_face|draft_body/)
})

test('a move that names its person is dropped: the line lands on a list the browser can read', () => {
  const v = parseDaily([
    HEADLINE,
    line({ kind: 'next_step', text: 'Send the drafted intro to Dana Clark today.', why: 'It has waited 16 days.', pilot_deal_id: DRAFT.pilot_deal_id }),
    CLOSE, END,
  ].join('\n'), ctx())
  assert.equal(v.complete, false)
  if (v.complete) return
  assert.ok(v.reasons.includes('dropped:next_step:name_in_move'))
})

test('a move about a draft takes the draft\'s person, whatever the line said', () => {
  const v = parseDaily([
    HEADLINE,
    line({ kind: 'next_step', text: 'Send the drafted intro to the agency partnerships lead.', why: 'It has waited 16 days.', pilot_deal_id: `deal:${DRAFT.pilot_deal_id}`, contact_id: 'c-rowan' }),
    CLOSE, END,
  ].join('\n'), ctx())
  assert.equal(v.complete, true)
  if (!v.complete) return
  assert.equal(v.read.next_steps[0].contact_id, 'c-dana')
  assert.equal(v.read.next_steps[0].pilot_deal_id, DRAFT.pilot_deal_id)
  assert.ok(v.notes.includes('contact_from_draft'))
})

test('a draft that does not exist and a person who is not warm are both refused', () => {
  const v = parseDaily([
    HEADLINE,
    line({ kind: 'next_step', text: 'Send the drafted intro.', why: 'It has waited 16 days.', pilot_deal_id: 'deal:nope' }),
    line({ kind: 'next_step', text: 'Ask the stranger for a call.', why: 'The stop rule reads in 2 days.', contact_id: 'c-cold' }),
    CLOSE, END,
  ].join('\n'), ctx())
  assert.equal(v.complete, false)
  if (v.complete) return
  assert.ok(v.reasons.includes('dropped:next_step:unknown_draft'))
  assert.ok(v.reasons.includes('dropped:next_step:unknown_contact'))
})

test('every move says why today', () => {
  const v = parseDaily([HEADLINE, line({ kind: 'next_step', text: 'Ask the buyer for a call.' }), CLOSE, END].join('\n'), ctx())
  assert.equal(v.complete, false)
  if (v.complete) return
  assert.ok(v.reasons.includes('dropped:next_step:missing_field:next_step.why'))
})

test('the bank row for each move carries its rank and what it is about', () => {
  const v = parseDaily([
    HEADLINE,
    line({ kind: 'next_step', text: 'Ask the buyer for a call before the stop rule reads.', why: 'No buyer call is booked and the read is in 2 days.', contact_id: 'c-rowan' }),
    line({ kind: 'next_step', text: 'Send the drafted intro to the agency partnerships lead.', why: 'It has waited 16 days.', pilot_deal_id: DRAFT.pilot_deal_id }),
    CLOSE, END,
  ].join('\n'), ctx())
  assert.equal(v.complete, true)
  if (!v.complete) return
  const rows = suggestionRowsFor(v.read, 'read-1', { model: 'claude-sonnet-5' })
  assert.equal(rows.length, 2)
  assert.deepEqual(
    rows.map(r => [(r.proposed as Record<string, unknown>).rank, (r.proposed as Record<string, unknown>).the_move]),
    [[1, true], [2, false]],
  )
  assert.equal((rows[1].proposed as Record<string, unknown>).pilot_deal_id, DRAFT.pilot_deal_id)
})

const READ: StrategistRead = {
  v: 1, shape: 'daily',
  headline: { kind: 'headline', text: 'h', rule: 'slow_pay', rule_n: 3, rule_chip: 'x' },
  heard: null, lenses: [], reframe: null, objectives: [], progress: [],
  next_steps: [
    { kind: 'next_step', text: 'one', goal_id: null, job: null, why: 'a' },
    { kind: 'next_step', text: 'two', goal_id: null, job: null, why: 'b' },
    { kind: 'next_step', text: 'three', goal_id: null, job: null, why: 'c' },
  ],
  asks: [], worry: null, kill: null, learning: null, close: { kind: 'close', stop: 's' },
}

test('the challenger may only prefer a move that exists, and may not invent a figure', () => {
  const src = 'the read is in 2 days, 16 days old'
  assert.deepEqual(parseChallenge('{"objection":"It adds a step.","prefer":2,"why":"A buyer call counts."}', 3, src),
    { objection: 'It adds a step.', prefer: 2, why: 'A buyer call counts.' })
  assert.equal(parseChallenge('{"objection":"x","prefer":4,"why":"y"}', 3, src), null)
  assert.equal(parseChallenge('{"objection":"Only 47 people replied.","prefer":2,"why":"y"}', 3, src), null)
  assert.equal(parseChallenge('not json', 3, src), null)
})

test('the decision is a word, so "switch" can never be misread as a rank', () => {
  // The dry run of 2026-10-03 answered {"keep":0} meaning "switch".
  assert.equal(parseDecision('{"keep":0,"why":"x"}', 2, ''), null)
  assert.deepEqual(parseDecision('{"choice":"switch","why":"A buyer call counts."}', 2, ''), { keep: 2, why: 'A buyer call counts.' })
  assert.deepEqual(parseDecision('```json\n{"choice":"keep","why":"The draft is warmer."}\n```', 3, ''), { keep: 1, why: 'The draft is warmer.' })
})

test('switching puts the preferred move first and keeps the others in order', () => {
  assert.deepEqual(reorderMoves(READ, 3).next_steps.map(m => m.text), ['three', 'one', 'two'])
  assert.deepEqual(reorderMoves(READ, 1).next_steps.map(m => m.text), ['one', 'two', 'three'])
})

test('the card says what the move survived, and says so when nothing challenged it', () => {
  assert.equal(challengeRecord(null, null, false).verdict, 'unchallenged')
  const c = { objection: 'It adds a step.', prefer: 2, why: 'A buyer call counts.' }
  assert.deepEqual(challengeRecord(c, { keep: 2, why: 'The buyer counts.' }, true),
    { verdict: 'switched', objection: 'It adds a step.', by: CHALLENGER_LABEL, why: 'The buyer counts.' })
  assert.equal(challengeRecord(c, { keep: 1, why: 'Warmer.' }, true).verdict, 'kept')
  // A decision that never came back keeps the move, and says that is why.
  assert.match(challengeRecord(c, null, false).why || '', /could not be weighed/)
  assert.equal(challengeRecord({ ...c, prefer: 1 }, null, false).verdict, 'kept')
})

test('the move is written from five in the morning in his zone, not in UTC', () => {
  // 09:30 UTC on 3 Oct 2026 is 05:30 in New York (EDT).
  assert.equal(localHour(new Date('2026-10-03T09:30:00Z'), 'America/New_York'), 5)
  assert.equal(dueNow(new Date('2026-10-03T09:30:00Z'), 'America/New_York'), true)
  assert.equal(dueNow(new Date('2026-10-03T08:30:00Z'), 'America/New_York'), false)
})

test('a person\'s details and a draft link are never stored with the read', () => {
  const wire: StrategistRead = {
    ...READ,
    next_steps: [{ ...READ.next_steps[0], person: { contact_id: 'c', name: 'n', title: null, company: null, best_channel: null, email: 'e@x.org' }, draft_url: 'https://mail.example/d/1' }],
  }
  const stored = stripWire(wire)
  assert.equal('person' in stored.next_steps[0], false)
  assert.equal('draft_url' in stored.next_steps[0], false)
})

test('a read another model wrote is stamped as that model, never as the decider', () => {
  assert.equal(servedByFallback('claude-sonnet-5'), false)
  // A dated snapshot of the decider is the decider.
  assert.equal(servedByFallback('claude-sonnet-5-20261001'), false)
  // A different model that merely starts the same way is not.
  assert.equal(servedByFallback('claude-sonnet-5-5'), true)
  assert.equal(servedByFallback('claude-opus-4-8'), true)
})
