import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readFileSync } from 'node:fs'

// api/_autonomy.ts imports _suggestions, which imports _supabase lazily; the
// pure half under test never calls out. The database half is exercised
// through an injected fake, the way tests/api/suggestions.test.ts does.
process.env.SUPABASE_URL ||= 'https://ci.invalid'
process.env.SUPABASE_SERVICE_ROLE_KEY ||= 'not-a-real-key-tests-never-call-out'
const {
  proposeLadderMoves, withinCeiling, rulePromotion, RUNG_RANK, PROMOTION_SURFACE,
} = await import('../../api/_autonomy.ts')
import type { EvidenceRow } from '../../api/_autonomy.ts'
import type { BankDb } from '../../api/_suggestions.ts'

const row = (over: Partial<EvidenceRow>): EvidenceRow => ({
  surface: 'strategist_ask', rung: 'propose', max_rung: 'assist', promote_after: 20, demote_below_rate: '0.6',
  verdicts_ruled: 0, clean_accepts: 0, clean_rate: null, last_verdict_at: null, ...over,
})

test('enough clean accepts at or above the line proposes propose to assist, and nothing less does', () => {
  const up = proposeLadderMoves([row({ verdicts_ruled: 29, clean_accepts: 23, clean_rate: '0.793', last_verdict_at: '2026-10-05T09:00:00Z' })], new Set(), { strategist_ask: 'ask' })
  assert.equal(up.length, 1)
  assert.deepEqual({ surface: up[0].surface, from: up[0].from, to: up[0].to }, { surface: 'strategist_ask', from: 'propose', to: 'assist' })
  assert.match(up[0].reason, /^23 of 29 ruled ask taken as proposed up to 2026-10-05, at or above 60%\./)
  assert.ok(up[0].reason.trim().length >= 12)
  // Too few accepts, or a rate under the line, proposes nothing.
  assert.deepEqual(proposeLadderMoves([row({ verdicts_ruled: 19, clean_accepts: 19, clean_rate: '1.0' })], new Set()), [])
  assert.deepEqual(proposeLadderMoves([row({ verdicts_ruled: 40, clean_accepts: 20, clean_rate: '0.5' })], new Set()), [])
})

test('at assist, enough rulings below the line proposes the way back; a surface already proposed is left alone', () => {
  const down = proposeLadderMoves([row({ rung: 'assist', verdicts_ruled: 25, clean_accepts: 10, clean_rate: '0.4' })], new Set())
  assert.equal(down.length, 1)
  assert.deepEqual({ from: down[0].from, to: down[0].to }, { from: 'assist', to: 'propose' })
  assert.match(down[0].reason, /below the 60% it was promoted on/)
  assert.deepEqual(proposeLadderMoves([row({ verdicts_ruled: 29, clean_accepts: 23, clean_rate: '0.793' })], new Set(['strategist_ask'])), [])
})

