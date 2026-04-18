import type { VercelRequest, VercelResponse } from '@vercel/node'
import { supabase } from './_supabase.js'

const today = new Date().toLocaleDateString('en-GB', {
  weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
})

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Cache-Control', 'no-store')

  const { data: tasks, error } = await supabase
    .from('tasks')
    .select('*')
    .neq('status', 'done')

  if (error) return res.status(500).json({ error: error.message })

  const items: Array<{
    id: string; title: string; detail: string; owner: string;
    status: string; priority: number; est: string; link?: string
  }> = []

  let priorityCounter = 1

  for (const t of tasks || []) {
    if (t.owner !== 'krish' && t.blocked_by !== 'krish') continue

    const isHighPriority = t.priority === 'pri-0' || t.urgency === 'high' || t.urgency === 'CRITICAL'

    items.push({
      id: t.id,
      title: t.title,
      detail: t.description || t.next_step || `Assigned to: ${t.agent || t.owner}`,
      owner: 'krish',
      status: t.status === 'in_progress' ? 'active' : 'pending',
      priority: isHighPriority ? priorityCounter++ : priorityCounter + 10,
      est: '—',
      link: t.link_primary || ''
    })
  }

  items.sort((a, b) => a.priority - b.priority)

  res.json({ date: today, items })
}
