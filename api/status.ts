import type { VercelRequest, VercelResponse } from '@vercel/node'
import { supabase } from './_supabase'

const N8N_BASE = process.env.N8N_API_BASE_URL ?? 'https://krishraja10101.app.n8n.cloud/api/v1'
const N8N_KEY = process.env.N8N_API_KEY || ''

async function fetchN8N(path: string) {
  const res = await fetch(`${N8N_BASE}${path}`, {
    headers: { 'X-N8N-API-KEY': N8N_KEY }
  })
  if (!res.ok) throw new Error(`N8N ${path}: ${res.status}`)
  return res.json()
}

async function loadWorkflowNames(): Promise<Record<string, string>> {
  const { data, error } = await supabase
    .from('system_config')
    .select('value')
    .eq('key', 'n8n_workflow_names')
    .maybeSingle()
  if (error || !data?.value) return {}
  const value = data.value
  if (typeof value === 'string') {
    try { return JSON.parse(value) as Record<string, string> } catch { return {} }
  }
  if (value && typeof value === 'object') return value as Record<string, string>
  return {}
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Cache-Control', 'no-store, max-age=0')

  try {
    const [workflows, executions, wfMap] = await Promise.all([
      fetchN8N('/workflows?limit=50'),
      fetchN8N('/executions?limit=100'),
      loadWorkflowNames(),
    ])

    const wfList = workflows.data || []
    const execList = executions.data || []

    const lastExec: Record<string, { status: string; startedAt: string; stoppedAt?: string }> = {}
    for (const ex of execList) {
      const wfId = ex.workflowId
      if (!lastExec[wfId] || ex.startedAt > lastExec[wfId].startedAt) {
        lastExec[wfId] = {
          status: ex.finished ? (ex.status === 'error' ? 'error' : 'success') : 'running',
          startedAt: ex.startedAt,
          stoppedAt: ex.stoppedAt,
        }
      }
    }

    const workflowStatus = wfList.map((wf: any) => ({
      id: wf.id,
      name: wfMap[wf.id] || wf.name,
      active: wf.active,
      lastStatus: lastExec[wf.id]?.status ?? 'never',
      lastRun: lastExec[wf.id]?.startedAt ?? null,
    }))

    const activeCount = wfList.filter((w: any) => w.active).length
    const errorCount = workflowStatus.filter((w: any) => w.lastStatus === 'error').length
    const runningCount = workflowStatus.filter((w: any) => w.lastStatus === 'running').length

    if (Object.keys(wfMap).length === 0) {
      res.setHeader('X-Warning', 'n8n_workflow_names missing from system_config')
    }

    res.json({
      ok: true,
      fetched_at: new Date().toISOString(),
      workflows: {
        total: wfList.length,
        active: activeCount,
        errors: errorCount,
        running: runningCount,
        list: workflowStatus,
      },
      agents: {
        note: 'Agent status updates via /webhook/status-update — populates when crons run'
      }
    })
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message })
  }
}
