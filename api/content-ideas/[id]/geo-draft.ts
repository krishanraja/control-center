import type { VercelRequest, VercelResponse } from '@vercel/node'
import { preamble } from '../../_content.js'
import { draftIdea } from '../../_geoRun.js'

// POST /api/content-ideas/:id/geo-draft
//
// Writes the piece an answer engine can quote, for an idea that came from the
// weekly research run. The work is in api/_geoRun.ts, which the unattended
// weekly job calls directly; this is the door a human comes through. Both
// arrive at the same function, so a page drafted by hand and a page drafted on
// Monday morning are the same page.

export const config = { maxDuration: 300 }

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (preamble(req, res)) return
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'method_not_allowed' })
  const id = typeof req.query.id === 'string' ? req.query.id : ''
  if (!id) return res.status(400).json({ ok: false, error: 'missing_id' })

  const r = await draftIdea(id, { overwrite: req.body?.overwrite === true })
  return res.status(r.status).json(r.body)
}
