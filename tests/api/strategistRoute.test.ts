import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readFileSync } from 'node:fs'
import {
  parseStrategistRequest, candidatesFrom, contactDetailsFrom, dealCounts, todayAskFrom, weekNotesFrom,
  lastWeekCloseFrom, previousReadFrom, canonFrom, pickScores, assembleGrounding, askContactIds,
  withContacts, withoutContacts, sectionWithContacts, readWireFrom, readFailureEvent, isMissingTable,
  WEEK_NOTES_KEPT, WEEK_NOTE_CHARS,
  type GroundingParts, type StoredReadRow, type GoalSubject,
} from '../../api/_strategistGrounding.ts'
import {
  renderGroundingText, buildStrategistSystem, buildValidationCtx, createReadAccumulator, incompleteSentence,
  NOTE_MAX_CHARS, type StrategistGrounding,
} from '../../api/_strategist.ts'
import type { StrategistRead, AskSection } from '../../src/types/strategist.ts'

// The route's pure half: request parsing, the grounding assembled from what
// the database returned, and the stored read shaped for the wire. SYNTHETIC
// fixtures only (tests/api/fixtures/strategist.*): the repo is public.

const fixture = (name: string) => readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8')
const BASE: StrategistGrounding = JSON.parse(fixture('strategist.grounding.json'))
const at = (iso: string) => `day ${iso.slice(0, 10)}`

/** The OS golden read, through the same path the route takes. */
function goldenOsRead(): StrategistRead {
  const g = structuredClone(BASE)
  const system = buildStrategistSystem({ source: 'goal', rung: 'os' })
  const acc = createReadAccumulator(buildValidationCtx({ shape: 'os', system, grounding: g }))
  for (const l of fixture('strategist.os.ndjson').trim().split('\n')) acc.line(l)
  const v = acc.finish()
  assert.equal(v.complete, true, JSON.stringify(v))
  return (v as { read: StrategistRead }).read
}

/** A grounding assembled from nothing: every read failed or found no rows. */
function emptyParts(over: Partial<GroundingParts> = {}): GroundingParts {
  return {
    today: '2026-09-28',
    tz: 'America/New_York',
    week_start: '2026-09-28',
    subject: { source: 'note', kind: 'week_open', body: 'Starting the week. Nothing is set yet.' },
    spine: null,
    scorecard: null,
    targets: null,
    stop_rule: { on: '2026-10-05', reads: 'Fewer than 2 of 25 took a call, or no paid pilot.' },
    deal_rows: null,
    today_ask_row: undefined,
    week_rows: null,
    last_close_row: null,
    previous_row: null,
    exclude_read_id: null,
    network_counts: null,
    search_lists: [],
    at,
    ...over,
  }
}

// ── The request ──────────────────────────────────────────────────────────────

test('a goal request needs a goal id', () => {
  assert.deepEqual(parseStrategistRequest({ source: 'goal', goalId: ' os:x ' }), { ok: true, request: { source: 'goal', goalId: 'os:x' } })
  const r = parseStrategistRequest({ source: 'goal' })
  assert.equal(r.ok, false)
  assert.equal((r as { error: string }).error, 'goal_required')
})

test('a note is trimmed, needs a known kind and a body, and passes tz through', () => {
  const ok = parseStrategistRequest({ source: 'note', kind: 'update', body: '  sent two asks  ', tz: 'Europe/London' })
  assert.deepEqual(ok, { ok: true, request: { source: 'note', kind: 'update', body: 'sent two asks', tz: 'Europe/London' } })
  const reasons = [
    parseStrategistRequest({ source: 'note', kind: 'monday', body: 'x' }),
    parseStrategistRequest({ source: 'note', kind: 'update', body: '   ' }),
    parseStrategistRequest({ source: 'note', kind: 'update' }),
    parseStrategistRequest({}),
    parseStrategistRequest(null),
  ].map(r => (r as { error: string }).error)
  assert.deepEqual(reasons, ['unknown_note_kind', 'note_required', 'note_required', 'source_required', 'source_required'])
})

