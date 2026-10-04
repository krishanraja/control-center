// The Content tab's model of the engine (src/lib/contentModel.ts).
//
// The fixtures copy the shapes the live tables held on 2026-10-04 (SELECT
// only): lane null with lane_slot set on most rows, ladder bands ready /
// repairable / weak, fact_check {passed, blocking, ran_at, version}, "How sure
// we are: N%" inside the prediction section of the body, and the W39 / W40
// decisions with one "keep for good" piece offered in both weeks. A fixture
// written from imagination is how this repo keeps testing shapes the engine
// never writes.

import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  STAGES, byId, calendarDate, callSectionOf, cadenceWeekday, compareNewestFirst, displayThesis, factGateOf,
  howSureOf, pipeline, seriesOf, seriesWithSource, sortNewestFirst, stageOf, storedSeries, supersededDecisions,
  todaysCalls, weekSlots, withHowSure,
  type DecisionInput, type IdeaInput,
} from '../../src/lib/contentModel.ts'
import { SUBCHANNELS, type FormatDef } from '../../src/lib/formats.ts'

// ── fixtures ────────────────────────────────────────────────────────────────

const SUNDAY = new Date('2026-10-04T12:00:00Z')

function ladder(band: string, score: number, winner: string | null = null, judgedAt = '2026-10-04T05:00:00Z') {
  return {
    final: { band, score, weakest: 'consequence' },
    first: { band, score, weakest: 'consequence' },
    router: { winner, fits: {}, contested: [], why: 'x' },
    router_disagrees: false,
    expansion: { angle: 'An angle.', parties: [], scenarios: 0, decision_rule: false, known: 0, inferred: 0 },
    attempts: [],
    panel_run_id: 'run-1',
    judged_at: judgedAt,
    roster_version: 'panel-v2',
  }
}

const PASSED = { passed: true, blocking: 0, ran_at: '2026-10-04T00:15:58Z', version: 1, body_hash: 'h', independent_checker: 'perplexity' }

/** A body long enough to be a real draft, with its prediction in the
 *  heading form piece 2 uses. */
function draftBody(howSure: string): string {
  return [
    'The lease bill arrives before the revenue does. '.repeat(6).trim(),
    '',
    '## OUR PREDICTION',
    'By 30 June 2027, at least two of the large labs will report lease costs above their AI revenue.',
    '',
    `How sure we are: ${howSure}`,
    '',
  ].join('\n')
}

let n = 0
function idea(o: Partial<IdeaInput> & { id?: string }): IdeaInput {
  n += 1
  return {
    id: o.id ?? `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`,
    idea: o.idea ?? `Piece ${n}`,
    state: o.state ?? 'seeded',
    lane: o.lane ?? null,
    lane_slot: o.lane_slot ?? null,
    meta: o.meta ?? null,
    body: o.body ?? null,
    thesis: o.thesis ?? null,
    buried_at: o.buried_at ?? null,
    library_at: o.library_at ?? null,
    scheduled_for: o.scheduled_for ?? null,
    published_at: o.published_at ?? null,
    created_at: o.created_at ?? '2026-10-01T10:00:00Z',
    updated_at: o.updated_at ?? '2026-10-04T01:00:00Z',
    related_idea_ids: o.related_idea_ids ?? null,
    parent_idea_id: o.parent_idea_id ?? null,
  }
}

/** A deterministic shuffle, so "any order" is tested without flakiness. */
function shuffled<T>(xs: readonly T[], seed: number): T[] {
  const out = [...xs]
  let s = seed
  for (let i = out.length - 1; i > 0; i--) {
    s = (s * 1103515245 + 12345) % 2147483648
    const j = s % (i + 1)
    ;[out[i], out[j]] = [out[j]!, out[i]!]
  }
  return out
}

// ── the series ──────────────────────────────────────────────────────────────

test('lane_slot is the series even when lane is null (151 of 154 live rows)', () => {
  assert.equal(seriesOf({ lane: null, lane_slot: 'mind_the_gap' }), 'mind_the_gap')
  assert.equal(seriesOf({ lane: 'publication', lane_slot: 'follow_the_money' }), 'follow_the_money')
  assert.equal(storedSeries(null, 'under_the_hood'), 'under_the_hood')
})

test('retired spellings resolve through the rename ledger, never a second map', () => {
  assert.equal(storedSeries(null, 'built_with_ai'), 'under_the_hood')
  assert.equal(storedSeries(null, 'paid'), 'follow_the_money')
  // A retired venture name in the lane column, from before the slot carried it.
  assert.equal(storedSeries('built', null), 'under_the_hood')
  // The holding lane and an unknown value are not series.
  assert.equal(storedSeries(null, 'general'), null)
  assert.equal(storedSeries('publication', null), null)
})

