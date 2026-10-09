import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readFileSync } from 'node:fs'
import { draftableAsks, withAskDrafts, prepareAskDrafts, readAskRung, ASSIST, type AskAssistDeps } from '../../api/_askAssist.ts'
import { withoutContacts, withContacts } from '../../api/_strategistGrounding.ts'
import type { StrategistRead, AskSection, AskPerson } from '../../src/types/strategist.ts'

// The ask at assist (ADR-030, phase 5): at assist the read makes the Gmail
// draft and the link rides on the ask; at propose nothing is made. SYNTHETIC
// people only: the repo is public.

const RILEY: AskPerson = { contact_id: 'c-riley', name: 'Riley Stone', title: 'Chief operating officer', company: 'Fixture Media', best_channel: null }
const MORGAN: AskPerson = { contact_id: 'c-morgan', name: 'Morgan Vale', title: 'Operating partner', company: 'Fixture Capital', best_channel: null }
const CASEY: AskPerson = { contact_id: 'c-casey', name: 'Casey Lin', title: null, company: null, best_channel: null }

const ask = (to: AskSection['to'], over: Partial<AskSection> = {}): AskSection => ({
  kind: 'ask', to, line: 'Would you take a short call on Thursday?',
  message: 'I am running a three week pilot.\nWould you be willing to take a short call on Thursday?\nIf it is not a fit, please say so.',
  why: 'Riley is deciding on AI this quarter.', ladder: { level: 6, request: 'a call', feared: 'a no', learning: 'where the line is' },
  lens: 'sell_first', job: 'fill_pilots', job_note: null, suggestion_id: 'sug-ask-1', ...over,
})

function read(asks: AskSection[]): StrategistRead {
  return {
    v: 1, headline: { kind: 'headline', text: 'One call this week.' }, close: { kind: 'close', stop: 'Once Riley names a day.' },
    asks, next_steps: [], objectives: [],
  } as unknown as StrategistRead
}

const DETAILS = { 'c-riley': { email: 'riley@fixture.invalid', linkedin_url: null }, 'c-casey': { email: null, linkedin_url: 'https://linkedin.invalid/in/casey' } }

function deps(rung: string | null, over: Partial<AskAssistDeps> = {}) {
  const drafts: Array<{ to: string; subject: string; body: string }> = []
  const recorded: Array<[string, string]> = []
  const d: AskAssistDeps = {
    rung: async () => rung,
    draft: async (x) => { drafts.push(x); return { url: `https://mail.google.com/mail/u/0/#drafts?compose=m${drafts.length}` } },
    record: async (id, url) => { recorded.push([id, url]) },
    ...over,
  }
  return { d, drafts, recorded }
}

test('a draft can be made only for a person with an email on record: named, or the one who makes the intro', () => {
  const r = read([
    ask({ kind: 'named', person: RILEY }),
    ask({ kind: 'role', role: 'a partner', via: { kind: 'contact', person: CASEY } }, { suggestion_id: 'sug-ask-2' }),
    ask({ kind: 'role', role: 'a chief executive', via: { kind: 'contact', person: { ...MORGAN, email: 'morgan@fixture.invalid' } } }, { suggestion_id: null }),
    ask({ kind: 'role', role: 'a client', via: { kind: 'existing_client' } }),
  ])
  const d = draftableAsks(r, DETAILS)
  assert.deepEqual(d.map(x => [x.index, x.to, x.suggestion_id]), [[0, 'riley@fixture.invalid', 'sug-ask-1'], [2, 'morgan@fixture.invalid', null]])
  assert.equal(d[0].subject, 'Would you take a short call on Thursday?')
  assert.equal(d[0].body, r.asks[0].message)
})

test('at propose nothing is drafted and the read comes back as it went in', async () => {
  const r = read([ask({ kind: 'named', person: RILEY })])
  for (const rung of ['propose', null, 'autonomous', 'anything']) {
    const { d, drafts } = deps(rung)
    const out = await prepareAskDrafts(r, DETAILS, d)
    assert.equal(drafts.length, 0, `rung ${rung} drafted`)
    assert.deepEqual(out.read, r)
    assert.equal(out.drafted, 0)
  }
})

