import type { VercelRequest, VercelResponse } from '@vercel/node'
import { promoteGuestToContact } from '../../_guest-to-contact.js'

// POST /api/guests/:id/promote-to-contact
// Promote a recorded/published guest into the Network as a contact. Idempotent.
export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  res.setHeader('Cache-Control', 'no-store')

  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Method not allowed' })

  const idParam = req.query?.id
  const id = Array.isArray(idParam) ? idParam[0] : idParam
  if (!id) return res.status(400).json({ ok: false, error: 'id is required' })

  const result = await promoteGuestToContact(id)
  if (!result.ok) return res.status(500).json(result)
  return res.json(result)
}
