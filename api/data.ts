import type { VercelRequest, VercelResponse } from '@vercel/node'
import { readFileSync, writeFileSync } from 'fs'
import { join } from 'path'

const BLOCKED_PATH = join(process.cwd(), 'public', 'data', 'blocked.json')

function readBlocked() {
  try {
    return JSON.parse(readFileSync(BLOCKED_PATH, 'utf8'))
  } catch {
    return { tasks: [] }
  }
}

export default function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, PATCH, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  res.setHeader('Cache-Control', 'no-store')

  if (req.method === 'OPTIONS') return res.status(200).end()

  if (req.method === 'GET') {
    return res.json(readBlocked())
  }

  // PATCH — update a task (status, comment, done)
  if (req.method === 'PATCH') {
    const { id, status, comment, done } = req.body || {}
    if (!id) return res.status(400).json({ error: 'id required' })

    const data = readBlocked()
    const task = (data.tasks || []).find((t: any) => t.id === id)
    if (!task) return res.status(404).json({ error: 'task not found' })

    if (done) task.status = 'done'
    else if (status) task.status = status

    if (comment) {
      task.comments = task.comments || []
      task.comments.push({ text: comment, from: 'krish', ts: new Date().toISOString() })
      task.feedbackText = comment
    }

    task.updatedAt = new Date().toISOString()
    data.updated_at = new Date().toISOString()

    // Forward to N8N for Radar to pick up hourly
    try {
      fetch('https://krishraja10101.app.n8n.cloud/webhook/krish-feedback', {
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
      }).catch(() => {}) // fire and forget
    } catch {}

    try {
      writeFileSync(BLOCKED_PATH, JSON.stringify(data, null, 2))
    } catch {
      // read-only FS on Vercel — in-memory update only
    }

    return res.json({ ok: true, task })
  }

  return res.status(405).json({ error: 'Method not allowed' })
}
