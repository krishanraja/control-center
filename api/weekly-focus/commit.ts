import type { VercelRequest, VercelResponse } from '@vercel/node'
import { supabase } from '../_supabase.js'

// POST /api/weekly-focus/commit
//   Body: { week_of: 'YYYY-MM-DD', milestones: [{ milestone_id, goal_id }] (0..3), retro_ack?: boolean }
//   Upserts the weekly_focus row for the week (one per week), then replaces the
//   weekly_focus_milestones bridge rows for that week with the committed set.
//   This is the only write path for the weekly commitment; re-running it
//   mid-week is safe (idempotent replace). Caps at 3 server-side as defense in
//   depth behind the UI cap.

interface InMilestone {
  milestone_id?: string
  goal_id?: string
}

interface Body {
  week_of?: string
  milestones?: InMilestone[]
  retro_ack?: boolean
}

function isYmd(s: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(s)
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  res.setHeader('Cache-Control', 'no-store')
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST')    return res.status(405).json({ ok: false, error: 'Method not allowed' })

  const body = (req.body || {}) as Body
  if (!body.week_of || !isYmd(body.week_of)) {
    return res.status(400).json({ ok: false, error: 'week_of must be YYYY-MM-DD' })
  }
  const milestones = Array.isArray(body.milestones) ? body.milestones : []
  if (milestones.length > 3) {
    return res.status(400).json({ ok: false, error: 'at most 3 weekly milestones' })
  }
  for (let i = 0; i < milestones.length; i++) {
    const m = milestones[i]
    if (!m || typeof m.milestone_id !== 'string' || !UUID_RE.test(m.milestone_id)) {
      return res.status(400).json({ ok: false, error: `milestones[${i}].milestone_id must be a uuid` })
    }
    if (typeof m.goal_id !== 'string' || m.goal_id.trim().length === 0) {
      return res.status(400).json({ ok: false, error: `milestones[${i}].goal_id required` })
    }
  }

  // 1. Upsert the weekly commitment record (one per week_of).
  const { data: wf, error: wfErr } = await supabase
    .from('weekly_focus')
    .upsert(
      {
        week_of: body.week_of,
        status: 'committed',
        committed_at: new Date().toISOString(),
        retro_ack: !!body.retro_ack,
        source: 'krish_committed',
      },
      { onConflict: 'week_of' },
    )
    .select('id')
    .single()
  if (wfErr) return res.status(500).json({ ok: false, error: wfErr.message })
  const weekly_focus_id = wf.id as string

  // 2. Replace the bridge rows for the week (idempotent re-commit).
  const { error: delErr } = await supabase
    .from('weekly_focus_milestones')
    .delete()
    .eq('week_of', body.week_of)
  if (delErr) return res.status(500).json({ ok: false, error: delErr.message })

  if (milestones.length > 0) {
    const rows = milestones.map(m => ({
      weekly_focus_id,
      week_of: body.week_of,
      milestone_id: m.milestone_id as string,
      goal_id: m.goal_id as string,
    }))
    const { error: insErr } = await supabase.from('weekly_focus_milestones').insert(rows)
    if (insErr) return res.status(500).json({ ok: false, error: insErr.message })
  }

  return res.json({ ok: true, week_of: body.week_of, weekly_focus_id, count: milestones.length })
}
