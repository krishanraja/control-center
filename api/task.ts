import type { VercelRequest, VercelResponse } from '@vercel/node'
import { supabase } from './_supabase'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, PATCH, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

  if (req.method === 'OPTIONS') return res.status(200).end()

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
