import type { VercelRequest, VercelResponse } from '@vercel/node'
import { supabase } from './_supabase.js'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, PATCH, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  res.setHeader('Cache-Control', 'no-store')

  if (req.method === 'OPTIONS') return res.status(200).end()

  if (req.method === 'GET') {
    const { data: tasks, error } = await supabase
      .from('tasks')
      .select('*')
      .order('priority', { ascending: true })

    if (error) return res.status(500).json({ error: error.message })

    // Map DB columns to camelCase for frontend compatibility
    const mapped = (tasks || []).map((t: any) => ({
      ...t,
      groupLabel: t.group_label,
      linkPrimary: t.link_primary,
      linkSecondary: t.link_secondary,
      nextStep: t.next_step,
      blockedBy: t.blocked_by,
      completedAt: t.completed_at,
      updatedAt: t.updated_at,
      feedbackText: t.feedback_text,
    }))

    return res.json({ tasks: mapped, updated_at: new Date().toISOString() })
  }

  if (req.method === 'PATCH') {
    const { id, status, comment, done } = req.body || {}
    if (!id) return res.status(400).json({ error: 'id required' })

    const updates: any = { updated_at: new Date().toISOString() }
    if (done) updates.status = 'done'
    else if (status) updates.status = status

    if (comment) {
      // Fetch current comments, append
      const { data: current } = await supabase.from('tasks').select('comments').eq('id', id).single()
      const comments = Array.isArray(current?.comments) ? current.comments : []
      comments.push({ text: comment, from: 'krish', ts: new Date().toISOString() })
      updates.comments = comments
      updates.feedback_text = comment
    }

    const { data: task, error } = await supabase
      .from('tasks')
      .update(updates)
      .eq('id', id)
      .select()
      .single()

    if (error) return res.status(404).json({ error: error.message })

    // Forward to N8N (fire and forget)
    const n8nUrl = process.env.N8N_FEEDBACK_URL
    if (n8nUrl) {
      try {
        fetch(n8nUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            taskId: id,
            feedback: comment || '',
            status: done ? 'done' : status,
            timestamp: new Date().toISOString(),
            submittedBy: 'krish',
            agent: task.agent || 'unknown',
            title: task.title
          })
        }).catch(() => {})
      } catch {}
    }

    // Log to audit
    try {
      await supabase.from('audit_log').insert({
      event_type: 'task_updated',
      actor: 'krish',
      target: id,
      changes: updates,
      details: comment || `status -> ${updates.status}`
      })
    } catch {}

    return res.json({ ok: true, task })
  }

  return res.status(405).json({ error: 'Method not allowed' })
}
