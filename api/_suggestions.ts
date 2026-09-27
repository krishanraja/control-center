// The first writer of the learning bank in this repo (the content engine
// writes it from its own repository). Every machine proposal is a suggestion
// with a reason; every response is a verdict; the gap between them is what
// teaches. Schema: supabase/migrations/20260919100000_every_output_is_a_suggestion.sql.
//
// The validators mirror the table's CHECKs so a bad row fails here with a
// named reason, before the round trip, rather than as a Postgres error string
// nobody reads. tests/api/suggestions.test.ts holds FORM_ONLY_DELTA_KEYS and
// VERDICT_KINDS against the SQL files, so the mirror cannot drift silently.
//
// Supabase is imported lazily: `_supabase.ts` throws at module scope without
// service credentials, and the validators here must load in tests and guards
// that have none.

export type VerdictKind = 'accepted' | 'tweaked' | 'replaced' | 'rejected' | 'deferred'

/** The verdict_kinds rows, in their sort order. */
export const VERDICT_KINDS: readonly VerdictKind[] = ['accepted', 'tweaked', 'replaced', 'rejected', 'deferred']

/**
 * The keys public.delta_keys_are_form_only(jsonb) allows, in its order. Every
 * one describes FORM or CRAFT; none can carry a subject, a topic, a company, a
 * person or a headline (the anti-echo rule). Exact mirror: change the function
 * in a migration first, then this list, and the drift test checks both.
 */
export const FORM_ONLY_DELTA_KEYS: readonly string[] = [
  // Size and shape.
  'chars_before', 'chars_after', 'pct_shorter', 'sentences_before', 'sentences_after',
  'sections_kept', 'sections_dropped', 'sections_added', 'order_changed',
  // Craft moves, counted and never quoted.
  'hedges_removed', 'adjectives_removed', 'numbers_added', 'numbers_removed',
  'attributions_added', 'attributions_fixed', 'counterpoints_added',
  'opening_rewritten', 'ending_rewritten', 'moral_removed', 'question_removed',
  'em_dashes_removed', 'exclamations_removed', 'product_names_removed',
  // Structural verdicts on non-text suggestions.
  'items_kept', 'items_dropped', 'items_added', 'items_reordered',
  'slot_changed', 'format_changed', 'timing_changed_days', 'asset_kinds_changed',
  // Provenance of the comparison itself.
  'before_hash', 'after_hash', 'rounds',
]

const FORM_ONLY = new Set(FORM_ONLY_DELTA_KEYS)

/** The strategist's three surfaces (migration 20260927100000). Their rows are
 *  hidden from the anon key by restrictive policies; the verdict route only
 *  accepts verdicts on these. */
export const STRATEGIST_SURFACES = ['strategist_objective', 'strategist_ask', 'strategist_next_step'] as const
export type StrategistSurface = (typeof STRATEGIST_SURFACES)[number]

export const AUTONOMY_RUNGS = ['propose', 'assist', 'autonomous'] as const

const THE_MIGRATION = 'supabase/migrations/20260927100000_what_he_says_becomes_the_plan.sql'

// ── Suggestions ──────────────────────────────────────────────────────────────

export interface SuggestionInput {
  surface: string
  subject_table: string
  subject_id: string
  /** What the machine proposed. Null only on a hand-off. */
  proposed: unknown | null
  /** Why, in a sentence of at least twelve characters. */
  reason: string
  confidence?: number | null
  alternatives?: unknown
  producer: { agent: string } & Record<string, unknown>
  /** A handoff_reasons slug, set exactly when proposed is null. */
  handoff_reason?: string | null
  autonomy_rung?: string
  run_id?: string | null
}

/**
 * The named reason a suggestion row would be refused, or null when it would be
 * written. One reason per failure, first match wins:
 *   surface_required | subject_required | reason_too_short | proposed_xor_handoff
 *   confidence_out_of_range | producer_needs_agent | unknown_autonomy_rung
 */
export function validateSuggestion(s: SuggestionInput): string | null {
  if (!s || typeof s !== 'object') return 'surface_required'
  if (typeof s.surface !== 'string' || !s.surface.trim()) return 'surface_required'
  if (typeof s.subject_table !== 'string' || !s.subject_table.trim()) return 'subject_required'
  if (typeof s.subject_id !== 'string' || !s.subject_id.trim()) return 'subject_required'
  // suggestions_reason_is_a_sentence: length(btrim(reason)) >= 12.
  if (typeof s.reason !== 'string' || s.reason.trim().length < 12) return 'reason_too_short'
  // suggestions_proposed_xor_handoff.
  const proposed = s.proposed !== null && s.proposed !== undefined
  const handoff = typeof s.handoff_reason === 'string' && s.handoff_reason.trim() !== ''
  if (proposed === handoff) return 'proposed_xor_handoff'
  // suggestions_confidence_range.
  if (s.confidence !== null && s.confidence !== undefined) {
    if (typeof s.confidence !== 'number' || !Number.isFinite(s.confidence) || s.confidence < 0 || s.confidence > 1) {
      return 'confidence_out_of_range'
    }
  }
  if (!s.producer || typeof s.producer !== 'object' || typeof s.producer.agent !== 'string' || !s.producer.agent.trim()) {
    return 'producer_needs_agent'
  }
  if (s.autonomy_rung !== undefined && !(AUTONOMY_RUNGS as readonly string[]).includes(s.autonomy_rung)) {
    return 'unknown_autonomy_rung'
  }
  return null
}