test('no input proposes autonomous, and the promotion surface never promotes itself', () => {
  const cases: EvidenceRow[] = [
    row({ rung: 'assist', verdicts_ruled: 100, clean_accepts: 100, clean_rate: '1.0', max_rung: 'autonomous' }),
    row({ rung: 'propose', verdicts_ruled: 100, clean_accepts: 100, clean_rate: '1.0', max_rung: 'autonomous' }),
    row({ rung: 'autonomous', verdicts_ruled: 100, clean_accepts: 100, clean_rate: '1.0' }),
    row({ surface: PROMOTION_SURFACE, verdicts_ruled: 100, clean_accepts: 100, clean_rate: '1.0' }),
  ]
  for (const m of proposeLadderMoves(cases, new Set())) assert.notEqual(m.to, 'autonomous')
  assert.deepEqual(proposeLadderMoves([cases[3]], new Set()), [])
  assert.deepEqual(proposeLadderMoves([cases[2]], new Set()), [])
  // The word is not in the file's writable paths at all.
  const src = readFileSync(new URL('../../api/_autonomy.ts', import.meta.url), 'utf8')
  const writes = src.split('\n').filter(l => /to: '|rung: /.test(l) && !l.trim().startsWith('//') && !l.trim().startsWith('*'))
  for (const l of writes) assert.doesNotMatch(l, /'autonomous'/, `a write names autonomous: ${l.trim()}`)
})

test('the ceiling: a verdict may reach assist by default and never past max_rung', () => {
  assert.equal(withinCeiling('assist', 'assist'), true)
  assert.equal(withinCeiling('assist', 'propose'), false)
  assert.equal(withinCeiling('propose', 'propose'), true)
  assert.equal(withinCeiling('autonomous', 'assist'), false)
  assert.equal(withinCeiling('assist', null), true)
  assert.ok(RUNG_RANK.propose < RUNG_RANK.assist && RUNG_RANK.assist < RUNG_RANK.autonomous)
})

// ── rulePromotion against a fake bank ───────────────────────────────────────

const SUG = '11111111-2222-4333-8444-555555555555'

function fakeDb(opts: { surface?: string; to?: string; maxRung?: string | null; rung?: string }) {
  const writes: Array<{ table: string; op: string; payload: unknown }> = []
  const suggestion = { id: SUG, surface: opts.surface ?? PROMOTION_SURFACE, subject_id: 'strategist_ask', created_at: '2026-10-05T09:00:00Z',
    proposed: { surface: 'strategist_ask', from: 'propose', to: opts.to ?? 'assist' }, reason: '23 of 29 ruled asks taken as proposed.' }
  const ladder = { surface: 'strategist_ask', rung: opts.rung ?? 'propose', max_rung: opts.maxRung === undefined ? 'assist' : opts.maxRung }
  const chain = (table: string) => {
    const api: Record<string, unknown> = {}
    const self = () => api
    const terminal = async () => {
      if (table === 'suggestions') return { data: suggestion, error: null }
      if (table === 'autonomy_ladder') return { data: ladder, error: null }
      if (table === 'suggestion_verdicts') return { data: null, error: null }
      return { data: null, error: null }
    }
    for (const m of ['select', 'eq', 'order', 'limit', 'in']) api[m] = self
    api.maybeSingle = terminal
    api.single = async () => (table === 'suggestion_verdicts' ? { data: { id: 'v1', round: 1 }, error: null } : terminal())
    api.insert = (payload: unknown) => { writes.push({ table, op: 'insert', payload }); return api }
    api.update = (payload: unknown) => { writes.push({ table, op: 'update', payload }); return { eq: async () => ({ error: null }) } }
    return api
  }
  const db: BankDb = { from: (t: string) => chain(t) }
  return { db, writes }
}

test('accepted moves the ladder to the proposed rung within the ceiling, after the verdict is written', async () => {
  const { db, writes } = fakeDb({})
  const r = await rulePromotion({ suggestion_id: SUG, verdict: 'accepted' }, db)
  assert.equal(r.kind, 'promotion')
  if (r.kind !== 'promotion') return
  assert.equal(r.result.ok, true)
  assert.equal(r.applied, true)
  const upd = writes.find(w => w.table === 'autonomy_ladder' && w.op === 'update')
  assert.ok(upd, 'the ladder was updated')
  assert.equal((upd!.payload as { rung: string }).rung, 'assist')
  assert.equal((upd!.payload as { changed_by: string }).changed_by, 'krish')
})

test('a proposal above max_rung is refused before any verdict is written', async () => {
  const { db, writes } = fakeDb({ maxRung: 'propose' })
  const r = await rulePromotion({ suggestion_id: SUG, verdict: 'accepted' }, db)
  assert.equal(r.kind, 'promotion')
  if (r.kind !== 'promotion') return
  assert.equal(r.result.ok, false)
  if (r.result.ok === false) { assert.equal(r.result.status, 403); assert.match(r.result.reason, /^above_max_rung:propose/) }
  assert.deepEqual(writes, [], 'nothing was written')
})

test('rejected is recorded and the ladder stays; a strategist suggestion is not a promotion', async () => {
  const { db, writes } = fakeDb({})
  const r = await rulePromotion({ suggestion_id: SUG, verdict: 'rejected', note: 'Not yet. Keep proposing it.' }, db)
  assert.equal(r.kind, 'promotion')
  if (r.kind === 'promotion') { assert.equal(r.result.ok, true); assert.equal(r.applied, false) }
  assert.equal(writes.some(w => w.table === 'autonomy_ladder'), false)
  const other = await rulePromotion({ suggestion_id: SUG, verdict: 'accepted' }, fakeDb({ surface: 'strategist_ask' }).db)
  assert.equal(other.kind, 'not_promotion')
})
