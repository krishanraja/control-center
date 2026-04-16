// Leo's N8N workflow (pyr9wurcs1M9utW3) writes to `business_metrics` every Friday at 11AM EST.
// To update a metric manually:
//   PATCH /rest/v1/business_metrics?id=eq.monthly-revenue
//   Body: {"value": "$X,XXX", "status": "hit", "updated_by": "leo"}

import type { VercelRequest, VercelResponse } from '@vercel/node'
import { supabase } from './_supabase'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Cache-Control', 'no-store')

  // Build metrics from live task data
  const { data: tasks } = await supabase.from('tasks').select('status, priority, venture, agent')

  const byStatus: Record<string, number> = {}
  const byVenture: Record<string, number> = {}
  for (const t of tasks || []) {
    byStatus[t.status] = (byStatus[t.status] || 0) + 1
    if (t.venture) byVenture[t.venture] = (byVenture[t.venture] || 0) + 1
  }

  res.json({
    total_tasks: tasks?.length || 0,
    by_status: byStatus,
    by_venture: byVenture,
    updated_at: new Date().toISOString(),
    updated_by: 'supabase'
  })
}
