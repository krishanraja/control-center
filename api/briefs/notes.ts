import type { VercelRequest, VercelResponse } from '@vercel/node'
import { preamble } from '../_content.js'
import { loadStandingNotes, addStandingNote, removeStandingNote } from '../_briefNotes.js'

// GET/POST/DELETE /api/briefs/notes — Krish's standing brief preferences.
//
//   GET                 -> { ok, notes }
//   POST { text }       -> add a standing note, returns the new list
//   DELETE { id }       -> remove one, returns the new list
//
// These are the notes the assembler and the revise engine fold into every
// prompt, so "Tell Cleo" corrections can compound instead of resetting.

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (preamble(req, res, 'GET, POST, DELETE, OPTIONS')) return
  try {
    if (req.method === 'GET') {
      return res.json({ ok: true, notes: await loadStandingNotes() })
    }
    if (req.method === 'POST') {
      const text = String((req.body || {}).text || '').trim()
      if (!text) return res.status(400).json({ ok: false, error: 'text required' })
      return res.json({ ok: true, notes: await addStandingNote(text) })
    }
    if (req.method === 'DELETE') {
      const id = String((req.body || {}).id || '').trim()
      if (!id) return res.status(400).json({ ok: false, error: 'id required' })
      return res.json({ ok: true, notes: await removeStandingNote(id) })
    }
    return res.status(405).json({ ok: false, error: 'GET, POST or DELETE only' })
  } catch (e: unknown) {
    return res.status(500).json({ ok: false, error: String((e as Error)?.message || e) })
  }
}
