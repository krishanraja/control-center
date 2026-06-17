import type { VercelRequest, VercelResponse } from '@vercel/node'
import { supabase } from '../../_supabase.js' // .js extension MANDATORY (ESM, "type":"module")

// POST /api/guests/:id/briefing
//
// Generate-only internal Speaker Briefing prep doc (no publish; PUB-001/005 satisfied).
// Optimistically flips the guest to briefing_status='generating' (Realtime swaps the
// GuestCard button instantly), then fires the Nell Guest Speaker Briefing webhook.
//
// Idempotency: if a briefing is already 'generating' and was requested within the last
// 15 min, returns without re-firing (allow re-fire if older, or if body.force).
//
// Body: { force?: boolean }
// Response: { ok, briefing_status } | { ok:false, error }

const N8N_BRIEFING_URL =
  process.env.N8N_SPEAKER_BRIEFING_WEBHOOK_URL ||
  'https://krishraja10101.app.n8n.cloud/webhook/guest-speaker-briefing'

const AGATHA_SECRET = process.env.AGATHA_WEBHOOK_SECRET || ''

const STALE_MS = 15 * 60 * 1000

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

  // SELECT ONLY REAL COLUMNS (no role/company/why_relevant — they do not exist on guests).
  const { data: g, error } = await supabase
    .from('guests')
    .select(
      'id, name, email, linkedin_url, twitter_handle, personal_url, podcast_target, ' +
        'one_liner, why_fit, notes, fit_score, status, raw_data, briefing_status, ' +
        'briefing_doc_url, briefing_requested_at',
    )
    .eq('id', id)
    .single()
  if (error || !g) return res.status(404).json({ ok: false, error: 'guest not found' })

  // Need something to research. Company is derived downstream from one_liner/raw_data, not a column.
  if (!g.name && !g.personal_url && !g.linkedin_url && !g.email) {
    return res.status(422).json({ ok: false, error: 'guest has no name/url/email to research' })
  }

  const force = !!(req.body && (req.body as { force?: unknown }).force)
  const reqAt = g.briefing_requested_at ? new Date(g.briefing_requested_at).getTime() : 0
  const isStale = Date.now() - reqAt > STALE_MS
  if (g.briefing_status === 'generating' && !force && !isStale) {
    return res.status(200).json({ ok: true, already: true, briefing_status: 'generating', note: 'already in progress' })
  }

  // Optimistic flip so Realtime swaps the button to "Briefing…" instantly.
  await supabase
    .from('guests')
    .update({ briefing_status: 'generating', briefing_requested_at: new Date().toISOString() })
    .eq('id', id)

  await supabase.from('audit_log').insert({
    event_type: 'guest_briefing_requested',
    actor: 'krish',
    target: id,
    details: JSON.stringify({ name: g.name, podcast_target: g.podcast_target, force }),
  })

  try {
    const r = await fetch(N8N_BRIEFING_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(AGATHA_SECRET ? { 'X-Agatha-Secret': AGATHA_SECRET } : {}),
      },
      body: JSON.stringify({
        entity_type: 'guest',
        guest_id: g.id,
        name: g.name || null,
        personal_url: g.personal_url || null,
        linkedin_url: g.linkedin_url || null,
        twitter_handle: g.twitter_handle || null,
        podcast_target: g.podcast_target, // drives tone + angle ladder
        context: g.why_fit || g.one_liner || null,
        notes: g.notes || null,
        force,
      }),
    })
    if (!r.ok) {
      await supabase.from('guests').update({ briefing_status: 'failed' }).eq('id', id)
      const body = await r.text()
      return res.status(502).json({ ok: false, error: `N8N ${r.status}`, body: body.slice(0, 300) })
    }
    return res.status(200).json({ ok: true, briefing_status: 'generating' }) // fire-and-forward
  } catch (e: any) {
    await supabase.from('guests').update({ briefing_status: 'failed' }).eq('id', id)
    return res.status(502).json({ ok: false, error: `N8N call failed: ${e?.message || String(e)}` })
  }
}