test('with nothing stored, the judges\' router names the series, and says so', () => {
  const row = { lane: null, lane_slot: null, meta: { ladder: ladder('ready', 7, 'under_the_hood') } }
  assert.deepEqual(seriesWithSource(row), { series: 'under_the_hood', source: 'judges' })
  // A stored series always wins over the router, as on the decide card.
  const disagree = { lane: null, lane_slot: 'mind_the_gap', meta: { ladder: ladder('repairable', 6, 'under_the_hood') } }
  assert.deepEqual(seriesWithSource(disagree), { series: 'mind_the_gap', source: 'stored' })
  assert.deepEqual(seriesWithSource({ lane: null, lane_slot: null, meta: null }), { series: null, source: null })
})

// ── what may be shown ───────────────────────────────────────────────────────

test('a summary the source cut off is hidden, never shown broken', () => {
  // The live row e6e0512f, a pool headline, ends exactly like this.
  assert.equal(displayThesis({ thesis: 'The model ships to paying customers first. Availability: Not gen...' }), null)
  assert.equal(displayThesis({ thesis: 'It stops mid-thought…' }), null)
  assert.equal(displayThesis({ thesis: 'A quote that trails off..."' }), null)
  assert.equal(displayThesis({ thesis: '  A whole sentence.  ' }), 'A whole sentence.')
  // Three dots in the middle are punctuation, not a cut.
  assert.equal(displayThesis({ thesis: 'Wait... it gets better.' }), 'Wait... it gets better.')
  assert.equal(displayThesis({ thesis: null }), null)
  assert.equal(displayThesis({ thesis: '   ' }), null)
})

// ── stable order ────────────────────────────────────────────────────────────

test('newest first with an id tie-break gives one order whatever order rows arrive in', () => {
  // Seven live ideas shared one created_at to the microsecond on 2026-10-03.
  const same = '2026-10-03T11:30:28.283173Z'
  const rows = ['c', 'a', 'g', 'e', 'b', 'f', 'd'].map(id => ({ id, created_at: same }))
    .concat([{ id: 'z', created_at: '2026-10-04T00:00:00Z' }, { id: 'y', created_at: '2026-09-30T00:00:00Z' }])
  const expected = ['z', 'a', 'b', 'c', 'd', 'e', 'f', 'g', 'y']
  for (let seed = 1; seed < 8; seed++) {
    assert.deepEqual(sortNewestFirst(shuffled(rows, seed)).map(r => r.id), expected)
  }
  assert.equal(compareNewestFirst({ id: 'a', created_at: same }, { id: 'a', created_at: same }), 0)
  assert.equal(byId({ id: 'a' }, { id: 'b' }), -1)
})

// ── how sure we are ─────────────────────────────────────────────────────────

test('reads how sure we are from the prediction section, as the publish check does', () => {
  assert.deepEqual(howSureOf(draftBody('[Krish to set].')), { state: 'unset' })
  assert.deepEqual(howSureOf(draftBody('70%.')), { state: 'set', percent: 70 })
  // Piece 1's form: one bold-labelled paragraph ending "Confidence: 70%."
  const call = 'Body text.\n\n**The Call.** By 30 June 2027, two labs will report it. Confidence: 70%.\n'
  assert.deepEqual(howSureOf(call), { state: 'set', percent: 70 })
  // No prediction section at all is the writer's job, not his number.
  assert.deepEqual(howSureOf('Just an essay with no prediction.'), { state: 'missing' })
  assert.deepEqual(howSureOf(null), { state: 'missing' })
  // A number the publish check would refuse still needs his call.
  assert.deepEqual(howSureOf(draftBody('62.5%')), { state: 'unset' })
  assert.deepEqual(howSureOf(draftBody('100%')), { state: 'unset' })
  assert.equal(callSectionOf(draftBody('70%'))?.includes('How sure we are: 70%'), true)
})

