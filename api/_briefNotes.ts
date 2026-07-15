import { supabase } from './_supabase.js'
import { parseVal } from './_content.js'

// Standing brief preferences — the "Tell Cleo remembers" store.
//
// A one-off Cleo instruction ("harder ending", "more skeptical about vendor
// claims") applies once and is forgotten. A STANDING note is Krish's recurring
// editorial preference: it is folded into the system prompt every time the brief
// is assembled or revised, so the same correction never has to be re-typed. The
// list lives in system_config under one key (same key/value store as the voice
// block and corpus).

const KEY = 'brief_standing_notes'
const MAX_NOTES = 20
const MAX_LEN = 280

export interface StandingNote { id: string; text: string; at: string }

function coerce(raw: unknown): StandingNote[] {
  if (!Array.isArray(raw)) return []
  const out: StandingNote[] = []
  for (const r of raw) {
    if (r && typeof r === 'object' && typeof (r as any).text === 'string') {
      const text = (r as any).text.trim()
      if (text) out.push({ id: String((r as any).id || text.slice(0, 24)), text, at: String((r as any).at || '') })
    } else if (typeof r === 'string' && r.trim()) {
      out.push({ id: r.slice(0, 24), text: r.trim(), at: '' })
    }
  }
  return out
}

export async function loadStandingNotes(): Promise<StandingNote[]> {
  const { data } = await supabase.from('system_config').select('value').eq('key', KEY).single()
  return coerce(parseVal((data as any)?.value)).slice(0, MAX_NOTES)
}

export async function saveStandingNotes(notes: StandingNote[]): Promise<void> {
  await supabase.from('system_config').upsert({
    key: KEY,
    value: notes.slice(0, MAX_NOTES),
    updated_at: new Date().toISOString(),
  })
}

/** Add a note (trimmed, deduped by normalized text). Returns the new list. */
export async function addStandingNote(text: string): Promise<StandingNote[]> {
  const clean = String(text || '').trim().slice(0, MAX_LEN)
  if (!clean) return loadStandingNotes()
  const notes = await loadStandingNotes()
  const norm = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').trim()
  if (notes.some(n => norm(n.text) === norm(clean))) return notes
  const id = (globalThis.crypto?.randomUUID?.() || `n_${Date.now()}_${notes.length}`)
  const next = [...notes, { id, text: clean, at: new Date().toISOString() }].slice(-MAX_NOTES)
  await saveStandingNotes(next)
  return next
}

export async function removeStandingNote(id: string): Promise<StandingNote[]> {
  const notes = await loadStandingNotes()
  const next = notes.filter(n => n.id !== id)
  await saveStandingNotes(next)
  return next
}

/** The system-prompt block. Empty string when there are no standing notes. */
export function standingNotesPrompt(notes: StandingNote[]): string {
  if (!notes.length) return ''
  return [
    "STANDING PREFERENCES (Krish's recurring editorial notes — honor every one unless a direct instruction overrides it):",
    ...notes.map(n => `- ${n.text}`),
  ].join('\n')
}
