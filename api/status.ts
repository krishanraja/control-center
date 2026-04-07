import type { VercelRequest, VercelResponse } from '@vercel/node'

const N8N_BASE = 'https://krishraja10101.app.n8n.cloud/api/v1'
const N8N_KEY = process.env.N8N_API_KEY || ''

// Map N8N workflow IDs → friendly names
const WF_MAP: Record<string, string> = {
  SVr96xVfOCupWpK7: 'Error Monitor',
  AzalV2S1SngVdVMp: 'Health Check',
  mDIL4cjEmIVYDUf8: 'Morning Brief',
  oNZc5BRIBRXSNtu3: 'Content Sweep',
  UL59ByPJJtOK7sBG: 'Content Draft',
  nXnqdZTbEuk4CPzJ: 'Content Performance',
  O6AUi9W6UxBxhH94: 'LinkedIn Distribution',
  pyr9wurcs1M9utW3: 'Weekly Revenue',
  eB5Si7OAIFO8QZ8J: 'Mindmaker Stripe',
  XUiLRadMc0vvoM83: 'OnAlert Stripe',
  zjgOgd3puahqBwql: 'Fractionl Stripe',
  '7pzP0Xjto31rplTK': 'Feedback Receiver',
  WbHC2krWcX9IHbE7: 'Monthly All Hands',
  NgVcpJ7PO7sTYvm9: 'Content Approval',
  ZovvjMxZvkrBuMON: 'Apollo Enrichment',
  JAauFc4DyfkPaDOG: 'Proposal Review',
  gnwpyTFbusBrZG7P: 'Opportunity Pipeline',
  rtl6Xmx7tZXN8fS3: 'Feedback Distributor',
  '7DLTmJiAEhieoXwY': 'Status Board Writer',
  gJtEJ9kwSsAffxc3: 'Status Board API',
}

async function fetchN8N(path: string) {
  const res = await fetch(`${N8N_BASE}${path}`, {
    headers: { 'X-N8N-API-KEY': N8N_KEY }
  })
  if (!res.ok) throw new Error(`N8N ${path}: ${res.status}`)
  return res.json()
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Cache-Control', 'no-store, max-age=0')

  try {
    // Fetch all workflows + recent executions in parallel
    const [workflows, executions] = await Promise.all([
      fetchN8N('/workflows?limit=50'),
      fetchN8N('/executions?limit=100'),  // N8N API doesn't support comma-separated status — filter client-side
    ])

    const wfList = workflows.data || []
    const execList = executions.data || []

    // Build last-execution map per workflow
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
      name: WF_MAP[wf.id] || wf.name,
      active: wf.active,
      lastStatus: lastExec[wf.id]?.status ?? 'never',
      lastRun: lastExec[wf.id]?.startedAt ?? null,
    }))

    const activeCount = wfList.filter((w: any) => w.active).length
    const errorCount = workflowStatus.filter((w: any) => w.lastStatus === 'error').length
    const runningCount = workflowStatus.filter((w: any) => w.lastStatus === 'running').length

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
      // Agent status comes from the Status Board writer webhook
      // When agents start reporting, this will be populated
      agents: {
        note: 'Agent status updates via /webhook/status-update — populates when crons run'
      }
    })
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message })
  }
}
