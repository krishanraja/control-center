import { supabase } from './_supabase.js'
import { isJob } from './_mission.js'

/**
 * The one writer for a single Today slot.
 *
 * Two surfaces write today's 3 outside the ritual lock: the evening shutdown
 * (tomorrow's 3, chosen the night before) and the editable slots on Home.
 * Both land here, so the slot shape, the source tag and the "fill only what is
 * empty" rule cannot drift between them.
 *
 * What this never does: fire the n8n Focus Calibrator. That webhook is the
 * ritual lock's (api/daily-focus/calibrate.ts), which is the only path that
 * declares a day calibrated. A slot written here leaves the row `pending`.
 */

export type Slot = 1 | 2 | 3

export interface SlotInput {
  slot: Slot
  /** Empty string clears the slot. */
  text: string
  goal_id?: string | null
  job?: string | null
  /** The suggestion the slot was taken from (ADR-030), so a tick on it can
   *  be recorded as did_it. Null when he wrote the slot himself. */
  suggestion_id?: string | null
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Postgres 42703, undefined column: the loop migration is not applied yet. */
function columnMissing(e: { code?: string; message?: string } | null | undefined): boolean {
  return !!e && (e.code === '42703' || /suggestion_id/.test(e.message || ''))
}

export interface UpsertSlotsOptions {
  /** Overwrite a slot that already has text. Default: only fill empty slots. */
  replace?: boolean
}

export function isYmd(s: unknown): s is string {
  return typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s)
}

export function isSlot(n: unknown): n is Slot {
  return n === 1 || n === 2 || n === 3
}

/** Validate a slot payload. Returns an error string, or null when it is fine. */
export function validateSlot(s: Partial<SlotInput>): string | null {
  if (!isSlot(s.slot)) return 'slot must be 1, 2 or 3'
  if (typeof s.text !== 'string') return 'text must be a string'
  if (s.text.trim().length > 240) return 'text must be 240 characters or fewer'
  if (s.job != null && s.job !== '' && !isJob(s.job)) return `unknown job '${s.job}'`
  if (s.goal_id != null && typeof s.goal_id !== 'string') return 'goal_id must be a string'
  if (s.suggestion_id != null && s.suggestion_id !== '' && !(typeof s.suggestion_id === 'string' && UUID.test(s.suggestion_id))) return 'suggestion_id must be a uuid'
  return null
}

/**
 * Upsert one or more slots on the daily_focus row for `date`.
 *
 * Returns the row after the write. A goal_id that names no goal resolves to
 * null through the FK's ON DELETE SET NULL only on delete; on insert Postgres
 * rejects it, so unknown ids are dropped here rather than failing the day.
 */
export async function upsertSlots(
  date: string,
  slots: SlotInput[],
  opts: UpsertSlotsOptions = {},
): Promise<{ row: Record<string, unknown> | null; error: string | null; written: Slot[] }> {
  const { data: existing, error: readErr } = await supabase
    .from('daily_focus')
    .select('*')
    .eq('focus_date', date)
    .maybeSingle()
  if (readErr && readErr.code !== 'PGRST116') return { row: null, error: readErr.message, written: [] }

  const current = (existing || null) as Record<string, unknown> | null

  const goalIds = slots.map(s => s.goal_id).filter((g): g is string => typeof g === 'string' && g.length > 0)
  const knownGoals = new Set<string>()
  if (goalIds.length) {
    const { data } = await supabase.from('goals').select('id').in('id', goalIds)
    for (const g of (data || []) as Array<{ id: string }>) knownGoals.add(g.id)
  }

  const patch: Record<string, unknown> = {}
  const written: Slot[] = []
  for (const s of slots) {
    const n = s.slot
    const text = s.text.trim()
    const had = typeof current?.[`target_${n}_text`] === 'string' && String(current[`target_${n}_text`]).trim().length > 0
    if (had && !opts.replace) continue
    if (!text) {
      // Clearing a slot: only meaningful when replacing.
      if (!opts.replace) continue
      patch[`target_${n}_text`] = null
      patch[`target_${n}_source`] = null
      patch[`target_${n}_goal_id`] = null
      patch[`target_${n}_job`] = null
      patch[`target_${n}_completed_at`] = null
      patch[`target_${n}_suggestion_id`] = null
      written.push(n)
      continue
    }
    patch[`target_${n}_text`] = text
    patch[`target_${n}_source`] = 'krish_added'
    patch[`target_${n}_goal_id`] = s.goal_id && knownGoals.has(s.goal_id) ? s.goal_id : null
    patch[`target_${n}_job`] = s.job && isJob(s.job) ? s.job : null
    // A slot written by hand has no suggestion behind it, and a slot taken
    // from a move keeps the move's id, so the tick can close the loop.
    patch[`target_${n}_suggestion_id`] = s.suggestion_id && UUID.test(s.suggestion_id) ? s.suggestion_id.toLowerCase() : null
    written.push(n)
  }

  if (written.length === 0) return { row: current, error: null, written }

  // Before migration 20261009120000 the suggestion columns do not exist. The
  // slot write must still land: retry once without them rather than fail the
  // day over a column that only closes the loop.
  const withoutSuggestion = (p: Record<string, unknown>) =>
    Object.fromEntries(Object.entries(p).filter(([k]) => !k.endsWith('_suggestion_id')))

  if (current) {
    let { data, error } = await supabase
      .from('daily_focus')
      .update(patch)
      .eq('focus_date', date)
      .select('*')
      .single()
    if (error && columnMissing(error)) {
      ({ data, error } = await supabase.from('daily_focus').update(withoutSuggestion(patch)).eq('focus_date', date).select('*').single())
    }
    return { row: (data as Record<string, unknown>) || null, error: error?.message || null, written }
  }

  const fresh = (p: Record<string, unknown>) => ({
    focus_date: date,
    status: 'pending',
    relevance_index: {},
    marcus_suggestions: [],
    ...p,
  })
  let { data, error } = await supabase.from('daily_focus').insert(fresh(patch)).select('*').single()
  if (error && columnMissing(error)) {
    ({ data, error } = await supabase.from('daily_focus').insert(fresh(withoutSuggestion(patch))).select('*').single())
  }
  return { row: (data as Record<string, unknown>) || null, error: error?.message || null, written }
}
