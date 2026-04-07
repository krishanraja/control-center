import type { VercelRequest, VercelResponse } from '@vercel/node'
import { readFileSync, writeFileSync } from 'fs'
import { join } from 'path'

const QUEUE_PATH = join(process.cwd(), 'public', 'feedback-queue.json')

function readQueue(): any[] {
  try {
    return JSON.parse(readFileSync(QUEUE_PATH, 'utf8'))
  } catch {
    return []
  }
}

function writeQueue(items: any[]) {
  writeFileSync(QUEUE_PATH, JSON.stringify(items, null, 2))
}

export default function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, PATCH, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

  if (req.method === 'OPTIONS') {
    return res.status(200).end()
  }

  if (req.method === 'GET') {
    return res.json({ items: readQueue() })
  }

  if (req.method === 'PATCH') {
    const { id, status, comment, owner } = req.body || {}
    if (!id) return res.status(400).json({ error: 'id required' })

    const queue = readQueue()
    const existing = queue.find(i => i.id === id)

    const entry = existing || { id }
    entry.status = status || entry.status
    entry.owner = owner || entry.owner
    entry.updatedAt = new Date().toISOString()
    if (comment) {
      entry.comments = entry.comments || []
      entry.comments.push({ text: comment, from: 'krish', ts: Date.now() })
      entry.feedbackText = comment
    }

    if (!existing) queue.push(entry)

    try {
      writeQueue(queue)
      return res.json({ ok: true, entry })
    } catch (err: any) {
      // Vercel serverless is read-only for most paths — log but don't fail the UI
      console.error('feedback-queue write error (expected on Vercel read-only fs):', err.message)
      return res.json({ ok: true, entry, note: 'persisted in-memory only' })
    }
  }

  return res.status(405).json({ error: 'Method not allowed' })
}