test('setting how sure changes only the number, so a passed fact check stays passed', () => {
  const before = draftBody('[Krish to set].')
  const r = withHowSure(before, 75)
  assert.equal(r.ok, true)
  if (r.ok === false) return
  assert.match(r.body, /How sure we are: 75%\./)
  assert.equal(r.body.replace('75%', '[Krish to set]'), before)
  assert.deepEqual(howSureOf(r.body), { state: 'set', percent: 75 })

  // Re-setting a number keeps everything else, and the spacing as written.
  const tight = 'Intro.\n\n**The Call.** By 1 May 2027, it happens. Confidence:[Krish to set].\n'
  const t = withHowSure(tight, 40)
  assert.equal(t.ok && t.body, 'Intro.\n\n**The Call.** By 1 May 2027, it happens. Confidence:40%.\n')

  // A labelled number outside the prediction is a fact in the piece, not his.
  const outside = 'Consumer confidence: 62% in August.\n\n## OUR PREDICTION\nBy 1 May 2027, X.\n\nHow sure we are: 50%\n'
  const o = withHowSure(outside, 65)
  assert.equal(o.ok && o.body.startsWith('Consumer confidence: 62% in August.'), true)
  assert.equal(o.ok && o.body.includes('How sure we are: 65%'), true)
})

test('setting how sure refuses what the publish check would refuse', () => {
  for (const bad of [0, 100, 7.5, -1, Number.NaN]) {
    assert.equal(withHowSure(draftBody('[Krish to set]'), bad).ok, false)
  }
  assert.equal(withHowSure('No prediction here.', 70).ok, false)
  assert.equal(withHowSure('## OUR PREDICTION\nBy 1 May 2027, X, with no label.\n', 70).ok, false)
})

// ── stages ──────────────────────────────────────────────────────────────────

test('every state maps to a stage of the engine\'s flow, or off the board', () => {
  const real = draftBody('70%')
  assert.equal(stageOf(idea({ state: 'published' })), 'out')
  assert.equal(stageOf(idea({ state: 'dropped' })), null)
  assert.equal(stageOf(idea({ state: 'absorbed' })), null)
  assert.equal(stageOf(idea({ state: 'seeded', buried_at: '2026-10-01T00:00:00Z', meta: { ladder: ladder('ready', 7) } })), null)
  assert.equal(stageOf(idea({ state: 'seeded', library_at: '2026-10-01T00:00:00Z' })), null)
  assert.equal(stageOf(idea({ state: 'approved', body: real, meta: { fact_check: PASSED } })), 'ready_to_go')

  assert.equal(stageOf(idea({ state: 'seeded' })), 'found')
  assert.equal(stageOf(idea({ state: 'seeded', meta: { ladder: ladder('ready', 7) } })), 'judged_ready')
  assert.equal(stageOf(idea({ state: 'researching', meta: { ladder: ladder('repairable', 6) } })), 'needs_work')
  assert.equal(stageOf(idea({ state: 'seeded', meta: { ladder: ladder('weak', 3) } })), 'weak')

  assert.equal(stageOf(idea({ state: 'drafting', body: 'Too short to be a draft.' })), 'writing')
  // The three live drafts: real bodies, no fact check yet.
  assert.equal(stageOf(idea({ state: 'drafting', body: real })), 'fact_check')
  assert.equal(stageOf(idea({ state: 'drafting', body: real, meta: { fact_check: PASSED } })), 'your_call')
  assert.equal(stageOf(idea({ state: 'review', body: real, meta: { fact_check: PASSED } })), 'your_call')
})

test('the engine\'s gate read outranks the stored result, which may be of older words', () => {
  const row = idea({ state: 'review', body: draftBody('70%'), meta: { fact_check: PASSED } })
  assert.equal(stageOf(row, { ok: false, reason: 'The words changed after the fact check.' }), 'fact_check')
  assert.equal(stageOf(row, { ok: true }), 'your_call')
  assert.deepEqual(factGateOf(row), { ok: true, known: false, ran: true })
  assert.deepEqual(factGateOf(row, { ok: false }), { ok: false, known: true, ran: true })
  assert.deepEqual(factGateOf(idea({ state: 'drafting' })), { ok: false, known: false, ran: false })
})

// ── the pipeline ────────────────────────────────────────────────────────────

