import type { VercelRequest, VercelResponse } from '@vercel/node'
import { readFileSync } from 'fs'
import { join } from 'path'

const today = new Date().toLocaleDateString('en-GB', {
  weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
})

const BLOCKED_PATH = join(process.cwd(), 'public', 'data', 'blocked.json')
const SYNC_CACHE_PATH = join(process.cwd(), 'public', 'data', 'sync-cache.json')

function getKrishStepsFromTasks() {
  let tasks = []
  
  // Try live sync cache first
  try {
    const syncData = JSON.parse(readFileSync(SYNC_CACHE_PATH, 'utf8'))
    if (syncData.tasks && syncData.tasks.length > 0) {
      tasks = syncData.tasks
    }
  } catch {}

  // Fall back to blocked.json
  if (tasks.length === 0) {
    try {
      const blockedData = JSON.parse(readFileSync(BLOCKED_PATH, 'utf8'))
      if (blockedData.tasks) {
        tasks = blockedData.tasks
      }
    } catch {}
  }

  const items: Array<{
    id: string; title: string; detail: string; owner: string;
    status: string; priority: number; est: string; link?: string
  }> = []

  let priority = 1

  for (const t of tasks) {
    if (t.status === 'done') continue
    if (t.owner !== 'krish' && t.blockedBy !== 'krish') continue

    const isHighPriority = t.priority === 'pri-0' || t.urgency === 'high' || t.urgency === 'CRITICAL'
    const est = t.estimated_mins ? `${t.estimated_mins} min` : '—'
    const link = t.linkPrimary || t.plan_doc_url || ''

    items.push({
      id: t.id,
      title: t.title,
      detail: t.description || t.nextStep || `Assigned to: ${t.agent || t.owner}`,
      owner: 'krish',
      status: t.status === 'in_progress' ? 'active' : 'pending',
      priority: isHighPriority ? priority++ : priority + 10,
      est: est,
      link: link
    })
  }

  // Sort: pri-0/high urgency first
  items.sort((a, b) => a.priority - b.priority)

  return items
}

export default function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Cache-Control', 'no-store')
  res.json({ date: today, items: getKrishStepsFromTasks() })
}
