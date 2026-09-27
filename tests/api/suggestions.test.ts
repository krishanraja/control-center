import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readFileSync } from 'node:fs'
import {
  validateSuggestion, recordSuggestions, validateVerdict, recordVerdict, describeDbError,
  FORM_ONLY_DELTA_KEYS, VERDICT_KINDS, STRATEGIST_SURFACES,
  type SuggestionInput, type BankDb,
} from '../../api/_suggestions.ts'

const sql = (name: string) => readFileSync(new URL(`../../supabase/migrations/${name}`, import.meta.url), 'utf8')
const BANK = sql('20260919100000_every_output_is_a_suggestion.sql')
const STRATEGIST = sql('20260927100000_what_he_says_becomes_the_plan.sql')

const ID = '11111111-2222-4333-8444-555555555555'

function row(over: Partial<SuggestionInput> = {}): SuggestionInput {
  return {
    surface: 'strategist_ask',
    subject_table: 'strategist_reads',
    subject_id: 'read-1',
    proposed: { line: 'Would you introduce me?' },
    reason: 'One bounded ask to someone he already knows.',
    producer: { agent: 'goal-strategist' },
    ...over,
  }
}

// ── validateSuggestion mirrors the table's checks ────────────────────────────

test('a suggestion row that would be written passes', () => {
  assert.equal(validateSuggestion(row()), null)
  assert.equal(validateSuggestion(row({ proposed: null, handoff_reason: 'strategist_read_incomplete' })), null)
})

test('each check on suggestions refuses by name', () => {
  assert.equal(validateSuggestion(row({ reason: 'too short' })), 'reason_too_short')
  assert.equal(validateSuggestion(row({ reason: '   eleven ch   ' })), 'reason_too_short', 'length is measured after trimming')
  assert.equal(validateSuggestion(row({ handoff_reason: 'strategist_read_incomplete' })), 'proposed_xor_handoff', 'both')
  assert.equal(validateSuggestion(row({ proposed: null })), 'proposed_xor_handoff', 'neither')
  assert.equal(validateSuggestion(row({ confidence: 1.2 })), 'confidence_out_of_range')
  assert.equal(validateSuggestion(row({ confidence: -0.1 })), 'confidence_out_of_range')
  assert.equal(validateSuggestion(row({ confidence: 0.5 })), null)
  assert.equal(validateSuggestion(row({ producer: {} as SuggestionInput['producer'] })), 'producer_needs_agent')
  assert.equal(validateSuggestion(row({ subject_id: '' })), 'subject_required')
  assert.equal(validateSuggestion(row({ surface: ' ' })), 'surface_required')
  assert.equal(validateSuggestion(row({ autonomy_rung: 'boss' })), 'unknown_autonomy_rung')
})

// ── validateVerdict ──────────────────────────────────────────────────────────

test('each check on verdicts refuses by name', () => {
  assert.equal(validateVerdict({ suggestion_id: ID, verdict: 'accepted' }), null)
  assert.equal(validateVerdict({ suggestion_id: 'nope', verdict: 'accepted' }), 'suggestion_id_not_uuid')
  assert.equal(validateVerdict({ suggestion_id: ID, verdict: 'loved' }), 'unknown_verdict')
  assert.equal(validateVerdict({ suggestion_id: ID, verdict: 'tweaked', delta: { topic: 'pilots' } }), 'delta_key_not_form_only:topic')
  assert.equal(validateVerdict({ suggestion_id: ID, verdict: 'tweaked', delta: { chars_before: 120, chars_after: 90, pct_shorter: 25 } }), null)
  assert.equal(validateVerdict({ suggestion_id: ID, verdict: 'rejected' }), 'reject_needs_reason')
  assert.equal(validateVerdict({ suggestion_id: ID, verdict: 'rejected', note: 'too early' }), null)
  assert.equal(validateVerdict({ suggestion_id: ID, verdict: 'rejected', reason_code: 'wrong_person' }), null)
  assert.equal(validateVerdict({ suggestion_id: ID, verdict: 'rejected', note: 'no' }), 'reject_needs_reason')
})

// ── Drift: the mirrors against the SQL ───────────────────────────────────────

test('FORM_ONLY_DELTA_KEYS is exactly delta_keys_are_form_only, in order', () => {
  const fn = BANK.slice(BANK.indexOf('create or replace function public.delta_keys_are_form_only'))
  const list = fn.slice(fn.indexOf('where k not in ('), fn.indexOf('$$;'))
  const keys = [...list.matchAll(/'([a-z_]+)'/g)].map(m => m[1])
  assert.ok(keys.length > 20, 'the key list was found')
  assert.deepEqual([...FORM_ONLY_DELTA_KEYS], keys)
  // No later migration redefines the function without this list following it.
  assert.ok(!STRATEGIST.includes('delta_keys_are_form_only(d jsonb)'))
})

