import type { VercelRequest, VercelResponse } from '@vercel/node'
import { supabase } from '../_supabase.js'

// POST /api/weekly-focus/commit
//   Body: { week_of: 'YYYY-MM-DD', milestones: [{ milestone_id, goal_id }] (0..3),
//           retro_ack?: boolean,
//           custom_added?: [{ milestone_id, goal_id, title }],  -- moves Krish wrote himself
//           disliked?:    [{ milestone_id?, goal_id?, title?, reason_text? }] } -- "not a good move"
//   Upserts the weekly_focus row for the week (one per week), then replaces the
//   weekly_focus_milestones bridge rows for that week with the committed set.
//   This is the only write path for the weekly commitment; re-running it
//   mid-week is safe (idempotent replace). Caps at 3 server-side as defense in
//   depth behind the UI cap.
//
//   Two extensions (Phase 6):
//   - Taste signal: a move Krish hand-wrote (the slate missed it) or explicitly
//     dismissed becomes a weekly-altitude feedback_queue row
//     (reason_code=marcus_weekly_slate_override) so Marcus's slate learns.
//   - Ladder-down: after committing, fire (best-effort, non-blocking) the
//     milestone-ladder-down webhook so each committed milestone spawns its
//     agent-assigned tasks, immediately feeding the daily picker's
//     serves_milestone join. A missing/slow webhook never fails the commit.

const LADDER_DOWN_WEBHOOK = 'https://krishraja10101.app.n8n.cloud/webhook/milestone-ladder-down'

interface InMilestone {
  milestone_id?: string
  goal_id?: string
}

interface TasteItem {
  milestone_id?: string
  goal_id?: string
  title?: string
  reason_text?: string
}

interface Body {
  week_of?: string
  milestones?: InMilestone[]
  retro_ack?: boolean
  custom_added?: TasteItem[]
  disliked?: TasteItem[]
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

  // 3. Taste signal (weekly altitude): hand-written or dismissed moves teach the
  //    slate. Non-blocking; failures don't fail the commit.
  const taste: Array<Record<string, unknown>> = []
  for (const c of Array.isArray(body.custom_added) ? body.custom_added : []) {
    taste.push({
      source_table: 'weekly_slate',
      source_id: c.milestone_id || `${body.week_of}:custom`,
      agent_id: 'marcus',
      original_agent: 'marcus',
      original_item_id: c.milestone_id || null,
      vote: -1,
      reason_code: 'marcus_weekly_slate_override',
      reason_text: (c.title || '').slice(0, 500) || null,
      meta: { kind: 'krish_authored_custom', week_of: body.week_of, goal_id: c.goal_id || null, title: c.title || null },
      status: 'pending',
    })
  }
  for (const d of Array.isArray(body.disliked) ? body.disliked : []) {
    taste.push({
      source_table: 'weekly_slate',
      source_id: d.milestone_id || `${body.week_of}:dismissed`,
      agent_id: 'marcus',
      original_agent: 'marcus',
      original_item_id: d.milestone_id || null,
      vote: -1,
      reason_code: 'marcus_weekly_slate_override',
      reason_text: (d.reason_text || '').slice(0, 2000) || null,
      meta: { kind: 'dismissed', week_of: body.week_of, goal_id: d.goal_id || null, title: d.title || null },
      status: 'pending',
    })
  }
  if (taste.length > 0) {
    await supabase.from('feedback_queue').insert(taste).then(() => undefined, () => undefined)
  }

  // 4. Ladder-down (best-effort, short timeout). Each committed milestone gets
  //    its agent-assigned tasks generated so the daily picker has serves_milestone
  //    candidates. Missing/slow webhook is swallowed.
  let ladder_down_ok = false
  if (milestones.length > 0) {
    const ctrl = new AbortController()
    const tid = setTimeout(() => ctrl.abort('ladder_timeout'), 6_000)
    try {
      const lr = await fetch(LADDER_DOWN_WEBHOOK, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          week_of: body.week_of,
          weekly_focus_id,
          milestones: milestones.map(m => ({ milestone_id: m.milestone_id, goal_id: m.goal_id })),
        }),
        signal: ctrl.signal,
      })
      ladder_down_ok = lr.ok
    } catch { /* best-effort */ } finally { clearTimeout(tid) }
  }

  return res.json({ ok: true, week_of: body.week_of, weekly_focus_id, count: milestones.length, ladder_down_ok })
}
