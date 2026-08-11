import type { VercelRequest, VercelResponse } from '@vercel/node'
import { supabase } from '../../_supabase.js'
import { canonicalVenture } from '../../_venturePositioning.js'

// PATCH /api/contacts/:id — light edits from the Network detail sheet.
// Primary use: reassign a contact's venture (e.g. a recorded Signal & Noise
// guest who's actually a better fit for another venture).

// 'meliora' and 'adfixus' are retired but stay accepted here: contacts tagged
// before the July 2026 retirement still PATCH their existing venture back on an
// unrelated edit, and rejecting it would 400 those saves. The pickers no longer
// offer them, so this set only ever readmits a value that is already on the row.
// Same reasoning applies to signal_noise and builder_economy, retired as
// ventures on 2026-08-11: still accepted, no longer offered.
const KNOWN_VENTURES = new Set([
  // live
  'mindmaker', 'mindmaker_live', 'mm_ctrl', 'fractionl_circle', 'fractionl_pulse', 'full_time', 'investor',
  // retired, accepted so historical rows can still PATCH
  'meliora', 'adfixus', 'signal_noise', 'builder_economy', 'mymu', 'legibility',
])

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'PATCH, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  res.setHeader('Cache-Control', 'no-store')

  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'PATCH') return res.status(405).json({ error: 'Method not allowed' })

  const idParam = req.query?.id
  const id = Array.isArray(idParam) ? idParam[0] : idParam
  if (!id) return res.status(400).json({ error: 'id is required' })

  const body = (req.body || {}) as Record<string, unknown>
  const updates: Record<string, unknown> = {}

  if ('primary_venture' in body) {
    const v = body.primary_venture
    if (v === null) updates.primary_venture = null
    // Accept what the pickers send, store what the data uses. Every venture
    // reader (fit_scores, VENTURE_POSITIONING, the network importer) says
    // `fractionl`; only the contact pickers say `fractionl_pulse`, and writing
    // that put a slug in the column that nothing else could resolve.
    else if (typeof v === 'string' && KNOWN_VENTURES.has(v)) updates.primary_venture = canonicalVenture(v)
    else return res.status(400).json({ error: `invalid primary_venture: ${String(v)}` })
  }
  // NOTE: no `notes` handling. contacts has no notes column, so the branch that
  // used to be here made every PATCH carrying notes a 500. Nothing sends it;
  // accepting a field that cannot be stored is worse than not offering it.

  if (Object.keys(updates).length === 0) {
    return res.status(400).json({ error: 'no updatable fields supplied' })
  }

  const { data, error } = await supabase
    .from('contacts')
    .update(updates)
    .eq('id', id)
    .select()
    .single()

  if (error) return res.status(500).json({ ok: false, error: error.message })
  return res.json({ ok: true, contact: data })
}