test('VERDICT_KINDS is exactly the verdict_kinds rows, in sort order', () => {
  const insert = BANK.slice(BANK.indexOf('insert into public.verdict_kinds'), BANK.indexOf('on conflict (slug) do update set label = excluded.label, what = excluded.what, counts_clean'))
  const rows = [...insert.matchAll(/\('([a-z_]+)',\s*'[^']*',\s*'(?:[^']|'')*',\s*(?:true|false),\s*(\d+)\)/g)]
    .map(m => ({ slug: m[1], order: Number(m[2]) }))
    .sort((a, b) => a.order - b.order)
  assert.deepEqual([...VERDICT_KINDS], rows.map(r => r.slug))
})

test('the strategist migration seeds its surfaces, its ladder rows and its handoff reason', () => {
  for (const s of STRATEGIST_SURFACES) {
    assert.match(STRATEGIST, new RegExp(`\\('${s}', '[^']+',\\s*\\n\\s*'`), `surface ${s}`)
    assert.match(STRATEGIST, new RegExp(`\\('${s}', 'propose',`), `ladder row for ${s}`)
  }
  assert.match(STRATEGIST, /\('strategist_read_incomplete', /)
  assert.equal((STRATEGIST.match(/'strategist_reads', 1[123]0\)/g) || []).length, 3, 'every surface names strategist_reads as its subject')
})

test('the strategist migration keeps what he says away from the browser key', () => {
  assert.match(STRATEGIST, /^begin;$/m)
  assert.match(STRATEGIST, /^commit;$/m)
  assert.match(STRATEGIST, /notify pgrst, 'reload schema';/)
  assert.match(STRATEGIST, /create table if not exists public\.strategist_reads/)
  assert.match(STRATEGIST, /alter table public\.strategist_reads enable row level security;/)
  assert.match(STRATEGIST, /revoke all on public\.strategist_reads from anon, authenticated;/)
  assert.ok(!/policy[^;]*on public\.strategist_reads[^;]*to anon/i.test(STRATEGIST), 'no anon policy on the private store')
  // Restrictive, so they only ever narrow the existing anon policies.
  assert.match(STRATEGIST, /on public\.suggestions\s+as restrictive for select to anon\s+using \(surface not like 'strategist\\_%'\);/)
  assert.match(STRATEGIST, /on public\.suggestion_verdicts\s+as restrictive for select to anon\s+using \(suggestion_id in \(select s\.id from public\.suggestions s\)\);/)
  assert.match(STRATEGIST, /on public\.suggestion_verdicts\s+as restrictive for insert to anon\s+with check \(suggestion_id in \(select s\.id from public\.suggestions s\)\);/)
  // Idempotent: every policy is dropped before it is created.
  const created = [...STRATEGIST.matchAll(/create policy "([^"]+)"/g)].map(m => m[1])
  for (const name of created) assert.ok(STRATEGIST.includes(`drop policy if exists "${name}"`), name)
  // The two ways in, held by the table.
  assert.match(STRATEGIST, /strategist_reads_goal_read_needs_goal check \(source <> 'goal' or goal_id is not null\)/)
  assert.match(STRATEGIST, /length\(note_body\) <= 12000/)
})

// ── The writers, against a fake client ───────────────────────────────────────

interface FakeState {
  suggestion: { id: string; surface: string; created_at: string } | null
  lastRound: number | null
  conflicts: number
  inserted: Record<string, unknown>[]
}

/** Just enough of the supabase chain for recordVerdict and recordSuggestions. */
function fakeDb(state: FakeState): BankDb {
  return {
    from(table: string) {
      const chain: Record<string, unknown> = {}
      let mode: 'select' | 'insert' = 'select'
      let payload: unknown = null
      const self = () => chain
      Object.assign(chain, {
        select: self, eq: self, order: self, limit: self,
        insert: (p: unknown) => { mode = 'insert'; payload = p; return chain },
        maybeSingle: async () => {
          if (table === 'suggestions') return { data: state.suggestion, error: null }
          return { data: state.lastRound === null ? null : { round: state.lastRound }, error: null }
        },
        single: async () => {
          if (mode !== 'insert') throw new Error('unexpected single')
          if (state.conflicts > 0) {
            state.conflicts -= 1
            state.lastRound = (state.lastRound ?? 0) + 1
            return { data: null, error: { code: '23505', message: 'duplicate key value violates unique constraint "suggestion_verdicts_one_per_round"' } }
          }
          state.inserted.push(payload as Record<string, unknown>)
          return { data: { id: 'verdict-1', round: (payload as { round: number }).round }, error: null }
        },
        then: (resolve: (v: unknown) => void) => {
          // `await client.from('suggestions').insert(rows).select('id')`
          const rows = payload as unknown[]
          resolve({ data: rows.map((_, i) => ({ id: `sug-${i}` })), error: null })
        },
      })
      return chain
    },
  }
}

const state = (over: Partial<FakeState> = {}): FakeState => ({
  suggestion: { id: ID, surface: 'strategist_ask', created_at: new Date(Date.now() - 90_000).toISOString() },
  lastRound: null, conflicts: 0, inserted: [], ...over,
})

test('recordVerdict writes round 1, then the next round, with the seconds measured on the server', async () => {
  const s = state()
  const r = await recordVerdict({ suggestion_id: ID, verdict: 'accepted' }, STRATEGIST_SURFACES, fakeDb(s))
  assert.deepEqual(r, { ok: true, id: 'verdict-1', round: 1 })
  assert.ok((s.inserted[0].seconds_to_verdict as number) >= 89)
  assert.equal(s.inserted[0].actor, 'krish')
  const s2 = state({ lastRound: 2 })
  const r2 = await recordVerdict({ suggestion_id: ID, verdict: 'tweaked', delta: { chars_before: 80, chars_after: 60 } }, STRATEGIST_SURFACES, fakeDb(s2))
  assert.equal(r2.ok && r2.round, 3)
})

test('recordVerdict refuses another surface, a missing suggestion, and a bad verdict', async () => {
  const other = await recordVerdict({ suggestion_id: ID, verdict: 'accepted' }, STRATEGIST_SURFACES,
    fakeDb(state({ suggestion: { id: ID, surface: 'headline', created_at: new Date().toISOString() } })))
  assert.deepEqual(other, { ok: false, status: 403, reason: 'surface_not_allowed:headline' })
  const missing = await recordVerdict({ suggestion_id: ID, verdict: 'accepted' }, STRATEGIST_SURFACES, fakeDb(state({ suggestion: null })))
  assert.deepEqual(missing, { ok: false, status: 404, reason: 'suggestion_not_found' })
  const bad = await recordVerdict({ suggestion_id: ID, verdict: 'rejected' }, STRATEGIST_SURFACES, fakeDb(state()))
  assert.deepEqual(bad, { ok: false, status: 400, reason: 'reject_needs_reason' })
})

test('two writers racing to one round: the loser retries once, then says round_conflict', async () => {
  const once = state({ conflicts: 1 })
  const r = await recordVerdict({ suggestion_id: ID, verdict: 'accepted' }, STRATEGIST_SURFACES, fakeDb(once))
  assert.deepEqual(r, { ok: true, id: 'verdict-1', round: 2 })
  const twice = state({ conflicts: 2 })
  const r2 = await recordVerdict({ suggestion_id: ID, verdict: 'accepted' }, STRATEGIST_SURFACES, fakeDb(twice))
  assert.equal(r2.ok, false)
  assert.equal(!r2.ok && r2.status, 409)
  assert.match(!r2.ok ? r2.reason : '', /^round_conflict/)
})

test('recordSuggestions returns ids in order, and refuses a bad row by its index', async () => {
  const ok = await recordSuggestions([row(), row({ surface: 'strategist_objective' })], fakeDb(state()))
  assert.deepEqual(ok, { ok: true, ids: ['sug-0', 'sug-1'] })
  const bad = await recordSuggestions([row(), row({ reason: 'short' })], fakeDb(state()))
  assert.deepEqual(bad, { ok: false, reason: 'row 1: reason_too_short' })
  assert.deepEqual(await recordSuggestions([], fakeDb(state())), { ok: true, ids: [] })
})

test('a database failure comes back as one named, plain line', () => {
  assert.match(describeDbError({ code: '23503', message: 'insert or update on table "suggestions" violates foreign key constraint "suggestions_surface_fkey"' }),
    /^vocabulary_missing: .*suggestions_surface_fkey.*20260927100000_what_he_says_becomes_the_plan\.sql\.$/)
  assert.equal(describeDbError({ code: '23514', message: 'new row for relation "suggestions" violates check constraint "suggestions_reason_is_a_sentence"' }),
    'check_failed:suggestions_reason_is_a_sentence: the reason must be a sentence of at least twelve characters.')
  assert.match(describeDbError({ code: 'PGRST205', message: "Could not find the table 'public.strategist_reads'" }), /^table_missing: .*Apply supabase\/migrations\/20260927100000/)
  assert.equal(describeDbError({ code: '42501', message: 'permission denied' }), 'permission_denied: this key cannot write here. The bank is written with the service role only.')
  assert.equal(describeDbError(null), 'db_error: the database returned an error with no detail.')
})