const LIVE: IdeaInput[] = [
  // In flight, one per series as on 2026-10-04.
  idea({ id: 'a1', idea: 'Salesforce built Koa', state: 'approved', lane_slot: 'under_the_hood', body: draftBody('55%.'), meta: { fact_check: PASSED, ladder: ladder('ready', 7) } }),
  idea({ id: 'a2', idea: 'Every AI lab now sells a menu', state: 'approved', lane_slot: 'mind_the_gap', body: draftBody('75%.'), meta: { fact_check: PASSED, ladder: ladder('ready', 7) } }),
  idea({ id: 'r1', idea: 'Same agent, opposite answers', state: 'review', lane_slot: 'follow_the_money', body: draftBody('70%.'), meta: { fact_check: PASSED, ladder: ladder('ready', 8) } }),
  idea({ id: 'd1', idea: 'The lease bill arrives first', state: 'drafting', lane: 'publication', lane_slot: 'follow_the_money', body: draftBody('62%'), meta: { ladder: ladder('ready', 8) } }),
  idea({ id: 'd2', idea: 'The AI workforce already exists', state: 'drafting', lane: 'publication', lane_slot: 'mind_the_gap', body: draftBody('64%'), meta: { ladder: ladder('ready', 7) } }),
  idea({ id: 'd3', idea: 'ChatGPT Agent against Copilot Studio', state: 'drafting', lane: 'publication', lane_slot: 'under_the_hood', body: draftBody('[Krish to set]'), meta: { ladder: ladder('weak', 4) } }),
  // The pile.
  idea({ id: 'p1', state: 'researching', lane_slot: 'mind_the_gap', meta: { ladder: ladder('ready', 7, 'mind_the_gap', '2026-10-04T05:00:00Z') }, created_at: '2026-10-02T10:00:00Z' }),
  idea({ id: 'p2', state: 'seeded', lane_slot: 'mind_the_gap', meta: { ladder: ladder('ready', 7, 'mind_the_gap', '2026-10-04T05:00:00Z') }, created_at: '2026-10-03T10:00:00Z' }),
  idea({ id: 'p3', state: 'seeded', lane_slot: 'mind_the_gap', meta: { ladder: ladder('ready', 8, 'mind_the_gap', '2026-10-03T05:00:00Z') } }),
  idea({ id: 'p4', state: 'seeded', lane_slot: 'mind_the_gap', meta: { ladder: ladder('ready', 7, 'mind_the_gap', '2026-10-03T05:00:00Z') } }),
  idea({ id: 'p5', state: 'seeded', lane_slot: null, meta: { ladder: ladder('ready', 7, 'under_the_hood') } }),
  idea({ id: 'p6', state: 'seeded', lane_slot: 'follow_the_money', meta: { ladder: ladder('repairable', 6) } }),
  idea({ id: 'p7', state: 'seeded', lane_slot: null, meta: { ladder: ladder('weak', 3) } }),
  idea({ id: 'p8', state: 'seeded' }),
  // Off the board.
  idea({ id: 'x1', state: 'dropped' }),
  idea({ id: 'x2', state: 'review', lane: 'publication', buried_at: '2026-09-23T10:00:00Z' }),
]

test('the pipeline counts each piece once, per stage and per series', () => {
  const p = pipeline(LIVE)
  assert.equal(p.total, 14)
  assert.equal(p.off, 2)
  assert.deepEqual(p.byStage, {
    found: 1, judged_ready: 5, needs_work: 1, weak: 1, writing: 0, fact_check: 3, your_call: 1, ready_to_go: 2, out: 0,
  })
  assert.equal(p.bySeries.mind_the_gap!.judged_ready, 4)
  assert.equal(p.bySeries.under_the_hood!.judged_ready, 1) // p5, by the judges' router
  assert.equal(p.bySeries.follow_the_money!.your_call, 1)
  assert.equal(p.bySeries.none!.weak, 1)
  assert.equal(p.bySeries.none!.found, 1)
  // Every stage is present in every bucket, zeros included.
  for (const counts of Object.values(p.bySeries)) assert.deepEqual(Object.keys(counts), [...STAGES])
})

test('the pipeline is the same whatever order the rows arrive in', () => {
  const first = pipeline(LIVE)
  for (let seed = 1; seed < 6; seed++) assert.deepEqual(pipeline(shuffled(LIVE, seed)), first)
})

test('a series with nothing in it still reads as zero rather than missing', () => {
  const p = pipeline([])
  for (const f of SUBCHANNELS) assert.ok(p.bySeries[f.slug])
  assert.equal(p.total, 0)
})

// ── the week's slots ────────────────────────────────────────────────────────

test('cadence words become weekdays, from the table\'s own wording', () => {
  assert.equal(cadenceWeekday('Mondays'), 1)
  assert.equal(cadenceWeekday('Wednesdays'), 3)
  assert.equal(cadenceWeekday('Fridays'), 5)
  assert.equal(cadenceWeekday('No cadence'), null)
  assert.equal(cadenceWeekday('retired 2026-09-17'), null)
})

