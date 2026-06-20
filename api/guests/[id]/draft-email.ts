import type { VercelRequest, VercelResponse } from '@vercel/node'
import { supabase } from '../../_supabase.js'
import { loadOutboundVoice } from '../../_voice.js'
import { deliverEmailDraft } from '../../_emailDraft.js'

// POST /api/guests/:id/draft-email
// Server-side proxy to the Cleo Email Draft N8N workflow for podcast guests.

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

  // SELECT ONLY REAL COLUMNS. guests has no role/company/why_relevant columns;
  // the equivalent signal lives in one_liner / why_fit (a dead-column bug that
  // previously made this select error and 404 every guest).
  const { data: g, error } = await supabase
    .from('guests')
    .select('id, name, email, one_liner, why_fit, personal_url, twitter_handle')
    .eq('id', id)
    .single()
  if (error || !g) return res.status(404).json({ ok: false, error: 'guest not found' })
  if (!g.email) return res.status(422).json({ ok: false, error: 'guest has no email address' })

  const intent = (req.body && typeof req.body.intent === 'string') ? req.body.intent : 'podcast_invite'
  const forceDirect = !!(req.body && req.body.mode === 'direct')

  // Ground the draft in the full krish-voice (content_voice_block), same as every
  // other outbound surface.
  const voiceRules = await loadOutboundVoice()

  try {
    const result = await deliverEmailDraft({
      entity_type: 'guest',
      entity_id: g.id,
      recipient_email: g.email,
      recipient_name: g.name || null,
      recipient_title: g.one_liner || null,
      recipient_company: null,
      context: g.why_fit || g.one_liner || null,
      voice_rules: voiceRules || null,
      intent,
    }, { forceDirect })
    return res.status(200).json({ ok: true, ...result })
  } catch (e: any) {
    return res.status(502).json({ ok: false, error: `Draft failed: ${e?.message || String(e)}` })
  }
}