test('at assist the draft is addressed to the person with the ask\'s own words, and its link rides on the ask', async () => {
  const r = read([ask({ kind: 'named', person: RILEY }), ask({ kind: 'role', role: 'a client', via: { kind: 'existing_client' } })])
  const { d, drafts, recorded } = deps(ASSIST)
  const out = await prepareAskDrafts(r, DETAILS, d)
  assert.equal(out.drafted, 1)
  assert.deepEqual(drafts, [{ to: 'riley@fixture.invalid', subject: r.asks[0].line, body: r.asks[0].message }])
  assert.equal(out.read.asks[0].draft_url, 'https://mail.google.com/mail/u/0/#drafts?compose=m1')
  assert.equal(out.read.asks[1].draft_url, undefined)
  assert.deepEqual(recorded, [['sug-ask-1', 'https://mail.google.com/mail/u/0/#drafts?compose=m1']])
  // Everything else on the ask is untouched: the words and the ladder are the read's.
  const { draft_url: _u, ...rest } = out.read.asks[0]
  assert.deepEqual(rest, r.asks[0])
})

test('a draft that fails leaves the ask as it was and says so in a note, never in the read', async () => {
  const r = read([ask({ kind: 'named', person: RILEY })])
  const { d } = deps(ASSIST, { draft: async () => null })
  const out = await prepareAskDrafts(r, DETAILS, d)
  assert.equal(out.drafted, 0)
  assert.deepEqual(out.notes, ['ask_0_not_drafted'])
  assert.deepEqual(out.read, r)
  const thrown = deps(ASSIST, { draft: async () => { throw new Error('gmail down') } })
  assert.equal((await prepareAskDrafts(r, DETAILS, thrown.d)).drafted, 0)
  // A ledger that cannot be written does not lose the link.
  const noLedger = deps(ASSIST, { record: async () => { throw new Error('no table') } })
  const kept = await prepareAskDrafts(r, DETAILS, noLedger.d)
  assert.ok(kept.read.asks[0].draft_url)
  assert.deepEqual(kept.notes, ['ask_0_outcome_not_recorded'])
})

test('only an https link is kept, and what is stored keeps the link while losing the contact details', () => {
  const r = read([ask({ kind: 'named', person: RILEY })])
  assert.equal(withAskDrafts(r, { 0: 'javascript:alert(1)' }).asks[0].draft_url, undefined)
  const wire = withContacts(withAskDrafts(r, { 0: 'https://mail.google.com/mail/u/0/#drafts?compose=m1' }), DETAILS)
  assert.equal(wire.asks[0].to.kind === 'named' && wire.asks[0].to.person.email, 'riley@fixture.invalid')
  const stored = withoutContacts(wire)
  assert.equal(stored.asks[0].draft_url, 'https://mail.google.com/mail/u/0/#drafts?compose=m1')
  assert.ok(!JSON.stringify(stored).includes('fixture.invalid'))
})

test('the rung comes off the ladder; a missing row, table or an error reads as nothing', async () => {
  const db = (res: { data: unknown; error: unknown }) => ({
    from: (t: string) => { assert.equal(t, 'autonomy_ladder'); return { select: () => ({ eq: (k: string, v: string) => { assert.deepEqual([k, v], ['surface', 'strategist_ask']); return { maybeSingle: async () => res } } }) } },
  })
  assert.equal(await readAskRung(db({ data: { rung: 'assist' }, error: null })), 'assist')
  assert.equal(await readAskRung(db({ data: null, error: null })), null)
  assert.equal(await readAskRung(db({ data: null, error: { message: 'relation does not exist' } })), null)
  assert.equal(await readAskRung(db({ data: { rung: 7 }, error: null })), null)
})

test('the module can draft and cannot send, and drafts only at assist', () => {
  const src = readFileSync(new URL('../../api/_askAssist.ts', import.meta.url), 'utf8')
  assert.doesNotMatch(src, /sendGmail|messages\/send|sendMail|nodemailer/)
  assert.match(src, /createGmailDraft/)
  assert.match(src, /rung !== ASSIST\) return/)
})
