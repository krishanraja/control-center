import type { VercelRequest, VercelResponse } from '@vercel/node'
import { supabase } from './_supabase.js'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

  if (req.method === 'OPTIONS') return res.status(200).end()

  // Create a task from a signal (the Business Intelligence sheet's "Create
  // task"). This POST did not exist — the button had been 405ing since the
  // sheet shipped, and the browser could not insert directly either: `tasks`
  // has no anon INSERT policy and its status check forbids the 'todo' the
  // sheet used to send. Service-role insert, server-owned defaults: the task
  // lands active and pre-reviewed in OS → Queue, attributed to Marcus whose
  // signal it came from.
  if (req.method === 'POST') {
    const body = (req.body ?? {}) as Record<string, unknown>
    const title = typeof body.title === 'string' ? body.title.trim() : ''
    const description = typeof body.description === 'string' ? body.description.trim() : null
    const priority = body.priority === 'high' ? 'high' : 'medium'
    if (!title) return res.status(400).json({ error: 'title required' })

    const { data, error } = await supabase
      .from('tasks')
      .insert({
        title,
        description,
        next_step: title,
        owner: 'krish',
        agent: 'marcus',
        status: 'active',
        krish_reviewed: true,
        priority,
        workstream: 'intel',
        origin: 'intel-signal',
        created: new Date().toISOString(),
      })
      .select('id, title, status')
      .single()
    if (error || !data) return res.status(500).json({ error: error?.message || 'insert_failed' })
    return res.status(200).json({ ok: true, task: data })
  }

  if (req.method === 'GET') {
    const { data, error } = await supabase.from('feedback_queue').select('*').order('created_at', { ascending: false })
    if (error) return res.status(500).json({ error: error.message })
    return res.json({ items: data || [] })
  }

  if (req.method === 'PATCH') {
    const { id, status, comment, owner } = req.body || {}
    if (!id) return res.status(400).json({ error: 'id required' })

    // Check if entry exists
    const { data: existing } = await supabase.from('feedback_queue').select('*').eq('id', id).single()

    const updates: any = { updated_at: new Date().toISOString() }
    if (status) updates.status = status
    if (owner) updates.owner = owner

    if (comment) {
      const comments = Array.isArray(existing?.comments) ? existing.comments : []
      comments.push({ text: comment, from: 'krish', ts: Date.now() })
      updates.comments = comments
      updates.feedback_text = comment
    }

    if (existing) {
      const { data: entry, error } = await supabase.from('feedback_queue').update(updates).eq('id', id).select().single()
      if (error) return res.status(500).json({ error: error.message })
      return res.json({ ok: true, entry })
    } else {
      const { data: entry, error } = await supabase.from('feedback_queue').insert({ id, ...updates }).select().single()
      if (error) return res.status(500).json({ error: error.message })
      return res.json({ ok: true, entry })
    }
  }

  return res.status(405).json({ error: 'Method not allowed' })
}