test('a note of exactly the cap is read, one character over is refused in plain words', () => {
  assert.equal(parseStrategistRequest({ source: 'note', kind: 'week_close', body: 'a'.repeat(NOTE_MAX_CHARS) }).ok, true)
  const over = parseStrategistRequest({ source: 'note', kind: 'week_close', body: 'a'.repeat(NOTE_MAX_CHARS + 1) })
  assert.equal(over.ok, false)
  const { error, detail } = over as { error: string; detail: string }
  assert.equal(error, 'note_too_long')
  assert.match(detail, /12,000 characters/)
  assert.doesNotMatch(detail, /[—–!]/)
})

// ── Candidates: an allowlist, warm only ──────────────────────────────────────

test('candidates carry the allowlisted fields only, never why_them, risk or contact details', () => {
  const rows = BASE.candidates as unknown as Array<Record<string, unknown>>
  const out = candidatesFrom([rows])
  for (const c of out) {
    assert.deepEqual(Object.keys(c).sort(), [
      'best_channel', 'company', 'contact_id', 'full_name', 'hook', 'network_tier', 'roles', 'title', 'who',
    ])
  }
  const text = JSON.stringify(out)
  for (const secret of ['PRIVATE-WHY-THEM-SENTINEL', 'PRIVATE-RISK-SENTINEL', 'fixture.invalid']) {
    assert.ok(!text.includes(secret), `candidates must not carry ${secret}`)
  }
})

test('a cold contact is never a candidate, and a person found under two roles appears once', () => {
  const rows = BASE.candidates as unknown as Array<Record<string, unknown>>
  const out = candidatesFrom([rows, [rows[0]], [{ ...rows[2], network_tier: '4_cold', contact_id: 'c-x' }]])
  assert.deepEqual(out.map(c => c.contact_id), ['c-fixture-001', 'c-fixture-002', 'c-fixture-003'])
})

test('contact details come off the search rows or the contacts rows by id', () => {
  const d = contactDetailsFrom([
    { contact_id: 'a', email: ' a@x.invalid ', linkedin_url: '' },
    { id: 'b', email: null, linkedin_url: 'https://linkedin.invalid/in/b' },
  ])
  assert.deepEqual(d, {
    a: { email: 'a@x.invalid', linkedin_url: null },
    b: { email: null, linkedin_url: 'https://linkedin.invalid/in/b' },
  })
})

// ── Small counts ─────────────────────────────────────────────────────────────

test('deals are counted by state, and today\'s ask says whether it went', () => {
  assert.deepEqual(dealCounts([{ state: 'sent' }, { state: 'drafted' }, { state: 'sent' }, { state: null }]), { sent: 2, drafted: 1 })
  assert.deepEqual(dealCounts(null), {})
  assert.deepEqual(todayAskFrom(null), { exists: false, sent: false, outcome: null })
  assert.deepEqual(todayAskFrom({ sent_at: '2026-09-28T10:00:00Z', outcome: 'yes' }), { exists: true, sent: true, outcome: 'yes' })
  assert.deepEqual(todayAskFrom({ sent_at: null, outcome: null }), { exists: true, sent: false, outcome: null })
})

test('the scorecard keeps its six columns and nothing else', () => {
  assert.deepEqual(
    pickScores({ approaches_sent: 3, calls_taken: 0, unasked_measured: true, commits: 9, week_ending: '2026-10-02', paid_pilots: null }),
    { approaches_sent: 3, calls_taken: 0 },
  )
})

// ── Earlier notes, last week, the previous read ──────────────────────────────

function noteRow(i: number, over: Partial<StoredReadRow> = {}): StoredReadRow {
  return {
    id: `r${i}`,
    created_at: `2026-09-2${i}T09:00:00Z`,
    source: 'note',
    note_kind: 'update',
    note_body: `note ${i}`,
    week_start: '2026-09-21',
    status: 'complete',
    headline: `headline ${i}`,
    ...over,
  }
}

