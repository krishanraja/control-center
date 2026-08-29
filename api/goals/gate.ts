import type { VercelRequest, VercelResponse } from '@vercel/node'
import { supabase } from '../_supabase.js'
import { gateGoal, HORIZONS, type Horizon } from '../_goalGate.js'

// POST /api/goals/gate
//
// Judge a goal WITHOUT writing it, so the editor can show the verdict while
// Krish is still typing. The same gate runs again server-side on the write
// path, so this endpoint is a preview and never the enforcement point: a
// client that skipped it cannot smuggle an ungated goal in.

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  res.setHeader('Cache-Control', 'no-store')
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'POST only' })

  const body = (req.body || {}) as {
    title?: string
    horizon?: string
    parent_id?: string | null
    venture?: string | null
  }

  const title = String(body.title || '').trim()
  if (!title) return res.status(400).json({ ok: false, error: 'title required' })
  if (!HORIZONS.includes(body.horizon as Horizon)) {
    return res.status(400).json({ ok: false, error: `horizon must be one of ${HORIZONS.join(', ')}` })
  }

  // The parent's title, not just its id: "what does this serve" is a judgment
  // the model cannot make from a slug.
  let parentTitle: string | null = null
  if (body.parent_id) {
    const { data } = await supabase.from('goals').select('title').eq('id', body.parent_id).maybeSingle()
    parentTitle = (data as { title?: string } | null)?.title ?? null
  }

  try {
    const verdict = await gateGoal(title, body.horizon as Horizon, {
      parentId: body.parent_id ?? null,
      parentTitle,
      venture: body.venture ?? null,
    })
    return res.json({ ok: true, ...verdict })
  } catch (e) {
    return res.status(500).json({ ok: false, error: e instanceof Error ? e.message : 'gate failed' })
  }
}