/** The minimal slice of a supabase client these writers use. Injectable so
 *  the round logic can be tested without a database. */
export interface BankDb {
  from(table: string): any
}

async function defaultDb(): Promise<BankDb> {
  const { supabase } = await import('./_supabase.js')
  return supabase as unknown as BankDb
}

/**
 * Write suggestion rows in one insert and return their ids in the order given.
 * Validates every row first; one bad row refuses the batch, naming its index
 * and reason, because a partial write would leave a read whose actionable
 * items do not line up with their ids.
 */
export async function recordSuggestions(
  rows: SuggestionInput[],
  db?: BankDb,
): Promise<{ ok: true; ids: string[] } | { ok: false; reason: string }> {
  if (!Array.isArray(rows) || rows.length === 0) return { ok: true, ids: [] }
  for (let i = 0; i < rows.length; i += 1) {
    const problem = validateSuggestion(rows[i])
    if (problem) return { ok: false, reason: `row ${i}: ${problem}` }
  }
  const payload = rows.map(r => ({
    surface: r.surface,
    subject_table: r.subject_table,
    subject_id: r.subject_id,
    proposed: r.proposed ?? null,
    reason: r.reason.trim(),
    confidence: r.confidence ?? null,
    alternatives: r.alternatives ?? null,
    producer: r.producer,
    handoff_reason: r.handoff_reason ?? null,
    autonomy_rung: r.autonomy_rung ?? 'propose',
    run_id: r.run_id ?? null,
  }))
  try {
    const client = db ?? await defaultDb()
    const { data, error } = await client.from('suggestions').insert(payload).select('id')
    if (error) return { ok: false, reason: describeDbError(error) }
    const ids = ((data || []) as Array<{ id: string }>).map(r => String(r.id))
    if (ids.length !== rows.length) {
      return { ok: false, reason: `short_write: asked for ${rows.length} rows and got ${ids.length} ids back.` }
    }
    return { ok: true, ids }
  } catch (e) {
    return { ok: false, reason: describeDbError(e as DbErrorLike) }
  }
}

// ── Verdicts ─────────────────────────────────────────────────────────────────