test('the coming Monday, Wednesday and Friday, today included', () => {
  const slots = weekSlots([], SUBCHANNELS, SUNDAY)
  assert.deepEqual(slots.map(s => [s.series, s.weekday, s.date]), [
    ['under_the_hood', 'Monday', '2026-10-05'],
    ['follow_the_money', 'Wednesday', '2026-10-07'],
    ['mind_the_gap', 'Friday', '2026-10-09'],
  ])
  // On a Monday, Monday's slot is today.
  const monday = weekSlots([], SUBCHANNELS, new Date('2026-10-05T08:00:00Z'))
  assert.equal(monday.find(s => s.series === 'under_the_hood')!.date, '2026-10-05')
  assert.equal(monday.find(s => s.series === 'mind_the_gap')!.date, '2026-10-09')
})

test('the day is his day: a time zone moves the date', () => {
  const lateSunday = new Date('2026-10-04T23:30:00Z')
  assert.equal(calendarDate(lateSunday), '2026-10-04')
  assert.equal(calendarDate(lateSunday, 'Australia/Brisbane'), '2026-10-05')
  const slots = weekSlots([], SUBCHANNELS, lateSunday, { timeZone: 'Australia/Brisbane' })
  assert.equal(slots[0]!.date, '2026-10-05')
  // An unknown zone falls back to UTC rather than throwing.
  assert.equal(calendarDate(lateSunday, 'Not/AZone'), '2026-10-04')
})

test('each slot names its picked piece: furthest along first, an exact date beating all', () => {
  const slots = weekSlots(LIVE, SUBCHANNELS, SUNDAY)
  const by = Object.fromEntries(slots.map(s => [s.series, s]))
  assert.equal(by.under_the_hood!.picked?.id, 'a1')
  assert.equal(by.under_the_hood!.queued, 1) // d3 waits for a later week
  assert.equal(by.follow_the_money!.picked?.id, 'r1') // review beats drafting
  assert.equal(by.mind_the_gap!.picked?.id, 'a2')

  const dated = [
    ...LIVE,
    idea({ id: 'dd', state: 'drafting', lane_slot: 'follow_the_money', body: draftBody('50%'), scheduled_for: '2026-10-07' }),
    idea({ id: 'later', state: 'approved', lane_slot: 'follow_the_money', body: draftBody('50%'), scheduled_for: '2026-10-14' }),
  ]
  const ftm = weekSlots(dated, SUBCHANNELS, SUNDAY).find(s => s.series === 'follow_the_money')!
  assert.equal(ftm.picked?.id, 'dd')
  // A piece scheduled for another day belongs to that day, not this slot.
  assert.equal(ftm.queued, 2)
})

test('the top three ready candidates come in one order, by score then newest verdict', () => {
  const mtg = weekSlots(LIVE, SUBCHANNELS, SUNDAY).find(s => s.series === 'mind_the_gap')!
  assert.equal(mtg.readyCount, 4)
  // p3 scores 8. p1 and p2 share a score and a verdict time, so the newer
  // piece leads; p4's verdict is a day older.
  assert.deepEqual(mtg.candidates.map(c => c.id), ['p3', 'p2', 'p1'])
  for (let seed = 1; seed < 8; seed++) {
    const again = weekSlots(shuffled(LIVE, seed), SUBCHANNELS, SUNDAY)
    assert.deepEqual(again, weekSlots(LIVE, SUBCHANNELS, SUNDAY))
  }
  // A judged-ready piece with no stored series is a candidate for the series
  // the judges routed it to.
  const uth = weekSlots(LIVE, SUBCHANNELS, SUNDAY).find(s => s.series === 'under_the_hood')!
  assert.deepEqual(uth.candidates.map(c => c.id), ['p5'])
})

test('candidates equal on every key but the id still come back in one order', () => {
  // Seven live ideas shared a created_at to the microsecond on 2026-10-03,
  // and the sweep stamps one judged_at per run.
  const twins = ['c3', 'a1', 'b2', 'd4'].map(id => idea({
    id, state: 'seeded', lane_slot: 'follow_the_money', created_at: '2026-10-03T11:30:28.283173Z',
    meta: { ladder: ladder('ready', 7, 'follow_the_money', '2026-10-04T05:00:00Z') },
  }))
  const expected = ['a1', 'b2', 'c3']
  for (let seed = 1; seed < 10; seed++) {
    const ftm = weekSlots(shuffled(twins, seed), SUBCHANNELS, SUNDAY).find(s => s.series === 'follow_the_money')!
    assert.deepEqual(ftm.candidates.map(c => c.id), expected)
  }
})

