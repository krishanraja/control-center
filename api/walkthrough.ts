import type { VercelRequest, VercelResponse } from '@vercel/node'
import { supabase } from './_supabase.js'
import { guard } from './_auth.js'
import { describeDbError } from './_suggestions.js'
import { isReadId, loadRun, startWalkthrough, walkthroughPrompt, type WalkthroughView } from './_walkthrough.js'

/**
 * /api/walkthrough: the session a note starts (api/_walkthrough.ts).
 *
 *   GET  ?readId=<uuid>   where the walkthrough for that read stands, and the
 *                         prompt to paste by hand if it never started.
 *   POST { readId }       the button. Opens a started run as it is, retries a
 *                         failed or lost one, and starts one for a read that
 *                         was never fired. Never a second session for a read
 *                         that already has one.
 *
 * Only a complete note read can start one: a goal read has nothing he said to
 * walk through, and an incomplete read has no steps.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (guard(req, res, ['GET', 'POST'])) return

  const raw = req.method === 'GET' ? req.query.readId : (req.body as { readId?: unknown } | undefined)?.readId
  const readId = Array.isArray(raw) ? raw[0] : raw
  if (!isReadId(readId)) return res.status(400).json({ ok: false, error: 'read_id_required' })

  try {
    if (req.method === 'POST') {
      const { data: read, error } = await supabase.from('strategist_reads').select('id, source, status').eq('id', readId).maybeSingle()
      if (error) return res.status(500).json({ ok: false, error: describeDbError(error) })
      if (!read) return res.status(404).json({ ok: false, error: 'read_not_found' })
      const r = read as { source: string; status: string }
      if (r.source !== 'note' || r.status !== 'complete') return res.status(409).json({ ok: false, error: 'not_a_complete_note_read' })
      await startWalkthrough(readId, 'button')
    }
    const view: WalkthroughView = { read_id: readId, run: await loadRun(readId), prompt: walkthroughPrompt(readId) }
    return res.status(200).json({ ok: true, ...view })
  } catch (e) {
    const message = (e as Error)?.message || String(e)
    // Before the migration there is no table: say so, and still hand over the prompt.
    if (message.startsWith('table_missing')) {
      return res.status(200).json({ ok: true, read_id: readId, run: null, prompt: walkthroughPrompt(readId), not_ready: 'walkthrough_tables_missing' })
    }
    return res.status(500).json({ ok: false, error: message.slice(0, 200) })
  }
}
