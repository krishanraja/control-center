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
      written.push(n)
      continue
    }
    patch[`target_${n}_text`] = text
    patch[`target_${n}_source`] = 'krish_added'
    patch[`target_${n}_goal_id`] = s.goal_id && knownGoals.has(s.goal_id) ? s.goal_id : null
    patch[`target_${n}_job`] = s.job && isJob(s.job) ? s.job : null
    written.push(n)
  }

  if (written.length === 0) return { row: current, error: null, written }

  if (current) {
    const { data, error } = await supabase
      .from('daily_focus')
      .update(patch)
      .eq('focus_date', date)
      .select('*')
      .single()
    return { row: (data as Record<string, unknown>) || null, error: error?.message || null, written }
  }

  const { data, error } = await supabase
    .from('daily_focus')
    .insert({
      focus_date: date,
      status: 'pending',
      relevance_index: {},
      marcus_suggestions: [],
      ...patch,
    })
    .select('*')
    .single()
  return { row: (data as Record<string, unknown>) || null, error: error?.message || null, written }
}
