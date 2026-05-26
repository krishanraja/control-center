import type { VercelRequest, VercelResponse } from '@vercel/node'
import { supabase } from '../_supabase.js'

/**
 * GET  /api/config/lead-auto-enrich   -> { enabled: boolean }
 * POST /api/config/lead-auto-enrich   body { enabled: boolean } -> { ok: true, enabled }
 *
 * Backs the Lead Auto-Enrich toggle on DesktopLeads. When `true`, the n8n
 * Apollo Contact Enrichment workflow + future auto-enrichment paths fire
 * automatically on new lead ingest. When `false`, only explicit manual
 * triggers (e.g. LeadCard's "Enrich" button which sets manual_trigger:true)
 * burn Apollo credits.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Cache-Control', 'no-store')
  if (req.method === 'GET') {
    const { data, error } = await supabase
      .from('system_config')
      .select('value')
      .eq('key', 'lead_auto_enrich_enabled')
      .maybeSingle()
    if (error) return res.status(500).json({ ok: false, error: error.message })
    const enabled = data?.value === 'true' || data?.value === true
    return res.json({ ok: true, enabled })
  }
  if (req.method === 'POST') {
    const body = (req.body || {}) as { enabled?: boolean }
    if (typeof body.enabled !== 'boolean') {
      return res.status(400).json({ ok: false, error: 'enabled must be boolean' })
    }
    const { error } = await supabase
      .from('system_config')
      .upsert({ key: 'lead_auto_enrich_enabled', value: body.enabled ? 'true' : 'false' }, { onConflict: 'key' })
    if (error) return res.status(500).json({ ok: false, error: error.message })
    return res.json({ ok: true, enabled: body.enabled })
  }
  return res.status(405).json({ ok: false, error: 'GET or POST only' })
}
