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
//   - Ladder-down: after committing, each committed milestone spawns one task
//     per contributing agent (deterministic, idempotent on (milestone_id,
//     agent) in the objective-ladder workstream), immediately feeding the daily
//     picker's serves_milestone join. Best-effort: a failure here never fails
//     the commit.

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

  // 4. Ladder-down: each committed milestone spawns one task per contributing
  //    agent so the daily picker immediately has serves_milestone candidates.
  //    Deterministic + idempotent on (milestone_id, agent) within the
  //    objective-ladder workstream. Best-effort: failures don't fail the commit.
  let tasks_created = 0
  if (milestones.length > 0) {
    try {
      const mids = milestones.map(m => m.milestone_id as string)
      const gids = Array.from(new Set(milestones.map(m => m.goal_id as string)))

      const [{ data: mrows }, { data: crows }, { data: existing }] = await Promise.all([
        supabase.from('milestones').select('id, title').in('id', mids),
        supabase.from('goal_agent_contributions').select('goal_id, agent_id, contribution_note').in('goal_id', gids),
        supabase.from('tasks').select('milestone_id, agent').in('milestone_id', mids).eq('workstream', 'objective-ladder'),
      ])

      const titleById = new Map((mrows || []).map(r => [r.id as string, r.title as string]))
      const contribByGoal = new Map<string, Array<{ agent_id: string | null; contribution_note: string | null }>>()
      for (const c of (crows || []) as Array<{ goal_id: string; agent_id: string | null; contribution_note: string | null }>) {
        const arr = contribByGoal.get(c.goal_id) || []
        arr.push({ agent_id: c.agent_id, contribution_note: c.contribution_note })
        contribByGoal.set(c.goal_id, arr)
      }
      const seen = new Set(
        ((existing || []) as Array<{ milestone_id: string; agent: string | null }>).map(t => `${t.milestone_id}::${t.agent || ''}`),
      )

      const now = new Date().toISOString()
      const newTasks: Array<Record<string, unknown>> = []
      for (const m of milestones) {
        const title = titleById.get(m.milestone_id as string) || 'Milestone work'
        const owners = contribByGoal.get(m.goal_id as string) || []
        const list = owners.length > 0
          ? owners.map(o => ({ agent: o.agent_id, note: o.contribution_note }))
          : [{ agent: null as string | null, note: null as string | null }]
        for (const o of list) {
          const key = `${m.milestone_id}::${o.agent || ''}`
          if (seen.has(key)) continue
          seen.add(key)
          newTasks.push({
            title,
            status: 'waiting',
            agent: o.agent,
            goal_id: m.goal_id,
            milestone_id: m.milestone_id,
            workstream: 'objective-ladder',
            next_step: o.note,
            origin: 'user',
            created: now,
          })
        }
      }
      if (newTasks.length > 0) {
        const { data: ins } = await supabase.from('tasks').insert(newTasks).select('id')
        tasks_created = (ins || []).length
      }
    } catch { /* ladder-down is best-effort */ }
  }

  return res.json({ ok: true, week_of: body.week_of, weekly_focus_id, count: milestones.length, tasks_created })
}