test('earlier notes run oldest first, leave out the note being read, and keep only the newest few', () => {
  const rows = Array.from({ length: 9 }, (_, i) => noteRow(i))
  const out = weekNotesFrom(rows.slice().reverse(), 'r8', at)
  assert.equal(out.length, WEEK_NOTES_KEPT)
  assert.deepEqual(out.map(n => n.body), ['note 2', 'note 3', 'note 4', 'note 5', 'note 6', 'note 7'])
  assert.equal(out[0].at, 'day 2026-09-22')
})

test('a failed read still keeps what he said, without a headline, and a long note says it was cut', () => {
  const out = weekNotesFrom([
    noteRow(1, { status: 'incomplete', headline: 'never shown' }),
    noteRow(2, { note_body: 'x'.repeat(WEEK_NOTE_CHARS + 50) }),
    noteRow(3, { note_body: '   ' }),
  ], null, at)
  assert.equal(out.length, 2)
  assert.equal(out[0].headline, null)
  assert.equal(out[0].body, 'note 1')
  assert.ok(out[1].body.endsWith('[the rest of this note is cut here]'))
  assert.equal(out[1].body.length, WEEK_NOTE_CHARS + ' [the rest of this note is cut here]'.length)
})

test('last week\'s close gives its headline and learning; the previous read gives its asks', () => {
  const read = goldenOsRead()
  assert.deepEqual(
    lastWeekCloseFrom(noteRow(1, { note_kind: 'week_close', sections: { learning: { kind: 'learning', text: 'Ask earlier.' } } })),
    { headline: 'headline 1', learning: 'Ask earlier.' },
  )
  assert.equal(lastWeekCloseFrom(null), null)
  assert.equal(lastWeekCloseFrom(noteRow(1, { headline: null, sections: null })), null)
  const prev = previousReadFrom({ ...noteRow(2), source: 'goal', sections: read }, at)
  assert.deepEqual(prev, { at: 'day 2026-09-22', headline: 'headline 2', asks: read.asks.map(a => a.line) })
  assert.deepEqual(previousReadFrom({ ...noteRow(2), sections: 'not a read' }, at)?.asks, [])
})

test('the canon is the active goals, plus the goal being read when it is not active', () => {
  const subject: GoalSubject = { id: 'os:new', title: 'A proposed goal', horizon: 'os', status: 'proposed', job: null, parent_id: null, parent_title: null }
  const canon = canonFrom([
    { id: 'os:a', title: 'A', horizon: 'os' },
    { id: 'weekly:b', title: 'B', horizon: 'weekly', parent_id: 'os:a', is_stale: true },
    { id: 'legacy:c', title: 'C', horizon: 'quarterly' },
  ], subject)
  assert.deepEqual(canon.map(c => [c.id, c.status]), [['os:a', 'active'], ['weekly:b', 'active'], ['os:new', 'proposed']])
  assert.equal(canon[1].is_stale, true)
  assert.equal(canonFrom(null, null).length, 0)
})

// ── An empty week renders as "no rows", never as a guess ─────────────────────

test('a grounding assembled from nothing renders every block as no rows, and still validates a read', () => {
  const g = assembleGrounding(emptyParts())
  const text = renderGroundingText(g)
  for (const block of [
    'CANON GOALS (the only goal ids you may use):\nno rows',
    "This week's objectives: no rows.",
    "TODAY'S 3:\nno rows",
    'SCORECARD: no rows',
    'PILOT DEALS BY STATE: no rows',
    "TODAY'S ASK: none yet",
    'EARLIER NOTES THIS WEEK:\nno rows',
    "LAST WEEK'S CLOSE: no rows",
    'WARM NETWORK BY ROLE (tiers 1 to 3): no rows',
    'CANDIDATES (the only people you may name, by contact_id):\nno rows',
  ]) {
    assert.ok(text.includes(block), `missing: ${block}\n---\n${text}`)
  }
  assert.equal(g.pilot_deals, null)
  assert.equal(g.today_ask, null)
  assert.equal(g.previous_read, null)
  assert.ok(text.includes('Starting the week. Nothing is set yet.'))
  // The context builds against it: a read with no people and no goals can
  // still be checked, it just cannot name anyone.
  const ctx = buildValidationCtx({ shape: 'week_open', system: buildStrategistSystem({ source: 'note', noteKind: 'week_open' }), grounding: g })
  assert.equal(ctx.candidates.size, 0)
  assert.equal(ctx.canon.size, 0)
})

