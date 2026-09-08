import type { VercelRequest, VercelResponse } from '@vercel/node'
import { preamble } from '../../_content.js'
import { publishIdea } from '../../_geoRun.js'

// POST /api/content-ideas/:id/geo-publish
//
// Puts a drafted answer page into the venture's own site repository, on a
// branch behind a pull request, and records what it is expected to change
// before it can change anything. The work is in api/_geoRun.ts, shared with
// the unattended weekly job.
//
// The pull request is a standing veto rather than an approval gate: nobody has
// to act for the page to go live, and closing it is the one gesture that stops
// it.

export const config = { maxDuration: 60 }

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (preamble(req, res)) return
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'method_not_allowed' })
  const id = typeof req.query.id === 'string' ? req.query.id : ''
  if (!id) return res.status(400).json({ ok: false, error: 'missing_id' })

  const r = await publishIdea(id, { dry: req.body?.dry === true })
  return res.status(r.status).json(r.body)
}