export interface VerdictInput {
  suggestion_id: string
  verdict: VerdictKind | string
  final?: unknown
  delta?: Record<string, number | string | boolean> | null
  reason_code?: string | null
  note?: string | null
  actor?: string
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * The named reason a verdict would be refused, or null:
 *   suggestion_id_not_uuid | unknown_verdict | delta_not_an_object
 *   delta_key_not_form_only:<key> | reject_needs_reason | actor_required
 */
export function validateVerdict(v: VerdictInput): string | null {
  if (!v || typeof v !== 'object') return 'suggestion_id_not_uuid'
  if (typeof v.suggestion_id !== 'string' || !UUID.test(v.suggestion_id)) return 'suggestion_id_not_uuid'
  if (!(VERDICT_KINDS as readonly string[]).includes(v.verdict as string)) return 'unknown_verdict'
  if (v.delta !== null && v.delta !== undefined) {
    if (typeof v.delta !== 'object' || Array.isArray(v.delta)) return 'delta_not_an_object'
    // suggestion_verdicts_delta_is_form_only.
    for (const k of Object.keys(v.delta)) {
      if (!FORM_ONLY.has(k)) return `delta_key_not_form_only:${k}`
    }
  }
  // suggestion_verdicts_reject_says_why: reason_code, or a note of eight or more.
  if (v.verdict === 'rejected') {
    const code = typeof v.reason_code === 'string' && v.reason_code.trim() !== ''
    const note = typeof v.note === 'string' && v.note.trim().length >= 8
    if (!code && !note) return 'reject_needs_reason'
  }
  if (v.actor !== undefined && (typeof v.actor !== 'string' || !v.actor.trim())) return 'actor_required'
  return null
}

export type RecordVerdictResult =
  | { ok: true; id: string; round: number }
  | { ok: false; status: 400 | 403 | 404 | 409 | 500; reason: string }

/**
 * Write one verdict. The round is the suggestion's current highest plus one,
 * and seconds_to_verdict is measured here from the suggestion's own
 * created_at, never trusted from the client. A verdict on a surface outside
 * `allowSurfaces` is refused: the route that calls this only rules on its own
 * surfaces, and the engine's rows are the engine's to judge.
 *
 * Two writers racing to the same round meet the unique (suggestion_id, round)
 * constraint; the loser re-reads the round and tries once more, then reports
 * round_conflict rather than looping.
 */
export async function recordVerdict(
  v: VerdictInput,
  allowSurfaces: readonly string[],
  db?: BankDb,
): Promise<RecordVerdictResult> {
  const problem = validateVerdict(v)
  if (problem) return { ok: false, status: 400, reason: problem }
  try {
    const client = db ?? await defaultDb()
    const { data: s, error: sErr } = await client
      .from('suggestions')
      .select('id, surface, created_at')
      .eq('id', v.suggestion_id)
      .maybeSingle()
    if (sErr) return { ok: false, status: 500, reason: describeDbError(sErr) }
    if (!s) return { ok: false, status: 404, reason: 'suggestion_not_found' }
    const surface = String((s as { surface: unknown }).surface)
    if (!allowSurfaces.includes(surface)) {
      return { ok: false, status: 403, reason: `surface_not_allowed:${surface}` }
    }
    const createdAt = Date.parse(String((s as { created_at: unknown }).created_at))
    const seconds = Number.isFinite(createdAt) ? Math.max(0, Math.round((Date.now() - createdAt) / 1000)) : null

    for (let attempt = 0; attempt < 2; attempt += 1) {
      const { data: last, error: rErr } = await client
        .from('suggestion_verdicts')
        .select('round')
        .eq('suggestion_id', v.suggestion_id)
        .order('round', { ascending: false })
        .limit(1)
        .maybeSingle()
      if (rErr) return { ok: false, status: 500, reason: describeDbError(rErr) }
      const round = (last && Number((last as { round: unknown }).round)) ? Number((last as { round: unknown }).round) + 1 : 1

      const { data: row, error: iErr } = await client
        .from('suggestion_verdicts')
        .insert({
          suggestion_id: v.suggestion_id,
          round,
          verdict: v.verdict,
          final: v.final ?? null,
          delta: v.delta ?? null,
          reason_code: v.reason_code ?? null,
          note: v.note ?? null,
          seconds_to_verdict: seconds,
          actor: v.actor ?? 'krish',
        })
        .select('id, round')
        .single()
      if (!iErr && row) return { ok: true, id: String((row as { id: unknown }).id), round }
      if (iErr && String((iErr as DbErrorLike).code) === '23505' && attempt === 0) continue
      if (iErr && String((iErr as DbErrorLike).code) === '23505') {
        return { ok: false, status: 409, reason: 'round_conflict: another verdict took this round twice running. Try again.' }
      }
      return { ok: false, status: 500, reason: describeDbError(iErr as DbErrorLike) }
    }
    return { ok: false, status: 409, reason: 'round_conflict: another verdict took this round twice running. Try again.' }
  } catch (e) {
    return { ok: false, status: 500, reason: describeDbError(e as DbErrorLike) }
  }
}

// ── Errors, named ────────────────────────────────────────────────────────────

export interface DbErrorLike {
  code?: string | null
  message?: string | null
  details?: string | null
}

/** Plain sentences for the constraints these tables carry, keyed by name. */
const CONSTRAINTS: Record<string, string> = {
  suggestions_proposed_xor_handoff: 'a suggestion must propose something or hand off with a named reason, never both and never neither',
  suggestions_confidence_range: 'confidence must be between 0 and 1',
  suggestions_reason_is_a_sentence: 'the reason must be a sentence of at least twelve characters',
  suggestion_verdicts_one_per_round: 'that round already has a verdict',
  suggestion_verdicts_round_positive: 'a round starts at 1',
  suggestion_verdicts_delta_is_form_only: 'the delta may only carry form and craft keys (delta_keys_are_form_only)',
  suggestion_verdicts_reject_says_why: 'a rejection needs a reason code or a note of at least eight characters',
}

/**
 * A database failure as one named, plain line: `<name>: <sentence>`. The name
 * is countable; the sentence says what to do. A missing vocabulary row or a
 * missing table points at the migration that adds it, because before it is
 * applied that is the only reason those two happen.
 */
export function describeDbError(e: DbErrorLike | null | undefined): string {
  if (!e) return 'db_error: the database returned an error with no detail.'
  const code = String(e.code ?? '')
  const text = `${e.message ?? ''} ${e.details ?? ''}`
  const constraint = (text.match(/constraint "([^"]+)"/) || [])[1] ?? null
  if (code === '23503') {
    return `vocabulary_missing: a value is not in its vocabulary table (suggestion_surfaces, handoff_reasons, verdict_kinds or autonomy_rungs)${constraint ? `, constraint ${constraint}` : ''}. Apply ${THE_MIGRATION}.`
  }
  if (code === '23514') {
    const plain = constraint && CONSTRAINTS[constraint]
    return `check_failed${constraint ? `:${constraint}` : ''}: ${plain || 'a row broke a table check'}.`
  }
  if (code === '23505') {
    return `duplicate${constraint ? `:${constraint}` : ''}: ${(constraint && CONSTRAINTS[constraint]) || 'that row already exists'}.`
  }
  if (code === '42P01' || code === 'PGRST205' || /does not exist|could not find the table/i.test(text)) {
    return `table_missing: the table does not exist yet. Apply ${THE_MIGRATION}.`
  }
  if (code === '42501') return 'permission_denied: this key cannot write here. The bank is written with the service role only.'
  const msg = (e.message || '').trim()
  return `db_error${code ? `:${code}` : ''}: ${msg || 'the database refused the write'}.`
}
