import type { VercelRequest, VercelResponse } from '@vercel/node'
import { writeFileSync } from 'fs'
import { join } from 'path'

/**
 * POST /api/sync
 *
 * Receives tasks.json snapshot from the VPS sync pipeline (git hook / cron).
 * Validates, normalises, and caches to public/data/sync-cache.json.
 *
 * Body: { "tasks": [...], "updated_at": "ISO8601", "agent_states": {...} }
 */

const CACHE_PATH = join(process.cwd(), 'public', 'data', 'sync-cache.json')

export default function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Sync-Secret')
  res.setHeader('Cache-Control', 'no-store')

  if (req.method === 'OPTIONS') return res.status(200).end()

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed. Use POST.' })
  }

  // Optional secret guard — set SYNC_SECRET env var in Vercel to enable
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

  if (!body.updated_at) {
    return res.status(400).json({ error: '"updated_at" is required' })
  }

  const tasks: any[] = body.tasks
  const ts = new Date().toISOString()

  // Build quick-access slices for UI consumption
  const by_status: Record<string, number> = {}
  const by_agent: Record<string, number> = {}

  for (const t of tasks) {
    const s = t.status || 'unknown'
    const a = t.agent || 'unassigned'
    by_status[s] = (by_status[s] || 0) + 1
    by_agent[a] = (by_agent[a] || 0) + 1
  }

  const snapshot = {
    tasks,
    updated_at: body.updated_at,
    agent_states: body.agent_states || {},
    synced_at: ts,
    task_count: tasks.length,
    by_status,
    by_agent,
  }

  // Persist to public/data/sync-cache.json (SPA-accessible static JSON)
  try {
    writeFileSync(CACHE_PATH, JSON.stringify(snapshot, null, 2))
  } catch {
    // Vercel serverless has a read-only FS — skip silently
  }

  console.log(`[sync] received ${tasks.length} tasks @ ${ts}`)

  return res.status(200).json({
    ok: true,
    received_tasks: tasks.length,
    ts,
  })
}
