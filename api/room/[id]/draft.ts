import type { VercelRequest, VercelResponse } from '@vercel/node'
import { guard } from '../../_auth.js'
import { googleConfigured } from '../../_google.js'
import { loadTarget, draftTarget } from '../../_room.js'

// POST /api/room/:id/draft
//
// "Draft it." Finds the live trigger for this person, drafts the approach in
// Krish's voice, lands it in his Gmail drafts, and moves the row to drafted.
//
// This route can create a Gmail DRAFT and nothing else. It does not import
// the send function in api/_google.ts, so there is no path here that puts a
// message in front of another human. Krish presses send in Gmail, or marks it
// sent on the card after he has.

export const config = { maxDuration: 60 }

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (guard(req, res, ['POST'])) return

  const id = typeof req.query.id === 'string' ? req.query.id : ''
  if (!UUID.test(id)) return res.status(400).json({ ok: false, error: 'invalid_id' })

  if (!googleConfigured()) {
    return res.status(503).json({ ok: false, error: 'google_not_configured' })
  }

  try {
    const target = await loadTarget(id)
    if (!target) return res.status(404).json({ ok: false, error: 'target not found' })
    if (!target.contact) return res.status(409).json({ ok: false, error: 'target has no contact' })
    // Listed, or drafted again after an edit. Anything further along has left
    // the machine and is not redrafted from here.
    if (target.state !== 'listed' && target.state !== 'drafted') {
      return res.status(409).json({ ok: false, error: `cannot draft from state ${target.state}` })
    }
    const updated = await draftTarget(target)
    return res.status(200).json({ ok: true, target: updated })
  } catch (e: unknown) {
    return res.status(500).json({ ok: false, error: (e as Error)?.message?.slice(0, 200) || 'draft_failed' })
  }
}
