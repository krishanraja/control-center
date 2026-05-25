import type { VercelRequest, VercelResponse } from '@vercel/node'

// POST /api/automations/:workflow_id/rerun
//
// N8N's public API doesn't expose a generic "trigger any workflow" endpoint.
// For webhook-triggered workflows we look up the webhook node and POST to it.
// For scheduled workflows (no webhook trigger) we return 422 with guidance —
// the user must trigger via the n8n UI's "Execute Workflow" button.

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  res.setHeader('Cache-Control', 'no-store')

  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Method not allowed' })

  const N8N_BASE = process.env.N8N_API_BASE_URL
  const N8N_KEY = process.env.N8N_API_KEY
  if (!N8N_BASE || !N8N_KEY) {
    return res.status(503).json({ ok: false, error: 'N8N_API_BASE_URL or N8N_API_KEY not configured' })
  }

  const idParam = req.query?.workflow_id
  const workflowId = Array.isArray(idParam) ? idParam[0] : idParam
  if (!workflowId) return res.status(400).json({ ok: false, error: 'workflow_id is required' })

  try {
    const wfRes = await fetch(`${N8N_BASE}/workflows/${encodeURIComponent(workflowId)}`, {
      headers: { 'X-N8N-API-KEY': N8N_KEY },
    })
    if (!wfRes.ok) {
      return res.status(502).json({ ok: false, error: `N8N workflow fetch ${wfRes.status}` })
    }
    const wf = await wfRes.json() as { nodes?: Array<{ type: string; parameters?: any; webhookId?: string }> }
    const webhookNode = (wf.nodes || []).find(n => n.type === 'n8n-nodes-base.webhook')
    if (!webhookNode) {
      return res.status(422).json({
        ok: false,
        error: 'Workflow has no webhook trigger — manual rerun is not supported via the public API. Use the n8n UI Execute Workflow button.',
      })
    }
    const webhookPath = webhookNode.parameters?.path || webhookNode.webhookId
    if (!webhookPath) {
      return res.status(422).json({ ok: false, error: 'Webhook node has no path' })
    }
    // N8N_API_BASE_URL is .../api/v1; webhook lives at .../webhook/<path>
    const root = N8N_BASE.replace(/\/api\/v1\/?$/, '')
    const webhookUrl = `${root}/webhook/${webhookPath}`
    const wbRes = await fetch(webhookUrl, {
      method: webhookNode.parameters?.httpMethod || 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rerun: true, triggered_at: new Date().toISOString() }),
    })
    const body = await wbRes.text()
    if (!wbRes.ok) {
      return res.status(502).json({ ok: false, error: `Webhook ${wbRes.status}`, body: body.slice(0, 300) })
    }
    return res.status(202).json({ ok: true, webhook: webhookUrl, body: body.slice(0, 300) })
  } catch (e: any) {
    return res.status(502).json({ ok: false, error: `N8N call failed: ${e?.message || String(e)}` })
  }
}