test('a ready piece that an approved piece was built from is not offered again', () => {
  // The live Koa case: the approved piece lists the later pool headline with
  // the same title among its related ideas, and that headline was judged
  // ready on its own.
  const approved = idea({ id: 'koa', state: 'approved', lane_slot: 'under_the_hood', body: draftBody('55%'), related_idea_ids: ['koa-headline', 'other'] })
  const headline = idea({ id: 'koa-headline', state: 'seeded', lane_slot: null, meta: { ladder: ladder('ready', 7, 'under_the_hood') } })
  const parent = idea({ id: 'parent', state: 'researching', lane_slot: 'under_the_hood', meta: { ladder: ladder('ready', 7) } })
  const child = idea({ id: 'child', state: 'drafting', lane_slot: 'under_the_hood', body: draftBody('50%'), parent_idea_id: 'parent' })
  const fresh = idea({ id: 'fresh', state: 'seeded', lane_slot: 'under_the_hood', meta: { ladder: ladder('ready', 7) } })
  const uth = weekSlots([approved, headline, parent, child, fresh], SUBCHANNELS, SUNDAY).find(s => s.series === 'under_the_hood')!
  assert.deepEqual(uth.candidates.map(c => c.id), ['fresh'])
  assert.equal(uth.readyCount, 1)
})

test('a format with no fixed weekday gets no slot', () => {
  const formats: FormatDef[] = [
    ...SUBCHANNELS,
    { slug: 'general', label: 'general', cadence_label: 'No cadence', target_per_week: 0, hero: false, gear: null, sort_order: 90, kind: 'holding' },
  ]
  assert.equal(weekSlots([], formats, SUNDAY).length, 3)
})

// ── the weekly decisions ────────────────────────────────────────────────────

const decision = (id: string, week: string, kind: string, ref: string, created = `${week}-c`, payload: Record<string, unknown> = {}): DecisionInput =>
  ({ id, week, kind, ref, status: 'pending', created_at: created, payload })

// The live pending set on 2026-10-04.
const PENDING: DecisionInput[] = [
  decision('b39', '2026-W39', 'brief_review', 'brief-39'),
  decision('g39a', '2026-W39', 'graduation', '4ea8d1c7', '2026-09-25T18:02:23.289Z', { title: 'Levie on agents' }),
  decision('g39b', '2026-W39', 'graduation', '4d856efd', '2026-09-25T18:02:23.521Z', { title: 'Old piece B' }),
  decision('g39c', '2026-W39', 'graduation', 'fab5d174', '2026-09-25T18:02:23.405Z', { title: 'Old piece C' }),
  decision('b40', '2026-W40', 'brief_review', 'brief-40'),
  decision('g40a', '2026-W40', 'graduation', '9bc8a215', '2026-10-02T18:03:55.362Z', { title: 'New piece A' }),
  decision('g40b', '2026-W40', 'graduation', '4ea8d1c7', '2026-10-02T18:03:55.756Z', { title: 'Levie on agents' }),
  decision('g40c', '2026-W40', 'graduation', 'a9ef9249', '2026-10-02T18:03:55.638Z', { title: 'New piece C' }),
  decision('pp40', '2026-W40', 'purge_preview', 'brief-40', '2026-10-02T18:03:55.122Z', { expiring: 72 }),
  decision('sp40', '2026-W40', 'shift_proposal', 'shift-1', '2026-10-02T17:30:14.908Z', { title: 'Agents buy from agents' }),
]

test('an older week\'s brief and proposals are superseded by the newer week\'s', () => {
  const out = supersededDecisions(PENDING)
  assert.deepEqual(out.map(d => d.id), ['b40', 'g40b', 'g40c', 'g40a', 'sp40', 'pp40'])
  assert.ok(!out.some(d => d.week === '2026-W39'))
})

test('"keep for good" is offered once per piece, the newest offer kept', () => {
  const dup = [...PENDING, decision('g40dup', '2026-W40', 'graduation', '9bc8a215', '2026-10-02T18:03:54.000Z')]
  const keeps = supersededDecisions(dup).filter(d => d.kind === 'graduation')
  assert.equal(keeps.length, 3)
  assert.equal(new Set(keeps.map(d => d.ref)).size, 3)
  assert.ok(keeps.some(d => d.id === 'g40a'))
  assert.ok(!keeps.some(d => d.id === 'g40dup'))
})

