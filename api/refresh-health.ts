import type { VercelRequest, VercelResponse } from '@vercel/node'
import { supabase } from './_supabase.js'

const N8N_BASE = process.env.N8N_API_BASE_URL
const N8N_KEY = process.env.N8N_API_KEY || ''

interface N8NList { data?: any[] }

async function fetchN8N(path: string): Promise<N8NList> {
  if (!N8N_BASE) throw new Error('Missing N8N_API_BASE_URL')
  const res = await fetch(`${N8N_BASE}${path}`, {
    headers: { 'X-N8N-API-KEY': N8N_KEY },
  })
  if (!res.ok) throw new Error(`N8N ${path}: ${res.status}`)
  return res.json() as Promise<N8NList>
}

interface HealthRow {
  component: string
  status: string
  message: string
  last_check: string
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Sync-Secret')
  res.setHeader('Cache-Control', 'no-store')

  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Use POST' })

  const now = new Date().toISOString()
  const rows: HealthRow[] = []

  try {
    const [workflows, executions] = await Promise.all([
      fetchN8N('/workflows?limit=200'),
      fetchN8N('/executions?limit=200'),
    ])

    const wfList: any[] = workflows.data || []
    const execList: any[] = executions.data || []

    const active = wfList.filter(w => w.active).length
    const inactive = wfList.length - active
    rows.push({
      component: 'N8N Cloud',
      status: 'healthy',
      message: `${active} active / ${inactive} inactive workflows`,
      last_check: now,
    })

    // Last execution per workflow
    const lastExec: Record<string, { status: string; startedAt: string }> = {}
    for (const ex of execList) {
      const id = ex.workflowId
      if (!lastExec[id] || ex.startedAt > lastExec[id].startedAt) {
        lastExec[id] = {
          status: ex.finished ? (ex.status === 'error' ? 'error' : 'success') : 'running',
          startedAt: ex.startedAt,
        }
      }
    }

    // Content workflows — heuristic: workflow name matches /content|draft|post|signal/i.
    // Bucket: healthy if >=80% recent execs succeeded, degraded if 50-79%, failing below.
    const contentWfs = wfList.filter(w =>
      /content|draft|post|signal sweep/i.test(w.name || '')
    )
    const contentSuccess = contentWfs.filter(w => lastExec[w.id]?.status === 'success').length
    const contentTotal = contentWfs.length
    const contentRate = contentTotal === 0 ? 0 : contentSuccess / contentTotal
    let contentStatus: string
    if (contentTotal === 0) contentStatus = 'unknown'
    else if (contentRate >= 0.8) contentStatus = 'healthy'
    else if (contentRate >= 0.5) contentStatus = 'degraded'
    else contentStatus = 'failing'
    rows.push({
      component: 'Content Engine',
      status: contentStatus,
      message: contentTotal === 0
        ? 'No content workflows detected'
        : `${contentSuccess}/${contentTotal} content workflows healthy`,
      last_check: now,
    })

    // Revenue Report Workflow (Leo) — known id pyr9wurcs1M9utW3
    const leoId = 'pyr9wurcs1M9utW3'
    const leoExec = lastExec[leoId]
    if (leoExec) {
      rows.push({
        component: 'Revenue Report Workflow',
        status: leoExec.status === 'success' ? 'healthy' : leoExec.status === 'error' ? 'failing' : 'degraded',
        message: `Last run ${leoExec.status} at ${new Date(leoExec.startedAt).toISOString()}`,
        last_check: now,
      })
    }

    // Status Webhook — known id cVnbywEWaDS4Xa5V
    const statusWebhookId = 'cVnbywEWaDS4Xa5V'
    const webhookWf = wfList.find(w => w.id === statusWebhookId)
    if (webhookWf) {
      rows.push({
        component: 'Status Webhook',
        status: webhookWf.active ? 'healthy' : 'inactive',
        message: webhookWf.active
          ? 'POST /webhook/status-update active'
          : 'Webhook workflow deactivated',
        last_check: now,
      })
    }

    // Upsert all rows (requires unique index on system_health(component); see
    // scripts/migrations/2026-05-18-refresh-system-health.sql).
    const { error } = await supabase
      .from('system_health')
      .upsert(rows, { onConflict: 'component' })

    if (error) return res.status(500).json({ ok: false, error: error.message })

    return res.status(200).json({ ok: true, updated: rows, fetched_at: now })
  } catch (err: any) {
    return res.status(500).json({ ok: false, error: err.message })
  }
}