test('a missing strategist_reads table reads as no rows, the same as an empty one', () => {
  assert.equal(isMissingTable({ code: '42P01', message: 'relation "public.strategist_reads" does not exist' }), true)
  assert.equal(isMissingTable({ code: 'PGRST205', message: "Could not find the table 'public.strategist_reads' in the schema cache" }), true)
  assert.equal(isMissingTable({ code: '23505', message: 'duplicate key' }), false)
  assert.equal(isMissingTable(null), false)
  const g = assembleGrounding(emptyParts({ week_rows: null, last_close_row: null, previous_row: null }))
  assert.deepEqual([g.week_notes, g.last_week_close], [[], null])
})

test('a full grounding carries the figures, the subject goal and the warm candidates only', () => {
  const g = assembleGrounding(emptyParts({
    subject: { source: 'goal', goal: { ...BASE.canon[0], parent_title: null } },
    spine: { all: BASE.canon.map(c => ({ ...c })), today: [{ slot: 1, text: 'Send the scope', done: false, goal_id: null }] },
    scorecard: { week_ending: '2026-10-02', current: BASE.scorecard!.current, totals: BASE.scorecard!.totals, gap: BASE.scorecard!.gap },
    targets: BASE.scorecard!.targets,
    deal_rows: [{ state: 'sent' }, { state: 'sent' }],
    today_ask_row: null,
    network_counts: { partner: 140, introducer: 260, investor: 31 },
    search_lists: [BASE.candidates as unknown as Array<Record<string, unknown>>],
  }))
  const text = renderGroundingText(g)
  assert.ok(text.includes('To date: approaches sent 7'))
  assert.ok(text.includes('PILOT DEALS BY STATE: sent 2'))
  assert.ok(text.includes('WARM NETWORK BY ROLE (tiers 1 to 3): partner 140, introducer 260, investor 31'))
  assert.ok(text.includes("PREVIOUS READ OF THIS GOAL: no rows"))
  assert.ok(text.includes('[c-fixture-001]'))
  assert.ok(!text.includes('c-fixture-cold'))
  for (const secret of ['PRIVATE-WHY-THEM-SENTINEL', 'PRIVATE-RISK-SENTINEL', 'fixture.invalid']) {
    assert.ok(!text.includes(secret), `grounding must not carry ${secret}`)
  }
})

// ── The wire: contact details on for him, off for storage ────────────────────

const DETAILS = {
  'c-fixture-001': { email: 'morgan@fixture.invalid', linkedin_url: null },
  'c-fixture-003': { email: null, linkedin_url: 'https://linkedin.invalid/in/casey' },
}

test('named people and introducers get email and LinkedIn on the wire, null when unknown', () => {
  const read = goldenOsRead()
  assert.deepEqual(askContactIds(read), ['c-fixture-001', 'c-fixture-003'])
  const wire = withContacts(read, DETAILS)
  const [named, role] = wire.asks as AskSection[]
  assert.equal(named.to.kind, 'named')
  assert.deepEqual(named.to.kind === 'named' && [named.to.person.email, named.to.person.linkedin_url], ['morgan@fixture.invalid', null])
  assert.ok(role.to.kind === 'role' && role.to.via.kind === 'contact')
  assert.equal(role.to.kind === 'role' && role.to.via.kind === 'contact' && role.to.via.person.linkedin_url, 'https://linkedin.invalid/in/casey')
  const none = withContacts(read, {})
  assert.equal(none.asks[0].to.kind === 'named' && none.asks[0].to.person.email, null)
})

