import type { VercelRequest, VercelResponse } from '@vercel/node'
import { supabase } from '../_supabase.js'

// POST /api/daily-focus/calibrate
//   Body: { date, targets: [{ text, source, replaced_marcus_pick? }] }
//   Upserts daily_focus on focus_date, fires calibrator webhook async,
//   returns { ok, row_id } immediately. Also double-writes a feedback_queue
//   row per swap so Vera's weekly aggregation sees the override.

const N8N_BASE = (process.env.N8N_API_BASE_URL || 'https://krishraja10101.app.n8n.cloud').replace(/\/+$/, '')
const CALIBRATE_WEBHOOK = `${N8N_BASE}/webhook/focus-calibrate`

type Source = 'marcus_nominated' | 'krish_swapped' | 'krish_added'

interface InputTarget {
  text: string
  source: Source
  concept_id?: string | null
  replaced_marcus_pick?: Record<string, unknown> | null
}

interface Body {
  date?: string
  targets?: InputTarget[]
}

function isYmd(s: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(s)
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  res.setHeader('Cache-Control', 'no-store')
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST')    return res.status(405).json({ ok: false, error: 'Method not allowed' })

  const body = (req.body || {}) as Body
  if (!body.date || !isYmd(body.date)) return res.status(400).json({ ok: false, error: 'date must be YYYY-MM-DD' })
  if (!Array.isArray(body.targets) || body.targets.length !== 3) {
    return res.status(400).json({ ok: false, error: 'targets must be exactly 3 entries' })
  }
  for (let i = 0; i < 3; i++) {
    const t = body.targets[i]
    if (!t || typeof t.text !== 'string' || t.text.trim().length === 0) {
      return res.status(400).json({ ok: false, error: `targets[${i}].text required` })
    }
    if (!['marcus_nominated', 'krish_swapped', 'krish_added'].includes(t.source)) {
      return res.status(400).json({ ok: false, error: `targets[${i}].source invalid` })
    }
  }

  const row: Record<string, unknown> = {
    focus_date: body.date,
    status: 'pending',
    relevance_index: {},
    marcus_suggestions: [],
  }
  body.targets.forEach((t, i) => {
    const n = i + 1
    row[`target_${n}_text`] = t.text.trim()
    row[`target_${n}_source`] = t.source
    row[`target_${n}_concept_id`] = t.concept_id || null
    row[`target_${n}_replaced_marcus_pick`] = t.replaced_marcus_pick || null
  })

  const { data, error } = await supabase
    .from('daily_focus')
    .upsert(row, { onConflict: 'focus_date' })
    .select('id')
    .single()
  if (error) return res.status(500).json({ ok: false, error: error.message })
  const row_id = data.id as string

  // Double-write feedback rows for swaps + added picks. Mirrors the
  // Phase 0 marcus_priority_override shape so Vera's weekly aggregation
  // picks them up alongside the Home swap affordance.
  const overrideRows = body.targets
    .map((t, i) => ({ t, slot: i }))
    .filter(({ t }) => t.source === 'krish_swapped' || t.source === 'krish_added')
    .map(({ t, slot }) => ({
      source_table: 'home_intelligence',
      source_id: String(slot),
      agent_id: 'marcus',
      original_agent: 'marcus',
      original_item_id: String(slot),
      vote: -1,
      reason_code: 'marcus_priority_override',
      reason_text: t.text,
      meta: {
        original_pick_title: (t.replaced_marcus_pick as { title?: string } | null)?.title || null,
        original_pick_meta: t.replaced_marcus_pick || null,
        replaced_with_text: t.text,
        captured_at: new Date().toISOString(),
        source_phase: 'phase1_calibrate',
      },
      status: 'pending',
    }))
  if (overrideRows.length > 0) {
    await supabase.from('feedback_queue').insert(overrideRows)
  }

  // Fire the calibrator webhook but don't await. The webhook does the
  // semantic match against the candidate pool and writes back
  // relevance_index + status='calibrated'.
  fetch(CALIBRATE_WEBHOOK, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      date: body.date,
      row_id,
      targets: body.targets.map((t, i) => ({
        text: t.text.trim(),
        slot: i + 1,
        source: t.source,
        concept_id: t.concept_id || null,
        replaced_marcus_pick: t.replaced_marcus_pick || null,
      })),
    }),
  }).catch((e) => {
    console.warn('focus-calibrate webhook fire-and-forget failed:', (e as Error).message)
  })

  return res.json({ ok: true, row_id })
}
