import { requestOk } from './apiFetch'
import type { StrategistVerdictRequest } from '../types/strategist'

// The client half of the learning bank (ADR-019, ADR-026): every response to a
// suggestion is a verdict. Taken unchanged is `accepted`, taken after an edit
// is `tweaked` with form-only deltas, "Not this" is `rejected` with a reason
// code from src/lib/servedSurfaces.ts (STRATEGIST_SURFACE).
//
// Best effort, always. The action it follows (a goal saved, a slot filled, an
// ask made) has already happened by the time this runs, and a verdict that
// fails to write must never undo it or put an error in front of him. A missing
// suggestion id (a read that could not be saved, persisted:false) means there
// is no row to answer, so nothing is sent.

export async function postVerdict(v: StrategistVerdictRequest | (Omit<StrategistVerdictRequest, 'suggestion_id'> & { suggestion_id?: string | null })): Promise<void> {
  if (!v.suggestion_id) return
  try {
    await requestOk('/api/suggestions/verdict', { method: 'POST', body: v, timeoutMs: 12_000 })
  } catch {
    // Deliberately silent: see above.
  }
}

/**
 * Taken after an edit: the form-only delta keys the table allows
 * (delta_keys_are_form_only). Never the words themselves.
 */
export function editDelta(before: string, after: string): Record<string, number> {
  const b = before.trim().length
  const a = after.trim().length
  return {
    chars_before: b,
    chars_after: a,
    pct_shorter: b > 0 ? Math.round(((b - a) / b) * 100) : 0,
  }
}

/**
 * accepted when he took the words as offered, tweaked when he changed them,
 * replaced when what he kept shares under a third of its words with what was
 * offered (he used the slot, not the suggestion). The bank learns from the
 * difference, so calling a rewrite a tweak would teach it the wrong thing.
 */
export function verdictForTaken(offered: string, taken: string): 'accepted' | 'tweaked' | 'replaced' {
  const norm = (s: string) => s.replace(/\s+/g, ' ').trim()
  if (norm(offered) === norm(taken)) return 'accepted'
  const words = (s: string) => new Set(s.toLowerCase().match(/[a-z0-9']+/g) ?? [])
  const a = words(offered)
  const b = words(taken)
  const shared = [...a].filter(w => b.has(w)).length
  const union = new Set([...a, ...b]).size
  return union > 0 && shared / union < 1 / 3 ? 'replaced' : 'tweaked'
}