test('a newer week supersedes the older snapshot even when it has no proposals of its own', () => {
  const onlyBrief = [
    decision('b39', '2026-W39', 'brief_review', 'brief-39'),
    decision('g39a', '2026-W39', 'graduation', 'piece-1'),
    decision('b40', '2026-W40', 'brief_review', 'brief-40'),
  ]
  assert.deepEqual(supersededDecisions(onlyBrief).map(d => d.id), ['b40'])
})

test('per-item kinds pass through, and settled decisions drop out', () => {
  const mixed = [
    ...PENDING,
    decision('sp39', '2026-W39', 'shift_proposal', 'shift-0'),
    { ...decision('g40x', '2026-W40', 'graduation', 'done-piece'), status: 'done' },
  ]
  const out = supersededDecisions(mixed)
  assert.ok(out.some(d => d.id === 'sp39'))
  assert.ok(!out.some(d => d.id === 'g40x'))
})

test('the superseded set is the same whatever order the decisions arrive in', () => {
  const first = supersededDecisions(PENDING).map(d => d.id)
  for (let seed = 1; seed < 8; seed++) assert.deepEqual(supersededDecisions(shuffled(PENDING, seed)).map(d => d.id), first)
})

// ── today's calls ───────────────────────────────────────────────────────────

const BOARD = [{
  id: 'you-p1-official-lock', lane: 'on_you', rank: 0, title: 'Lock this exact Article 1 for production',
  detail: 'It passed the fact check.', prompt: 'Yes, lock this exact article for production',
  link: 'https://controlcenter.krishraja.com/#/content?idea=6cb0d213-1aa6-44d3-8dc2-0b91d8dde4df',
}, {
  id: 'doing-next-picks', lane: 'in_progress', rank: 2, title: 'Your next two articles', detail: '', prompt: null, link: null,
}]

const ARTICLE_1 = idea({
  id: '6cb0d213-1aa6-44d3-8dc2-0b91d8dde4df', idea: 'Same agent, opposite answers', state: 'review',
  lane_slot: 'follow_the_money', body: draftBody('70%.'), meta: { fact_check: PASSED, ladder: ladder('ready', 8) },
})

function calls(over: Partial<Parameters<typeof todaysCalls>[0]> = {}) {
  const ideas = [ARTICLE_1, ...LIVE.filter(i => i.id !== 'r1')]
  return todaysCalls({
    ideas, decisions: PENDING, boardItems: BOARD,
    videoReviews: [{ id: 'v1', status: 'pending', safe_title: 'Proof lands sooner', created_at: '2026-09-05T08:00:00Z' }],
    gates: { [ARTICLE_1.id]: { ok: true, freshSentences: 0 } },
    now: SUNDAY, ...over,
  })
}

test('approve and lock is one call when the board asks for exactly that piece', () => {
  const { calls: list } = calls()
  const approve = list.filter(c => c.kind === 'approve')
  assert.equal(approve.length, 1)
  assert.equal(approve[0]!.ideaId, ARTICLE_1.id)
  assert.equal(approve[0]!.boardItemId, 'you-p1-official-lock')
  assert.equal(approve[0]!.primary.label, 'Approve and lock')
  assert.equal(approve[0]!.checkedBy, 'engine')
  // The board item is answered by the approve call, not repeated beside it,
  // and items in progress are not on him.
  assert.equal(list.filter(c => c.kind === 'board').length, 0)
})

test('the live morning: approve, two to put out, paid checks, a number to set, a video, the weekly ones', () => {
  const { calls: list, unsupported, leftOut } = calls()
  assert.deepEqual(list.map(c => c.key), [
    `approve:${ARTICLE_1.id}`,
    'go_out:a2', 'go_out:a1',
    'allow_fact_check:d2', 'allow_fact_check:d1', 'allow_fact_check:d3',
    'set_how_sure:d3',
    'studio_review:v1',
    // Weekly ones carry no series, so they fall back to the title, then the key.
    'keep_for_good:4ea8d1c7', 'keep_for_good:9bc8a215', 'keep_for_good:a9ef9249',
    'shift_proposal:shift-1',
    'expiry_notice:2026-W40',
  ])
  // Every series has its next piece, so there is nothing to pick this week.
  assert.equal(list.filter(c => c.kind === 'pick_for_series').length, 0)
  // An approved piece is offered its series' coming day.
  assert.equal(list.find(c => c.key === 'go_out:a1')!.date, '2026-10-05')
  assert.equal(list.find(c => c.key === 'go_out:a2')!.date, '2026-10-09')
  // Without the engine's read, the stored result is a guess and says so.
  assert.equal(list.find(c => c.key === 'allow_fact_check:d1')!.checkedBy, 'stored')
  assert.ok(list.every(c => c.secondary.label === 'Not now'))
  assert.deepEqual(unsupported.map(u => u.kind), ['prediction_ruling'])
  assert.deepEqual(leftOut.map(l => [l.kind, l.count]), [['brief_review', 1]])
})