test('what is stored carries no contact details, whatever the wire copy had', () => {
  const read = goldenOsRead()
  const stored = withoutContacts(withContacts(read, DETAILS))
  assert.deepEqual(stored, read)
  assert.ok(!JSON.stringify(stored).includes('fixture.invalid'))
  assert.ok(!JSON.stringify(stored).includes('linkedin.invalid'))
})

test('one streamed ask section gets its details; other sections pass through untouched', () => {
  const read = goldenOsRead()
  const s = sectionWithContacts(read.asks[0], DETAILS)
  assert.equal(s.kind === 'ask' && s.to.kind === 'named' && s.to.person.email, 'morgan@fixture.invalid')
  assert.equal(sectionWithContacts(read.headline, DETAILS), read.headline)
})

test('GET returns the read only when the row is complete, and never the note itself', () => {
  const read = goldenOsRead()
  const row: StoredReadRow = {
    id: 'r1', created_at: '2026-09-28T09:00:00Z', source: 'note', goal_id: null, note_kind: 'week_open',
    note_body: 'PRIVATE NOTE BODY', week_start: '2026-09-28', status: 'complete', sections: read,
    headline: read.headline.text, last_attempt_at: '2026-09-28T09:00:00Z',
  }
  const wire = readWireFrom(row, DETAILS)
  assert.deepEqual(Object.keys(wire).sort(), [
    'created_at', 'goal_id', 'headline', 'id', 'last_attempt_at', 'note_kind', 'read', 'source', 'status', 'week_start',
  ])
  assert.ok(!JSON.stringify(wire).includes('PRIVATE NOTE BODY'))
  assert.equal(wire.read?.asks[0].to.kind === 'named' && wire.read.asks[0].to.person.email, 'morgan@fixture.invalid')
  assert.equal(readWireFrom({ ...row, status: 'incomplete' }).read, null)
  assert.equal(readWireFrom({ ...row, sections: { v: 2 } }).read, null)
  assert.equal(readWireFrom({ ...row, last_attempt_at: null }).last_attempt_at, row.created_at)
})

// ── A read that did not finish, in plain words ───────────────────────────────

test('each failure has its code and a plain sentence that never carries provider text', () => {
  const cases = [
    readFailureEvent('timed_out', ['timed_out', 'stopped_early'], 'note'),
    readFailureEvent('anthropic_failed', ['anthropic_failed'], 'goal'),
    readFailureEvent('unexpected', ['unexpected'], 'note'),
    readFailureEvent('incomplete', ['missing_ask', 'dropped:ask:unknown_contact'], 'note'),
  ]
  assert.deepEqual(cases.map(c => c.error), ['timed_out', 'anthropic_failed', 'strategist_read_incomplete', 'strategist_read_incomplete'])
  assert.equal(cases[3].detail, incompleteSentence(['missing_ask', 'dropped:ask:unknown_contact'], 'note'))
  assert.match(cases[0].detail, /What you said is kept/)
  assert.match(cases[1].detail, /Nothing was saved/)
  for (const c of cases) {
    assert.doesNotMatch(c.detail, /[—–!]|anthropic_|OPENROUTER|API_KEY|\d{3}:/)
  }
})

test('the grounding module loads with no database credentials', async () => {
  const { spawnSync } = await import('node:child_process')
  const env = { ...process.env }
  delete env.SUPABASE_URL
  delete env.SUPABASE_SERVICE_ROLE_KEY
  const script = "await import('./api/_strategistGrounding.ts'); console.log('loaded')"
  const r = spawnSync(process.execPath, ['--import', 'tsx', '--input-type=module', '-e', script], {
    cwd: new URL('../../', import.meta.url), env, encoding: 'utf8',
  })
  assert.equal(r.status, 0, r.stderr)
  assert.match(r.stdout, /loaded/)
})
