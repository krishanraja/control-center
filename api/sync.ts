import type { VercelRequest, VercelResponse } from '@vercel/node'
import { supabase } from './_supabase'

/**
 * POST /api/sync
 *
 * Receives tasks.json snapshot from the VPS sync pipeline.
 * Now writes directly to Supabase instead of caching to JSON.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Sync-Secret')
  res.setHeader('Cache-Control', 'no-store')

  if (req.method === 'OPTIONS') return res.status(200).end()

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed. Use POST.' })
  }

  const secret = process.env.SYNC_SECRET
  if (secret) {
    const provided = req.headers['x-sync-secret']
    if (provided !== secret) {
      return res.status(401).json({ error: 'Unauthorized' })
    }
  }

  const body = req.body || {}

  if (!Array.isArray(body.tasks)) {
    return res.status(400).json({ error: '"tasks" must be an array' })
  }

  const tasks: any[] = body.tasks
  const ts = new Date().toISOString()
  let upserted = 0

  for (const t of tasks) {
    if (!t.id) continue
    const agentId = t.agent ? t.agent.toLowerCase().split('+')[0].split('&')[0].trim() : null
    const { error } = await supabase.from('tasks').upsert({
      id: t.id,
      venture: t.venture || 'ops',
      title: t.title || 'Untitled',
      description: t.description,
      status: t.status || 'waiting',
      priority: t.priority,
      urgency: t.urgency,
      created: t.created,
      owner: t.owner,
      agent: agentId,
      group: t.group,
      group_label: t.groupLabel,
      link_primary: t.linkPrimary,
      link_secondary: t.linkSecondary,
      next_step: t.nextStep,
      blocked_by: t.blockedBy,
      updated_at: ts,
    })
    if (!error) upserted++
  }

  await supabase.from('audit_log').insert({
    event_type: 'sync_received',
    actor: 'vps-pipeline',
    target: 'tasks',
    details: `Synced ${upserted}/${tasks.length} tasks`
  })

  return res.status(200).json({ ok: true, received_tasks: tasks.length, upserted, ts })
}