test('a piece whose words changed after its check is offered the paid check, not approval', () => {
  const { calls: list } = calls({ gates: { [ARTICLE_1.id]: { ok: false, freshSentences: 31 } } })
  assert.equal(list.filter(c => c.kind === 'approve').length, 0)
  const check = list.find(c => c.key === `allow_fact_check:${ARTICLE_1.id}`)!
  assert.equal(check.freshSentences, 31)
  assert.match(check.why, /31 sentences/)
  assert.match(check.why, /up to \$2/)
  // The board item now stands on its own, with its own prompt as the answer.
  const board = list.find(c => c.kind === 'board')!
  assert.equal(board.primary.label, 'Yes, lock this exact article for production')
  assert.equal(board.ideaId, ARTICLE_1.id)
})

test('a slot with no piece in flight asks for a pick from its ready candidates', () => {
  const ideas = [ARTICLE_1, ...LIVE.filter(i => !['r1', 'a2', 'd2'].includes(i.id))]
  const { calls: list } = calls({ ideas })
  const pick = list.filter(c => c.kind === 'pick_for_series')
  assert.equal(pick.length, 1)
  assert.equal(pick[0]!.series, 'mind_the_gap')
  assert.equal(pick[0]!.date, '2026-10-09')
  assert.equal(pick[0]!.title, "Pick Friday's mind.the.gap piece")
  assert.equal(pick[0]!.primary.action, 'pick_for_series')
})

test('a piece due to go out and not marked published asks to be marked', () => {
  const due = idea({ id: 'due', idea: 'Due piece', state: 'approved', lane_slot: 'under_the_hood', body: draftBody('50%'), scheduled_for: '2026-10-03' })
  const future = idea({ id: 'future', idea: 'Future piece', state: 'approved', lane_slot: 'under_the_hood', body: draftBody('50%'), scheduled_for: '2026-10-12' })
  const { calls: list } = calls({ ideas: [due, future] })
  assert.equal(list.find(c => c.key === 'go_out:due')!.primary.action, 'mark_published')
  assert.equal(list.some(c => c.key === 'go_out:future'), false)
})

test('what could not be read is named as unsupported, never invented', () => {
  const { calls: list, unsupported } = calls({ boardItems: null, videoReviews: null, decisions: null })
  assert.deepEqual(unsupported.map(u => u.kind).sort(), ['board', 'keep_for_good', 'prediction_ruling', 'studio_review'])
  assert.equal(list.some(c => c.cadence === 'weekly'), false)
  assert.equal(list.some(c => c.kind === 'studio_review'), false)
  // Approval still stands on the piece itself; it just has no board item.
  assert.equal(list.find(c => c.kind === 'approve')!.boardItemId, undefined)
})

test('today\'s calls are the same whatever order the rows arrive in', () => {
  const ideas = [ARTICLE_1, ...LIVE.filter(i => i.id !== 'r1')]
  const first = calls({ ideas })
  for (let seed = 1; seed < 6; seed++) {
    assert.deepEqual(calls({ ideas: shuffled(ideas, seed), decisions: shuffled(PENDING, seed + 10) }), first)
  }
})

test('two calls alike in every word still come back in one order', () => {
  const twin = (id: string) => ({ id, lane: 'on_you', rank: 1, title: 'Answer the board', detail: 'Same words.', prompt: 'Yes', link: null })
  const a = todaysCalls({ ideas: [], boardItems: [twin('item-b'), twin('item-a')], decisions: [], videoReviews: [], now: SUNDAY })
  const b = todaysCalls({ ideas: [], boardItems: [twin('item-a'), twin('item-b')], decisions: [], videoReviews: [], now: SUNDAY })
  assert.deepEqual(a.calls.map(c => c.key), ['board:item-a', 'board:item-b'])
  assert.deepEqual(b, a)
})

test('no call text is cut short or carries an em dash', () => {
  for (const c of calls().calls) {
    for (const s of [c.title, c.why, c.primary.label]) {
      assert.ok(!s.includes('—'), s)
      assert.ok(!/(\.\.\.|…)$/.test(s), s)
    }
  }
})
