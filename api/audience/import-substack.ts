import type { VercelRequest, VercelResponse } from '@vercel/node'
import { supabase } from '../_supabase.js'

// Substack CSV import proxy.
//
// The Control Center Substack dropzone POSTs a raw CSV export here. We hand it
// to the OS `audience_import_proxy` RPC, which (via the http extension and a
// Vault-held gate secret) forwards the CSV to the Mindmaker AI app-DB
// `import-audience-csv` edge function, then immediately syncs. Free subscribers
// become leads, paid subscribers become Subscriptions (never both). No secret
// is held in the Control Center.
//
// Input:  { csv: string, source?: 'mindmaker_live' | 'tech0nomic' }
// Output: { ok: true, import: {...}, sync: {...} }

const ALLOWED_SOURCES = new Set(['mindmaker_live', 'tech0nomic'])

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  res.setHeader('Cache-Control', 'no-store')

  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const body = (req.body || {}) as { csv?: string; source?: string }
  if (!body.csv || !body.csv.trim()) {
    return res.status(400).json({ ok: false, error: 'csv is required' })
  }
  const source = body.source || 'mindmaker_live'
  if (!ALLOWED_SOURCES.has(source)) {
    return res.status(400).json({ ok: false, error: `source must be one of ${[...ALLOWED_SOURCES].join(', ')}` })
  }

  const { data, error } = await supabase.rpc('audience_import_proxy', { p_csv: body.csv, p_source: source })
  if (error) {
    return res.status(502).json({ ok: false, error: error.message })
  }
  const result = (data || {}) as { ok?: boolean; import?: any; sync?: any; error?: string }
  if (!result.ok) {
    return res.status(502).json({ ok: false, error: result.error || 'import failed', detail: result })
  }
  const imp = result.import || {}
  return res.json({
    ok: true,
    processed: imp.processed ?? 0,
    paid: imp.paid ?? 0,
    free: imp.free ?? 0,
    skipped: imp.skipped ?? 0,
    sync: result.sync || null,
  })
}
